/**
 * 将 TripNARA E2E Case 导出为 SkillEvolver replay-cases/*.json
 */
import type { E2ECase } from '../../../../trips/decision/evaluation/e2e-case.types';
import type {
  ReplayAssertion,
  ReplayCaseFixture,
  SkillEvolverTask,
} from '../interfaces/skill-evolver.types';

function slugCaseId(e2eId: string): string {
  return e2eId.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function buildSuccessCriteria(e2e: E2ECase): string {
  const parts: string[] = [];
  if (e2e.expected.finalState?.allowed != null) {
    parts.push(`final allowed=${e2e.expected.finalState.allowed}`);
  }
  if (e2e.expected.abuExpected?.action) {
    parts.push(`Abu ${e2e.expected.abuExpected.action}`);
  }
  if (e2e.expected.drdreExpected?.mustAdjust != null) {
    parts.push(`Dr.Dre mustAdjust=${e2e.expected.drdreExpected.mustAdjust}`);
  }
  if (e2e.expected.neptuneExpected?.mustRepair != null) {
    parts.push(`Neptune mustRepair=${e2e.expected.neptuneExpected.mustRepair}`);
  }
  return parts.join('; ') || '完成决策流程';
}

function isInternalFixtureFragment(frag: string): boolean {
  const s = frag.toLowerCase().trim();
  return (
    s.includes('fixture-meta') ||
    s.includes('fixture-dem') ||
    /entropy=\d/.test(s) ||
    /^cand=\d+$/.test(s) ||
    /^repair=\d+$/.test(s) ||
    s === 'no_optimize'
  );
}

function reasonCodeToTrajectoryHint(code: string): string {
  const c = code.toLowerCase();
  if (c.includes('dem')) return 'dem';
  return c.replace(/^e_/, '').replace(/_/g, ' ');
}

export function buildAssertionsFromE2e(e2e: E2ECase): ReplayAssertion[] {
  const assertions: ReplayAssertion[] = [];

  if (e2e.expected.finalState?.allowed === true) {
    assertions.push({ type: 'task_completed', value: 'true', weight: 2 });
  }

  if (e2e.expected.abuExpected?.action) {
    const action = e2e.expected.abuExpected.action.toLowerCase();
    assertions.push({
      type: 'trajectory_contains',
      value: action,
      weight: 1,
    });
    assertions.push({
      type: 'skill_body_contains',
      value: action,
      weight: 2,
    });
  }

  for (const code of e2e.expected.abuExpected?.reasonCodes ?? []) {
    const hint = reasonCodeToTrajectoryHint(String(code));
    assertions.push({
      type: 'trajectory_contains',
      value: hint,
      weight: 0.5,
    });
    if (hint.length >= 3) {
      assertions.push({
        type: 'skill_body_contains',
        value: hint,
        weight: 1,
      });
    }
  }

  const auditIncludes =
    e2e.expected.traceSummary?.metaDecisionAudit
      ? [e2e.expected.traceSummary.metaDecisionAudit]
      : [];
  const optIncludes =
    e2e.expected.scientificExpected?.optimization?.metaDecisionAuditIncludes ?? [];
  for (const frag of [...auditIncludes, ...optIncludes].slice(0, 3)) {
    if (typeof frag === 'string' && frag.length > 2 && !isInternalFixtureFragment(frag)) {
      assertions.push({ type: 'trajectory_contains', value: frag.slice(0, 40), weight: 0.5 });
    }
  }

  if (e2e.expected.routeDirectionTags?.includes('highlands')) {
    assertions.push({ type: 'trajectory_contains', value: '高地', weight: 1 });
  } else if (e2e.metadata?.tags?.includes('highlands')) {
    assertions.push({ type: 'trajectory_contains', value: '高地', weight: 0.5 });
  }

  if (e2e.input.countryCode) {
    assertions.push({
      type: 'skill_body_contains',
      value: e2e.input.countryCode.toLowerCase(),
      weight: 0.5,
    });
  }

  if (e2e.expected.drdreExpected?.mustAdjust) {
    assertions.push({ type: 'action_contains', value: 'pace', weight: 0.5 });
  }
  if (e2e.expected.neptuneExpected?.mustRepair) {
    assertions.push({ type: 'action_contains', value: 'repair', weight: 0.5 });
  }

  return assertions;
}

export function e2eCaseToReplayFixture(e2e: E2ECase): ReplayCaseFixture & { source_e2e_case_id: string } {
  const task: SkillEvolverTask = {
    id: e2e.id,
    description: e2e.description ?? e2e.name,
    initialObservation: e2e.input.userQuery,
    successCriteria: buildSuccessCriteria(e2e),
    optimalSteps: e2e.expected.finalState?.planDays ? Math.min(8, e2e.expected.finalState.planDays + 2) : 4,
  };

  return {
    caseId: slugCaseId(e2e.id),
    description: `[e2e] ${e2e.name}`,
    source_e2e_case_id: e2e.id,
    tasks: [task],
    assertions: buildAssertionsFromE2e(e2e),
  };
}

export function e2eCasesToReplayFixtures(cases: E2ECase[]): Array<ReplayCaseFixture & { source_e2e_case_id: string }> {
  return cases.map(e2eCaseToReplayFixture);
}
