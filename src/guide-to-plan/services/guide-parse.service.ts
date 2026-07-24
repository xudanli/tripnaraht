import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import {
  GUIDE_CREDIBILITY_LEVEL,
  GUIDE_PARSE_STATUS,
  GUIDE_TO_PLAN_SESSION_STATUS,
  INSPIRATION_CANDIDATE_TYPE,
  POI_MATCH_STATUS,
} from '../constants/guide-to-plan-status.constants';
import type { GuideParseResult, ExtractedPlace } from '../types/guide-to-plan.types';
import { GuidePoiMatchService } from './guide-poi-match.service';
import { GuidePoiGeoService } from './guide-poi-geo.service';
import { GuideLinkFetchService } from './guide-link-fetch.service';
import {
  buildGuideParsePrompt,
  GUIDE_PARSE_LLM_SCHEMA,
  normalizeLlmParseResult,
} from '../utils/guide-parse-llm.util';

/**
 * 攻略结构化解析：优先 LLM schema 抽取，失败时回退启发式。
 */
@Injectable()
export class GuideParseService {
  private readonly logger = new Logger(GuideParseService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly poiMatch?: GuidePoiMatchService,
    @Optional() private readonly poiGeo?: GuidePoiGeoService,
    @Optional() private readonly linkFetch?: GuideLinkFetchService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async parseGuide(guideId: string, countryCode?: string | null): Promise<GuideParseResult> {
    const guide = await this.prisma.importedGuide.findUnique({ where: { id: guideId } });
    if (!guide) {
      throw new Error(`ImportedGuide ${guideId} not found`);
    }

    await this.prisma.importedGuide.update({
      where: { id: guideId },
      data: { parseStatus: GUIDE_PARSE_STATUS.PARSING },
    });

    let text = [guide.rawContent, guide.ocrText].filter(Boolean).join('\n\n').trim();
    let result: GuideParseResult;

    try {
      text = await this.resolveParseText(guide.id, text, guide.sourceUrl);
      if (text.length > 0) {
        result = await this.parseWithLlmOrHeuristic(text, countryCode);
      } else {
        result = this.emptyParseResult();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.importedGuide.update({
        where: { id: guideId },
        data: { parseStatus: GUIDE_PARSE_STATUS.FAILED, parseError: message },
      });
      throw err;
    }

    await this.prisma.importedGuide.update({
      where: { id: guideId },
      data: {
        parseStatus: GUIDE_PARSE_STATUS.PARSED,
        parsedAt: new Date(),
        extractedPlaces: result.places as object[],
        extractedRoutes: result.routes as object[],
        extractedTips: result.tips as object[],
        implicitAssumptions: result.implicitAssumptions as object[],
        parseError: null,
        ...(result.themeNarrative ? { title: guide.title ?? result.themeNarrative.slice(0, 80) } : {}),
        ...(result.suggestedTripDays
          ? {
              sourceMetadata: {
                ...((guide.sourceMetadata as Record<string, unknown> | null) ?? {}),
                suggestedTripDays: result.suggestedTripDays,
              },
            }
          : {}),
      },
    });

    if (result.themeNarrative) {
      await this.prisma.guideToPlanSession.update({
        where: { id: guide.sessionId },
        data: { themeNarrative: result.themeNarrative },
      });
    }

    await this.persistClaims(guide.sessionId, guideId, result);
    await this.persistInspirationCandidates(guide.sessionId, guideId, result.places, countryCode);

    return result;
  }

  async parseSession(sessionId: string, countryCode?: string | null) {
    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.PARSING },
    });

    const guides = await this.prisma.importedGuide.findMany({
      where: {
        sessionId,
        parseStatus: { in: [GUIDE_PARSE_STATUS.PENDING, GUIDE_PARSE_STATUS.FAILED] },
      },
    });

    if (guides.length === 0) {
      await this.prisma.guideToPlanSession.update({
        where: { id: sessionId },
        data: { status: GUIDE_TO_PLAN_SESSION_STATUS.UNDERSTANDING },
      });
      return;
    }

