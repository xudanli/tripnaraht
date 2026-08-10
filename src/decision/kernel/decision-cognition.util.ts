/**
 * 从现有 DSO / Orchestrator 字段收敛认知产物（不另起 LLM 总结）。
 */

import type { DecisionState } from './decision-state.types';
import type {
  CognitionAdmission,
  CognitionAdmissionAuditEntry,
  CognitionAdmissionPhase,
  CognitionTraceMarker,
  DecisionCognitionSlice,
  DecisionDepth,
  FocusedDecisionProblem,
  FutureSimulationBundle,
  RealitySnapshot,
  RelationGraph,
  SnapshotValidity,
} from './decision-cognition.types';
import {
  buildCognitionFourLayerView,
  mapToConstraintLayer,
} from './cognition-four-layer.util';
import { resolveUnifiedIntent } from '../../agent/intent/unified-intent.resolver';

/** Orchestrator metadata / axiom / predictive 旁路注入（不进 LLM） */
export type RelationGraphEnrichment = {
  earlyWarning?: {
    risk_level?: string;
    conflict_type?: string;
    evidence_summary?: string;
    /** ISO 行动截止时间 */
    action_deadline?: string;
    intervention_deadline?: string;
    predictive_failure_report?: {
      audit_text?: string;
      simulated_repair_traces?: unknown[];
    };
  };
  dominantAxiomCid?: string;
  axiomLabel?: string;
};

