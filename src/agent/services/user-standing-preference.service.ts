/**
 * 将聊天中的「长期偏好 / 用户摘要」类表述写入 UserProfile.preferences，并在后续 route_and_run 中注入模型上下文。
 *
 * 存储键（JSON，与 decision_dna 等并存）：
 * - tripnara_user_summary_bullets: string[]
 * - tripnara_user_summary_zh: string（拼接版，便于单字段消费）
 * - tripnara_user_summary_updated_at: ISO 时间
 * - tripnara_structured_preferences: object（LLM 抽取的可选结构化 hints，供下游扩展）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService, type LlmTokenContext } from '../../llm/services/llm.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { extractJsonObjectForParse } from './hotel-decision-support-narrator.service';
import {
  USER_PREFERENCE_EXTRACTION_SCHEMA,
  buildUserPreferenceExtractionPrompt,
  type UserPreferenceLlmExtraction,
} from '../utils/user-preference-llm-extract.util';

export const TRIPNARA_USER_SUMMARY_BULLETS = 'tripnara_user_summary_bullets' as const;
export const TRIPNARA_USER_SUMMARY_ZH = 'tripnara_user_summary_zh' as const;
export const TRIPNARA_USER_SUMMARY_UPDATED_AT = 'tripnara_user_summary_updated_at' as const;
export const TRIPNARA_STRUCTURED_PREFERENCES = 'tripnara_structured_preferences' as const;

const MAX_BULLETS = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** LLM 路径：过短浪费、过长易截断；可通过环境变量关闭。 */
const LLM_EXTRACT_MIN_LEN = 6;
const LLM_EXTRACT_MAX_LEN = 4000;
const LLM_CONFIDENCE_THRESHOLD = 0.45;

export function isValidUuidForUserProfile(userId: string | undefined | null): boolean {
  const u = (userId ?? '').trim();
  return u.length > 0 && u !== 'anonymous' && UUID_RE.test(u);
}

/** 是否像「以后都要…」「记住…」类可写入 User Summary 的长期偏好句（启发式，避免每句闲聊都写库）。 */
export function looksLikeStandingUserPreferenceUtterance(message: string): boolean {
  const m = message.trim();
  if (m.length < 10) return false;
  const marker =
    /以后|今后|之后|从现在开始|记住|偏好|默认|一律|都要|只选|只要|尽量|永远|千万别|避免|别给我|不用|统一|别总|别再|以后选|之后选/i.test(
      m,
    );
  if (!marker) return false;
  const domain =
    /酒店|住宿|民宿|饭店|餐厅|用餐|租车|自驾|机票|行程|路线|极简|暗黑|连锁|星级|青旅|包车|导游|门票/i.test(m);
  if (domain) return true;
  return m.length >= 14;
}

function normalizeBullet(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function hasNonEmptyStructuredHints(h: UserPreferenceLlmExtraction['structured_hints']): boolean {
  if (!h || typeof h !== 'object') return false;
  for (const v of Object.values(h)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim()) return true;
    if (Array.isArray(v) && v.some((x) => typeof x === 'string' && x.trim())) return true;
  }
  return false;
}

