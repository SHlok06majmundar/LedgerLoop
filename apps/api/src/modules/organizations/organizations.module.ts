import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { Invitation, InvitationSchema } from './schemas/invitation.schema';
import { Membership, MembershipSchema } from './schemas/membership.schema';
import { Organization, OrganizationSchema } from './schemas/organization.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: Invitation.name, schema: InvitationSchema },
    ]),
  ],
  controllers: [OrganizationsController, InvitationsController],
  providers: [OrganizationsService, MembershipsService, InvitationsService],
  exports: [OrganizationsService, MembershipsService, MongooseModule],
})
export class OrganizationsModule {}
