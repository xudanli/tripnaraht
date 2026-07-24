import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { findPlaceByTemplatePoiNames } from '../../route-directions/utils/template-poi-place-match.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GUIDE_CREDIBILITY_LEVEL,
  POI_MATCH_STATUS,
} from '../constants/guide-to-plan-status.constants';
import { expandPlaceNameVariants } from '../utils/guide-poi-name-match.util';
import { GuidePoiGeoService } from './guide-poi-geo.service';
import { GuideCrossGuideMergeService } from './guide-cross-guide-merge.service';

export interface PoiMatchResult {
  placeId: number;
  nameCN: string;
  nameEN?: string | null;
  ambiguous: boolean;
}

export interface PoiRematchResult {
  countryCode: string;
  attempted: number;
  matched: number;
  stillUnmatched: number;
}

export interface PoiBindResult {
  candidateId: string;
  placeId: number | null;
  matchStatus: string;
  credibilityLevel: string;
  matchedName?: string;
  matchedNameEn?: string | null;
}

/**
 * 攻略地点 → TripNARA Place 库匹配（复用模板 POI 匹配逻辑）。
 */
@Injectable()
export class GuidePoiMatchService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly poiGeo?: GuidePoiGeoService,
    @Optional() private readonly crossGuideMerge?: GuideCrossGuideMergeService,
  ) {}

  async matchByName(
    rawName: string,
    countryCode: string,
    rawNameEn?: string | null,
  ): Promise<PoiMatchResult | null> {
    for (const ref of expandPlaceNameVariants(rawName, rawNameEn)) {
      const place = await findPlaceByTemplatePoiNames(this.prisma, ref, countryCode);
      if (!place) continue;
      return {
        placeId: place.id,
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        ambiguous: false,
      };
    }
    return null;
  }

  async rematchSession(sessionId: string, countryCode: string): Promise<PoiRematchResult> {
    const normalizedCountry = countryCode.toUpperCase();
    const candidates = await this.prisma.guideInspirationCandidate.findMany({
      where: {
        sessionId,
        candidateType: 'poi',
        matchStatus: POI_MATCH_STATUS.UNMATCHED,
      },
    });

    let matched = 0;
    for (const candidate of candidates) {
      const match = await this.matchByName(
        candidate.rawName,
        normalizedCountry,
        candidate.rawNameEn,
      );
      if (!match) continue;
      matched++;
      await this.prisma.guideInspirationCandidate.update({
        where: { id: candidate.id },
        data: {
          placeId: match.placeId,
          matchStatus: match.ambiguous ? POI_MATCH_STATUS.AMBIGUOUS : POI_MATCH_STATUS.MATCHED,
          credibilityLevel: GUIDE_CREDIBILITY_LEVEL.L3,
        },
      });
      if (this.poiGeo) {
        await this.poiGeo.attachGeoToCandidate(
          candidate.id,
          match.placeId,
          candidate.rawName,
          match.ambiguous ? 0.65 : 0.9,
        );
      }
    }

    if (this.poiGeo) {
      await this.poiGeo.rematchSessionGeo(sessionId);
    }

    return {
      countryCode: normalizedCountry,
      attempted: candidates.length,
      matched,
      stillUnmatched: candidates.length - matched,
    };
  }

  async bindCandidateToPlace(
    sessionId: string,
    candidateId: string,
    placeId: number,
    expectedCountryCode?: string | null,
  ): Promise<PoiBindResult> {
    const candidate = await this.requirePoiCandidate(sessionId, candidateId);

    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        City: { select: { countryCode: true } },
      },
    });
    if (!place) {
      throw new NotFoundException(`POI #${placeId} 不存在`);
    }

    const placeCountry = place.City?.countryCode?.toUpperCase();
    if (expectedCountryCode && placeCountry && placeCountry !== expectedCountryCode.toUpperCase()) {
      throw new BadRequestException(
        `POI 所属国家 (${placeCountry}) 与会话目的地 (${expectedCountryCode.toUpperCase()}) 不一致`,
      );
    }

    const credibilityLevel =
      this.crossGuideMerge?.resolveCredibilityLevel(candidate.sourceGuideIds, place.id) ??
      GUIDE_CREDIBILITY_LEVEL.L3;

    await this.prisma.guideInspirationCandidate.update({
      where: { id: candidateId },
      data: {
        placeId: place.id,
        matchStatus: POI_MATCH_STATUS.MATCHED,
        credibilityLevel,
        metadata: {
          ...(typeof candidate.metadata === 'object' && candidate.metadata
            ? (candidate.metadata as object)
            : {}),
          manualMatch: true,
          matchConfidence: 1,
        } as object,
      },
    });

    if (this.poiGeo) {
      await this.poiGeo.attachGeoToCandidate(candidateId, place.id, candidate.rawName, 1);
    }

    return {
      candidateId,
      placeId: place.id,
      matchStatus: POI_MATCH_STATUS.MATCHED,
      credibilityLevel,
      matchedName: place.nameCN,
      matchedNameEn: place.nameEN,
    };
  }

  async rejectCandidate(sessionId: string, candidateId: string): Promise<PoiBindResult> {
    const candidate = await this.requirePoiCandidate(sessionId, candidateId);
    const credibilityLevel =
      this.crossGuideMerge?.resolveCredibilityLevel(candidate.sourceGuideIds, null) ??
      GUIDE_CREDIBILITY_LEVEL.L1;

    await this.prisma.guideInspirationCandidate.update({
      where: { id: candidateId },
      data: {
        placeId: null,
        matchStatus: POI_MATCH_STATUS.REJECTED,
        credibilityLevel,
        metadata: {
          ...(typeof candidate.metadata === 'object' && candidate.metadata
            ? (candidate.metadata as object)
            : {}),
          manualMatch: true,
          rejected: true,
        } as object,
      },
    });

    return {
      candidateId,
      placeId: null,
      matchStatus: POI_MATCH_STATUS.REJECTED,
      credibilityLevel,
    };
  }

  private async requirePoiCandidate(sessionId: string, candidateId: string) {
    const candidate = await this.prisma.guideInspirationCandidate.findFirst({
      where: { id: candidateId, sessionId },
    });
    if (!candidate) {
      throw new NotFoundException('地点候选不存在');
    }
    if (candidate.candidateType !== 'poi') {
      throw new BadRequestException('仅支持 POI 类型地点的手动匹配');
    }
    return candidate;
  }
}
