import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Connection, mongo } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { MembershipsService } from '../organizations/memberships.service';

/**
 * Pushes notifications and import progress to browsers. Events come from
 * MongoDB change streams, so writes made by the worker process reach
 * sockets connected to any API instance without a message broker.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeGateway.name);
  private streams: mongo.ChangeStream[] = [];

  @WebSocketServer() private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly memberships: MembershipsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  afterInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.watch('notifications', ['insert'], (doc) => {
      this.server.to(`user:${String(doc.userId)}`).emit('notification', serialize(doc));
    });
    this.watch('import_jobs', ['update', 'replace'], (doc) => {
      this.server.to(`org:${String(doc.organizationId)}`).emit('import.progress', {
        id: String(doc._id),
        status: doc.status,
        totalRows: doc.totalRows,
        processedRows: doc.processedRows,
        importedRows: doc.importedRows,
        duplicateRows: doc.duplicateRows,
        failedRows: doc.failedRows,
      });
    });
  }

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth as { token?: string } | undefined)?.token;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token ?? '');
      if (!(await this.sessions.isActive(payload.sid))) throw new Error('Session ended');
      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  /** Subscribes the socket to an organization's events after checking membership. */
  @SubscribeMessage('join-organization')
  async joinOrganization(@ConnectedSocket() client: Socket, @MessageBody() organizationId: string) {
    const userId = client.data.userId as string | undefined;
    if (!userId || typeof organizationId !== 'string') return { ok: false };
    const membership = await this.memberships.findActive(organizationId, userId).catch(() => null);
    if (!membership) return { ok: false };
    for (const room of client.rooms) if (room.startsWith('org:')) await client.leave(room);
    await client.join(`org:${organizationId}`);
    return { ok: true };
  }

  async onApplicationShutdown() {
    await Promise.all(this.streams.map((s) => s.close().catch(() => undefined)));
  }

  private watch(
    collection: string,
    operations: string[],
    emit: (doc: Record<string, unknown>) => void,
  ) {
    try {
      const stream = this.connection
        .collection(collection)
        .watch([{ $match: { operationType: { $in: operations } } }], {
          fullDocument: 'updateLookup',
        });
      stream.on('change', (change) => {
        const doc = (change as { fullDocument?: Record<string, unknown> }).fullDocument;
        if (doc) emit(doc);
      });
      stream.on('error', (err) =>
        this.logger.warn(`Change stream on ${collection} stopped: ${err.message}`),
      );
      this.streams.push(stream);
    } catch (err) {
      this.logger.warn(`Realtime updates for ${collection} unavailable: ${(err as Error).message}`);
    }
  }
}

function serialize(doc: Record<string, unknown>) {
  const { _id, __v: _v, ...rest } = doc;
  return { id: String(_id), ...rest, userId: String(rest.userId) };
}
