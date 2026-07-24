import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityGovernanceModule } from '../../identity-governance/identity-governance.module';
import { DecisionSemanticsModule } from '../decision-semantics/decision-semantics.module';
import { TripMemberInviteController } from './trip-member-invite.controller';
import { TripResponsibilityOwnersController } from './trip-responsibility-owners.controller';
import { InviteResolverController } from './invite-resolver.controller';
import { TripMemberConfirmInboxController } from './trip-member-confirm-inbox.controller';
import { TripMemberOnboardingProfilesController } from './trip-member-onboarding-profiles.controller';
import { TripMemberInviteService } from './services/trip-member-invite.service';
import { TripResponsibilityOwnersService } from './services/trip-responsibility-owners.service';
import { InviteResolverService } from './services/invite-resolver.service';
import { MemberConfirmInboxService } from './services/member-confirm-inbox.service';
import { MemberOnboardingProfilesService } from './services/member-onboarding-profiles.service';

@Module({
  imports: [PrismaModule, IdentityGovernanceModule, DecisionSemanticsModule],
  controllers: [
    TripMemberInviteController,
    TripResponsibilityOwnersController,
    InviteResolverController,
    TripMemberConfirmInboxController,
    TripMemberOnboardingProfilesController,
  ],
  providers: [
    TripMemberInviteService,
    TripResponsibilityOwnersService,
    InviteResolverService,
    MemberConfirmInboxService,
    MemberOnboardingProfilesService,
  ],
  exports: [
    TripMemberInviteService,
    TripResponsibilityOwnersService,
    InviteResolverService,
    MemberConfirmInboxService,
    MemberOnboardingProfilesService,
  ],
})
export class TripMemberInvitesModule {}
