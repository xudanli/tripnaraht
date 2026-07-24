import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GUIDE_CREDIBILITY_LEVEL } from '../constants/guide-to-plan-status.constants';
import type { GuideCredibilityLevel } from '../constants/guide-to-plan-status.constants';
import {
  inspirationCandidateGroupKey,
  normalizeClaimKey,
} from '../utils/guide-place-key.util';

export type GuideCrossGuideMergeResult = {
  mergedPlaceRows: number;
  l2PlaceCount: number;
  l3PlaceCount: number;
  l2ClaimCount: number;
};

/**
 * Multi-guide L2 cross-validation: same POI in ≥2 guides → L2; POI DB match → L3.
 */
@Injectable()
export class GuideCrossGuideMergeService {
  private readonly logger = new Logger(GuideCrossGuideMergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async mergeSession(sessionId: string): Promise<GuideCrossGuideMergeResult> {
    const placeResult = await this.mergeInspirationCandidates(sessionId);
    const l2ClaimCount = await this.boostCrossGuideClaims(sessionId);
    this.logger.log(
      `Cross-guide merge session=${sessionId} merged=${placeResult.mergedPlaceRows} l2Places=${placeResult.l2PlaceCount} l3Places=${placeResult.l3PlaceCount} l2Claims=${l2ClaimCount}`,
    );
    return { ...placeResult, l2ClaimCount };
  }

  resolveCredibilityLevel(
    sourceGuideIds: string[],
    placeId: number | null,
  ): GuideCredibilityLevel {
    if (placeId != null) return GUIDE_CREDIBILITY_LEVEL.L3;
    if (sourceGuideIds.length >= 2) return GUIDE_CREDIBILITY_LEVEL.L2;
    return GUIDE_CREDIBILITY_LEVEL.L1;
  }

  private async mergeInspirationCandidates(sessionId: string) {
    const candidates = await this.prisma.guideInspirationCandidate.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const groups = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const key = inspirationCandidateGroupKey(candidate);
      const bucket = groups.get(key) ?? [];
      bucket.push(candidate);
      groups.set(key, bucket);
    }

    let mergedPlaceRows = 0;
    let l2PlaceCount = 0;
    let l3PlaceCount = 0;

    for (const group of groups.values()) {
      if (group.length <= 1) {
        const sole = group[0];
        const credibilityLevel = this.resolveCredibilityLevel(
          sole.sourceGuideIds,
          sole.placeId,
        );
        if (sole.credibilityLevel !== credibilityLevel) {
          await this.prisma.guideInspirationCandidate.update({
            where: { id: sole.id },
            data: { credibilityLevel },
          });
        }
        if (credibilityLevel === GUIDE_CREDIBILITY_LEVEL.L2) l2PlaceCount++;
        if (credibilityLevel === GUIDE_CREDIBILITY_LEVEL.L3) l3PlaceCount++;
        continue;
      }

      const keeper = this.pickKeeper(group);
      const mergedGuideIds = [
        ...new Set(group.flatMap((row) => row.sourceGuideIds)),
      ];
      const mergedPlaceId =
        group.find((row) => row.placeId != null)?.placeId ?? keeper.placeId;
      const matchStatus =
        group.find((row) => row.matchStatus === 'matched')?.matchStatus ??
        keeper.matchStatus;
      const credibilityLevel = this.resolveCredibilityLevel(
        mergedGuideIds,
        mergedPlaceId,
      );
      const suggestedDay = group.reduce<number | null>((min, row) => {
        if (row.suggestedDay == null) return min;
        if (min == null) return row.suggestedDay;
        return Math.min(min, row.suggestedDay);
      }, null);
      const routeOrder = group.reduce<number | null>((min, row) => {
        if (row.routeOrder == null) return min;
        if (min == null) return row.routeOrder;
        return Math.min(min, row.routeOrder);
      }, null);

      await this.prisma.guideInspirationCandidate.update({
        where: { id: keeper.id },
        data: {
          sourceGuideIds: mergedGuideIds,
          placeId: mergedPlaceId,
          matchStatus,
          credibilityLevel,
          suggestedDay,
          routeOrder,
          metadata: {
            crossValidated: mergedGuideIds.length >= 2,
            mentionCount: mergedGuideIds.length,
          },
        },
      });

      const duplicateIds = group
        .filter((row) => row.id !== keeper.id)
        .map((row) => row.id);
      if (duplicateIds.length > 0) {
        await this.prisma.guideInspirationCandidate.deleteMany({
          where: { id: { in: duplicateIds } },
        });
        mergedPlaceRows += duplicateIds.length;
      }

      if (credibilityLevel === GUIDE_CREDIBILITY_LEVEL.L2) l2PlaceCount++;
      if (credibilityLevel === GUIDE_CREDIBILITY_LEVEL.L3) l3PlaceCount++;
    }

    return { mergedPlaceRows, l2PlaceCount, l3PlaceCount };
  }

  private pickKeeper<T extends { placeId: number | null; rawName: string; matchStatus: string }>(
    group: T[],
  ): T {
    return [...group].sort((a, b) => {
      const aMatched = a.placeId != null ? 1 : 0;
      const bMatched = b.placeId != null ? 1 : 0;
      if (bMatched !== aMatched) return bMatched - aMatched;
      const aStatus = a.matchStatus === 'matched' ? 1 : 0;
      const bStatus = b.matchStatus === 'matched' ? 1 : 0;
      if (bStatus !== aStatus) return bStatus - aStatus;
      return b.rawName.length - a.rawName.length;
    })[0];
  }

  private async boostCrossGuideClaims(sessionId: string): Promise<number> {
    const claims = await this.prisma.guideClaim.findMany({
      where: { sessionId, guideId: { not: null } },
    });

    const groups = new Map<string, typeof claims>();
    for (const claim of claims) {
      const key = `${claim.claimType}:${normalizeClaimKey(claim.statement)}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(claim);
      groups.set(key, bucket);
    }

    let l2ClaimCount = 0;
    for (const group of groups.values()) {
      const guideIds = new Set(
        group.map((claim) => claim.guideId).filter((id): id is string => id != null),
      );
      if (guideIds.size < 2) continue;

      const toUpgrade = group.filter(
        (claim) => claim.confidenceLevel !== GUIDE_CREDIBILITY_LEVEL.L2,
      );
      if (toUpgrade.length === 0) continue;

      await this.prisma.guideClaim.updateMany({
        where: { id: { in: toUpgrade.map((claim) => claim.id) } },
        data: { confidenceLevel: GUIDE_CREDIBILITY_LEVEL.L2 },
      });
      l2ClaimCount += toUpgrade.length;
    }

    return l2ClaimCount;
  }
}
