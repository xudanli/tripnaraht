/**
 * Lightweight 知识问答 helpers（从 ClaudeOrchestrator 迁出）。
 */

import type { LightweightKnowledgeHelpersHost } from './lightweight-knowledge-helpers.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { collectTripPlaceNameHints } from '../../trips/readiness/utils/collect-trip-place-hints.util';
import { formatCnClassicRoutePromptSupplement } from '../../trips/readiness/utils/cn-classic-routes.util';
import {
  isWeatherRoadConditionFocusedQuery,
} from '../utils/orchestration-signals.util';
import { isDiningRecommendationQuery } from '../utils/trip-dining-consultation.util';
import { isPoiSupplyConsultationQuery } from '../utils/trip-supply-consultation.util';
import {
  estimateLightweightKbTopicRelevanceScore,
  isActivityBookingRagSupplementQuery,
  LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD,
} from '../utils/lightweight-kb-relevance.util';
import {
  CONSULTATION_DAY_SKELETON_FOOTER_ZH,
  CONSULTATION_NAMED_DRAFT_APPENDIX_FOOTER_ZH,
  buildBriefItineraryLinesFromTripDays,
  formatConsultationTripDaySkeletonLines,
  formatTripPromptSummaryForConsultation,
  shouldIncludeNamedDraftAppendixForLightweightConsultation,
} from '../../trips/utils/trip-prompt-summary.util';
import {
  resolveActivityFocusWorldState,
  resolveTripDayWorldState,
} from '../../trips/utils/resolve-trip-day-world-state.util';
import { extractDayIndexFromUtterance } from '../intent/unified-intent-signals.util';
import { extractScheduleActivityReferent } from '../chat/build-activity-booking-chat-cards.util';
import {
  type ChunkRetrievalParams,
  type ChunkRetrievalResult,
} from '../../rag/services/chunk-retrieval.service';
import type { RagSoftWorldScope } from '../../rag/reality-policy/rag-soft-world-policy';
import { getBoundDecisionContext } from '../../trips/reality-kernel/reality-context.storage';
import { buildConsultationDecisionContextV0 } from '../../trips/reality-kernel/build-consultation-decision-context-v0';
import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';
import {
  TripContext,
  ItineraryInfo,
} from '../../trips/readiness/types/trip-context.types';
import type { ReadinessCheckResult } from '../../trips/readiness/types/readiness-findings.types';
import type { ReadinessScoreResponse } from '../../trips/readiness/types/coverage-map.types';
import { isValidUuidForUserProfile } from '../services/user-standing-preference.service';
import { extractTripnaraStructuredSlicesFromPreferences } from '../utils/tripnara-structured-preferences-context.util';
import {
  classifyDrivingRagIntentPhase,
  expandedRentalTransactionRagQuery,
} from '../utils/driving-rag-intent-phase.util';
import { ragRetrievalExpansionParams } from '../utils/query-rewrite-rag-expansion.util';

export function resolveLightweightLlmHttpTimeoutMs(host: LightweightKnowledgeHelpersHost): number {
  const raw =
    host.configService?.get<string>('LIGHTWEIGHT_LLM_HTTP_TIMEOUT_MS') ??
    process.env.LIGHTWEIGHT_LLM_HTTP_TIMEOUT_MS;
  const fallback = 180_000;
  if (raw == null || !String(raw).trim()) return fallback;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 10_000) return fallback;
  return Math.min(600_000, n);
}

/**
 * 轻量咨询注入行程摘要：优先 TripsService；若可选依赖未注入则回退 Prisma（避免 Optional TripsService 导致永远不加载）。
 * 默认按日类型骨架；绑定工作台或需锚定 POI 的咨询问法额外附带「草案地点速览」（Place 名/备注）。
 */
