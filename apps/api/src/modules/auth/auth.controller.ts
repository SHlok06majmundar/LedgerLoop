import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@ledgerloop/validation';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { unauthorized } from '../../common/errors/app-exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AppConfig } from '../../config/app-config.service';
import { toPublicUser, UsersService } from '../users/users.service';
import { AuthService, type AuthResult } from './auth.service';

export const REFRESH_COOKIE = 'll_refresh';
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  @ResponseMessage('Account created')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(await this.auth.register(body, client(req)), res);
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  @ResponseMessage('Signed in')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(await this.auth.login(body, client(req)), res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ResponseMessage('Session refreshed')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token)
      throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired. Please sign in again.');
    try {
      return this.respond(await this.auth.refresh(token, client(req)), res);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  @ResponseMessage('Signed out')
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.sessionId, req.cookies?.[REFRESH_COOKIE] as string | undefined);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return null;
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(200)
  @ResponseMessage('Signed out of all sessions')
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.userId);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return null;
  }

  @Public()
  @Throttle(STRICT)
  @Post('forgot-password')
  @HttpCode(200)
  @ResponseMessage('If that email has an account, a reset link is on its way')
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ) {
    await this.auth.forgotPassword(body.email);
    return null;
  }

  @Public()
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(200)
  @ResponseMessage('Password updated. Please sign in again.')
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body);
    return null;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @ResponseMessage('Email verified')
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    await this.auth.verifyEmail(body.token);
    return null;
  }

  @ApiBearerAuth()
  @Throttle(STRICT)
  @Post('resend-verification')
  @HttpCode(200)
  @ResponseMessage('Verification email sent')
  async resendVerification(@CurrentUser() user: AuthUser) {
    await this.auth.sendVerification(user.userId);
    return null;
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return toPublicUser(await this.users.getById(user.userId));
  }

  private respond(result: AuthResult, res: Response) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieOptions(),
      expires: result.refreshExpiresAt,
    });
    return { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  private cookieOptions(): CookieOptions {
    const production = this.config.isProduction;
    return {
      httpOnly: true,
      secure: production,
      // The web app and API live on different sites in production.
      sameSite: production ? 'none' : 'lax',
      domain: this.config.get('COOKIE_DOMAIN'),
      path: '/api/v1/auth',
    };
  }
}

function client(req: Request) {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}
