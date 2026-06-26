/**
 * Persona Expression Layer — 单主角输出路由
 */
import {
  mapPersonaVerdictToGuardianAction,
  type AbuExistenceStatus,
  type DreCostStatus,
} from '../../trips/decision/shared/guardian-action.types';
import {
  buildStructuredStatusFromSlices,
  presentationDisplayStyle,
  toBriefLines,
} from '../../trips/decision/shared/guardian-decision-metadata.util';
import { enrichGuardianPresentation } from '../../trips/decision/shared/guardian-presentation.util';
import type {
  GuardianExpressionPhase,
  GuardianPersonaPresentation,
  LeadSpeakerPersona,
  LeadSpeakerScenario,
  PersonaStructuredStatus,
} from '../../trips/decision/shared/guardian-presentation.types';

export type {
  GuardianExpressionPhase,
  GuardianPersonaPresentation,
  LeadSpeakerPersona,
  LeadSpeakerScenario,
  PersonaStructuredStatus,
};

/** @deprecated 使用 GuardianPersonaPresentation */
export type PersonaPresentation = GuardianPersonaPresentation;

export interface PersonaStatementSlice {
  persona: LeadSpeakerPersona;
  icon: string;
  name: string;
  verdict: 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';
  explanation: string;
}

export interface BuildPersonaPresentationOptions {
  expressionPhase?: GuardianExpressionPhase;
  structuredStatus?: PersonaStructuredStatus;
  abuExistence?: AbuExistenceStatus;
  dreCost?: DreCostStatus;
}

const PERSONA_LABELS: Record<
  LeadSpeakerPersona,
  { name: string; leadTitle: string }
> = {
  ABU: { name: 'Abu', leadTitle: 'Abu 发现风险' },
  DR_DRE: { name: 'Dr.Dre', leadTitle: 'Dr.Dre 评估节奏' },
  NEPTUNE: { name: 'Neptune', leadTitle: 'Neptune 已准备替代方案' },
};

function isActive(verdict: PersonaStatementSlice['verdict']): boolean {
  return verdict !== 'ALLOW';
}

export function resolveLeadSpeakerScenario(
  personas: {
    abu: PersonaStatementSlice | null;
    drdre: PersonaStatementSlice | null;
    neptune: PersonaStatementSlice | null;
  },
): LeadSpeakerScenario {
  const abu = personas.abu;
  const dre = personas.drdre;
  const nep = personas.neptune;

  const abuBlock = abu?.verdict === 'REJECT';
  const abuWarn = abu?.verdict === 'NEED_CONFIRM';
  const dreActive = dre != null && isActive(dre.verdict);
  const nepActive = nep != null && isActive(nep.verdict);

  const activeCount = [abuBlock || abuWarn, dreActive, nepActive].filter(Boolean).length;

  if (activeCount >= 2) return 'MULTI_FACTOR';
  if (abuBlock) return 'SAFETY_BLOCK';
  if (nepActive) return 'INTENT_REPAIR';
  if (dreActive) return 'PACE_COST';
  if (abuWarn) return 'SAFETY_WARN';
  return 'ALL_CLEAR';
}

export function pickLeadSpeaker(
  scenario: LeadSpeakerScenario,
  personas: {
    abu: PersonaStatementSlice | null;
    drdre: PersonaStatementSlice | null;
    neptune: PersonaStatementSlice | null;
  },
): LeadSpeakerPersona {
  switch (scenario) {
    case 'SAFETY_BLOCK':
    case 'SAFETY_WARN':
      return 'ABU';
    case 'PACE_COST':
      return 'DR_DRE';
    case 'INTENT_REPAIR':
      return 'NEPTUNE';
    case 'MULTI_FACTOR':
      if (personas.abu?.verdict === 'REJECT') return 'ABU';
      if (personas.neptune && isActive(personas.neptune.verdict)) return 'NEPTUNE';
      if (personas.drdre && isActive(personas.drdre.verdict)) return 'DR_DRE';
      return 'ABU';
    case 'ALL_CLEAR':
    default:
      return 'ABU';
  }
}

function supportingRole(
  persona: LeadSpeakerPersona,
): 'evidence' | 'pace' | 'repair' {
  if (persona === 'ABU') return 'evidence';
  if (persona === 'DR_DRE') return 'pace';
  return 'repair';
}

function firstSentence(text: string, maxLen = 120): string {
  const trimmed = text.trim();
  const dot = trimmed.search(/[。！？.!?]\s*/);
  const head = dot > 0 ? trimmed.slice(0, dot + 1) : trimmed;
  return head.length > maxLen ? `${head.slice(0, maxLen)}…` : head;
}

