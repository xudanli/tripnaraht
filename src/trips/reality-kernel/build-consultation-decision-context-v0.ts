/**
 * 轻量咨询 / RAG HTTP 共用的最小 DecisionContextV0。
 * 新鲜 snapshot（degraded=false）→ 门禁开启时 scope=full，避免 RAG_CONTEXT_REQUIRED。
 */
import { buildDecisionContextV0 } from './build-decision-context-v0';
import type { DecisionContextV0 } from './decision-context.types';
import {
  buildSnapshotValidityV0,
  computeRealitySnapshotId,
} from './build-shadow-reality-snapshot-v0';
import {
  REALITY_SNAPSHOT_SCHEMA_V0,
  type RealityConsistencyV0,
  type RealitySnapshotLayersV0,
  type RealitySnapshotV0,
} from './reality-snapshot.types';

export type BuildConsultationDecisionContextInput = {
  /** 逻辑区域，如 cn / iceland / consultation */
  region?: string;
  tripId?: string;
  runId?: string;
  /** YYYY-MM-DD；缺省则 UTC 今天起 +7 天 */
  startYmd?: string;
  endYmd?: string;
  generatedBy?: string;
  generatedAt?: string;
};

function defaultHorizonYmd(): { startYmd: string; endYmd: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return {
    startYmd: start.toISOString().slice(0, 10),
    endYmd: end.toISOString().slice(0, 10),
  };
}

/**
 * 构造可过 `RAG_REALITY_POLICY_ENFORCE` 的咨询级 DecisionContext。
 * HTTP `POST /api/rag/chunks/retrieve` 应把返回值放入 body.`decision_context`。
 */
export function buildConsultationDecisionContextV0(
  input: BuildConsultationDecisionContextInput = {},
): DecisionContextV0 {
  const generated_at = input.generatedAt ?? new Date().toISOString();
  const region = (input.region ?? 'consultation').trim() || 'consultation';
  const horizon = input.startYmd && input.endYmd
    ? { startYmd: input.startYmd, endYmd: input.endYmd }
    : defaultHorizonYmd();
  const startYmd = input.startYmd ?? horizon.startYmd;
  const endYmd = input.endYmd ?? horizon.endYmd;

  const consistency: RealityConsistencyV0 = {
    max_staleness_sec: 0,
    degraded: false,
  };
  const snapshot: RealitySnapshotV0 = {
    schema: REALITY_SNAPSHOT_SCHEMA_V0,
    snapshot_id: computeRealitySnapshotId(
      generated_at,
      input.tripId,
      input.runId ?? 'consultation',
    ),
    valid_at: generated_at,
    generated_at,
    domain: { region },
    layers: {} as RealitySnapshotLayersV0,
    consistency,
    validity: buildSnapshotValidityV0(consistency),
    provenance: {
      generated_by:
        input.generatedBy ?? 'tripnara.consultation_decision_context_v0',
      source_versions: { bound: '1' },
    },
  };

  return buildDecisionContextV0(snapshot, {
    start_at: `${startYmd}T00:00:00.000Z`,
    end_at: `${endYmd}T23:59:59.999Z`,
  });
}
