import type { PlanState } from '../../../skills/plan/shared/plan-state.types';
import type { DecisionLogEntry } from './decision-result.types';
import {
  mapAbuGateToExistenceStatus,
  mapFatigueToDreCostStatus,
  mapPersonaVerdictToGuardianAction,
  type AbuExistenceStatus,
  type DreCostStatus,
} from './guardian-action.types';
import type {
  GuardianDecisionLogMetadata,
  GuardianExpressionPhase,
  GuardianPersonaPresentation,
  LeadSpeakerPersona,
  LeadSpeakerScenario,
  PersonaStructuredStatus,
} from './guardian-presentation.types';

export function inferGuardianExpressionPhase(
  planState: Pick<PlanState, 'metadata'>,
): GuardianExpressionPhase {
  const meta = planState.metadata as Record<string, unknown> | undefined;
  const explicit = meta?.guardianExpressionPhase ?? meta?.expressionPhase;
  if (explicit === 'in_trip' || explicit === 'planning') {
    return explicit;
  }
  const lifecycle = meta?.tripStatus ?? meta?.tripLifecycle ?? meta?.tripPhase;
  if (lifecycle === 'TRAVELING' || lifecycle === 'IN_TRIP' || lifecycle === 'ACTIVE') {
    return 'in_trip';
  }
  return 'planning';
}

export function resolveAbuExistenceFromPlanState(
  planState: Pick<PlanState, 'gate'>,
): AbuExistenceStatus {
  const hasHardBlock = planState.gate.status === 'REJECT';
  return mapAbuGateToExistenceStatus(planState.gate.status, hasHardBlock);
}

export function resolveDreCostFromPlanState(
  planState: Pick<PlanState, 'pace'>,
): DreCostStatus {
  return mapFatigueToDreCostStatus(planState.pace.fatigueScore?.paceScore);
}

export function buildStructuredStatusFromPresentation(
  presentation: Pick<GuardianPersonaPresentation, 'actions' | 'structuredStatus'>,
): PersonaStructuredStatus {
  return presentation.structuredStatus;
}

export function buildGuardianDecisionLogMetadata(input: {
  presentation: GuardianPersonaPresentation;
  revalidationPass?: GuardianDecisionLogMetadata['revalidationPass'];
}): GuardianDecisionLogMetadata {
  return {
    guardianExpressionPhase: input.presentation.expressionPhase,
    guardianLeadSpeaker: input.presentation.leadSpeaker,
    guardianScenario: input.presentation.scenario,
    guardianStructuredStatus: input.presentation.structuredStatus,
    guardianActions: input.presentation.actions,
    revalidationPass: input.revalidationPass,
  };
}

export function mergeGuardianMetadataIntoLog(
  metadata: Record<string, unknown> | undefined,
  guardian: GuardianDecisionLogMetadata,
): Record<string, unknown> {
  return {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    ...guardian,
  };
}

export function buildStructuredStatusFromSlices(input: {
  abuVerdict?: 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';
  dreVerdict?: 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';
  neptuneVerdict?: 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';
  abuExistence?: AbuExistenceStatus;
  dreCost?: DreCostStatus;
}): PersonaStructuredStatus {
  const status: PersonaStructuredStatus = {};

  if (input.abuExistence) {
    status.abu = {
      existence: input.abuExistence,
      action: input.abuVerdict
        ? mapPersonaVerdictToGuardianAction('ABU', input.abuVerdict) ?? undefined
        : undefined,
    };
  }

  if (input.dreCost) {
    status.dre = {
      cost: input.dreCost,
      action: input.dreVerdict
        ? mapPersonaVerdictToGuardianAction('DR_DRE', input.dreVerdict) ?? undefined
        : undefined,
    };
  }

  if (input.neptuneVerdict && input.neptuneVerdict !== 'ALLOW') {
    status.neptune = {
      action: mapPersonaVerdictToGuardianAction('NEPTUNE', input.neptuneVerdict) ?? undefined,
    };
  }

  if (input.abuVerdict === 'NEED_CONFIRM') {
    status.user = { action: 'CHOOSE' };
  }

  return status;
}

