import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type {
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@ledgerloop/validation';
import { conflict, unauthorized } from '../../common/errors/app-exception';
import { AppConfig } from '../../config/app-config.service';
import { Mailer } from '../../mail/mailer';
import { resetPasswordTemplate, verifyEmailTemplate } from '../../mail/templates';
import { toPublicUser, UsersService, type PublicUser } from '../users/users.service';
import { ActionTokensService } from './action-tokens.service';
import { ActionTokenType } from './schemas/action-token.schema';
import { SessionsService } from './sessions.service';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Verified against when the email is unknown, so both paths cost the same.
  private readonly dummyHash = hash('not-a-real-password');

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly actionTokens: ActionTokensService,
    private readonly jwt: JwtService,
    private readonly mailer: Mailer,
    private readonly config: AppConfig,
  ) {}

  async register(input: RegisterInput, client: ClientInfo): Promise<AuthResult> {
    if (await this.users.exists(input.email)) {
      throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    }
    const user = await this.users.create({
      name: input.name,
      email: input.email,
      passwordHash: await hash(input.password),
    });
    await this.sendVerification(user.id as string);
    return this.signIn(toPublicUser(user), client);
  }

  async login(input: LoginInput, client: ClientInfo): Promise<AuthResult> {
    const user = await this.users.findByEmailWithPassword(input.email);
    const valid = await verify(user?.passwordHash ?? (await this.dummyHash), input.password).catch(
      () => false,
    );
    if (!user || !valid) {
      throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    if (!user.isActive) {
      throw unauthorized('ACCOUNT_DISABLED', 'This account has been disabled');
    }
    const updated = await this.users.update(user.id as string, { lastLoginAt: new Date() });
    return this.signIn(toPublicUser(updated), client);
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthResult> {
    const session = await this.sessions.rotate(refreshToken, client);
    const user = await this.users.findById(session.userId);
    if (!user?.isActive) {
      await this.sessions.revokeAll(session.userId);
      throw unauthorized('ACCOUNT_DISABLED', 'This account has been disabled');
    }
    return {
      user: toPublicUser(user),
      ...this.accessToken(session.userId, session.sessionId),
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  async logout(sessionId: string, refreshToken?: string): Promise<void> {
    await this.sessions.revoke(sessionId);
    if (refreshToken) await this.sessions.revokeByToken(refreshToken);
  }

  logoutAll(userId: string): Promise<void> {
    return this.sessions.revokeAll(userId);
  }

  async sendVerification(userId: string): Promise<void> {
    const user = await this.users.getById(userId);
    if (user.emailVerifiedAt) return;
    const token = await this.actionTokens.issue(userId, ActionTokenType.VERIFY_EMAIL, 24 * 60);
    const url = `${this.config.get('APP_URL')}/verify-email?token=${token}`;
    await this.deliver(user.email, verifyEmailTemplate(user.name, url));
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.actionTokens.consume(token, ActionTokenType.VERIFY_EMAIL);
    await this.users.update(userId, { emailVerifiedAt: new Date() });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user?.isActive) return;
    const token = await this.actionTokens.issue(user.id as string, ActionTokenType.RESET_PASSWORD, 60);
    const url = `${this.config.get('APP_URL')}/reset-password?token=${token}`;
    await this.deliver(user.email, resetPasswordTemplate(user.name, url));
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const userId = await this.actionTokens.consume(input.token, ActionTokenType.RESET_PASSWORD);
    await this.users.update(userId, { passwordHash: await hash(input.password) });
    await this.sessions.revokeAll(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.users.getById(userId);
    const withHash = await this.users.findByEmailWithPassword(user.email);
    if (!withHash || !(await verify(withHash.passwordHash, currentPassword).catch(() => false))) {
      throw unauthorized('INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    await this.users.update(userId, { passwordHash: await hash(newPassword) });
  }

  private async signIn(user: PublicUser, client: ClientInfo): Promise<AuthResult> {
    const session = await this.sessions.start(user.id, client);
    return {
      user,
      ...this.accessToken(user.id, session.sessionId),
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  private accessToken(userId: string, sessionId: string) {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
    return { accessToken: this.jwt.sign(payload), expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS') };
  }

  /** Auth emails must not fail the request when SMTP hiccups; the user can resend. */
  private async deliver(to: string, template: { subject: string; html: string; text: string }) {
    try {
      await this.mailer.send({ to, ...template });
    } catch (err) {
      this.logger.error(`Failed to send "${template.subject}" to ${to}`, err as Error);
    }
  }
}
