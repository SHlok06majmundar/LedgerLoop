import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import {
  createInvitationSchema,
  createOrganizationSchema,
  updateMemberSchema,
  updateOrganizationSchema,
  type CreateInvitationInput,
  type CreateOrganizationInput,
  type UpdateMemberInput,
  type UpdateOrganizationInput,
} from '@ledgerloop/validation';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import {
  CurrentOrg,
  OrgAccessRequired,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { unprocessable } from '../../common/errors/app-exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvitationsService } from './invitations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationsService } from './organizations.service';
import type { MembershipDocument } from './schemas/membership.schema';

const OrgParam = (permission?: Permission) => OrgAccessRequired({ param: 'id', permission });

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly memberships: MembershipsService,
    private readonly invitations: InvitationsService,
  ) {}

  @Post()
  @ResponseMessage('Organization created')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
  ) {
    return this.organizations.create(user.userId, body);
  }

  @Get()
  async listMine(@CurrentUser() user: AuthUser) {
    const memberships = await this.memberships.listForUser(user.userId);
    return memberships
      .filter((m) => m.organizationId)
      .map((m) => ({
        id: m.id as string,
        role: m.role,
        organization: (m.organizationId as unknown as { toJSON(): unknown }).toJSON(),
      }));
  }

  @Get(':id')
  @OrgParam()
  async get(@CurrentOrg() org: OrgAccess) {
    const organization = await this.organizations.get(org.organizationId);
    return { ...organization.toJSON(), role: org.role };
  }

  @Patch(':id')
  @OrgParam(Permission.ORGANIZATION_MANAGE)
  @ResponseMessage('Organization updated')
  update(
    @CurrentOrg() org: OrgAccess,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
  ) {
    return this.organizations.update(org.organizationId, body);
  }

  @Post(':id/logo')
  @OrgParam(Permission.ORGANIZATION_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ResponseMessage('Logo updated')
  async uploadLogo(
    @CurrentOrg() org: OrgAccess,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw unprocessable('FILE_REQUIRED', 'Attach an image in the "file" field');
    return this.organizations.setLogo(org.organizationId, file);
  }

  @Get(':id/logo')
  @OrgParam()
  async logo(@CurrentOrg() org: OrgAccess) {
    const file = await this.organizations.getLogo(org.organizationId);
    return new StreamableFile(file.data, { type: file.contentType });
  }

  @Get(':id/members')
  @OrgParam()
  async members(@CurrentOrg() org: OrgAccess) {
    const members = await this.memberships.listForOrganization(org.organizationId);
    return members.map(toMember);
  }

  @Patch(':id/members/:memberId')
  @OrgParam(Permission.MEMBERS_MANAGE)
  @ResponseMessage('Member updated')
  async updateMember(
    @CurrentOrg() org: OrgAccess,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    const membership = await this.memberships.update(org.organizationId, memberId, body);
    return membership.toJSON();
  }

  @Delete(':id/members/:memberId')
  @OrgParam(Permission.MEMBERS_MANAGE)
  @ResponseMessage('Member removed')
  async removeMember(@CurrentOrg() org: OrgAccess, @Param('memberId') memberId: string) {
    await this.memberships.remove(org.organizationId, memberId);
    return null;
  }

  @Post(':id/invitations')
  @OrgParam(Permission.MEMBERS_MANAGE)
  @ResponseMessage('Invitation sent')
  async invite(
    @CurrentOrg() org: OrgAccess,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInvitationSchema)) body: CreateInvitationInput,
  ) {
    const invitation = await this.invitations.create(org.organizationId, user.userId, body);
    const { tokenHash: _omit, ...rest } = invitation.toJSON();
    return rest;
  }

  @Get(':id/invitations')
  @OrgParam(Permission.MEMBERS_MANAGE)
  listInvitations(@CurrentOrg() org: OrgAccess) {
    return this.invitations.listPending(org.organizationId);
  }

  @Delete(':id/invitations/:invitationId')
  @OrgParam(Permission.MEMBERS_MANAGE)
  @ResponseMessage('Invitation revoked')
  async revokeInvitation(
    @CurrentOrg() org: OrgAccess,
    @Param('invitationId') invitationId: string,
  ) {
    await this.invitations.revoke(org.organizationId, invitationId);
    return null;
  }
}

function toMember(m: MembershipDocument) {
  const user = m.userId as unknown as {
    id: string;
    name: string;
    email: string;
    emailVerifiedAt: Date | null;
  } | null;
  return {
    id: m.id as string,
    role: m.role,
    status: m.status,
    joinedAt: m.createdAt,
    user: user && {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
    },
  };
}
