/**
 * Storybook / playground fixtures: wind + solar (aurora), Tier 1–3.
 * Keep in sync with `playgrounds/iron-shield-evidence-ui.html` when tuning copy.
 */
import type { EvidenceCardUIProps } from '@/shared/interfaces/evidence-ui.interface';
import type { DecisionEvidenceCardPayload } from '@/agent/utils/evidence-payload-assembler.util';
import { assembleEvidenceCardUIProps } from '@/agent/utils/evidence-ui-assembler.util';

const WIND_PAYLOAD_BASE: DecisionEvidenceCardPayload = {
  kind: 'iron_shield_evidence',
  rule_id: 'temp_wind_speed_drive_limit_v1',
  rule_name: 'High wind warning for driving segments',
  severity: 'HARD',
  message:
    '[安全贴士] 基于 segment_prediction 提供的 25m/s 路段风速数据（红线阈值 15m/s）：1号公路南部段 已达危险侧风区间，建议延迟出发或更换路线。',
  narrator_hint_rendered:
    '基于 segment_prediction 提供的 25m/s 路段风速数据（红线阈值 15m/s）：1号公路南部段（South Coast Route 1）已达危险侧风区间（展示值 25.0m/s），建议延迟出发或更换路线。',
  evidence: {
    type: 'weather_physics',
    source: 'segment_prediction',
    value_mps: 25,
    threshold_mps: 15,
    segment_key: 'rt1_south',
    segment_name: '1号公路南部段（South Coast Route 1）',
  },
};

const SOLAR_PAYLOAD_BASE: DecisionEvidenceCardPayload = {
  kind: 'iron_shield_evidence',
  rule_id: 'temp_aurora_visibility_v2',
  rule_name: 'Aurora visibility window (sunset + offset)',
  severity: 'SOFT',
  message:
    '[安全贴士] 基于 sunset=16:30 的光照证据（暮光缓冲 30 分钟），极光观测建议在日落约 1 小时后开始。',
  narrator_hint_rendered:
    '基于 sunset=16:30 的光照证据（暮光缓冲 30 分钟），极光观测建议在日落/黄昏约 1 小时后开始（即 17:30 之后），以提高肉眼可见度。',
  evidence: {
    type: 'solar_physics',
    source: 'sunset',
    baseline: '16:30',
    offset_min: 60,
    twilight_buffer_min: 30,
    mode: 'START_TIME_MIN',
    prefer_civil_dusk: false,
  },
};

const MS_2_5H = 2.5 * 3_600_000;
const MS_9H = 9_000_000;

export const WIND_EVIDENCE_UI_FIXTURES: Record<'tier1' | 'tier2' | 'tier3', EvidenceCardUIProps> = {
  tier1: assembleEvidenceCardUIProps({ ...WIND_PAYLOAD_BASE, persuasion_tier: 1 }, {}),
  tier2: assembleEvidenceCardUIProps({ ...WIND_PAYLOAD_BASE, persuasion_tier: 2 }, { wallHitDistanceMs: MS_2_5H }),
  tier3: assembleEvidenceCardUIProps(
    { ...WIND_PAYLOAD_BASE, persuasion_tier: 3 },
    { wallHitDistanceMs: MS_9H, precedentN: 8, precedentAcceptPct: 91 },
  ),
};

export const SOLAR_EVIDENCE_UI_FIXTURES: Record<'tier1' | 'tier2' | 'tier3', EvidenceCardUIProps> = {
  tier1: assembleEvidenceCardUIProps({ ...SOLAR_PAYLOAD_BASE, persuasion_tier: 1 }, {}),
  tier2: assembleEvidenceCardUIProps({ ...SOLAR_PAYLOAD_BASE, persuasion_tier: 2 }, { wallHitDistanceMs: 90_000 }),
  tier3: assembleEvidenceCardUIProps(
    { ...SOLAR_PAYLOAD_BASE, persuasion_tier: 3 },
    { wallHitDistanceMs: 3_600_000, precedentN: 5, precedentAcceptPct: 88 },
  ),
};

export const ALL_EVIDENCE_UI_FIXTURES: EvidenceCardUIProps[] = [
  WIND_EVIDENCE_UI_FIXTURES.tier1,
  WIND_EVIDENCE_UI_FIXTURES.tier2,
  WIND_EVIDENCE_UI_FIXTURES.tier3,
  SOLAR_EVIDENCE_UI_FIXTURES.tier1,
  SOLAR_EVIDENCE_UI_FIXTURES.tier2,
  SOLAR_EVIDENCE_UI_FIXTURES.tier3,
];