function mergeStructuredHints(
  existing: Record<string, unknown> | null | undefined,
  incoming: UserPreferenceLlmExtraction['structured_hints'],
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  if (!incoming || typeof incoming !== 'object') return base;

  const stringKeys = ['hotel_style', 'dining_preferences', 'transport_preferences', 'general'] as const;
  for (const k of stringKeys) {
    const v = incoming[k];
    if (typeof v !== 'string' || !v.trim()) continue;
    const prev = base[k];
    if (typeof prev === 'string' && prev.trim()) {
      base[k] = `${prev}；${v.trim()}`.slice(0, 1200);
    } else {
      base[k] = v.trim();
    }
  }

  const arr = incoming.hotel_avoid;
  if (Array.isArray(arr)) {
    const strings = arr.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    if (strings.length) {
      const prevA = Array.isArray(base.hotel_avoid)
        ? (base.hotel_avoid as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
      base.hotel_avoid = [...new Set([...prevA, ...strings])];
    }
  }

  return base;
}

function parsePreferenceExtraction(raw: string): UserPreferenceLlmExtraction | null {
  try {
    const s = extractJsonObjectForParse(raw);
    const o = JSON.parse(s) as unknown;
    if (!o || typeof o !== 'object') return null;
    const boxed = o as Record<string, unknown>;
    const has_standing_preference =
      typeof boxed.has_standing_preference === 'boolean' ? boxed.has_standing_preference : false;
    const confidence =
      typeof boxed.confidence === 'number' && Number.isFinite(boxed.confidence)
        ? Math.min(1, Math.max(0, boxed.confidence))
        : 0;
    const summary_bullets = Array.isArray(boxed.summary_bullets)
      ? boxed.summary_bullets
          .filter((x): x is string => typeof x === 'string')
          .map((x) => normalizeBullet(x))
          .filter(Boolean)
          .slice(0, 5)
      : [];

    const sh = boxed.structured_hints;
    let structured_hints: UserPreferenceLlmExtraction['structured_hints'];
    if (sh && typeof sh === 'object' && !Array.isArray(sh)) {
      const h = sh as Record<string, unknown>;
      structured_hints = {};
      if (typeof h.hotel_style === 'string' && h.hotel_style.trim()) structured_hints.hotel_style = h.hotel_style.trim();
      if (Array.isArray(h.hotel_avoid)) {
        structured_hints.hotel_avoid = h.hotel_avoid
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean);
      }
      if (typeof h.dining_preferences === 'string' && h.dining_preferences.trim()) {
        structured_hints.dining_preferences = h.dining_preferences.trim();
      }
      if (typeof h.transport_preferences === 'string' && h.transport_preferences.trim()) {
        structured_hints.transport_preferences = h.transport_preferences.trim();
      }
      if (typeof h.general === 'string' && h.general.trim()) structured_hints.general = h.general.trim();
      if (Object.keys(structured_hints).length === 0) structured_hints = undefined;
    }

    return { has_standing_preference, confidence, summary_bullets, structured_hints };
  } catch {
    return null;
  }
}

@Injectable()
export class UserStandingPreferenceService {
  private readonly logger = new Logger(UserStandingPreferenceService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly llmService?: LlmService,
  ) {}

  private isLlmExtractEnabled(): boolean {
    if (!this.llmService) return false;
    if (process.env.TRIPNARA_USER_PREFERENCE_LLM_EXTRACT === '0') return false;
    return true;
  }

  /**
   * 从 UserProfile 读取已存摘要，格式化为可注入 `recent_messages` 的短块（无则 null）。
   */
  async buildPromptInjectionBlock(userId: string): Promise<string | null> {
    if (!this.prisma || !isValidUuidForUserProfile(userId)) {
      return null;
    }
    try {
      const row = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (row?.preferences as Record<string, unknown> | null) ?? {};
      const bullets = prefs[TRIPNARA_USER_SUMMARY_BULLETS];
      const lines: string[] = [];
      if (Array.isArray(bullets)) {
        for (const b of bullets) {
          if (typeof b === 'string' && b.trim()) {
            lines.push(`- ${b.trim()}`);
          }
        }
      } else if (typeof prefs[TRIPNARA_USER_SUMMARY_ZH] === 'string' && (prefs[TRIPNARA_USER_SUMMARY_ZH] as string).trim()) {
        lines.push((prefs[TRIPNARA_USER_SUMMARY_ZH] as string).trim());
      }
      const structured = prefs[TRIPNARA_STRUCTURED_PREFERENCES];
      if (structured && typeof structured === 'object' && !Array.isArray(structured) && Object.keys(structured).length) {
        const compact = JSON.stringify(structured).slice(0, 900);
        lines.push(`- 结构化偏好：${compact}`);
      }
      if (lines.length === 0) return null;
      const updated = typeof prefs[TRIPNARA_USER_SUMMARY_UPDATED_AT] === 'string' ? prefs[TRIPNARA_USER_SUMMARY_UPDATED_AT] : '';
      const head = `[系统注入·用户长期偏好摘要${updated ? ` 更新于 ${updated}` : ''}]`;
      return `${head}\n${lines.join('\n')}`;
    } catch (e: any) {
      this.logger.warn(`[UserStandingPreference] read failed: ${e?.message ?? e}`);
      return null;
    }
  }

  private async extractPreferencesWithLlm(
    message: string,
    requestId: string,
  ): Promise<UserPreferenceLlmExtraction | null> {
    if (!this.isLlmExtractEnabled() || !this.llmService) return null;
    const m = message.trim();
    if (m.length < LLM_EXTRACT_MIN_LEN || m.length > LLM_EXTRACT_MAX_LEN) return null;

    const provider = this.llmService.getDefaultProvider();
    const prompt = buildUserPreferenceExtractionPrompt(m);
    const tokenContext: LlmTokenContext = {
      request_id: requestId,
      state_machine_step: 'INTAKE',
      sub_agent: 'Orchestrator',
    };

    const raw = await this.llmService.callLlmWithSchema(
      provider,
      prompt,
      USER_PREFERENCE_EXTRACTION_SCHEMA as unknown as object,
      tokenContext,
    );
    return parsePreferenceExtraction(raw);
  }

