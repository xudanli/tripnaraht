import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishingPermissionService } from './publishing-permission.service';

export type EffectivePermissions = {
  canBrowsePublicProjects: boolean;
  canJoinPrivateProject: boolean;
  canCreatePrivateProject: boolean;
  canInviteKnownMembers: boolean;
  canPublicRecruit: boolean;
  canCommercialCharge: boolean;
  publishingLevel: string;
  subscriptionPlan: string;
};

@Injectable()
export class ContextPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishingPermission: PublishingPermissionService,
  ) {}

  async resolveForUser(userId: string): Promise<EffectivePermissions> {
    await this.publishingPermission.ensureUserDefaults(userId);
    const publishing = await this.publishingPermission.getUserPermission(userId);
    const trustedPublish = await this.publishingPermission.canPublishPublicTrustedProject(userId);
    const subscription = await this.prisma.subscription.findFirst({
      where: { accountScope: 'USER', accountId: userId, status: 'ACTIVE' },
      orderBy: { validFrom: 'desc' },
    });
    const plan = subscription?.plan ?? 'FREE';

    return {
      canBrowsePublicProjects: true,
      canJoinPrivateProject: true,
      canCreatePrivateProject: true,
      canInviteKnownMembers: true,
      canPublicRecruit: trustedPublish.allowed,
      canCommercialCharge:
        trustedPublish.allowed && publishing.level === 'PUBLIC_COMMERCIAL',
      publishingLevel: publishing.level,
      subscriptionPlan: plan,
    };
  }
}
