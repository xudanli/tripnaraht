/**
 * Travel DNA Inference — 从决策埋点反推行为偏好标签
 *
 * 不依赖心理测评；基于 reasonCodes、候选特征、用户选择模式。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionTelemetryEvent } from './decision-telemetry.types';
import {
  type TravelDnaBehavioralProfile,
  type TravelDnaBehavioralTag,
  type TravelDnaBehavioralTagScore,
} from './travel-dna-behavioral.types';

const TAG_RULES: Array<{
  tag: TravelDnaBehavioralTag;
  match: (event: DecisionTelemetryEvent) => boolean;
  weight: number;
}> = [
  {
    tag: 'ANTI_TOURIST',
    match: (e) =>
      hasReason(e, 'AVOID_CROWD', 'OFF_BEATEN_PATH', 'ANTI_TOURIST') ||
      hasChar(e, 'crowd_level', 'low') ||
      hasLabel(e, '小众', '秘境', 'off-beaten'),
    weight: 1,
  },
  {
    tag: 'PHOTO_EXPLORER',
    match: (e) =>
      hasReason(e, 'PHOTO_PRIORITY', 'GOLDEN_HOUR', 'SCENIC_STOP') ||
      hasChar(e, 'photo_priority', true) ||
      hasLabel(e, '摄影', 'photo', 'scenic'),
    weight: 1,
  },
  {
    tag: 'ADVENTURE_LOVER',
    match: (e) =>
      hasReason(e, 'F_ROAD', 'HIGHLANDS', 'ADVENTURE', 'OFF_ROAD') ||
      hasChar(e, 'terrain', 'f-road') ||
      hasLabel(e, '高地', 'F路', 'adventure', '越野'),
    weight: 1,
  },
  {
    tag: 'COMFORT_SEEKER',
    match: (e) =>
      hasReason(e, 'COMFORT_PRIORITY', 'HOTEL_UPGRADE') ||
      hasChar(e, 'comfort_level', 'high') ||
      hasLabel(e, '舒适', 'comfort', 'luxury'),
    weight: 1,
  },
  {
    tag: 'BUDGET_CONSCIOUS',
    match: (e) =>
      hasReason(e, 'BUDGET_CONSTRAINT', 'COST_SENSITIVE', 'CHEAPER_OPTION') ||
      hasChar(e, 'price_tier', 'budget'),
    weight: 1,
  },
  {
    tag: 'SELF_DRIVE',
    match: (e) =>
      hasReason(e, 'SELF_DRIVE', 'RENTAL_4X4') ||
      hasChar(e, 'transport_mode', 'self_drive') ||
      hasLabel(e, '自驾', 'rental', '4x4'),
    weight: 1,
  },
  {
    tag: 'RISK_AVERSE',
    match: (e) =>
      hasReason(e, 'SAFETY_FIRST', 'STORM_AVOID', 'ROAD_CLOSED_REJECT') ||
      e.decision.action === 'REJECT',
    weight: 0.5,
  },
  {
    tag: 'FLEXIBLE_PLANNER',
    match: (e) => hasReason(e, 'POSTPONE', 'ALTERNATIVE_ROUTE', 'FLEXIBLE'),
    weight: 0.8,
  },
];

function hasReason(event: DecisionTelemetryEvent, ...codes: string[]): boolean {
  const set = new Set(event.reasons.reasonCodes.map((c) => c.toUpperCase()));
  return codes.some((c) => set.has(c.toUpperCase()));
}

function hasChar(event: DecisionTelemetryEvent, key: string, value: unknown): boolean {
  const selected = event.candidates.find((c) => c.optionId === event.decision.optionId);
  const chars = selected?.characteristics ?? {};
  return String(chars[key] ?? '').toLowerCase() === String(value).toLowerCase();
}

function hasLabel(event: DecisionTelemetryEvent, ...needles: string[]): boolean {
  const hay = [
    ...event.candidates.map((c) => `${c.label} ${c.description ?? ''}`),
    event.reasons.userReasoning ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

@Injectable()
export class TravelDnaInferenceService {
  private readonly logger = new Logger(TravelDnaInferenceService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /** 从单次埋点事件更新用户行为 DNA */
  async inferFromTelemetryEvent(params: {
    userId: string;
    event: DecisionTelemetryEvent;
  }): Promise<TravelDnaBehavioralProfile | null> {
    const uid = params.userId.trim();
    if (!uid || !this.prisma) return null;

    const now = new Date();
    const nowIso = now.toISOString();
    const matchedTags = TAG_RULES.filter((r) => r.match(params.event));

    const existing = await this.prisma.userTravelProfile.findUnique({
      where: { userId: uid },
      select: { extendedProfile: true },
    });
    const ext = (existing?.extendedProfile as Record<string, unknown> | null) ?? {};
    const prev = (ext.travel_dna_behavioral as TravelDnaBehavioralProfile | undefined) ?? {
      version: 1 as const,
      tags: [] as TravelDnaBehavioralTagScore[],
      confidence: 0,
      sampleCount: 0,
      lastInferredAt: nowIso,
      source: 'decision_telemetry' as const,
    };

    const tagMap = new Map(prev.tags.map((t) => [t.tag, { ...t }]));
    for (const rule of matchedTags) {
      const cur = tagMap.get(rule.tag) ?? {
        tag: rule.tag,
        score: 0,
        evidenceCount: 0,
        lastSeenAt: nowIso,
      };
      cur.evidenceCount += 1;
      cur.score = clamp01(cur.score + rule.weight * 0.15);
      cur.lastSeenAt = nowIso;
      tagMap.set(rule.tag, cur);
    }

    const sampleCount = prev.sampleCount + 1;
    const profile: TravelDnaBehavioralProfile = {
      version: 1,
      tags: Array.from(tagMap.values()).sort((a, b) => b.score - a.score),
      confidence: clamp01(sampleCount / 20),
      sampleCount,
      lastInferredAt: nowIso,
      source: 'decision_telemetry',
    };

    const extendedProfile = { ...ext, travel_dna_behavioral: profile } as unknown as Prisma.InputJsonValue;

    await this.prisma.userTravelProfile.upsert({
      where: { userId: uid },
      update: {
        extendedProfile,
        source: 'inferred',
        confidence: profile.confidence,
      },
      create: {
        userId: uid,
        preferredRouteTypes: [],
        extendedProfile,
        source: 'inferred',
        confidence: profile.confidence,
      },
    });

    if (matchedTags.length > 0) {
      this.logger.debug(
        `[TravelDNA] user=${uid} tags=${matchedTags.map((t) => t.tag).join(',')} sample=${sampleCount}`,
      );
    }

    return profile;
  }

  async getBehavioralProfile(userId: string): Promise<TravelDnaBehavioralProfile | null> {
    if (!this.prisma) return null;
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    const ext = row?.extendedProfile as Record<string, unknown> | undefined;
    return (ext?.travel_dna_behavioral as TravelDnaBehavioralProfile) ?? null;
  }
}
