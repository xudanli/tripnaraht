import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PoiAliasRegistryService } from './poi-alias-registry.service';
import type { ResolutionEvidenceStep, ResolutionResult } from '../types/canonical-poi.types';

export interface ConfirmPoiResolutionInput {
  queryName: string;
  selectedPoiId: string;
  countryCode?: string;
  userId?: string;
  resolutionLogId?: string;
  locale?: string;
}

@Injectable()
export class PoiAliasLearningService {
  private readonly logger = new Logger(PoiAliasLearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PoiAliasRegistryService,
  ) {}

  async confirmSelection(input: ConfirmPoiResolutionInput): Promise<ResolutionResult> {
    const queryName = input.queryName?.trim();
    const selectedPoiId = input.selectedPoiId?.trim();
    if (!queryName || !selectedPoiId) {
      throw new BadRequestException('queryName 与 selectedPoiId 必填');
    }

    const poi = this.registry.getByPoiId(selectedPoiId);
    if (!poi) {
      throw new BadRequestException(`未知 canonical poiId: ${selectedPoiId}`);
    }

    await this.prisma.poiAlias.upsert({
      where: {
        poiId_alias: { poiId: selectedPoiId, alias: queryName },
      },
      create: {
        poiId: selectedPoiId,
        alias: queryName,
        locale: input.locale,
        source: 'USER_CONFIRMED',
        confidence: 1.0,
      },
      update: {
        locale: input.locale,
        source: 'USER_CONFIRMED',
        confidence: 1.0,
      },
    });

    const evidence: ResolutionEvidenceStep[] = [
      { stage: 'INPUT', label: queryName },
      { stage: 'HUMAN', label: '用户确认', detail: selectedPoiId },
      { stage: 'CANONICAL', label: selectedPoiId, detail: poi.canonicalName },
    ];

    if (input.resolutionLogId) {
      await this.prisma.poiResolutionLog
        .update({
          where: { id: input.resolutionLogId },
          data: {
            poiId: selectedPoiId,
            method: 'HUMAN',
            confidence: 1.0,
            confirmed: true,
            userId: input.userId,
            evidence: evidence as object,
          },
        })
        .catch(() => undefined);
    } else {
      await this.prisma.poiResolutionLog.create({
        data: {
          queryName,
          poiId: selectedPoiId,
          method: 'HUMAN',
          confidence: 1.0,
          confirmed: true,
          userId: input.userId,
          evidence: evidence as object,
        },
      });
    }

    await this.registry.refreshFromDb();
    this.logger.log(`CPRE flywheel: "${queryName}" → ${selectedPoiId} (USER_CONFIRMED)`);

    return {
      status: 'MATCHED',
      method: 'HUMAN',
      poiId: selectedPoiId,
      confidence: 1.0,
      matchedPoi: poi,
      evidence,
    };
  }
}
