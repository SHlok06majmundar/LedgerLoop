import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { AppException } from '../../common/errors/app-exception';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { ActionToken, type ActionTokenType } from './schemas/action-token.schema';

@Injectable()
export class ActionTokensService {
  constructor(@InjectModel(ActionToken.name) private readonly tokens: Model<ActionToken>) {}

  /** Issues a fresh token and invalidates earlier unused ones of the same type. */
  async issue(userId: string, type: ActionTokenType, ttlMinutes: number): Promise<string> {
    await this.tokens.updateMany({ userId, type, usedAt: null }, { usedAt: new Date() });
    const token = randomToken();
    await this.tokens.create({
      userId: new Types.ObjectId(userId),
      type,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    });
    return token;
  }

  /** Marks the token used and returns its user id; fails if expired or already used. */
  async consume(token: string, type: ActionTokenType): Promise<string> {
    const used = await this.tokens
      .findOneAndUpdate(
        { tokenHash: sha256(token), type, usedAt: null, expiresAt: { $gt: new Date() } },
        { usedAt: new Date() },
      )
      .exec();
    if (!used) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_TOKEN',
        'This link is invalid or has expired',
      );
    }
    return used.userId.toString();
  }
}
