import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FIT_SOFT_DIMENSIONS } from '../constants/project-fit.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { ListingFitConfig, parseListingFitConfig } from '../utils/fit-questionnaire.util';

export type UpdateListingFitConfigInput = {
  enabledSoftDimensions?: string[];
  previewQuestionKeys?: string[];
};

@Injectable()
export class ProjectFitConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async getConfig(listingId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');

    const fitConfig = parseListingFitConfig(listing.metadata);
    return {
      listingId,
      fitConfig: {
        enabledSoftDimensions: fitConfig.enabledSoftDimensions ?? [...FIT_SOFT_DIMENSIONS],
        previewQuestionKeys: fitConfig.previewQuestionKeys,
      },
    };
  }

  async updateConfig(managerUserId: string, listingId: string, input: UpdateListingFitConfigInput) {
    await this.assertListingManager(listingId, managerUserId);
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');

    const current = parseListingFitConfig(listing.metadata);
    const fitConfig: ListingFitConfig = {
      enabledSoftDimensions: input.enabledSoftDimensions ?? current.enabledSoftDimensions,
      previewQuestionKeys: input.previewQuestionKeys ?? current.previewQuestionKeys,
    };

    const metadata = {
      ...(typeof listing.metadata === 'object' && listing.metadata ? (listing.metadata as object) : {}),
      fitConfig,
    };

    const updated = await this.prisma.trustedProjectListing.update({
      where: { id: listingId },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });

    await this.auditLog.record({
      actorId: managerUserId,
      action: 'FIT_CONFIG_UPDATED',
      targetType: 'TRUSTED_PROJECT_LISTING',
      targetId: listingId,
      after: fitConfig as unknown as Record<string, unknown>,
    });

    return { listingId, fitConfig };
  }

  private async assertListingManager(listingId: string, userId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');
    if (listing.responsibleUserId !== userId && listing.createdByUserId !== userId) {
      throw new ForbiddenException('无权配置该项目适合度问卷');
    }
  }
}