function readActionDeadlineFromDso(dso: DecisionState): string | undefined {
  const env = dso.environmentState as Record<string, unknown> | undefined;
  const research = dso.research_data as Record<string, unknown> | undefined;
  const sys = dso.systemState as unknown as Record<string, unknown> | undefined;
  const candidates = [
    env?.actionDeadline,
    env?.interventionDeadline,
    research?.actionDeadline,
    research?.interventionDeadline,
    sys?.actionDeadline,
    sys?.interventionDeadline,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return undefined;
}

function synthesizeInterventionDeadline(dso: DecisionState): string | undefined {
  const fromDso = readActionDeadlineFromDso(dso);
  if (fromDso) return fromDso;
  const risk = dso.riskLevel;
  if (risk === 'HIGH' || risk === 'CRITICAL') {
    return new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  }
  if (dso.constraints?.gateOutcome === 'NEED_USER_CONFIRM') {
    return new Date(Date.now() + 4 * 3600 * 1000).toISOString();
  }
  return undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function pushMarker(
  cognition: DecisionCognitionSlice,
  marker: CognitionTraceMarker,
): DecisionCognitionSlice {
  const markers = [...(cognition.markers ?? [])];
  if (!markers.includes(marker)) markers.push(marker);
  return { ...cognition, markers, updatedAt: nowIso() };
}

export function mergeCognitionSlice(
  current: DecisionCognitionSlice | undefined,
  patch: Partial<DecisionCognitionSlice>,
): DecisionCognitionSlice {
  return {
    ...(current ?? {}),
    ...patch,
    markers: patch.markers ?? current?.markers,
    updatedAt: nowIso(),
  };
}

/** 从 DSO 收敛 RealitySnapshot（看清现实） */
export function buildRealitySnapshotFromDecisionState(
  dso: DecisionState,
  opts?: { snapshotId?: string },
): RealitySnapshot {
  const dest = dso.userIntent?.destination;
  const dates = dso.userIntent?.dateRange
    ? {
        start: dso.userIntent.dateRange.startDate,
        end: dso.userIntent.dateRange.endDate,
      }
    : undefined;
  const wss = dso.worldStateSummary;
  const env = dso.environmentState as Record<string, unknown> | undefined;
  const research = dso.research_data ?? {};

  const evidence: RealitySnapshot['evidence'] = [];
  if (wss) {
    evidence.push({ id: 'worldStateSummary', kind: 'world_model', source: 'DSO' });
  }
  if (Object.keys(research).length > 0) {
    evidence.push({ id: 'research_data', kind: 'research', source: 'DSO' });
  }
  if (dso.contextPackage) {
    evidence.push({ id: 'contextPackage', kind: 'context', source: 'DSO' });
  }

  const unknowns: RealitySnapshot['unknowns'] = [];
  if (!dest) {
    unknowns.push({
      id: 'unknown_destination',
      question: '目的地尚未明确',
      blocking: true,
    });
  }
  if (!wss?.physical && !env) {
    unknowns.push({
      id: 'unknown_world_physical',
      question: '物理世界状态证据不足',
      blocking: false,
    });
  }

  const freshness = inferFreshness(dso);
  const confidence = clamp01(
    dso.confidence ??
      (evidence.length >= 2 ? 0.7 : evidence.length === 1 ? 0.5 : 0.3) -
        unknowns.filter((u) => u.blocking).length * 0.2,
  );

  const conflicts: NonNullable<RealitySnapshot['conflicts']> = [];
  for (const v of dso.constraints?.violations ?? []) {
    if (v.severity !== 'HARD' && v.severity !== 'SOFT') continue;
    conflicts.push({
      id: `dso_violation_${v.type}`,
      code: v.type,
      summary: v.detail || v.type,
      severity: v.severity === 'HARD' ? 'HARD' : 'SOFT',
      evidenceRefs: ['constraints.violations'],
    });
  }

  const currentState = [
    dest != null ? `目的地=${String(typeof dest === 'object' ? (dest as any).name ?? 'set' : dest)}` : '目的地未明',
    dso.constraints?.gateOutcome
      ? `gate=${dso.constraints.gateOutcome}`
      : 'gate=未知',
    conflicts.filter((c) => c.severity === 'HARD').length
      ? `硬冲突${conflicts.filter((c) => c.severity === 'HARD').length}项`
      : '无硬冲突',
    `新鲜度=${freshness.status}`,
  ].join('；');

  return {
    schema: 'tripnara/decision-reality-snapshot@v1',
    snapshotId: opts?.snapshotId ?? `reality_${dso.requestId ?? 'anon'}_${Date.now()}`,
    builtAt: nowIso(),
    tripState: {
      destination: dest,
      dates,
      itinerary: dso.tripState?.planDraft,
      vehicle: (dso.userIntent as { vehicle?: unknown } | undefined)?.vehicle,
      members: dso.userIntent?.party ?? wss?.human?.partyProfile,
      bookings: dso.travelOntologyState?.nouns,
      planVersion: dso.tripState?.planVersion,
    },
    worldState: {
      weather: (env as any)?.weather ?? (research as any)?.weather,
      roadStatus: wss?.physical?.roadStates ?? (env as any)?.roads,
      openingHours: (research as any)?.opening_hours ?? (research as any)?.openingHours,
      availability: (research as any)?.availability,
      regulations: wss?.route?.hardRules,
      physical: wss?.physical,
      human: wss?.human,
      route: wss?.route,
    },
    evidence,
    unknowns,
    conflicts,
    currentState,
    freshness,
    confidence,
  };
}

function inferFreshness(dso: DecisionState): SnapshotValidity {
  const updated = dso.systemState?.lastUpdatedAt;
  if (!updated) {
    return { status: 'UNKNOWN', reasons: ['missing_lastUpdatedAt'] };
  }
  const ageSec = Math.max(0, (Date.now() - Date.parse(updated)) / 1000);
  if (Number.isNaN(ageSec)) {
    return { status: 'UNKNOWN', reasons: ['unparseable_lastUpdatedAt'] };
  }
  if (ageSec > 24 * 3600) {
    return { status: 'STALE', maxAgeSec: ageSec, reasons: ['older_than_24h'] };
  }
  if (!dso.worldStateSummary && !dso.research_data) {
    return { status: 'DEGRADED', maxAgeSec: ageSec, reasons: ['sparse_world_evidence'] };
  }
  return { status: 'VALID', maxAgeSec: ageSec };
}

/**
 * 从约束 / 世界摘要 / ontology / predictive / axiom 收敛 RelationGraph。
 * 优先把 violations 与影响链显式化，供 Problem Focus 使用。
 */
export function buildRelationGraphFromDecisionState(
  dso: DecisionState,
  enrichment?: RelationGraphEnrichment,
): RelationGraph {
  const nodes: RelationGraph['nodes'] = [];
  const edges: RelationGraph['edges'] = [];
  const impactChains: RelationGraph['impactChains'] = [];
  const uncertaintyLinks: RelationGraph['uncertaintyLinks'] = [];

  const tripNode = 'entity:trip';
  nodes.push({ id: tripNode, kind: 'trip', label: 'current_trip' });

  if (dso.worldStateSummary?.physical) {
    nodes.push({ id: 'entity:world_physical', kind: 'world', label: 'physical' });
    edges.push({
      from: 'entity:world_physical',
      to: tripNode,
      relation: 'CONSTRAINS',
      strength: 0.6,
      evidenceRefs: ['worldStateSummary.physical'],
    });
  }
  if (dso.worldStateSummary?.human) {
    nodes.push({ id: 'entity:human_capability', kind: 'human', label: 'capability' });
    edges.push({
      from: 'entity:human_capability',
      to: tripNode,
      relation: 'CONSTRAINS',
      strength: 0.55,
      evidenceRefs: ['worldStateSummary.human'],
    });
  }

  const fatigue = dso.tripState?.fatigue;
  const fatigueTrend = dso.optimizationHints?.fatigueTrend;
  if (fatigue != null || fatigueTrend) {
    nodes.push({
      id: 'entity:fatigue',
      kind: 'fatigue',
      label: 'tdfpm_fatigue',
      attrs: { fatigue, fatigueTrend },
    });
    edges.push({
      from: 'entity:fatigue',
      to: tripNode,
      relation: 'AMPLIFIES',
      strength: fatigueTrend === 'HIGH' || (typeof fatigue === 'number' && fatigue >= 0.7) ? 0.8 : 0.45,
      evidenceRefs: ['tripState.fatigue', 'optimizationHints.fatigueTrend'],
      detail: fatigueTrend ? `fatigueTrend=${fatigueTrend}` : `fatigue=${fatigue}`,
    });
    if (fatigueTrend === 'HIGH' || (typeof fatigue === 'number' && fatigue >= 0.7)) {
      impactChains.push({
        id: 'chain_fatigue',
        steps: ['driving_load', 'fatigue_accumulates', 'next_day_failure_risk_up'],
        summary: '疲劳累积抬高后续日程失败概率',
        strength: 0.75,
        evidenceRefs: ['tripState.fatigue'],
      });
    }
  }

  const ontology = dso.travelOntologyState;
  if (ontology?.nouns?.activities?.length) {
    nodes.push({
      id: 'entity:ontology_activities',
      kind: 'ontology',
      label: 'activities',
      attrs: { count: ontology.nouns.activities.length },
    });
    edges.push({
      from: 'entity:ontology_activities',
      to: tripNode,
      relation: 'DEPENDS_ON',
      strength: 0.5,
      evidenceRefs: ['travelOntologyState.nouns.activities'],
    });
  }
  const pendingVerbs = ontology?.verbs?.pending ?? [];
  for (let i = 0; i < Math.min(pendingVerbs.length, 5); i++) {
    const verb = pendingVerbs[i];
    const vid = `entity:ontology_verb_${verb.actionId || i}`;
    nodes.push({
      id: vid,
      kind: 'ontology_action',
      label: verb.verb,
      attrs: { targetType: verb.targetType, riskLevel: verb.riskLevel },
    });
    edges.push({
      from: vid,
      to: tripNode,
      relation: verb.riskLevel === 'HIGH' ? 'CONFLICTS_WITH' : 'DEPENDS_ON',
      strength: verb.riskLevel === 'HIGH' ? 0.7 : 0.4,
      evidenceRefs: [`travelOntologyState.verbs.pending[${i}]`],
      detail: `${verb.verb}:${verb.targetType}`,
    });
  }

  const violations = dso.constraints?.violations ?? [];
  for (let i = 0; i < violations.length; i++) {
    const v = violations[i];
    const vid = `entity:violation_${i}`;
    nodes.push({
      id: vid,
      kind: 'constraint_violation',
      label: v.constraint ?? v.type,
      attrs: { severity: v.severity, detail: v.detail },
    });
    edges.push({
      from: vid,
      to: tripNode,
      relation: v.severity === 'HARD' ? 'CONFLICTS_WITH' : 'CONSTRAINS',
      strength: v.severity === 'HARD' ? 0.9 : 0.5,
      evidenceRefs: [`constraints.violations[${i}]`],
      detail: v.detail,
    });
    if (v.severity === 'HARD') {
      impactChains.push({
        id: `chain_violation_${i}`,
        steps: [v.type, v.detail, 'plan_feasibility_reduced'],
        summary: v.detail || v.type,
        strength: 0.85,
        evidenceRefs: [`constraints.violations[${i}]`],
      });
    }
  }

  const up = dso.uncertaintyProfile;
  if (up?.hasUncertainty && (up.sources?.includes('weather') || up.sources?.includes('road'))) {
    uncertaintyLinks.push({
      id: 'unc_world',
      from: 'entity:world_physical',
      to: tripNode,
      uncertainty: `sources=${(up.sources ?? []).join(',')};entropy=${up.entropy01 ?? '?'}`,
      evidenceRefs: ['uncertaintyProfile'],
    });
  }

  const ew = enrichment?.earlyWarning;
  if (ew) {
    nodes.push({
      id: 'entity:early_warning',
      kind: 'early_warning',
      label: ew.conflict_type ?? 'early_warning',
      attrs: { risk_level: ew.risk_level },
    });
    edges.push({
      from: 'entity:early_warning',
      to: tripNode,
      relation: 'CAUSES',
      strength: ew.risk_level === 'HIGH' || ew.risk_level === 'CRITICAL' ? 0.85 : 0.6,
      evidenceRefs: ['metadata.early_warning'],
      detail: ew.evidence_summary,
    });
    const pfr = ew.predictive_failure_report;
    const traceCount = Array.isArray(pfr?.simulated_repair_traces)
      ? pfr!.simulated_repair_traces!.length
      : 0;
    if (pfr || traceCount > 0) {
      impactChains.unshift({
        id: 'chain_predictive_failure',
        steps: [
          ew.conflict_type ?? 'hazard',
          'predicted_failure',
          pfr?.audit_text?.slice(0, 80) || 'repair_simulation',
        ],
        summary: pfr?.audit_text?.slice(0, 160) || ew.evidence_summary || 'predictive failure chain',
        strength: 0.88,
        evidenceRefs: ['metadata.early_warning.predictive_failure_report'],
      });
    }
  }

  if (enrichment?.dominantAxiomCid) {
    const aid = `entity:axiom_${enrichment.dominantAxiomCid}`;
    nodes.push({
      id: aid,
      kind: 'axiom',
      label: enrichment.axiomLabel ?? enrichment.dominantAxiomCid,
    });
    edges.push({
      from: aid,
      to: tripNode,
      relation: 'CONSTRAINS',
      strength: 0.7,
      evidenceRefs: ['axiom.dominant_cid'],
      detail: enrichment.dominantAxiomCid,
    });
  }

  if (impactChains.length === 0 && edges.length > 0) {
    impactChains.push({
      id: 'chain_default_constraints',
      steps: edges.slice(0, 3).map((e) => `${e.from}:${e.relation}:${e.to}`),
      summary: 'constraint_and_world_links',
      strength: 0.4,
      evidenceRefs: edges.flatMap((e) => e.evidenceRefs).slice(0, 5),
    });
  }

  // 疲劳 × 硬约束：显式放大链
  if (
    nodes.some((n) => n.id === 'entity:fatigue') &&
    violations.some((v) => v.severity === 'HARD')
  ) {
    edges.push({
      from: 'entity:fatigue',
      to: 'entity:violation_0',
      relation: 'AMPLIFIES',
      strength: 0.65,
      evidenceRefs: ['tripState.fatigue', 'constraints.violations[0]'],
      detail: 'fatigue amplifies hard constraint pressure',
    });
  }

  return {
    schema: 'tripnara/decision-relation-graph@v1',
    builtAt: nowIso(),
    nodes,
    edges,
    impactChains,
    uncertaintyLinks,
  };
}

/**
 * 从 RelationGraph + constraints 聚焦单一主问题（其余压入 secondary）。
 */
export function buildFocusedDecisionProblemFromDecisionState(
  dso: DecisionState,
  graph?: RelationGraph,
): FocusedDecisionProblem | undefined {
  const g = graph ?? dso.cognition?.relationGraph ?? buildRelationGraphFromDecisionState(dso);
  const violations = dso.constraints?.violations ?? [];
  const hard = violations.filter((v) => v.severity === 'HARD');
  const primary = hard[0] ?? violations[0];
  // 预测失败链优先于默认约束链（根因更贴近「为什么现在必须处理」）
  const chain =
    g.impactChains.find((c) => c.id === 'chain_predictive_failure') ??
    g.impactChains.find((c) => c.id === 'chain_fatigue') ??
    g.impactChains[0];

  if (!primary && !chain && dso.constraints?.gateOutcome === 'ALLOW') {
    return {
      schema: 'tripnara/focused-decision-problem@v1',
      problemId: `focus_allow_${dso.requestId ?? 'anon'}`,
      type: 'OPPORTUNITY',
      question: '当前约束下是否可以继续生成/调整行程？',
      rootCause: {
        entity: 'entity:trip',
        relation: 'MITIGATES',
        evidenceRefs: ['constraints.gateOutcome=ALLOW'],
        detail: 'no_hard_violations',
      },
      affectedScope: {},
      urgency: 'NOW',
      severity: 0.1,
      confidence: dso.confidence ?? 0.7,
      whyThisProblem: 'Gate 允许继续；聚焦于交付可执行方案',
      suppressedSecondaryProblems: [],
      gateDisposition: 'ALLOW',
      constraintLayer: mapToConstraintLayer({
        gateDisposition: 'ALLOW',
        problemType: 'OPPORTUNITY',
        urgency: 'NOW',
        freshnessStatus: dso.cognition?.realitySnapshot?.freshness.status,
      }),
      actionDeadline: null,
    };
  }

  if (!primary && !chain) {
    return undefined;
  }

  const secondary = [
    ...hard.slice(1).map((v) => v.detail || v.type),
    ...violations.filter((v) => v.severity !== 'HARD').map((v) => v.detail || v.type),
    ...(primary && chain?.id === 'chain_predictive_failure' ? [primary.detail || primary.type] : []),
  ].filter(Boolean) as string[];

  const gateOutcome = dso.constraints?.gateOutcome;
  const gateDisposition =
    gateOutcome === 'ALLOW'
      ? 'ALLOW'
      : gateOutcome === 'NEED_USER_CONFIRM'
        ? 'NEED_CONFIRM'
        : gateOutcome === 'BLOCK'
          ? 'REJECT'
          : gateOutcome === 'ADJUST_REQUIRED'
            ? 'SUGGEST_REPLACE'
            : undefined;

  const preferPredictiveRoot =
    !!chain &&
    (chain.id === 'chain_predictive_failure' || chain.id === 'chain_fatigue') &&
    (chain.strength ?? 0) >= 0.75;

  const type: FocusedDecisionProblem['type'] = preferPredictiveRoot
    ? 'RISK'
    : primary
      ? primary.severity === 'HARD'
        ? 'INFEASIBILITY'
        : 'RISK'
      : 'UNCERTAINTY';

  const question = preferPredictiveRoot
    ? `如何打断影响链：${chain!.summary}`
    : primary?.detail
      ? `如何处理：${primary.detail}`
      : chain?.summary
        ? `如何打断影响链：${chain.summary}`
        : '当前最需要解决的决策问题是什么？';

  const urgency: FocusedDecisionProblem['urgency'] =
    primary?.severity === 'HARD' || preferPredictiveRoot ? 'NOW' : 'TODAY';
  const actionDeadline = synthesizeInterventionDeadline(dso);
  const constraintLayer = mapToConstraintLayer({
    gateDisposition,
    problemType: type,
    urgency,
    freshnessStatus: dso.cognition?.realitySnapshot?.freshness.status,
    hasHardConflict:
      primary?.severity === 'HARD' &&
      /FROAD|F_ROAD|VEHICLE|BLOCK|INFEASIB/i.test(`${primary.type} ${primary.detail ?? ''}`),
  });

  return {
    schema: 'tripnara/focused-decision-problem@v1',
    problemId: `focus_${preferPredictiveRoot ? chain!.id : primary?.type ?? chain?.id ?? 'unknown'}`,
    type,
    question,
    rootCause: {
      entity: preferPredictiveRoot
        ? chain!.steps[0]
        : primary
          ? `entity:violation_0`
          : chain?.steps[0],
      relation: preferPredictiveRoot
        ? 'CAUSES'
        : primary?.severity === 'HARD'
          ? 'CONFLICTS_WITH'
          : 'CAUSES',
      evidenceRefs: chain?.evidenceRefs ?? ['constraints'],
      detail: preferPredictiveRoot ? chain!.summary : primary?.detail ?? chain?.summary,
    },
    affectedScope: {},
    urgency,
    severity: preferPredictiveRoot
      ? chain!.strength
      : primary?.severity === 'HARD'
        ? 0.9
        : chain?.strength ?? 0.5,
    confidence: clamp01(dso.confidence ?? 0.65),
    whyThisProblem: preferPredictiveRoot
      ? `预测/疲劳影响链是根因；表面约束违反是派生症状，应先处理根因链路。`
      : primary
        ? `根因约束「${primary.type}」驱动其余派生症状；先处理它才能解锁规划。`
        : `影响链「${chain?.summary}」是当前最高杠杆问题。`,
    suppressedSecondaryProblems: secondary.slice(0, 12),
    gateDisposition,
    constraintLayer,
    actionDeadline: actionDeadline ?? null,
  };
}

/** 从 planDraft / alternatives / verification 收敛 FutureSimulationBundle */
export function buildFutureSimulationBundleFromDecisionState(
  dso: DecisionState,
): FutureSimulationBundle {
  const altsRaw = (dso.tripState as { orchestratorAlternatives?: unknown } | undefined)
    ?.orchestratorAlternatives;
  const altList = Array.isArray(altsRaw) ? altsRaw : [];
  const baseline: FutureSimulationBundle['baseline'] = {
    id: 'baseline',
    label: 'current_plan_draft',
    planDraft: dso.tripState?.planDraft,
    scores: {
      fatigue: dso.tripState?.fatigue as number | undefined,
      feasibility: dso.constraints?.feasible === false ? 0.2 : 0.8,
    },
  };

  const alternatives = altList.slice(0, 5).map((a, i) => {
    const row = a as { id?: string; label?: string; reason?: string };
    return {
      id: row.id ?? `alt_${i}`,
      label: row.label ?? row.reason ?? `alternative_${i}`,
      predictedRisks: row.reason ? [row.reason] : undefined,
    };
  });

  const issues = (dso.verification?.issues ?? []).map((iss) => ({
    code: (iss as { code?: string }).code,
    class: (iss as { class?: string }).class,
    detail: (iss as { message?: string; detail?: string }).message
      ?? (iss as { detail?: string }).detail,
  }));
  const hasFatal = dso.verification?.hasFatal === true
    || issues.some((i) => i.class === 'FATAL');
  const hasConflict = dso.verification?.hasConflict === true
    || issues.some((i) => i.class === 'CONFLICT');

  const verificationStatus = hasFatal ? 'BLOCK' : hasConflict ? 'NEED_CONFIRM' : 'PASS';
  const interventionDeadline =
    synthesizeInterventionDeadline(dso) ??
    (verificationStatus !== 'PASS'
      ? new Date(Date.now() + 6 * 3600 * 1000).toISOString()
      : undefined);
  const onset = dso.systemState?.lastUpdatedAt;
  const predictionWindow =
    interventionDeadline || onset
      ? {
          ...(onset ? { onset } : {}),
          ...(verificationStatus !== 'PASS'
            ? {
                deterioration: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
              }
            : {}),
          ...(interventionDeadline ? { interventionDeadline } : {}),
        }
      : undefined;

  return {
    schema: 'tripnara/future-simulation-bundle@v1',
    builtAt: nowIso(),
    baseline,
    alternatives,
    comparison: {
      feasibility: baseline.scores?.feasibility,
      fatigue: baseline.scores?.fatigue,
      safety: hasFatal ? 0.2 : hasConflict ? 0.5 : 0.8,
    },
    recommendedAlternativeId: alternatives[0]?.id,
    verification: {
      status: verificationStatus,
      issues,
    },
    predictionWindow,
    requiresConfirmation: verificationStatus !== 'PASS',
  };
}

function recordAdmission(
  cognition: DecisionCognitionSlice | undefined,
  phase: CognitionAdmissionPhase,
  admission: CognitionAdmission,
): DecisionCognitionSlice {
  const entry: CognitionAdmissionAuditEntry = {
    phase,
    ok: admission.ok,
    missing: [...admission.missing],
    at: nowIso(),
  };
  const prev = cognition?.admissionAudit ?? [];
  const withoutPhase = prev.filter((e) => e.phase !== phase);
  return mergeCognitionSlice(cognition, {
    admissionAudit: [...withoutPhase, entry].slice(-8),
  });
}

/**
 * 发现关系前：RealitySnapshot 存在、freshness 已判定、未知项已登记（含 blocking 标记本身不算失败）。
 */
export function admitRelationsDiscovery(
  cognition: DecisionCognitionSlice | undefined,
): CognitionAdmission {
  const missing: string[] = [];
  const snap = cognition?.realitySnapshot;
  if (!snap) missing.push('realitySnapshot');
  else {
    if (!snap.freshness) {
      missing.push('realitySnapshot.freshness');
    } else if (snap.freshness.status === 'UNKNOWN') {
      missing.push('realitySnapshot.freshness.status');
    }
    // 「关键未知项已标记」= unknowns 数组存在即可；blocking 项应被列出而非拦死后续收敛
    if (!Array.isArray(snap.unknowns)) {
      missing.push('realitySnapshot.unknowns');
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    phase: 'relations',
    marker: missing.length === 0 ? 'RELATIONS_READY' : undefined,
  };
}

/**
 * 聚焦问题前：至少一条影响链或约束边，且能区分根因/派生（有 impactChains 或 >1 edges）。
 */
export function admitProblemFocus(
  cognition: DecisionCognitionSlice | undefined,
): CognitionAdmission {
  const missing: string[] = [];
  const g = cognition?.relationGraph;
  if (!g) missing.push('relationGraph');
  else if (!g.impactChains?.length && !g.edges?.length) {
    missing.push('relationGraph.impactChains_or_edges');
  } else if (!g.impactChains?.length && (g.edges?.length ?? 0) < 1) {
    missing.push('relationGraph.root_vs_derived');
  }
  return {
    ok: missing.length === 0,
    missing,
    phase: 'problem_focus',
    marker: missing.length === 0 ? 'PROBLEM_FOCUSED' : undefined,
  };
}

/**
 * 预演未来前：FocusedDecisionProblem 唯一存在，且目标/不可放宽约束可判定（gateDisposition 或 gateOutcome）。
 * REJECT/BLOCK 仍允许预演（把失败写进 FutureSimulation），写回由 admitPlanWrite 拦截。
 */
export function admitFutureSimulation(
  cognition: DecisionCognitionSlice | undefined,
  dso?: DecisionState,
): CognitionAdmission {
  const missing: string[] = [];
  const focus = cognition?.focusedProblem;
  if (!focus) missing.push('focusedProblem');
  else if (!focus.problemId) missing.push('focusedProblem.problemId');
  const disposition = focus?.gateDisposition;
  const gate = dso?.constraints?.gateOutcome;
  if (!disposition && !gate) {
    missing.push('hard_constraints_or_gateDisposition');
  }
  return {
    ok: missing.length === 0,
    missing,
    phase: 'future_simulation',
    marker: missing.length === 0 ? 'FUTURE_SIMULATED' : undefined,
  };
}

/**
 * 写入前：推荐方案已 VERIFY（非 BLOCK）、用户/策略已授权、planVersion 一致可观测。
 */
export function admitPlanWrite(dso: DecisionState): CognitionAdmission {
  const missing: string[] = [];
  const cognition = dso.cognition;
  const expectsFuture = cognitionPhasePlan(cognition?.decisionDepth).futureSimulation;
  const futureStatus = cognition?.futureSimulation?.verification.status;
  if (expectsFuture && !cognition?.futureSimulation) {
    missing.push('futureSimulation');
  } else if (futureStatus === 'BLOCK') {
    missing.push('futureSimulation.verification.BLOCK');
  }
  const markers = cognition?.markers ?? [];
  if (!markers.includes('DECISION_AUTHORIZED')) {
    missing.push('DECISION_AUTHORIZED');
  }
  const planVersion = dso.tripState?.planVersion;
  if (planVersion == null) {
    missing.push('tripState.planVersion');
  }
  const gate = dso.constraints?.gateOutcome;
  if (gate === 'BLOCK') {
    missing.push('constraints.gateOutcome.BLOCK');
  }
  return {
    ok: missing.length === 0,
    missing,
    phase: 'plan_write',
    marker: missing.length === 0 ? 'PLAN_APPLIED' : undefined,
  };
}

/** 各认知深度应跑到哪一层（工程节点仍复用，本表供短路与观测） */
export function cognitionPhasePlan(depth: DecisionDepth | undefined): {
  reality: boolean;
  relations: boolean;
  problemFocus: boolean;
  futureSimulation: boolean;
} {
  switch (depth) {
    case 'REALITY_ONLY':
      return { reality: true, relations: false, problemFocus: false, futureSimulation: false };
    case 'REALITY_AND_RELATIONS':
      return { reality: true, relations: true, problemFocus: false, futureSimulation: false };
    case 'FOCUSED_DECISION':
      return { reality: true, relations: true, problemFocus: true, futureSimulation: true };
    case 'FULL_SIMULATION':
    default:
      return { reality: true, relations: true, problemFocus: true, futureSimulation: true };
  }
}

export function stampDecisionDepth(
  dso: DecisionState,
  depth: DecisionDepth | undefined,
): DecisionState {
  if (!depth) return dso;
  return {
    ...dso,
    cognition: mergeCognitionSlice(dso.cognition, { decisionDepth: depth }),
  };
}

/** REALITY_BUILD 出口：写入 realitySnapshot */
export function attachRealityCognition(
  dso: DecisionState,
  opts?: {
    decisionDepth?: DecisionDepth;
    /** 若已有 ROR 冻结的 v1 Snapshot，优先写入（Gate 只读 Canonical） */
    preferredSnapshot?: RealitySnapshot;
  },
): DecisionState {
  const withDepth = stampDecisionDepth(dso, opts?.decisionDepth ?? dso.cognition?.decisionDepth);
  const realitySnapshot =
    opts?.preferredSnapshot ?? buildRealitySnapshotFromDecisionState(withDepth);
  const cognition = pushMarker(
    mergeCognitionSlice(withDepth.cognition, { realitySnapshot }),
    'REALITY_READY',
  );
  return { ...withDepth, cognition };
}

/** RELATION + PROBLEM_FOCUS + Gate disposition */
export function attachRelationAndFocusCognition(
  dso: DecisionState,
  opts?: { enrichment?: RelationGraphEnrichment; decisionDepth?: DecisionDepth },
): DecisionState {
  const depth = opts?.decisionDepth ?? dso.cognition?.decisionDepth;
  const plan = cognitionPhasePlan(depth);
  let next = stampDecisionDepth(dso, depth);
  if (!plan.relations) {
    return next;
  }
  // 关系阶段依赖 RealitySnapshot；缺则先补齐（不另起 LLM）
  if (!next.cognition?.realitySnapshot) {
    next = attachRealityCognition(next, { decisionDepth: depth });
  }
  const relAdmit = admitRelationsDiscovery(next.cognition);
  next = {
    ...next,
    cognition: recordAdmission(next.cognition, 'relations', relAdmit),
  };
  if (!relAdmit.ok) {
    return next;
  }

  const relationGraph = buildRelationGraphFromDecisionState(next, opts?.enrichment);
  let cognition = pushMarker(
    mergeCognitionSlice(next.cognition, { relationGraph }),
    'RELATIONS_READY',
  );
  next = { ...next, cognition };
  if (!plan.problemFocus) {
    return next;
  }

  const focusAdmit = admitProblemFocus(next.cognition);
  next = {
    ...next,
    cognition: recordAdmission(next.cognition, 'problem_focus', focusAdmit),
  };
  if (!focusAdmit.ok) {
    return next;
  }

  const focusedProblem = buildFocusedDecisionProblemFromDecisionState(next, relationGraph);
  if (focusedProblem) {
    const ewDeadline =
      opts?.enrichment?.earlyWarning?.action_deadline ??
      opts?.enrichment?.earlyWarning?.intervention_deadline;
    const patched =
      ewDeadline && !focusedProblem.actionDeadline
        ? { ...focusedProblem, actionDeadline: ewDeadline }
        : focusedProblem;
    cognition = pushMarker(
      mergeCognitionSlice(next.cognition, { focusedProblem: patched }),
      'PROBLEM_FOCUSED',
    );
    next = { ...next, cognition };
  }
  return next;
}

/** FUTURE_SIMULATION 出口 */
export function attachFutureSimulationCognition(
  dso: DecisionState,
  opts?: { decisionDepth?: DecisionDepth },
): DecisionState {
  const depth = opts?.decisionDepth ?? dso.cognition?.decisionDepth;
  const plan = cognitionPhasePlan(depth);
  let next = stampDecisionDepth(dso, depth);
  if (!plan.futureSimulation) {
    return next;
  }
  const futAdmit = admitFutureSimulation(next.cognition, next);
  next = {
    ...next,
    cognition: recordAdmission(next.cognition, 'future_simulation', futAdmit),
  };
  if (!futAdmit.ok) {
    return next;
  }
  const futureSimulation = buildFutureSimulationBundleFromDecisionState(next);
  // enrichment deadline 若在 DSO 未写入，仍可由 attach 前的 systemState 提供；此处补齐
  const cognition = pushMarker(
    mergeCognitionSlice(next.cognition, { futureSimulation, decisionDepth: depth }),
    'FUTURE_SIMULATED',
  );
  // 若 focus 尚无截止时间而 future 有，回填 focus.actionDeadline
  const focus = cognition.focusedProblem;
  const deadline = futureSimulation.predictionWindow?.interventionDeadline;
  const cognitionWithDeadline =
    focus && deadline && !focus.actionDeadline
      ? mergeCognitionSlice(cognition, {
          focusedProblem: { ...focus, actionDeadline: deadline },
        })
      : cognition;
  return { ...next, cognition: cognitionWithDeadline };
}

/** 从 Orchestrator metadata 抽取 RelationGraph 旁路证据 */
export function extractRelationGraphEnrichmentFromMetadata(
  metadata: Record<string, unknown> | undefined,
): RelationGraphEnrichment | undefined {
  if (!metadata) return undefined;
  const ew = metadata.early_warning as RelationGraphEnrichment['earlyWarning'] | undefined;
  const axiom =
    (metadata.dominant_axiom_cid as string | undefined) ??
    (metadata.dominant_cid as string | undefined);
  if (!ew && !axiom) return undefined;
  return {
    earlyWarning: ew,
    dominantAxiomCid: axiom,
    axiomLabel: typeof metadata.dominant_axiom_label === 'string'
      ? metadata.dominant_axiom_label
      : undefined,
  };
}

export function resolveDecisionDepth(input: {
  routingTaskType?: string;
  orchestrateMode?: string;
  message?: string;
}): DecisionDepth {
  const msgRaw = input.message ?? '';
  const unified = resolveUnifiedIntent({ message: msgRaw });
  const mode = input.orchestrateMode;
  const rt = input.routingTaskType;

  /** 状态机 / DAG 入口：深度由语义意图决定，不被误传的轻量 taskType 压成 REALITY_ONLY */
  if (mode === 'PLANNING_STATE_MACHINE' || mode === 'DYNAMIC_DAG') {
    if (
      unified.semanticIntent === 'ASSESS_IMPACT' ||
      unified.semanticIntent === 'LOCAL_EDIT'
    ) {
      return 'FOCUSED_DECISION';
    }
    if (unified.semanticIntent === 'GLOBAL_PLAN') {
      return 'FULL_SIMULATION';
    }
    return 'FULL_SIMULATION';
  }

  /** P2：ASSESS（非 SM 误入） */
  if (unified.semanticIntent === 'ASSESS_IMPACT') {
    return 'FOCUSED_DECISION';
  }
  if (unified.semanticIntent === 'LOCAL_EDIT') {
    return 'FOCUSED_DECISION';
  }
  if (
    mode === 'LIGHTWEIGHT' ||
    rt === 'DATA_LOOKUP' ||
    rt === 'GENERIC_QA' ||
    rt === 'RAG_QA'
  ) {
    return 'REALITY_ONLY';
  }
  /**
   * 高置信 CONSULT 且非状态机入口时压到 REALITY_ONLY；
   * 勿把「规划冰岛7日」等误分类 CONSULT 压掉 FULL_SIMULATION。
   */
  if (
    unified.semanticIntent === 'CONSULT' &&
    unified.mutationPolicy === 'READ_ONLY' &&
    unified.confidence >= 0.75
  ) {
    return 'REALITY_ONLY';
  }
  const msg = msgRaw.toLowerCase();
  const simpleCommand =
    /删除|去掉|取消|改名|rename|delete|remove/.test(msg) &&
    !/强风|风暴|天气|重规划|调整行程|怎么办/.test(msg);
  if (simpleCommand && mode !== 'DYNAMIC_DAG') {
    return 'FOCUSED_DECISION';
  }
  if (rt === 'TRIP_PLANNING' || rt === 'BOOKING_WORKFLOW') {
    return 'FULL_SIMULATION';
  }
  if (mode === 'NEED_DESTINATION_COUNTRY') {
    return 'REALITY_AND_RELATIONS';
  }
  return 'FOCUSED_DECISION';
}

/**
 * 是否跑 PLAN_GEN→VERIFY→REPAIR 工程预演段。
 * 状态机真实规划入口（新建/绑定改排）即使深度字段被旧 resume 泄漏为浅层，也不得静默跳过。
 */
export function shouldRunPlanVerifyEngineering(
  depth: DecisionDepth | undefined,
  opts?: {
    orchestrateMode?: string;
    smEntry?: string;
    semanticIntent?: string;
  },
): boolean {
  const mode = opts?.orchestrateMode;
  const entry = opts?.smEntry ?? '';
  const intent = opts?.semanticIntent ?? '';
  if (
    mode === 'PLANNING_STATE_MACHINE' &&
    (/^(new_trip_with_country|bound_trip_planning|bound_trip_itinerary_adjust)$/.test(entry) ||
      intent === 'GLOBAL_PLAN' ||
      intent === 'LOCAL_EDIT')
  ) {
    return true;
  }
  return cognitionPhasePlan(depth).futureSimulation;
}

export function appendCognitionMarker(
  dso: DecisionState,
  marker: CognitionTraceMarker,
): DecisionState {
  return {
    ...dso,
    cognition: pushMarker(dso.cognition ?? {}, marker),
  };
}

/** 推荐方案已通过校验且可呈现/可写回前的授权里程碑 */
export function markDecisionAuthorized(dso: DecisionState): DecisionState {
  return appendCognitionMarker(dso, 'DECISION_AUTHORIZED');
}

export function markPlanApplied(dso: DecisionState): DecisionState {
  // 写回已发生后的观测里程碑；入口门禁用 admitPlanWrite / gatePlanWriteAdmission
  return appendCognitionMarker(dso, 'PLAN_APPLIED');
}

/**
 * 写回入口门禁：失败时写入 admissionAudit，供 Orchestrator 跳过 auto-apply。
 */
export function gatePlanWriteAdmission(dso: DecisionState): {
  dso: DecisionState;
  admission: CognitionAdmission;
} {
  const admission = admitPlanWrite(dso);
  return {
    dso: {
      ...dso,
      cognition: recordAdmission(dso.cognition, 'plan_write', admission),
    },
    admission,
  };
}

export function markOutcomeReconciled(dso: DecisionState): DecisionState {
  return appendCognitionMarker(dso, 'OUTCOME_RECONCILED');
}

/** Gate / Verify 结果是否足以授权呈现推荐方案（写回另需 PLAN_APPLIED） */
export function canAuthorizeDecisionPresentation(dso: DecisionState): boolean {
  const disposition = dso.cognition?.focusedProblem?.gateDisposition;
  if (disposition === 'REJECT') return false;
  const gate = dso.constraints?.gateOutcome;
  if (gate === 'BLOCK') return false;
  const futureStatus = dso.cognition?.futureSimulation?.verification.status;
  if (futureStatus === 'BLOCK') return false;
  return true;
}

export type UserDecisionAuthorizationInput = {
  clarificationAnswers?: Array<{ questionId?: string; value?: unknown } | null> | null;
  earlyWarningAcknowledged?: boolean;
  /** 显式用户确认令牌（策略/前端 consent） */
  explicitConsent?: boolean;
};

export function detectUserDecisionAuthorization(
  input: UserDecisionAuthorizationInput,
): { authorized: boolean; reason: string } {
  if (input.explicitConsent === true) {
    return { authorized: true, reason: 'explicit_consent' };
  }
  if (input.earlyWarningAcknowledged === true) {
    return { authorized: true, reason: 'early_warning_acknowledged' };
  }
  const answers = (input.clarificationAnswers ?? []).filter(Boolean);
  if (answers.length > 0) {
    const ids = answers
      .map((a) => a?.questionId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return {
      authorized: true,
      reason: ids.length
        ? `clarification_answers:${ids.slice(0, 4).join(',')}`
        : 'clarification_answers_present',
    };
  }
  return { authorized: false, reason: 'no_user_confirmation' };
}

/**
 * 用户确认路径：澄清回答 / early-warning 确认 / 显式 consent → DECISION_AUTHORIZED。
 * 若聚焦问题仍为 NEED_CONFIRM，同步放宽为 ALLOW（用户已表态）。
 */
export function authorizeDecisionFromUserConfirmation(
  dso: DecisionState,
  input: UserDecisionAuthorizationInput,
): DecisionState {
  const det = detectUserDecisionAuthorization(input);
  if (!det.authorized) return dso;

  let next = markDecisionAuthorized(dso);
  const focus = next.cognition?.focusedProblem;
  if (focus && (focus.gateDisposition === 'NEED_CONFIRM' || focus.gateDisposition === 'SUGGEST_REPLACE')) {
    next = {
      ...next,
      cognition: mergeCognitionSlice(next.cognition, {
        focusedProblem: {
          ...focus,
          gateDisposition: 'ALLOW',
          whyThisProblem: `${focus.whyThisProblem}（用户已确认：${det.reason}）`,
        },
      }),
    };
  }

  return {
    ...next,
    cognition: {
      ...(next.cognition ?? {}),
      updatedAt: nowIso(),
    },
    systemState: {
      ...(next.systemState ?? ({} as DecisionState['systemState'])),
      earlyWarningAcknowledged:
        input.earlyWarningAcknowledged === true
          ? true
          : next.systemState?.earlyWarningAcknowledged,
    },
  };
}

/** route_and_run payload / observability 用的轻量认知回显 */
export function buildCognitionClientEcho(cognition: DecisionCognitionSlice | undefined):
  | {
      schema: 'tripnara/cognition_echo@v1';
      decision_depth?: DecisionDepth;
      markers: CognitionTraceMarker[];
      reality?: {
        snapshotId: string;
        confidence: number;
        freshness: string;
        unknownCount: number;
        conflictCount?: number;
      };
      relations?: {
        nodeCount: number;
        edgeCount: number;
        impactChainCount: number;
      };
      focused_problem?: {
        problemId: string;
        type: string;
        question: string;
        urgency: string;
        gateDisposition?: string;
        constraintLayer?: string;
        actionDeadline?: string | null;
        whyThisProblem: string;
        suppressedSecondaryProblems: string[];
      };
      future?: {
        status: string;
        recommendedAlternativeId?: string;
        alternativeCount: number;
        requiresConfirmation?: boolean;
        interventionDeadline?: string;
      };
      four_layer?: ReturnType<typeof buildCognitionFourLayerView>;
      admission_audit?: Array<{
        phase: string;
        ok: boolean;
        missing: string[];
      }>;
    }
  | undefined {
  if (!cognition) return undefined;
  const focus = cognition.focusedProblem;
  const future = cognition.futureSimulation;
  const reality = cognition.realitySnapshot;
  const rel = cognition.relationGraph;
  const audit = cognition.admissionAudit;
  const four_layer = buildCognitionFourLayerView(cognition);
  return {
    schema: 'tripnara/cognition_echo@v1',
    decision_depth: cognition.decisionDepth,
    markers: [...(cognition.markers ?? [])],
    ...(reality
      ? {
          reality: {
            snapshotId: reality.snapshotId,
            confidence: reality.confidence,
            freshness: reality.freshness.status,
            unknownCount: reality.unknowns.length,
            conflictCount: reality.conflicts?.length ?? 0,
          },
        }
      : {}),
    ...(rel
      ? {
          relations: {
            nodeCount: rel.nodes.length,
            edgeCount: rel.edges.length,
            impactChainCount: rel.impactChains.length,
          },
        }
      : {}),
    ...(focus
      ? {
          focused_problem: {
            problemId: focus.problemId,
            type: focus.type,
            question: focus.question,
            urgency: focus.urgency,
            gateDisposition: focus.gateDisposition,
            constraintLayer: focus.constraintLayer,
            actionDeadline: focus.actionDeadline ?? null,
            whyThisProblem: focus.whyThisProblem,
            suppressedSecondaryProblems: focus.suppressedSecondaryProblems.slice(0, 5),
          },
        }
      : {}),
    ...(future
      ? {
          future: {
            status: future.verification.status,
            recommendedAlternativeId: future.recommendedAlternativeId,
            alternativeCount: future.alternatives.length,
            requiresConfirmation: future.requiresConfirmation === true,
            interventionDeadline: future.predictionWindow?.interventionDeadline,
          },
        }
      : {}),
    ...(four_layer ? { four_layer } : {}),
    ...(audit?.length
      ? {
          admission_audit: audit.map((a) => ({
            phase: a.phase,
            ok: a.ok,
            missing: a.missing,
          })),
        }
      : {}),
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
