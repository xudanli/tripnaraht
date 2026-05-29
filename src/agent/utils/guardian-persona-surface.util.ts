// src/agent/utils/guardian-persona-surface.util.ts
import type {
  GateResult,
  GuardianEvidenceAtom,
  GuardianResultsSource,
  RequiredAdjustment,
} from '../interfaces/trip-plan.interface';

type GateViolation = GateResult['violations'][0];

function violationTag(v: GateViolation): GuardianEvidenceAtom['tag'] {
  switch (v.type) {
    case 'SAFETY':
      return 'safety';
    case 'REACHABILITY':
      return 'reachability';
    case 'DEM':
      return 'dem';
    case 'FATIGUE':
      return 'fatigue';
    default:
      return 'generic';
  }
}

function violationAtom(v: GateViolation): GuardianEvidenceAtom {
  return {
    text: v.detail,
    violation_code: `GATE_VIOLATION:${v.type}:${v.severity}`,
    tag: violationTag(v),
  };
}

function adjustmentTag(action: RequiredAdjustment['action']): GuardianEvidenceAtom['tag'] {
  if (action === 'REPLACE_SEGMENT' || action === 'REPLACE_POI') return 'replace_segment';
  if (action === 'SHORTEN_DAY') return 'pacing';
  if (action === 'REDUCE_SCOPE_OR_ADD_EVIDENCE') return 'scope';
  return 'adjustment';
}

function adjustmentAtom(a: RequiredAdjustment): GuardianEvidenceAtom {
  return {
    text: `${a.action}: ${a.why}`,
    violation_code: `ADJUSTMENT:${a.action}`,
    tag: adjustmentTag(a.action),
  };
}

function atomsToSummaryLines(atoms: GuardianEvidenceAtom[], fallback: string): string[] {
  const lines = atoms.map(a => a.text).filter(Boolean);
  return lines.length ? lines.slice(0, 12) : [fallback];
}

const PROJECTION_SOURCE: GuardianResultsSource = 'violation_projection_v1';

/**
 * 由门控聚合结果推导三人格（Abu / Dr.Dre / Neptune）可读结论。
 * 与完整「三人格辩论」Skill 解耦：基于 violations / required_adjustments 的归一化投影。
 */
export function deriveGuardianPersonaVotes(gate: GateResult): NonNullable<GateResult['guardian_results']> {
  const violations = gate.violations ?? [];
  const adjustments = gate.required_adjustments ?? [];
  const hardVs = violations.filter(v => v.severity === 'HARD');

  const abuReject = gate.gate_result === 'BLOCK' || hardVs.length > 0;

  const safetyOrReachHard = (v: GateViolation) =>
    v.severity === 'HARD' || ['SAFETY', 'REACHABILITY', 'DEM'].includes(v.type);

  const abuAtomsReject: GuardianEvidenceAtom[] = [
    ...hardVs.map(violationAtom),
    ...violations.filter(v => v.severity !== 'HARD' && safetyOrReachHard(v)).map(violationAtom),
  ].slice(0, 12);

  const abuAtomsAllow: GuardianEvidenceAtom[] = violations
    .filter(v => ['SAFETY', 'REACHABILITY', 'DEM'].includes(v.type))
    .map(violationAtom)
    .slice(0, 12);

  const abuAtoms = abuReject
    ? abuAtomsReject.length
      ? abuAtomsReject
      : [{ text: '门控否决', violation_code: 'GATE:BLOCK_NO_DETAIL', tag: 'safety' as const }]
    : abuAtomsAllow.length
      ? abuAtomsAllow
      : [{ text: 'Abu：硬门与软安全项未否决', violation_code: 'GATE:ABU_ALLOW_DEFAULT', tag: 'safety' as const }];

  const abu: NonNullable<GateResult['guardian_results']>['abu'] = {
    verdict: abuReject ? 'REJECT' : 'ALLOW',
    evidence: atomsToSummaryLines(abuAtoms, '门控否决'),
    evidence_atoms: abuAtoms,
  };

  const fatigueVs = violations.filter(v => v.type === 'FATIGUE');
  const shorten = adjustments.filter(a => a.action === 'SHORTEN_DAY');
  const dreAtoms: GuardianEvidenceAtom[] = [
    ...fatigueVs.map(violationAtom),
    ...shorten.map(adjustmentAtom),
  ]
    .filter(Boolean)
    .slice(0, 12);

  const drdre: NonNullable<GateResult['guardian_results']>['drdre'] =
    dreAtoms.length > 0
      ? {
          verdict: 'ADJUST',
          evidence: atomsToSummaryLines(dreAtoms, '节奏调整'),
          evidence_atoms: dreAtoms,
        }
      : {
          verdict: 'ALLOW',
          evidence: ['Dr.Dre：节奏与体力未检出需调整项'],
          evidence_atoms: [
            {
              text: 'Dr.Dre：节奏与体力未检出需调整项',
              violation_code: 'GATE:DRDRE_ALLOW_DEFAULT',
              tag: 'pacing',
            },
          ],
        };

  const replaceSeg = adjustments.filter(a => a.action === 'REPLACE_SEGMENT');
  let neptune: NonNullable<GateResult['guardian_results']>['neptune'];
  if (replaceSeg.length > 0) {
    const nAtoms = replaceSeg.map(adjustmentAtom).slice(0, 12);
    neptune = {
      verdict: 'REPLACE',
      evidence: atomsToSummaryLines(nAtoms, '路段替换'),
      evidence_atoms: nAtoms,
    };
  } else if (adjustments.length > 0) {
    const nAtoms = adjustments.map(adjustmentAtom).slice(0, 12);
    neptune = {
      verdict: 'ALLOW',
      evidence: atomsToSummaryLines(nAtoms, '结构调整'),
      evidence_atoms: nAtoms,
    };
  } else {
    const nAtoms: GuardianEvidenceAtom[] = [
      {
        text: 'Neptune：未触发路段替换',
        violation_code: 'GATE:NEPTUNE_ALLOW_DEFAULT',
        tag: 'generic',
      },
    ];
    neptune = {
      verdict: 'ALLOW',
      evidence: atomsToSummaryLines(nAtoms, 'Neptune：未触发路段替换'),
      evidence_atoms: nAtoms,
    };
  }

  return {
    source: PROJECTION_SOURCE,
    is_simulated: true,
    abu,
    drdre,
    neptune,
  };
}

function isGuardianSurfaceComplete(g: GateResult['guardian_results'] | undefined): boolean {
  return Boolean(g?.abu?.verdict && g?.drdre?.verdict && g?.neptune?.verdict);
}

/**
 * 统一出口：在写入 `route_and_run` payload 前保证 `gate_result.guardian_results` 存在。
 * 若上游已提供完整三人格结论（例如未来 Skill 直连），则不再覆盖推导，仅可选补全审计元数据。
 */
export function attachGuardianPersonaSurface(gate: GateResult | null | undefined): GateResult | undefined {
  if (!gate) return undefined;
  if (isGuardianSurfaceComplete(gate.guardian_results)) {
    const gr = gate.guardian_results!;
    if (gr.source != null && gr.is_simulated !== undefined) {
      return gate;
    }
    return {
      ...gate,
      guardian_results: {
        ...gr,
        source: gr.source ?? 'upstream_unlabeled',
        is_simulated: gr.is_simulated ?? false,
      },
    };
  }
  return { ...gate, guardian_results: deriveGuardianPersonaVotes(gate) };
}
