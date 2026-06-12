/**
 * VoiceEvidenceTranslator — 将硬门控 / 住宿诊断翻译为 TTS 友好口语叙事。
 */

import type { TravelDiagnosticReport, StayDistanceIssue } from '../utils/travel-diagnostic-collector.util';
import type { EmotionalVoiceToneModifier } from '../types/emotional-context.type';

export const VOICE_PAYLOAD_SCHEMA = 'tripnara.voice_payload@v1' as const;

export interface VoicePayloadAudioConfig {
  /** 前端 TTS 音色 ID（可选，由客户端映射） */
  voice_id?: string;
  speed_factor: number;
  pitch_setting: 'low' | 'medium' | 'high';
  emotions: string[];
}

export interface VoicePayload {
  schema: typeof VOICE_PAYLOAD_SCHEMA;
  text: string;
  audio_config: VoicePayloadAudioConfig;
  tone_modifier: EmotionalVoiceToneModifier;
}

function formatDrivingTimeZh(minutes: number): string {
  if (minutes >= 600) {
    const hours = Math.round(minutes / 60);
    return `约 ${hours} 小时`;
  }
  if (minutes >= 120) {
    const hours = (minutes / 60).toFixed(1).replace(/\.0$/, '');
    return `约 ${hours} 小时`;
  }
  return `约 ${minutes} 分钟`;
}

function describeGeoIssue(issue: StayDistanceIssue): string {
  const drive = formatDrivingTimeZh(issue.drivingMinutesEstimate);
  if (issue.distanceKm > 500) {
    return `第 ${issue.nightIndex} 晚的住宿和「${issue.anchorNameZh}」之间距离远得有点离谱（${drive}车程），很可能是定位或同名民宿搞错了`;
  }
  return `第 ${issue.nightIndex} 晚的住宿离「${issue.anchorNameZh}」太远（${drive}），不太像同一条动线上的选择`;
}

function describePacingIssue(issue: StayDistanceIssue, season: TravelDiagnosticReport['season']): string {
  const drive = formatDrivingTimeZh(issue.drivingMinutesEstimate);
  const winter =
    season === 'WINTER'
      ? '11月的冰岛天黑得极早，咱们尽量不摸黑开长途。'
      : '当天玩完再开这么远收队，特种兵也吃不消对不对？';
  return `第 ${issue.nightIndex} 晚如果泡完温泉还要再开 ${drive} 去睡觉，${winter}`;
}

export function translateDiagnosticToSpokenNarrative(report: TravelDiagnosticReport): string {
  if (!report.hasMajorItineraryConflict) {
    return '嗨，我是你的旅行管家。你的行程大纲我已经仔细帮你审过啦，整体动线和想玩的景点都很顺，按现在这版出发就很棒。';
  }

  const parts: string[] = [
    '嗨，我是你的旅行管家。别担心，你的行程大纲我已经仔细帮你审核过啦。总体动线和你想玩的景点都很棒，不过系统在核对细节时，发现有几个地方可能一不小心「踩坑」了，我们现在花一分钟同步一下：',
  ];

  if (report.geoImpossibleStays.length > 0) {
    parts.push(`首先是${describeGeoIssue(report.geoImpossibleStays[0])}。要是真这么开，当晚咱们可就得在车里跨越半个地球了。`);
    for (const extra of report.geoImpossibleStays.slice(1, 2)) {
      parts.push(`另外${describeGeoIssue(extra)}。`);
    }
  } else if (report.hasGeoImpossibleConflict) {
    parts.push(
      '首先是住宿和当天景点的距离对不上，可能是系统定位或者重名房源搞错啦，咱们得把酒店钉在动线终点附近。',
    );
  }

  if (report.pacingRiskStays.length > 0) {
    parts.push(`还有，${describePacingIssue(report.pacingRiskStays[0], report.season)}`);
  }

  if (report.missingAccommodationDays.length > 0) {
    const days = report.missingAccommodationDays.slice(0, 5).join('、');
    parts.push(
      `另外，第 ${days} 天你还没定落脚点，冰岛地广人稀，公路旁餐厅也不多，咱们得提前把根据地锁死。`,
    );
  }

  if (report.hasSelfHealApplied) {
    parts.push(
      '不过完全不用慌！我已经基于这些问题，在后台帮你把路线自动自愈了，重新挑了几个就在景点旁边的精品民宿，连中午哪有公路饭馆都卡好时间了。你看看现在工作台上更新的这一版，是不是丝滑多了？',
    );
  } else {
    parts.push(
      '不过完全不用慌！点一下工作台里的「一键修复」，我可以帮你把住宿和动线重新对齐，连收队时间一起卡好。',
    );
  }

  return parts.join('');
}

export function buildVoicePayloadForDiagnostic(
  report: TravelDiagnosticReport,
  toneModifier: EmotionalVoiceToneModifier = 'empathetic_reassurance',
): VoicePayload | undefined {
  if (!report.hasMajorItineraryConflict && report.totalDays === 0) return undefined;

  const text = translateDiagnosticToSpokenNarrative(report);
  if (!text?.trim()) return undefined;

  const empathetic = toneModifier === 'empathetic_reassurance' || report.hasMajorItineraryConflict;

  return {
    schema: VOICE_PAYLOAD_SCHEMA,
    text,
    tone_modifier: empathetic ? 'empathetic_reassurance' : toneModifier,
    audio_config: {
      ...(empathetic ? { voice_id: 'empathetic_buddy_male_02' } : {}),
      speed_factor: empathetic ? 0.85 : 1.0,
      pitch_setting: empathetic ? 'low' : 'medium',
      emotions: empathetic ? ['reassurance', 'warmth'] : ['neutral'],
    },
  };
}

export function applyEmpatheticStanceForDiagnostic<
  T extends {
    recommendedVoiceStance: {
      toneModifier: EmotionalVoiceToneModifier;
      audioProsodyPreference: { pitch: 'low' | 'medium' | 'high'; speedFactor: number };
    };
    anxietyLevel?: number;
  },
>(ctx: T, report: TravelDiagnosticReport): T {
  if (!report.hasMajorItineraryConflict) return ctx;
  return {
    ...ctx,
    recommendedVoiceStance: {
      toneModifier: 'empathetic_reassurance',
      audioProsodyPreference: { pitch: 'low', speedFactor: 0.85 },
    },
  };
}