export function presentationDisplayStyle(
  phase: GuardianExpressionPhase,
): GuardianPersonaPresentation['displayStyle'] {
  return phase === 'in_trip' ? 'execution_brief' : 'design_advisory';
}

export function toBriefLines(
  presentation: Pick<
    GuardianPersonaPresentation,
    'leadSpeaker' | 'supportingLines' | 'headline' | 'scenario'
  >,
): string[] {
  const lines: string[] = [];
  const lead = presentation.supportingLines.find((l) => l.persona === presentation.leadSpeaker);
  if (presentation.scenario === 'SAFETY_BLOCK' || presentation.scenario === 'SAFETY_WARN') {
    lines.push(`Abu：${presentation.headline.replace(/^Abu[^：]*：?/, '').trim() || '原方案需调整'}`);
  } else if (presentation.leadSpeaker === 'NEPTUNE') {
    lines.push(`Neptune：${lead?.text ?? '已准备替代方案'}`);
  } else if (presentation.leadSpeaker === 'DR_DRE') {
    lines.push(`Dr.Dre：${lead?.text ?? '节奏需调整'}`);
  }

  for (const line of presentation.supportingLines) {
    if (line.persona === presentation.leadSpeaker) continue;
    const prefix =
      line.persona === 'ABU' ? 'Abu' : line.persona === 'DR_DRE' ? 'Dr.Dre' : 'Neptune';
    lines.push(`${prefix}：${line.text}`);
  }

  return lines.slice(0, 3);
}

export type { LeadSpeakerPersona, LeadSpeakerScenario };

type LegacyVerdict = 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';

function decisionActionToVerdict(
  action: DecisionLogEntry['action'],
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
): LegacyVerdict {
  if (action === 'REJECT') return persona === 'ABU' ? 'REJECT' : 'ADJUST';
  if (action === 'ADJUST') return 'ADJUST';
  if (action === 'REPLACE' || action === 'MODIFY') return 'REPLACE';
  if (action === 'ALLOW' || action === 'EVALUATE') return 'ALLOW';
  return 'ALLOW';
}

/** 从编排日志推断各席位最新 verdict（用于 saveLogs metadata） */
export function inferPersonaVerdictsFromOrchestrationLogs(
  logs: DecisionLogEntry[],
): {
  abuVerdict?: LegacyVerdict;
  dreVerdict?: LegacyVerdict;
  neptuneVerdict?: LegacyVerdict;
} {
  const out: {
    abuVerdict?: LegacyVerdict;
    dreVerdict?: LegacyVerdict;
    neptuneVerdict?: LegacyVerdict;
  } = {};
  for (const log of logs) {
    if (log.persona === 'ABU') {
      out.abuVerdict = decisionActionToVerdict(log.action, 'ABU');
    }
    if (log.persona === 'DR_DRE') {
      out.dreVerdict = decisionActionToVerdict(log.action, 'DR_DRE');
    }
    if (log.persona === 'NEPTUNE') {
      out.neptuneVerdict = decisionActionToVerdict(log.action, 'NEPTUNE');
    }
  }
  return out;
}