export function buildPersonaPresentation(
  personas: {
    abu: PersonaStatementSlice | null;
    drdre: PersonaStatementSlice | null;
    neptune: PersonaStatementSlice | null;
  },
  options: BuildPersonaPresentationOptions = {},
): GuardianPersonaPresentation {
  const scenario = resolveLeadSpeakerScenario(personas);
  const leadSpeaker = pickLeadSpeaker(scenario, personas);
  const lead =
    personas[leadSpeaker === 'DR_DRE' ? 'drdre' : leadSpeaker === 'NEPTUNE' ? 'neptune' : 'abu'];
  const labels = PERSONA_LABELS[leadSpeaker];

  const slices: PersonaStatementSlice[] = [personas.abu, personas.drdre, personas.neptune].filter(
    (p): p is PersonaStatementSlice => p != null,
  );

  const actions: GuardianPersonaPresentation['actions'] = {};
  for (const slice of slices) {
    const action = mapPersonaVerdictToGuardianAction(slice.persona, slice.verdict);
    if (!action) continue;
    if (action === 'CHOOSE') {
      actions.user = 'CHOOSE';
      continue;
    }
    if (slice.persona === 'ABU') actions.abu = action;
    if (slice.persona === 'DR_DRE') actions.dre = action;
    if (slice.persona === 'NEPTUNE') actions.neptune = action;
  }

  const supportingLines = slices
    .filter((s) => s.persona !== leadSpeaker && isActive(s.verdict))
    .map((s) => ({
      persona: s.persona,
      icon: s.icon,
      name: s.name,
      role: supportingRole(s.persona),
      text: s.explanation,
    }));

  const mode: GuardianPersonaPresentation['mode'] =
    scenario === 'MULTI_FACTOR' ? 'decision_committee' : 'single_lead';

  const headline =
    scenario === 'ALL_CLEAR'
      ? '方案已通过安全检查与节奏评估'
      : labels.leadTitle;

  const expressionPhase = options.expressionPhase ?? 'planning';

  let narrative: string;
  if (scenario === 'ALL_CLEAR') {
    narrative = lead?.explanation ?? '当前方案可以执行。';
  } else if (mode === 'single_lead') {
    narrative = `${lead?.icon ?? ''} **${lead?.name ?? labels.name}**：${lead?.explanation ?? ''}`.trim();
  } else {
    const leadLine = `${lead?.icon ?? ''} **${lead?.name}**\n${lead?.explanation ?? ''}`;
    const support = supportingLines
      .map((l) => `${l.icon} _${l.name}_：${l.text}`)
      .join('\n\n');
    narrative = support ? `${leadLine}\n\n${support}` : leadLine;
  }

  const structuredStatus =
    options.structuredStatus ??
    buildStructuredStatusFromSlices({
      abuVerdict: personas.abu?.verdict,
      dreVerdict: personas.drdre?.verdict,
      neptuneVerdict: personas.neptune?.verdict,
      abuExistence: options.abuExistence,
      dreCost: options.dreCost,
    });

  let briefLines: string[] | undefined;
  if (expressionPhase === 'in_trip') {
    briefLines = toBriefLines({ leadSpeaker, supportingLines, headline, scenario });
    if (lead?.explanation) {
      briefLines[0] = `${labels.name}：${firstSentence(lead.explanation)}`;
    }
    narrative = briefLines.join('\n');
  }

  return enrichGuardianPresentation({
    mode,
    scenario,
    leadSpeaker,
    headline,
    narrative,
    briefLines,
    expressionPhase,
    displayStyle: presentationDisplayStyle(expressionPhase),
    supportingLines,
    actions,
    structuredStatus,
  });
}

/** Trip Planner 洞察 → presentation（行中默认 in_trip） */
export function buildPresentationFromInsights(
  insights: Array<{
    persona: string;
    emoji: string;
    name: string;
    message: string;
    severity: string;
  }>,
  priority: Record<string, number>,
  expressionPhase: GuardianExpressionPhase = 'in_trip',
): GuardianPersonaPresentation {
  const personaMap: Record<string, LeadSpeakerPersona> = {
    Abu: 'ABU',
    DrDre: 'DR_DRE',
    Neptune: 'NEPTUNE',
  };

  const sorted = [...insights].sort(
    (a, b) => (priority[a.persona] ?? 99) - (priority[b.persona] ?? 99),
  );

  const toSlice = (
    insight: (typeof sorted)[0],
    verdict: PersonaStatementSlice['verdict'],
  ): PersonaStatementSlice => ({
    persona: personaMap[insight.persona] ?? 'ABU',
    icon: insight.emoji,
    name: insight.name,
    verdict,
    explanation: insight.message,
  });

  const slices = sorted.map((i) =>
    toSlice(
      i,
      i.severity === 'error' ? 'REJECT' : i.severity === 'warning' ? 'ADJUST' : 'ALLOW',
    ),
  );

  return buildPersonaPresentation(
    {
      abu: slices.find((s) => s.persona === 'ABU') ?? null,
      drdre: slices.find((s) => s.persona === 'DR_DRE') ?? null,
      neptune: slices.find((s) => s.persona === 'NEPTUNE') ?? null,
    },
    { expressionPhase },
  );
}

export function buildGuardianInsightCard(
  insights: Array<{
    persona: string;
    emoji: string;
    name: string;
    message: string;
    severity: string;
  }>,
  priority: Record<string, number>,
): string {
  return buildPresentationFromInsights(insights, priority, 'in_trip').narrative;
}
