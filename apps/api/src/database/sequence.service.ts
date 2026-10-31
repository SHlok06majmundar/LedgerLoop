import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';

interface Counter {
  _id: string;
  seq: number;
}

/** Gap-free per-key counters (e.g. invoice numbers per organization and year). */
@Injectable()
export class SequenceService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async next(key: string, session?: ClientSession): Promise<number> {
    const counter = await this.connection
      .collection<Counter>('counters')
      .findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session },
      );
    return counter!.seq;
  }
}