export function inferGuardianMetadataFromLogEntry(
  log: Pick<DecisionLogEntry, 'persona' | 'action' | 'metadata'>,
): GuardianDecisionLogMetadata {
  const prior =
    log.metadata && typeof log.metadata === 'object'
      ? (log.metadata as GuardianDecisionLogMetadata)
      : {};

  const patch: GuardianDecisionLogMetadata = {};
  if (prior.revalidationPass) {
    patch.revalidationPass = prior.revalidationPass;
  }

  const persona = log.persona;
  if (persona === 'ABU' || persona === 'DR_DRE' || persona === 'NEPTUNE') {
    const verdict = decisionActionToVerdict(log.action, persona);
    const guardianAction = mapPersonaVerdictToGuardianAction(persona, verdict);
    if (guardianAction) {
      patch.guardianActions = {
        ...(prior.guardianActions ?? {}),
        ...(persona === 'ABU' ? { abu: guardianAction } : {}),
        ...(persona === 'DR_DRE' ? { dre: guardianAction } : {}),
        ...(persona === 'NEPTUNE' ? { neptune: guardianAction } : {}),
      };
    }
    if (persona === 'ABU' && verdict === 'REJECT') {
      patch.guardianStructuredStatus = {
        ...(prior.guardianStructuredStatus ?? {}),
        abu: { existence: 'BLOCK', action: guardianAction ?? 'BLOCK' },
      };
    }
  }

  if (persona === 'USER_ACTION' && log.action === 'MODIFY') {
    patch.guardianActions = {
      ...(prior.guardianActions ?? {}),
      user: 'CHOOSE',
    };
  }

  return patch;
}

/** 编排结束：为每条 log 合并 run 级 + entry 级 guardian metadata */
export function enrichOrchestrationLogsWithGuardianMetadata(
  logs: DecisionLogEntry[],
  options?: { expressionPhase?: GuardianExpressionPhase },
): DecisionLogEntry[] {
  if (logs.length === 0) return logs;

  const verdicts = inferPersonaVerdictsFromOrchestrationLogs(logs);
  const abuExistence: AbuExistenceStatus | undefined =
    verdicts.abuVerdict === 'REJECT'
      ? 'BLOCK'
      : verdicts.abuVerdict === 'NEED_CONFIRM'
        ? 'REQUIRE_CONFIRMATION'
        : verdicts.abuVerdict
          ? 'PASS'
          : undefined;

  const structuredStatus = buildStructuredStatusFromSlices({
    ...verdicts,
    abuExistence,
  });

  const actions: GuardianDecisionLogMetadata['guardianActions'] = {};
  if (verdicts.abuVerdict) {
    const a = mapPersonaVerdictToGuardianAction('ABU', verdicts.abuVerdict);
    if (a) actions.abu = a;
  }
  if (verdicts.dreVerdict) {
    const a = mapPersonaVerdictToGuardianAction('DR_DRE', verdicts.dreVerdict);
    if (a) actions.dre = a;
  }
  if (verdicts.neptuneVerdict) {
    const a = mapPersonaVerdictToGuardianAction('NEPTUNE', verdicts.neptuneVerdict);
    if (a) actions.neptune = a;
  }

  const runMeta: GuardianDecisionLogMetadata = {
    guardianExpressionPhase: options?.expressionPhase ?? 'planning',
    guardianStructuredStatus: structuredStatus,
    guardianActions: Object.keys(actions).length ? actions : undefined,
    guardianLeadSpeaker:
      verdicts.abuVerdict === 'REJECT'
        ? 'ABU'
        : verdicts.neptuneVerdict === 'REPLACE'
          ? 'NEPTUNE'
          : verdicts.dreVerdict === 'ADJUST'
            ? 'DR_DRE'
            : 'ABU',
    guardianScenario:
      verdicts.abuVerdict === 'REJECT'
        ? 'SAFETY_BLOCK'
        : verdicts.neptuneVerdict === 'REPLACE'
          ? 'INTENT_REPAIR'
          : verdicts.dreVerdict === 'ADJUST'
            ? 'PACE_COST'
            : 'ALL_CLEAR',
  };

  return logs.map((log) => {
    const entryMeta = inferGuardianMetadataFromLogEntry(log);
    const merged = mergeGuardianMetadataIntoLog(
      log.metadata as Record<string, unknown> | undefined,
      {
        ...runMeta,
        ...entryMeta,
        revalidationPass: entryMeta.revalidationPass ?? runMeta.revalidationPass,
      },
    );
    return { ...log, metadata: merged };
  });
}
