import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import { unauthorized } from '../../common/errors/app-exception';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { Session } from './schemas/session.schema';

export interface IssuedSession {
  sessionId: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
}

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/** Refresh-token sessions with rotation and reuse detection. */
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    private readonly config: AppConfig,
  ) {}

  start(userId: string, client: ClientInfo): Promise<IssuedSession> {
    return this.issue(userId, randomUUID(), client);
  }

  /**
   * Exchanges a refresh token for a new one. Presenting a token that was
   * already rotated means it leaked, so the whole family is revoked, unless it
   * was rotated moments ago: then the client most likely never received the
   * response (a page navigation aborted it), so it gets a fresh sibling token.
   */
  async rotate(refreshToken: string, client: ClientInfo): Promise<IssuedSession> {
    const current = await this.sessions.findOne({ tokenHash: sha256(refreshToken) }).exec();
    if (!current || current.expiresAt <= new Date()) {
      throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired. Please sign in again.');
    }
    if (current.revokedAt) {
      if (current.replacedBy && this.withinReuseGrace(current.revokedAt)) {
        return this.issue(current.userId.toString(), current.familyId, client);
      }
      if (current.replacedBy) await this.revokeFamily(current.familyId);
      throw unauthorized('REFRESH_TOKEN_REUSED', 'Session expired. Please sign in again.');
    }

    const next = await this.issue(current.userId.toString(), current.familyId, client);
    const claimed = await this.sessions
      .updateOne(
        { _id: current._id, revokedAt: null },
        { revokedAt: new Date(), replacedBy: new Types.ObjectId(next.sessionId) },
      )
      .exec();
    if (claimed.modifiedCount === 0) {
      // A concurrent refresh won the race just now: the same grace applies,
      // unless the token was revoked (logout) rather than rotated.
      const winner = await this.sessions.findById(current._id).select('replacedBy revokedAt').lean().exec();
      if (winner?.replacedBy && winner.revokedAt && this.withinReuseGrace(winner.revokedAt)) return next;
      await this.revokeFamily(current.familyId);
      throw unauthorized('REFRESH_TOKEN_REUSED', 'Session expired. Please sign in again.');
    }
    return next;
  }

  private withinReuseGrace(rotatedAt: Date): boolean {
    return Date.now() - rotatedAt.getTime() < this.config.get('REFRESH_REUSE_GRACE_SECONDS') * 1000;
  }

  async isActive(sessionId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(sessionId)) return false;
    const session = await this.sessions
      .findOne({ _id: sessionId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select('_id')
      .lean()
      .exec();
    return session !== null;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessions.updateOne({ _id: sessionId, revokedAt: null }, { revokedAt: new Date() });
  }

  async revokeByToken(refreshToken: string): Promise<void> {
    await this.sessions.updateOne(
      { tokenHash: sha256(refreshToken), revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  async revokeAll(userId: string): Promise<void> {
    await this.sessions.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.sessions.updateMany({ familyId, revokedAt: null }, { revokedAt: new Date() });
  }

  private async issue(
    userId: string,
    familyId: string,
    client: ClientInfo,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken(48);
    const expiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000);
    const session = await this.sessions.create({
      userId: new Types.ObjectId(userId),
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt,
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, 300),
    });
    return { sessionId: session.id as string, userId, refreshToken, expiresAt };
  }
}