    for (const guide of guides) {
      await this.prisma.guideClaim.deleteMany({ where: { guideId: guide.id } });
      await this.prisma.guideInspirationCandidate.deleteMany({
        where: { sessionId, sourceGuideIds: { has: guide.id } },
      });
      await this.parseGuide(guide.id, countryCode);
    }

    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.UNDERSTANDING },
    });
  }

  private async resolveParseText(
    guideId: string,
    text: string,
    sourceUrl: string | null,
  ): Promise<string> {
    const url = sourceUrl?.trim() ?? text.trim();
    if (!this.linkFetch?.isUrlOnlyContent(text) || !url) {
      return text;
    }

    const fetched = await this.linkFetch.fetchGuideContent(url);
    if (!fetched.fetched || !fetched.content.trim()) {
      throw new BadRequestException('无法自动读取链接内容，请改粘贴攻略正文');
    }

    await this.prisma.importedGuide.update({
      where: { id: guideId },
      data: {
        rawContent: fetched.content,
        sourceMetadata: {
          linkFetchMethod: fetched.method,
          linkFetchAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`Link fetch ok guide=${guideId} method=${fetched.method}`);
    return fetched.content;
  }

  private async parseWithLlmOrHeuristic(
    text: string,
    countryCode?: string | null,
  ): Promise<GuideParseResult> {
    const llmEnabled = this.configService?.get<string>('GUIDE_PARSE_LLM_ENABLED') !== 'false';
    if (llmEnabled && this.llmService) {
      try {
        const provider =
          (this.configService?.get<string>('GUIDE_PARSE_LLM_PROVIDER') as LlmProvider) ||
          LlmProvider.DEEPSEEK;
        const prompt = buildGuideParsePrompt(text, countryCode);
        const raw = await this.llmService.callLlmWithSchema(
          provider,
          prompt,
          GUIDE_PARSE_LLM_SCHEMA,
        );
        const parsed = JSON.parse(raw);
        const normalized = normalizeLlmParseResult(parsed);
        if (normalized.places.length > 0) {
          this.logger.debug(`LLM parsed ${normalized.places.length} places`);
          return normalized;
        }
      } catch (err: unknown) {
        this.logger.warn(
          `LLM guide parse failed, fallback to heuristic: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return this.heuristicParse(text);
  }

  private heuristicParse(text: string): GuideParseResult {
    const lines = text
      .split(/\n+/)
      .map((l) => l.replace(/^[\d\-*•·]+\s*/, '').trim())
      .filter((l) => l.length >= 2 && l.length <= 120);

    const placeLike = lines.filter((l) => this.looksLikePlaceLine(l));
    const places: ExtractedPlace[] = placeLike.slice(0, 30).map((name, idx) => ({
      name,
      type: this.inferCandidateType(name),
      routeOrder: idx + 1,
    }));

    const tips = lines
      .filter((l) => /建议|注意|预约|排队|不建议|值得|避坑|tip/i.test(l))
      .slice(0, 15)
      .map((t) => ({ text: t }));

    const implicitAssumptions = [
      { assumption: '默认攻略作者体力较好', category: 'fitness' as const },
      { assumption: '默认天气条件良好', category: 'season' as const },
    ];

    return {
      places,
      routes: [],
      tips,
      implicitAssumptions,
      claims: tips.map((t) => ({
        claimType: 'experience_tip',
        statement: t.text,
      })),
      themeNarrative: places.length
        ? `攻略提及 ${places.length} 个地点/体验线索（待 POI 匹配与约束验证）`
        : undefined,
    };
  }

  private looksLikePlaceLine(line: string): boolean {
    if (/^https?:\/\//i.test(line)) return false;
    if (/建议|注意|费用|预算|酒店|餐厅|day\s*\d|第\s*\d+\s*天/i.test(line)) return false;
    return /[\u4e00-\u9fff]{2,}/.test(line) || /[A-Za-z]{3,}/.test(line);
  }

  private inferCandidateType(name: string): ExtractedPlace['type'] {
    if (/餐厅|美食|吃|restaurant|café|cafe/i.test(name)) return INSPIRATION_CANDIDATE_TYPE.RESTAURANT;
    if (/酒店|住宿|hotel|guesthouse|bnb/i.test(name)) return INSPIRATION_CANDIDATE_TYPE.HOTEL;
    if (/徒步|冰川|极光|活动|tour|hike/i.test(name)) return INSPIRATION_CANDIDATE_TYPE.ACTIVITY;
    return INSPIRATION_CANDIDATE_TYPE.POI;
  }

  private emptyParseResult(): GuideParseResult {
    return {
      places: [],
      routes: [],
      tips: [],
      implicitAssumptions: [],
      claims: [],
    };
  }

  private async persistClaims(
    sessionId: string,
    guideId: string,
    result: GuideParseResult,
  ) {
    if (result.claims.length === 0) return;
    await this.prisma.guideClaim.createMany({
      data: result.claims.map((c) => ({
        sessionId,
        guideId,
        claimType: c.claimType,
        subjectName: c.subjectName ?? null,
        statement: c.statement,
      })),
    });
  }

  private async persistInspirationCandidates(
    sessionId: string,
    guideId: string,
    places: ExtractedPlace[],
    countryCode?: string | null,
  ) {
    if (places.length === 0) return;

    for (const place of places) {
      let placeId: number | null = null;
      let matchStatus: string = POI_MATCH_STATUS.UNMATCHED;

      if (this.poiMatch && countryCode) {
        const match = await this.poiMatch.matchByName(
          place.name,
          countryCode,
          place.nameEn,
        );
        if (match) {
          placeId = match.placeId;
          matchStatus = match.ambiguous ? POI_MATCH_STATUS.AMBIGUOUS : POI_MATCH_STATUS.MATCHED;
        }
      }

      await this.prisma.guideInspirationCandidate.create({
        data: {
          sessionId,
          sourceGuideIds: [guideId],
          candidateType: place.type ?? INSPIRATION_CANDIDATE_TYPE.POI,
          rawName: place.name,
          rawNameEn: place.nameEn ?? null,
          placeId,
          matchStatus,
          credibilityLevel:
            placeId != null
              ? GUIDE_CREDIBILITY_LEVEL.L3
              : GUIDE_CREDIBILITY_LEVEL.L1,
          suggestedDay: place.suggestedDay ?? null,
          routeOrder: place.routeOrder ?? null,
        },
      });

      if (placeId && this.poiGeo) {
        const created = await this.prisma.guideInspirationCandidate.findFirst({
          where: { sessionId, rawName: place.name, placeId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (created) {
          await this.poiGeo.attachGeoToCandidate(
            created.id,
            placeId,
            place.name,
            matchStatus === POI_MATCH_STATUS.AMBIGUOUS ? 0.65 : 0.9,
          );
        }
      }
    }
  }
}