  /**
   * 若本句经 LLM 或启发式判定为长期偏好，则写入 UserProfile.preferences（幂等：新 bullet 与已有任一条完全相同则跳过写库）。
   */
  async mergeFromRouteAndRunIfEligible(request: RouteAndRunRequestDto): Promise<boolean> {
    if (!this.prisma) return false;
    if (request.options?.dry_run) return false;
    if (request.options?.orchestration_replay_anchor_snapshot_id?.trim()) return false;
    const uid = request.user_id?.trim();
    if (!isValidUuidForUserProfile(uid)) return false;
    const msg = normalizeBullet(request.message ?? '');
    if (msg.length < LLM_EXTRACT_MIN_LEN) return false;

    const requestId = (request.request_id ?? '').trim() || 'unknown';

    let bulletsToAdd: string[] = [];
    let structuredPatch: UserPreferenceLlmExtraction['structured_hints'] | undefined;
    let usedLlm = false;

    if (this.isLlmExtractEnabled()) {
      try {
        const ext = await this.extractPreferencesWithLlm(msg, requestId);
        if (
          ext &&
          ext.has_standing_preference &&
          ext.confidence >= LLM_CONFIDENCE_THRESHOLD &&
          (ext.summary_bullets.length > 0 || hasNonEmptyStructuredHints(ext.structured_hints))
        ) {
          usedLlm = true;
          bulletsToAdd = [...ext.summary_bullets];
          structuredPatch = ext.structured_hints;
        }
      } catch (e: any) {
        this.logger.warn(`[UserStandingPreference] LLM extract failed: ${e?.message ?? e}`);
      }
    }

    if (!usedLlm && looksLikeStandingUserPreferenceUtterance(msg)) {
      const bullet = msg.length > 600 ? `${msg.slice(0, 597)}…` : msg;
      bulletsToAdd = [bullet];
    }

    if (bulletsToAdd.length === 0 && !hasNonEmptyStructuredHints(structuredPatch)) {
      return false;
    }

    try {
      const existing = await this.prisma.userProfile.findUnique({
        where: { userId: uid },
        select: { preferences: true },
      });
      const prefs = { ...((existing?.preferences as Record<string, unknown> | null) ?? {}) };
      const prev = Array.isArray(prefs[TRIPNARA_USER_SUMMARY_BULLETS])
        ? (prefs[TRIPNARA_USER_SUMMARY_BULLETS] as unknown[]).filter(
            (x): x is string => typeof x === 'string' && x.trim().length > 0,
          )
        : [];

      const prevNorm = new Set(prev.map((b) => normalizeBullet(b)));

      let changed = false;
      const next = [...prev];
      for (const b of bulletsToAdd) {
        const nb = normalizeBullet(b);
        if (!nb) continue;
        const line = nb.length > 600 ? `${nb.slice(0, 597)}…` : nb;
        if (prevNorm.has(line)) continue;
        prevNorm.add(line);
        next.push(line);
        changed = true;
      }
      while (next.length > MAX_BULLETS) {
        next.shift();
        changed = true;
      }

      if (hasNonEmptyStructuredHints(structuredPatch)) {
        const merged = mergeStructuredHints(
          prefs[TRIPNARA_STRUCTURED_PREFERENCES] as Record<string, unknown> | undefined,
          structuredPatch,
        );
        const prevJson = JSON.stringify(prefs[TRIPNARA_STRUCTURED_PREFERENCES] ?? {});
        if (JSON.stringify(merged) !== prevJson) {
          prefs[TRIPNARA_STRUCTURED_PREFERENCES] = merged;
          changed = true;
        }
      }

      if (!changed) {
        return false;
      }

      const nowIso = new Date().toISOString();
      prefs[TRIPNARA_USER_SUMMARY_BULLETS] = next;
      prefs[TRIPNARA_USER_SUMMARY_ZH] = next.map((b) => `• ${b}`).join('\n');
      prefs[TRIPNARA_USER_SUMMARY_UPDATED_AT] = nowIso;

      await this.prisma.userProfile.upsert({
        where: { userId: uid },
        update: { preferences: prefs as object, updatedAt: new Date() },
        create: { userId: uid, preferences: prefs as object, updatedAt: new Date() },
      });
      this.logger.log(
        `[UserStandingPreference] updated user_summary bullets=${next.length} llm=${usedLlm} userId=${uid}`,
      );
      return true;
    } catch (e: any) {
      this.logger.warn(`[UserStandingPreference] merge failed: ${e?.message ?? e}`);
      return false;
    }
  }
}
