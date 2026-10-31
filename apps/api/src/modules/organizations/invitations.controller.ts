import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { acceptInvitationSchema, type AcceptInvitationInput } from '@ledgerloop/validation';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Get('preview')
  preview(@Query(new ZodValidationPipe(acceptInvitationSchema)) query: AcceptInvitationInput) {
    return this.invitations.preview(query.token);
  }

  @Post('accept')
  @HttpCode(200)
  @ResponseMessage('Invitation accepted')
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
  ) {
    return this.invitations.accept(body.token, user.userId);
  }
}
