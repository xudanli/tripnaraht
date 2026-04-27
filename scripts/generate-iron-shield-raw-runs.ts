import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

type RawRun = {
  request_id?: string;
  audit_report: any;
  decision_log: any[];
  /** Mirrors `route_and_run` payload.decision_metadata for DPO / graph export */
  decision_metadata?: Record<string, unknown>;
};

function nowIso() {
  return new Date().toISOString();
}

function mkBaseAuditReport(args: { requestId: string; earlyWarningId: string; latencyMs: number }): any {
  return {
    evidence_anchors: [],
    interaction_trace: {
      plan_gen_retry_count: 0,
      consecutive_same_relaxation_attempts: 0,
    },
    consensus_id: {},
    behavioral_gap: {
      early_warning_id: args.earlyWarningId,
      wall_hit_distance: { latency_ms: args.latencyMs, event_span: 3 },
      is_gold_sample: false,
    },
    persuasion_summary: {
      feedback_event_count: 1,
      positive_reward_count: 1,
      negative_reward_count: 0,
      first_positive_reward_log_index: 2,
      initial_refusal_count: 0,
    },
  };
}

function mkRun(args: {
  requestId: string;
  dominantCid: string;
  evidenceSummary: string;
  earlyWarningId: string;
  narratorHintRendered: string;
  precedentN?: number;
  latencyMs?: number;
  decision_metadata?: Record<string, unknown>;
  /** Optional: event-level wall-hit latency (ms) for Tier2+ copy / DPO metadata */
  feedbackWallHitMs?: number;
  /** Optional: override inferred persuasion tier on CLARIFICATION_FEEDBACK row */
  feedbackPersuasionTier?: number;
}): RawRun {
  const latencyMs = args.latencyMs ?? 180_000;
  const audit_report = mkBaseAuditReport({
    requestId: args.requestId,
    earlyWarningId: args.earlyWarningId,
    latencyMs,
  });

  const decision_log = [
    {
      request_id: args.requestId,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: '',
      outputs_summary: '',
      evidence_refs: [],
      timestamp: nowIso(),
      metadata: {
        system_action: 'EARLY_WARNING',
        early_warning: {
          evidence_summary: args.evidenceSummary,
          historical_precedents:
            typeof args.precedentN === 'number'
              ? [
                  {
                    stats: { historical_late_accept_rate: 0.92 },
                  },
                ]
              : [],
        },
      },
    },
    {
      request_id: args.requestId,
      step: 'FEEDBACK',
      actor: 'Orchestrator',
      inputs_summary: '',
      outputs_summary: '',
      evidence_refs: [],
      timestamp: nowIso(),
      metadata: {
        system_action: 'CLARIFICATION_FEEDBACK',
        questionId: 'iron-shield-q1',
        reward: 1,
        early_warning_id: args.earlyWarningId,
        dominant_cid: args.dominantCid,
        narrator_hint_rendered: args.narratorHintRendered,
        ...(typeof args.feedbackWallHitMs === 'number' ? { wall_hit_distance_ms: args.feedbackWallHitMs } : {}),
        ...(typeof args.feedbackPersuasionTier === 'number' ? { persuasion_tier: args.feedbackPersuasionTier } : {}),
        options_snapshot: [
          {
            label: '[安全贴士] 物理锚定预警',
            metadata: {
              score: 0.99,
              precedent_n: args.precedentN ?? 0,
              dominant_cid: args.dominantCid,
              region_id: 'iceland',
              month: 12,
              terms: { N: args.precedentN ?? 0 },
              narrator_hint_rendered: args.narratorHintRendered,
            },
          },
        ],
      },
    },
  ];

  return {
    request_id: args.requestId,
    audit_report,
    decision_log,
    ...(args.decision_metadata ? { decision_metadata: args.decision_metadata } : {}),
  };
}

async function main() {
  const outPath = resolve(process.cwd(), 'data', 'raw_runs_iron_shield.json');
  await mkdir(resolve(process.cwd(), 'data'), { recursive: true });

  const runs: RawRun[] = [
    mkRun({
      requestId: 'iron-shield-wind-001',
      dominantCid: 'ENVIRONMENT_WIND_SPEED_LIMIT',
      evidenceSummary: '[安全贴士] 高风速路段级预警（Segment-level Wind Anchor）',
      earlyWarningId: 'ew-iron-wind-001',
      narratorHintRendered:
        '[安全贴士] 检测到 1号公路南部段（South Coast Route 1）附近风力将达到 25.0m/s（阈值 15m/s），已超过安全行驶条件，建议延迟出发或更换路线。',
      precedentN: 8,
      latencyMs: 120_000,
      feedbackWallHitMs: 9_000_000,
      feedbackPersuasionTier: 3,
      decision_metadata: {
        evidence_cards: [
          {
            kind: 'iron_shield_evidence',
            rule_id: 'temp_wind_speed_drive_limit_v1',
            rule_name: 'High wind warning for driving segments',
            severity: 'HARD',
            message:
              '[安全贴士] 基于 segment_prediction 提供的 25m/s 路段风速数据（红线阈值 15m/s）：1号公路南部段（South Coast Route 1） 已达危险侧风区间（展示值 25.0m/s），建议延迟出发或更换路线。',
            narrator_hint_rendered:
              '基于 segment_prediction 提供的 25m/s 路段风速数据（红线阈值 15m/s）：1号公路南部段（South Coast Route 1） 已达危险侧风区间（展示值 25.0m/s），建议延迟出发或更换路线。',
            evidence: {
              type: 'weather_physics',
              source: 'segment_prediction',
              value_mps: 25,
              threshold_mps: 15,
              segment_key: 'rt1_south',
              segment_name: '1号公路南部段（South Coast Route 1）',
            },
          },
        ],
      },
    }),
    mkRun({
      requestId: 'iron-shield-aurora-001',
      dominantCid: 'ENVIRONMENT_VISIBILITY_SUNSET_BUFFER',
      evidenceSummary: '[安全贴士] 极光观测窗口（sunset + offset）',
      earlyWarningId: 'ew-iron-aurora-001',
      narratorHintRendered:
        '[安全贴士] 极光观测受日落时间限制，建议在日落约 1 小时后开始（例如 22:00 后再出发），以提升肉眼可见度并减少无效等待。',
      precedentN: 5,
      latencyMs: 90_000,
      decision_metadata: {
        evidence_cards: [
          {
            kind: 'iron_shield_evidence',
            rule_id: 'temp_aurora_visibility_v2',
            rule_name: 'Aurora visibility window (sunset + offset)',
            severity: 'SOFT',
            message:
              '[安全贴士] 基于 sunset=16:30 的光照证据（暮光缓冲 30 分钟），极光观测建议在日落/黄昏约 1 小时后开始（即 17:30 之后），以提高肉眼可见度。',
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
          },
        ],
      },
    }),
  ];

  await writeFile(outPath, JSON.stringify(runs, null, 2), 'utf8');

  // Merge into data/raw_runs.json (append) for convenience, but keep idempotent by request_id.
  const basePath = resolve(process.cwd(), 'data', 'raw_runs.json');
  let base: RawRun[] = [];
  try {
    base = JSON.parse(await readFile(basePath, 'utf8'));
    if (!Array.isArray(base)) base = [];
  } catch {
    base = [];
  }
  const seen = new Set(base.map((r) => String(r?.request_id ?? '')));
  const merged = [...base, ...runs.filter((r) => !seen.has(String(r.request_id ?? '')))];
  await writeFile(basePath, JSON.stringify(merged, null, 2), 'utf8');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

