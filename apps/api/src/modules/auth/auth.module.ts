import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfig } from '../../config/app-config.service';
import { UsersModule } from '../users/users.module';
import { ActionTokensService } from './action-tokens.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ActionToken, ActionTokenSchema } from './schemas/action-token.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { SessionsService } from './sessions.service';

@Global()
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: ActionToken.name, schema: ActionTokenSchema },
    ]),
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL_SECONDS') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, ActionTokensService],
  exports: [AuthService, SessionsService, JwtModule, UsersModule],
})
export class AuthModule {}