export async function resolveTripPromptSummaryForLightweightQa(
  host: LightweightKnowledgeHelpersHost,
  effectiveTripId: string,
  request: RouteAndRunRequestDto,
): Promise<string | null> {
  const tid = effectiveTripId.trim();
  const msgLower = (request.message ?? '').trim().toLowerCase();
  const includeNamedDraftAppendix = shouldIncludeNamedDraftAppendixForLightweightConsultation({
    message: request.message ?? '',
    msgLower,
    contextType: request.conversation_context?.context_type,
  });
  const focusDayIndex = extractDayIndexFromUtterance(request.message ?? '');
  const activityHint =
    extractScheduleActivityReferent(request.message ?? '') ||
    String(request.message ?? '')
      .replace(/\n*\[日程\][\s\S]*$/u, '')
      .trim()
      .slice(0, 80) ||
    undefined;
  if (host.tripsService) {
    try {
      const s = await host.tripsService.getTripPromptSummaryForConsultation(tid, undefined, {
        include_named_draft_appendix: includeNamedDraftAppendix,
        focus_day_index: focusDayIndex,
        activity_hint: activityHint,
      });
      if (s) return s;
    } catch (e: any) {
      host.logger.warn(`[LightweightQA] TripsService summary failed trip_id=${tid}: ${e?.message ?? e}`);
    }
  }
  try {
    const trip = await host.prisma.trip.findUnique({
      where: { id: tid },
      select: {
        name: true,
        destination: true,
        startDate: true,
        endDate: true,
        status: true,
        metadata: true,
        TripDay: {
          orderBy: { date: 'asc' as const },
          select: {
            date: true,
            ItineraryItem: {
              orderBy: { order: 'asc' as const },
              select: {
                type: true,
                note: true,
                Place: { select: { nameCN: true, nameEN: true } },
              },
            },
          },
        },
      },
    });
    if (!trip) {
      host.logger.warn(
        `[LightweightQA] No Trip row for trip_id=${tid}. Client may omit trip_id on route_and_run, or UI uses another database/environment.`,
      );
      return null;
    }
    if (!host.tripsService) {
      host.logger.debug(`[LightweightQA] trip summary via Prisma fallback (TripsService not injected)`);
    }
    const { TripDay: tripDays, metadata, ...tripMeta } = trip as typeof trip & {
      metadata?: unknown;
      TripDay?: Array<{
        date: Date;
        ItineraryItem: Array<{
          type: string;
          note: string | null;
          Place: { nameCN: string | null; nameEN: string | null } | null;
        }>;
      }>;
    };
    const metaObj =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};
    const dayThemesRaw = metaObj.dayThemes;
    const dayThemes =
      dayThemesRaw && typeof dayThemesRaw === 'object' && !Array.isArray(dayThemesRaw)
        ? Object.fromEntries(
            Object.entries(dayThemesRaw as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : null;
    const base = formatTripPromptSummaryForConsultation(tid, tripMeta);
    const skeleton = formatConsultationTripDaySkeletonLines(tripDays ?? [], {
      startDate: tripMeta.startDate,
      dayThemes,
    });
    let body = `${base}\n\n【按日骨架（仅日程项类型与数量，不含景点库名称/坐标）】\n${skeleton}${CONSULTATION_DAY_SKELETON_FOOTER_ZH}`;
    if (includeNamedDraftAppendix) {
      const brief = buildBriefItineraryLinesFromTripDays(tripDays ?? [], {
        startDate: tripMeta.startDate,
        dayThemes,
      }).join('\n');
      body += `\n\n【草案地点速览（Place 登记名或备注；供你对照用户所述路段）】\n${brief}${CONSULTATION_NAMED_DRAFT_APPENDIX_FOOTER_ZH}`;
    }
    if (focusDayIndex && tripDays) {
      const resolution = resolveTripDayWorldState({
        requestedDay: focusDayIndex,
        startDate: tripMeta.startDate,
        days: tripDays,
        dayThemes,
        activityHint,
      });
      body += `\n\n${resolution.promptBlockZh}`;
    } else if (activityHint && tripDays) {
      const activityFocus = resolveActivityFocusWorldState({
        startDate: tripMeta.startDate,
        days: tripDays,
        dayThemes,
        activityHint,
      });
      if (activityFocus) body += `\n\n${activityFocus.promptBlockZh}`;
    }
    return body;
  } catch (e: any) {
    host.logger.warn(`[LightweightQA] Prisma trip summary failed trip_id=${tid}: ${e?.message ?? e}`);
    return null;
  }
}

/** 行前/装备/清单类咨询：合并 practical + risks 集合检索（可选 ChunkRetrievalService）。 */
export function isPreparationGearTravelQuery(
  host: LightweightKnowledgeHelpersHost,
  msg: string): boolean {
  const m = msg.trim();
  if (!m) return false;
  return (
    /准备|行前|装备|清单|穿搭|冰爪|要带|打包|衣物|注意事项|睡袋|冲锋衣|洋葱式|层叠穿法|登山鞋|雨靴|暖宝宝|无人机|报备|转换插头|欧标|电话卡|e\s*[Ss]im|无人机报备|电源转换/i.test(m) ||
    /checklist|packing|crampon|tips|建议.*带|注意.*安全/i.test(m) ||
    /\b(layer(?:ing)?|hiking\s+boots|rain\s+gear|windproof|sim\s+card|esim)\b/i.test(m.toLowerCase())
  );
}

/** 从 Trip 表行构造 Readiness 用的 TripContext（与 GATE_EVAL 的 trip_plan_request 路径对齐的字段子集）。 */
export function buildTripContextFromTripRowForReadiness(
  host: LightweightKnowledgeHelpersHost,
  trip: { destination: string; startDate: Date; endDate: Date },
  userMessage: string,
): TripContext {
  const dest = trip.destination.trim();
  const countryToken = dest.split('-')[0] || dest.split(',')[0] || 'UNKNOWN';
  const countryCode = countryToken.toUpperCase();
  const startIso = trip.startDate.toISOString().slice(0, 10);
  const endIso = trip.endDate.toISOString().slice(0, 10);
  const msg = (userMessage ?? '').trim();
  const activities: string[] = [];
  if (/徒步|登山|爬山|步道|hiking|trekking|trail/i.test(msg)) {
    activities.push('hiking');
  }
  const itinerary: ItineraryInfo = {
    countries: [countryCode],
    activities: activities.length ? activities : undefined,
    season: host.extractSeason(startIso),
  };
  return {
    traveler: {},
    trip: { startDate: startIso, endDate: endIso },
    itinerary,
  };
}

/** 与工作台左侧「准备度 xx/100」面板同源的分数摘录（CoverageMapService.getReadinessScore）。 */
export function formatReadinessScoreHeaderForLightweightPrompt(
  host: LightweightKnowledgeHelpersHost,
  scoreData: ReadinessScoreResponse): string {
  const lines: string[] = [];
  const overall = scoreData.score?.overall;
  if (typeof overall === 'number') {
    lines.push(`【出发准备度（与工作台左侧面板一致）】${Math.round(overall)}/100`);
  }
  const sum = scoreData.summary;
  if (sum) {
    lines.push(
      `阻塞=${sum.blockers}，必做=${sum.must ?? sum.warnings ?? 0}，建议=${sum.should ?? sum.suggestions ?? 0}`,
    );
  }
  const bd = scoreData.score;
  if (bd) {
    lines.push(
      `维度：入境 ${Math.round(bd.entryTransit)}，保险 ${Math.round(bd.healthInsurance)}，装备 ${Math.round(bd.gearPacking)}，预订 ${Math.round(bd.bookingsCredentials)}，后勤 ${Math.round(bd.logisticsComms)}，应急 ${Math.round(bd.emergency)}`,
    );
  }
  const blockers = (scoreData.findings ?? []).filter((f) => f.type === 'blocker').slice(0, 5);
  for (const b of blockers) {
    const title = (b.message ?? b.id ?? '').toString().replace(/\s+/g, ' ').trim();
    if (title) lines.push(`- [阻塞] ${title}`.slice(0, 420));
  }
  return lines.join('\n');
}

/** 将 ReadinessCheckResult 压成轻量 prompt 用摘录（条数与总长封顶，避免撑爆上下文）。 */
export function formatReadinessFindingsForLightweightPrompt(
  host: LightweightKnowledgeHelpersHost,
  result: ReadinessCheckResult): string {
  const lines: string[] = [];
  if (result.disclaimer?.message?.trim()) {
    lines.push(`【免责】${result.disclaimer.message.trim().slice(0, 600)}`);
  }
  lines.push(
    `【条数汇总】blocker=${result.summary.totalBlockers}, must=${result.summary.totalMust}, should=${result.summary.totalShould}, optional=${result.summary.totalOptional}, risks=${result.summary.totalRisks}`,
  );
  const maxLines = 72;
  let count = 0;
  const pushItems = (tier: string, items: Array<{ id: string; message: string }>) => {
    for (const it of items) {
      if (count >= maxLines) return;
      const line = `- [${tier}] ${it.id}: ${(it.message ?? '').replace(/\s+/g, ' ').trim()}`.slice(0, 420);
      lines.push(line);
      count++;
    }
  };
  for (const f of result.findings) {
    pushItems('阻塞', f.blockers as Array<{ id: string; message: string }>);
    pushItems('必做', f.must as Array<{ id: string; message: string }>);
    pushItems('建议', f.should as Array<{ id: string; message: string }>);
    pushItems('可选', f.optional as Array<{ id: string; message: string }>);
    for (const r of f.risks ?? []) {
      if (count >= maxLines) break;
      const s = (r.summary ?? '').replace(/\s+/g, ' ').trim();
      if (s) {
        lines.push(`- [风险] ${s}`.slice(0, 420));
        count++;
      }
    }
  }
  const text = lines.join('\n');
  return text.length > 14_000 ? `${text.slice(0, 14_000)}\n…(摘录已截断)` : text;
}

/**
 * 轻量咨询并行分支：已绑定行程且非 trivia 时拉取 Pack 准备度摘录。
 * 规划阶段（工作台 / TRIP_PLANNING / 距出发尚早）由 {@link shouldSkipAgentReadinessPackCheck} 跳过。
 */
export async function runLightweightReadinessSupplement(
  host: LightweightKnowledgeHelpersHost,
  effectiveTripId: string | undefined,
  userMessage: string,
  want: boolean,
): Promise<string | null> {
  if (!want || !host.readinessService || !effectiveTripId?.trim()) {
    return null;
  }
  const tid = effectiveTripId.trim();
  const started = Date.now();
  try {
    const trip = await host.prisma.trip.findUnique({
      where: { id: tid },
      select: {
        destination: true,
        startDate: true,
        endDate: true,
        TripDay: {
          select: {
            ItineraryItem: {
              select: {
                Place: {
                  select: {
                    nameCN: true,
                    nameEN: true,
                    City: { select: { name: true, nameCN: true, nameEN: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!trip?.destination?.trim()) {
      return null;
    }
    const placeNames = collectTripPlaceNameHints(trip.TripDay);
    const tripContext = buildTripContextFromTripRowForReadiness(host, trip, userMessage);
    const result = await host.readinessService.checkFromDestination(trip.destination.trim(), tripContext, {
      lang: 'zh',
      userMessage,
      placeNames,
    });
    let scoreHeader = '';
    if (host.coverageMapService) {
      try {
        const scoreData = await host.coverageMapService.getReadinessScore(tid);
        scoreHeader = formatReadinessScoreHeaderForLightweightPrompt(host, scoreData);
        host.logger.debug(
          `[LightweightQA] Readiness score trip_id=${tid} overall=${scoreData.score?.overall ?? 'n/a'}`,
        );
      } catch (scoreErr: any) {
        host.logger.warn(
          `[LightweightQA] Readiness score failed trip_id=${tid}: ${scoreErr?.message ?? scoreErr}`,
        );
      }
    }
    const packFormatted = formatReadinessFindingsForLightweightPrompt(host, result);
    const classicSkeleton = formatCnClassicRoutePromptSupplement([
      userMessage,
      trip.destination,
      ...placeNames,
    ]);
    const parts = [
      scoreHeader || null,
      packFormatted,
      classicSkeleton,
    ].filter(Boolean);
    const formatted = parts.join('\n\n');
    host.logger.debug(
      `[LightweightQA] Readiness OK trip_id=${tid} duration_ms=${Date.now() - started} findings=${result.findings?.length ?? 0}`,
    );
    return formatted;
  } catch (e: any) {
    host.logger.warn(`[LightweightQA] Readiness failed trip_id=${tid}: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * 无绑定行程也可注入：用户消息命中 G318/G211/青甘大环线等时的参考按日骨架。
 */
export function buildCnClassicRouteLightweightSupplement(userMessage: string): string | null {
  const msg = (userMessage ?? '').trim();
  if (!msg) return null;
  if (
    !/自驾|环线|国道|川藏|滇藏|新藏|青甘|独库|G\s*3\d{2}|G\s*2\d{2}|(?<!\d)(?:318|317|219|211)(?!\d)/i.test(
      msg,
    )
  ) {
    return null;
  }
  return formatCnClassicRoutePromptSupplement([msg]);
}

/** 行程复盘问法：注入 detail.analyzeHealth 体检摘录（时间冲突、节奏、预算等） */
export async function runLightweightTripHealthSupplement(
  host: LightweightKnowledgeHelpersHost,
  effectiveTripId: string | undefined,
): Promise<string | null> {
  const tid = effectiveTripId?.trim();
  if (!tid || !host.skillsRegistry) return null;
  const started = Date.now();
  try {
    const skill = host.skillsRegistry.getSkill('detail.analyzeHealth') as
      | {
          execute: (input: {
            tripId: string;
            planState?: null;
          }) => Promise<{
            health?: {
              overall?: string;
              overallScore?: number;
              dimensions?: Record<
                string,
                { score?: number; issues?: string[]; status?: string }
              >;
            };
          }>;
        }
      | undefined;
    if (!skill) return null;
    const { health } = await skill.execute({ tripId: tid, planState: null });
    if (!health) return null;
    const formatted = formatTripHealthForLightweightPrompt(host, health);
    host.logger.debug(
      `[LightweightQA] Trip health OK trip_id=${tid} duration_ms=${Date.now() - started} score=${health.overallScore ?? 'n/a'}`,
    );
    return formatted;
  } catch (e: any) {
    host.logger.warn(`[LightweightQA] Trip health failed trip_id=${tid}: ${e?.message ?? e}`);
    return null;
  }
}

export function formatTripHealthForLightweightPrompt(
  host: LightweightKnowledgeHelpersHost,
  health: {
  overall?: string;
  overallScore?: number;
  dimensions?: Record<string, { score?: number; issues?: string[]; status?: string }>;
}): string {
  const dimLabels: Record<string, string> = {
    schedule: '时间安排',
    budget: '预算',
    pace: '节奏',
    feasibility: '可达性',
  };
  const lines: string[] = [];
  if (typeof health.overallScore === 'number') {
    lines.push(`总体健康度：${Math.round(health.overallScore)}/100（${health.overall ?? 'unknown'}）`);
  }
  for (const [key, label] of Object.entries(dimLabels)) {
    const dim = health.dimensions?.[key];
    if (!dim) continue;
    const issueText =
      Array.isArray(dim.issues) && dim.issues.length
        ? dim.issues.slice(0, 5).join('；')
        : '无明显问题';
    lines.push(`- ${label}（${dim.score ?? '—'}/100，${dim.status ?? '—'}）：${issueText}`);
  }
  const text = lines.join('\n');
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…(体检摘录已截断)` : text;
}

/** 租车/自驾类咨询：须触发 RAG（与 isTripScopedConsultationQuery 交通词对齐），否则仅「租车建议」不会命中 isDataLookupRagSupplementQuery 正文关键词 → 无摘录 */
export function isCarRentalOrDrivingTravelQuery(
  host: LightweightKnowledgeHelpersHost,
  msg: string): boolean {
  const m = msg.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  const transportZh =
    /租车|自驾|包车|提车|还车|租车行|用车|车型|四驱|SUV|交规|碎石路|碎石险|火山灰|风沙险|车门.*风|驾照|开车|保险|SAAP|ASH|涉水|拖车|闭路|封路|加油卡|加油|充电桩|停车费|气象官网|路况官网|能开吗/i.test(
      m,
    );
  const fRoadOrNumber = /f\s*路|f-road|\bf\s*\d{2,4}\b/i.test(lower);
  const icelandRoadBrand = /\bN1\b|olis|ölis/i.test(m);
  const transportEn =
    /\b(car\s+rental|rent(?:ing)?\s+a\s+car|self[- ]drive|driving\s+in|road\s+rules|rental\s+car|gravel\s+protection|sand\s+and\s+ash|insurance|gas\s+station|charging\s+station|river\s+crossing)\b/i.test(
      lower,
    );
  const roadDotIs = /road\.is|vedur\.is|\bvedur\b/i.test(lower);
  return transportZh || fRoadOrNumber || icelandRoadBrand || transportEn || roadDotIs;
}

/**
 * 极地/冰岛常见：救援与实时风险、基础设施与消费痛点（与行前/租车互补）。
 * 第四类单独列出，避免仅靠泛咨询正则漏掉「112、封路」等短句。
 */
export function isPolarInfrastructureOrEmergencyQuery(
  host: LightweightKnowledgeHelpersHost,
  msg: string): boolean {
  const m = msg.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  const rescue =
    /救援|求助|报警|警察|\b112\b|坏车|爆胎|陷车|黄警|红警|风暴预警|地震|火山|safetravel|safe\s*travel/i.test(m) ||
    /\b(safe\s*travel|emergency)\b/i.test(lower);
  const infraCost =
    /极光|kp值|kp\s*\d|极光预测|蓝冰洞|观鲸|物价|消费|刷卡|现金|退税|超市|小费|马路|无人区|营地/i.test(m) ||
    /\b(aurora|northern\s+lights|ice\s*cave|whale\s+watching|vat\s+refund|supermarket)\b/i.test(lower);
  const icelandShort =
    /\bf路\b|f-road|\bf\s*\d{2,4}\b|碎石险|火山灰|涉水|vedur|road\.is|风暴|封路|闭路/i.test(lower);
  return rescue || infraCost || icelandShort;
}

/** 轻量 DATA_LOOKUP 下是否附加知识库 RAG 摘录（非 System1Executor RAG，但同为向量检索） */
export function isDataLookupRagSupplementQuery(
  host: LightweightKnowledgeHelpersHost,
  msg: string): boolean {
  if (isPreparationGearTravelQuery(host, msg)) return true;
  if (isWeatherRoadConditionFocusedQuery(msg)) return true;
  if (isCarRentalOrDrivingTravelQuery(host, msg)) return true;
  if (isPolarInfrastructureOrEmergencyQuery(host, msg)) return true;
  /** 餐饮类 DATA_LOOKUP：须走进轻量 RAG，否则「推荐餐厅」等无法命中 POI 知识库 */
  if (isDiningRecommendationQuery(msg)) return true;
  /** 超市/补给类 DATA_LOOKUP：须检索冰岛超市/物价知识块 */
  if (isPoiSupplyConsultationQuery(msg)) return true;
  /** 直升机 / 空中观光等活动预订咨询：原正则未含「直升机」，泛问路径下会完全不检索 KB */
  if (isActivityBookingRagSupplementQuery(msg)) return true;
  const m = msg.trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  return (
    /适合|什么人|哪种|哪类|人群|体质|新手|亲子|老人|值不值|攻略|指南|注意|安全|签证|季节|路况|道路状况|封路|闭路/i.test(m) ||
    /极光|蓝冰洞|观鲸|物价|消费|刷卡|退税|超市|小费/i.test(m) ||
    /\b(aurora|northern\s+lights|ice\s*cave|whale\s+watching)\b/i.test(lower)
  );
}

export function lightweightAnswerImpliesMissingTripContext(
  host: LightweightKnowledgeHelpersHost,
  answer: string): boolean {
  return /未指定.*目的地|请提供.*目的地|未说明.*去哪|不知道.*去哪|没有.*目的地|您.*未.*告知.*目的地/i.test(answer);
}

/** 展示用文档名：metadata.title / 文件名 / fileId */
export function formatRagDocumentTitle(
  host: LightweightKnowledgeHelpersHost,
  r: ChunkRetrievalResult): string {
  const m = r.metadata;
  let fromMeta = '';
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    const rec = m as Record<string, unknown>;
    const pick = (k: string) => {
      const v = rec[k];
      return typeof v === 'string' ? v.trim() : '';
    };
    fromMeta =
      pick('title') ||
      pick('documentTitle') ||
      pick('fileName') ||
      pick('sourceTitle') ||
      pick('name');
  }
  const pathLike = fromMeta || r.sourceFile || '';
  const base = pathLike.replace(/^.*[/\\]/, '').trim();
  const label = base || String(r.fileId || r.chunkId);
  return label.length > 200 ? `${label.slice(0, 197)}…` : label;
}

/** 「现在几点」类事实题：注入 UTC 参考并约束篇幅，避免绑定 trip 时叠行程摘要与 Dashboard JSON */
export function buildLightweightClockFactPromptLines(
  host: LightweightKnowledgeHelpersHost,
  message: string): string[] {
  const iso = new Date().toISOString();
  const utcHm = iso.slice(11, 16);
  const utcDate = iso.slice(0, 10);
  const out: string[] = [
    '【本题类型】用户仅询问某地当前时间、标准时区或与北京的时差；不得声称「AI 无法获知时间」：须结合下文 UTC 参考写出当地大致时刻（并提醒秒级以用户设备为准）。',
    `【UTC 参考】协调世界时（UTC）：${utcDate} ${utcHm}（ISO 8601：${iso}）。`,
    '【篇幅】正文约 3～10 句即可；禁止展开行程预算、租车报价、门票、住宿、日程风险评估或长途驾驶分析；勿主动复述关联行程草案。',
    '【禁止输出】不得输出 <<<CONSULTATION_UI_JSON>>>、<<<SUGGESTED_OPS_JSON>>> 或任何「准备度/预算四卡」式模板。',
  ];
  if (/冰岛|雷克雅未克|reykjavik|iceland/i.test(message)) {
    out.splice(2, 0, '【冰岛】全年采用 UTC±0（无夏令时）；雷克雅未克本地时钟与 UTC 一致。');
  }
  return out;
}

/** 人口/面积/GDP 等百科事实：短文，禁止把 Dashboard 指令复述进用户可见正文 */
export function buildLightweightMacroStatFactPromptLines(host: LightweightKnowledgeHelpersHost): string[] {
  return [
    '【本题类型】用户询问人口、面积、GDP 等宏观统计或百科事实；与当前行程草案无直接关系。',
    '【篇幅】简短作答：给出常用口径与数量级；若年份或来源不确定，须标注「约」「大致」并提醒以官方统计为准。',
    '【禁止】用户可见正文中不得出现以下字样（含加粗/小标题）：「可视化 Dashboard」「Dashboard JSON」「CONSULTATION_UI_JSON」「SUGGESTED_OPS_JSON」「前端一键操作」——这些仅供系统解析，复述即错误。',
    '【禁止输出】不得输出 <<<CONSULTATION_UI_JSON>>>、<<<SUGGESTED_OPS_JSON>>> 或行程预算/租车/风险长篇模板。',
  ];
}

/**
 * 模型偶发把编排提示语（Dashboard / 建议操作块说明）当作正文小标题输出时的兜底清除。
 * 用于轻量事实题；亦用于轻量行程咨询在抽取结构化块之后对用户可见 `answer_text` 的收尾。
 */
export function stripConsultationPromptLeakageFromLightweightAnswer(
  host: LightweightKnowledgeHelpersHost,
  text: string): string {
  if (!text?.trim()) return text;
  let t = text;
  const removals: RegExp[] = [
    /【可视化 Dashboard JSON】[^\n]*/g,
    /【前端一键操作】[^\n]*/g,
    /\*{0,2}\s*可视化\s*Dashboard\s*JSON\s*\*{0,2}/gi,
    /\*{0,2}\s*前端一键操作\s*\*{0,2}/gi,
    // 独立成行（含 Markdown 标题/列表/引用）的系统指令回声
    /^[ \t>]*#{1,6}[ \t]*可视化\s*Dashboard\s*JSON[ \t:：]*$/gim,
    /^[ \t>]*#{1,6}[ \t]*前端一键操作[ \t:：]*$/gim,
    /^[ \t>]*[-*+][ \t]+可视化\s*Dashboard\s*JSON[ \t:：]*$/gim,
    /^[ \t>]*[-*+][ \t]+前端一键操作[ \t:：]*$/gim,
    /^[ \t>]*可视化\s*Dashboard\s*JSON[ \t:：]*$/gim,
    /^[ \t>]*前端一键操作[ \t:：]*$/gim,
  ];
  for (const r of removals) t = t.replace(r, '');
  // 兜底：未抽净的 CONSULTATION_UI / SUGGESTED_OPS 机读块不得进入用户可见正文
  t = t.replace(/<<<CONSULTATION_UI_JSON>>>[\s\S]*?(?:<<<END_CONSULTATION_UI_JSON>{2,3}|$)/g, '');
  t = t.replace(/<<<SUGGESTED_OPS_JSON>>>[\s\S]*?(?:<<<END_SUGGESTED_OPS_JSON>{2,3}|$)/g, '');
  t = t.replace(/<<<(?:CONSULTATION_UI_JSON|END_CONSULTATION_UI_JSON|SUGGESTED_OPS_JSON|END_SUGGESTED_OPS_JSON)>{2,3}/g, '');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 模型或 Mock/回退 LLM 偶发只返回 `{}` / `[]` 等无可读正文，前端会照字面展示；在此统一兜底。
 */
export function coerceLightweightKnowledgeUserVisibleAnswer(
  host: LightweightKnowledgeHelpersHost,
  text: string,
  request: Pick<RouteAndRunRequestDto, 'request_id'>,
): string {
  let t = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fenced) t = fenced[1].trim();

  let looksLikeEmptyJson = false;
  if (!t) {
    looksLikeEmptyJson = true;
  } else if (t === '{}' || t === '[]') {
    looksLikeEmptyJson = true;
  } else {
    try {
      const v = JSON.parse(t) as unknown;
      if (v && typeof v === 'object') {
        if (!Array.isArray(v) && Object.keys(v as object).length === 0) looksLikeEmptyJson = true;
        if (Array.isArray(v) && v.length === 0) looksLikeEmptyJson = true;
      }
    } catch {
      // 非 JSON：视为正常正文
    }
  }

  if (!looksLikeEmptyJson) return text.trim();

  host.logger.warn({
    tag: 'lightweight_knowledge_qa.degenerate_answer',
    request_id: request.request_id,
    preview: text.trim().slice(0, 120),
  });
  return '抱歉，本轮未能生成有效文字说明（上游返回了空内容）。请稍后重试；若持续出现，可使用下方快捷操作进入行程规划。';
}

/** 轻量 RAG：把持久化 structured 偏好拼进检索 query，与住宿/餐饮/交通口味对齐 */
export async function resolveTripnaraStructuredRagBiasForLightweight(
  host: LightweightKnowledgeHelpersHost,
  request: RouteAndRunRequestDto,
): Promise<string | undefined> {
  const uid = request.user_id?.trim();
  if (!host.prisma || !isValidUuidForUserProfile(uid)) return undefined;
  try {
    const row = await host.prisma.userProfile.findUnique({
      where: { userId: uid },
      select: { preferences: true },
    });
    return extractTripnaraStructuredSlicesFromPreferences(
      row?.preferences as Record<string, unknown> | null,
    ).rag_query_bias_zh;
  } catch {
    return undefined;
  }
}

export async function buildDataLookupRagSupplement(
  host: LightweightKnowledgeHelpersHost,
  message: string,
  structuredRagBiasZh?: string,
  acquisition?: {
    slimLoad?: boolean;
    skipQueryExpansion?: boolean;
    skipRisksRag?: boolean;
  },
): Promise<{
  supplement: string | null;
  citations: Array<{
    chunk_id: string;
    file_id: string;
    document_title: string;
    source_file?: string;
    category: 'practical' | 'risks' | 'pois' | 'decision_support';
    credibility_score?: number;
  }>;
}> {
  const empty = {
    supplement: null as string | null,
    citations: [] as Array<{
      chunk_id: string;
      file_id: string;
      document_title: string;
      source_file?: string;
      category: 'practical' | 'risks' | 'pois' | 'decision_support';
      credibility_score?: number;
    }>,
  };
  if (!host.chunkRetrieval || !isDataLookupRagSupplementQuery(host, message)) {
    return empty;
  }
  const kbRelevance = estimateLightweightKbTopicRelevanceScore(message);
  if (kbRelevance < LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD) {
    host.logger.debug(
      `[LightweightQA] RAG skipped: KB relevance ${kbRelevance.toFixed(2)} < ${LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD}`,
    );
    return empty;
  }
  const decisionContext = getBoundDecisionContext();
  const { scope } = host.ragRealityPolicyGate.resolve(decisionContext);
  const ragScope: RagSoftWorldScope = scope;
  if (ragScope === 'blocked') {
    host.logger.debug('[LightweightQA] RAG supplement skipped: rag_soft_world_blocked');
    return empty;
  }
  const slimLoad = acquisition?.slimLoad === true;
  const skipQueryExpansion = acquisition?.skipQueryExpansion === true || slimLoad;
  const skipRisksRag = acquisition?.skipRisksRag === true;
  const expansionParams = skipQueryExpansion ? {} : ragRetrievalExpansionParams();
  const mergeRagParams = (p: ChunkRetrievalParams): ChunkRetrievalParams =>
    host.ragRealityPolicyGate.mergeChunkRetrievalParams(
      { ...expansionParams, ...p },
      ragScope,
    );
  try {
    const q = message.trim();
    /** CRE slimLoad：不注入偏好 bias，避免「汉堡」拖进全量生活方式/日程语义 */
    const bias = slimLoad ? '' : (structuredRagBiasZh ?? '').trim();
    const withBias = (query: string) => (bias ? `${query} ${bias}` : query);
    const rentalExtra = slimLoad ? false : isCarRentalOrDrivingTravelQuery(host, q);
    const diningExtra = isDiningRecommendationQuery(q);

    let practicalQuery = withBias(q);
    let practicalLimit = slimLoad ? 3 : 4;
    let risksQuery = withBias(`${q} 季节 安全 路况`);
    let risksLimit = 3;
    let fetchRisks = !skipRisksRag && !slimLoad;
    let fetchPoisPool = diningExtra;
    let fetchDecisionSupportPool = false;
    let poisQuery =
      diningExtra && !rentalExtra ? withBias(`${q} 餐饮 用餐 餐厅 local food`) : withBias(q);

    if (rentalExtra && diningExtra) {
      fetchPoisPool = true;
      fetchDecisionSupportPool = true;
      poisQuery = withBias(`${q} 餐饮 用餐 餐厅 local food`);
    } else if (rentalExtra) {
      const phase = classifyDrivingRagIntentPhase(q) ?? 'rental_transaction';
      if (phase === 'rental_transaction') {
        practicalQuery = withBias(expandedRentalTransactionRagQuery(q));
        practicalLimit = 3;
        fetchRisks = false;
        fetchPoisPool = false;
        fetchDecisionSupportPool = false;
      } else if (phase === 'driving_safety') {
        practicalQuery = withBias(q);
        practicalLimit = 4;
        risksQuery = withBias(`${q} 季节 安全 路况`);
        risksLimit = 3;
        fetchRisks = true;
        fetchPoisPool = false;
        fetchDecisionSupportPool = false;
      } else {
        /** road_trip_planning：路线/环岛类自驾规划才扩 pois + decision-support */
        practicalQuery = withBias(q);
        practicalLimit = 4;
        fetchRisks = true;
        fetchPoisPool = true;
        fetchDecisionSupportPool = true;
        poisQuery = withBias(q);
      }
    }

    if (slimLoad) {
      fetchDecisionSupportPool = false;
      if (!diningExtra) {
        fetchPoisPool = false;
      }
    }

    const [practical, risks, poisPool, decisionSupportPool] = await Promise.all([
      host.chunkRetrieval.retrieve(
        mergeRagParams({
          query: practicalQuery,
          limit: practicalLimit,
          category: 'practical',
          useHybridSearch: true,
          credibilityMin: 0.35,
        }),
      ),
      fetchRisks
        ? host.chunkRetrieval.retrieve(
            mergeRagParams({
              query: risksQuery,
              limit: risksLimit,
              category: 'risks',
              useHybridSearch: true,
              credibilityMin: 0.35,
            }),
          )
        : Promise.resolve([] as ChunkRetrievalResult[]),
      fetchPoisPool
        ? host.chunkRetrieval.retrieve(
            mergeRagParams({
              query: poisQuery,
              limit: 4,
              category: 'pois',
              useHybridSearch: true,
              credibilityMin: 0.35,
            }),
          )
        : Promise.resolve([] as ChunkRetrievalResult[]),
      fetchDecisionSupportPool
        ? host.chunkRetrieval.retrieve(
            mergeRagParams({
              query: withBias(q),
              limit: 3,
              category: 'decision-support',
              useHybridSearch: true,
              credibilityMin: 0.35,
            }),
          )
        : Promise.resolve([] as ChunkRetrievalResult[]),
    ]);
    const blocks: string[] = [];
    const byChunk = new Map<
      string,
      {
        chunk_id: string;
        file_id: string;
        document_title: string;
        source_file?: string;
        category: 'practical' | 'risks' | 'pois' | 'decision_support';
        credibility_score?: number;
      }
    >();
    const pack = (
      poolLabel: string,
      cat: 'practical' | 'risks' | 'pois' | 'decision_support',
      rows: ChunkRetrievalResult[],
    ) => {
      if (!rows?.length) return;
      const slice = rows.slice(0, 4);
      const lines = slice.map((r, i) => {
        const docTitle = formatRagDocumentTitle(host, r);
        if (!byChunk.has(r.chunkId)) {
          const row: {
            chunk_id: string;
            file_id: string;
            document_title: string;
            source_file?: string;
            category: 'practical' | 'risks' | 'pois' | 'decision_support';
            credibility_score?: number;
          } = {
            chunk_id: r.chunkId,
            file_id: r.fileId,
            document_title: docTitle,
            category: cat,
          };
          if (r.sourceFile) row.source_file = r.sourceFile;
          if (typeof r.credibilityScore === 'number') row.credibility_score = r.credibilityScore;
          byChunk.set(r.chunkId, row);
        }
        return `[${poolLabel}${i + 1}｜《${docTitle}》] ${String(r.content).slice(0, 900)}`;
      });
      blocks.push(lines.join('\n'));
    };
    pack('实操/practical', 'practical', practical);
    pack('风险/risks', 'risks', risks);
    if (fetchPoisPool && poisPool.length) {
      pack(diningExtra ? '餐饮POI/pois' : '租车POI/pois', 'pois', poisPool);
    }
    if (fetchDecisionSupportPool && decisionSupportPool.length) {
      pack('决策/decision-support', 'decision_support', decisionSupportPool);
    }
    if (blocks.length === 0) return empty;
    const citations = Array.from(byChunk.values());
    return {
      supplement: `以下为知识库检索摘录（供核对与补充；须与上文行程摘要一致，勿与摘要矛盾）。每条前缀《》内为文档名称：\n${blocks.join('\n\n')}`,
      citations,
    };
  } catch (e: any) {
    host.logger.warn(`[LightweightQA] RAG supplement failed: ${e?.message ?? e}`);
    return empty;
  }
}

/**
 * 为轻量咨询构造最小 DecisionContext，使 `RAG_REALITY_POLICY_ENFORCE` 开启时 `getBoundDecisionContext()` 非空，
 * 避免 `buildDataLookupRagSupplement` 被 `rag_soft_world_blocked` 短路。
 */
export async function buildLightweightDecisionContextForRealityGate(
  host: LightweightKnowledgeHelpersHost,
  request: RouteAndRunRequestDto,
  effectiveTripId: string | undefined,
): Promise<DecisionContextV0> {
  const rid = String(request.request_id ?? 'no_req').slice(0, 120);
  const tid = effectiveTripId?.trim() || undefined;
  let startYmd: string | undefined;
  let endYmd: string | undefined;
  let tripIdForSnap = tid;
  let region = 'consultation';

  if (tid) {
    const trip = await host.prisma.trip.findUnique({
      where: { id: tid },
      select: { destination: true, startDate: true, endDate: true },
    });
    if (trip) {
      const d = trip.destination.trim().toUpperCase();
      if (d === 'IS' || d.startsWith('IS-') || d.includes('ICELAND')) {
        region = 'iceland';
      } else if (d === 'CN' || d.startsWith('CN-') || d.includes('CHINA') || d.includes('中国')) {
        region = 'cn';
      } else {
        region = d.slice(0, 64) || 'consultation';
      }
      startYmd = trip.startDate.toISOString().slice(0, 10);
      endYmd = trip.endDate.toISOString().slice(0, 10);
    } else {
      tripIdForSnap = undefined;
    }
  }

  if (!startYmd || !endYmd) {
    const cc = host.extractCountryCodeFromMessage(request.message ?? '');
    if (cc) {
      region = cc.toLowerCase();
    }
  }

  return buildConsultationDecisionContextV0({
    region,
    tripId: tripIdForSnap,
    runId: rid,
    startYmd,
    endYmd,
    generatedBy: 'claude_orchestrator.lightweight_knowledge_qa',
  });
}
