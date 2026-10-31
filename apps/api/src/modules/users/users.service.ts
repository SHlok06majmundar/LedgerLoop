import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { notFound } from '../../common/errors/app-exception';
import { User, type UserDocument } from './user.schema';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user.id as string,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<UserDocument> {
    const [user] = await this.users.create([input]);
    return user!;
  }

  findById(id: string, session?: ClientSession): Promise<UserDocument | null> {
    return this.users
      .findById(id)
      .session(session ?? null)
      .exec();
  }

  async getById(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) throw notFound('User');
    return user;
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email: email.toLowerCase() }).exec();
  }

  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email: email.toLowerCase() }).select('+passwordHash').exec();
  }

  async exists(email: string): Promise<boolean> {
    return (await this.users.exists({ email: email.toLowerCase() })) !== null;
  }

  async update(
    id: string,
    changes: Partial<Pick<User, 'name' | 'passwordHash' | 'emailVerifiedAt' | 'lastLoginAt'>>,
  ): Promise<UserDocument> {
    const user = await this.users.findByIdAndUpdate(id, changes, { new: true }).exec();
    if (!user) throw notFound('User');
    return user;
  }

  findManyByIds(ids: string[]): Promise<UserDocument[]> {
    return this.users.find({ _id: { $in: ids } }).exec();
  }
}
