/**
 * 运行时：knowledgeCode + severity/executionGate → 约束模板绑定
 * DB 无种子时回退 DEFAULT_RISK_CONSTRAINT_BINDINGS
 */

import {
  DEFAULT_RISK_CONSTRAINT_BINDINGS,
  resolveBindingsForRisk,
} from './execution-risk-constraint-binding.defaults';

export type RiskConstraintBindingAttachment = {
  primaryTemplateId?: string;
  templateIds: string[];
  feasibilityDimension?: string | null;
  violationClass?: string | null;
  executionGate?: string | null;
  anyBlocked: boolean;
  notesZh?: string | null;
  bindingIds: string[];
};

export function severityLevelForBinding(input: {
  executionGate?: string | null;
}): string | null {
  const gate = input.executionGate;
  if (!gate || gate === 'ALLOW') return null;
  if (gate === 'REPLAN') return 'REPLAN_REQUIRED';
  return gate;
}

export function toRiskConstraintBindingAttachment(resolved: {
  bindings: Array<{
    id: string;
    constraintTemplateId: string;
    feasibilityDimension: string | null;
    violationClass: string | null;
    executionGate: string | null;
    notesZh: string | null;
    blocked: boolean;
  }>;
  primary: {
    id: string;
    constraintTemplateId: string;
    feasibilityDimension: string | null;
    violationClass: string | null;
    executionGate: string | null;
    notesZh: string | null;
  } | null;
  anyBlocked: boolean;
}): RiskConstraintBindingAttachment | undefined {
  if (!resolved.bindings.length) return undefined;
  return {
    primaryTemplateId: resolved.primary?.constraintTemplateId,
    templateIds: [...new Set(resolved.bindings.map((b) => b.constraintTemplateId))],
    feasibilityDimension: resolved.primary?.feasibilityDimension ?? null,
    violationClass: resolved.primary?.violationClass ?? null,
    executionGate: resolved.primary?.executionGate ?? null,
    anyBlocked: resolved.anyBlocked,
    notesZh: resolved.primary?.notesZh ?? null,
    bindingIds: resolved.bindings.map((b) => b.id),
  };
}

/** 纯函数：默认种子 resolve（无 DB） */
export function resolveRiskConstraintBindingSync(input: {
  knowledgeCode: string;
  severityLevel?: string | null;
}): RiskConstraintBindingAttachment | undefined {
  const resolved = resolveBindingsForRisk({
    knowledgeCode: input.knowledgeCode,
    severityLevel: input.severityLevel,
    bindings: DEFAULT_RISK_CONSTRAINT_BINDINGS.map((b) => ({
      id: b.id,
      knowledgeCode: b.knowledgeCode,
      severityLevel: b.severityLevel,
      status: 'ACTIVE',
      priority: b.priority,
      blocked: b.blocked,
      constraintTemplateId: b.constraintTemplateId,
      constraintCategory: b.constraintCategory,
      constraintType: b.constraintType,
      executionGate: b.executionGate,
      violationClass: b.violationClass,
      feasibilityDimension: b.feasibilityDimension,
      notesZh: b.notesZh,
    })),
  });
  return toRiskConstraintBindingAttachment(resolved);
}

export function collectConstraintTemplateIdsFromRisks(
  risks: Array<{ constraintBinding?: RiskConstraintBindingAttachment }>,
): string[] {
  const ids = new Set<string>();
  for (const risk of risks) {
    for (const id of risk.constraintBinding?.templateIds ?? []) {
      ids.add(id);
    }
  }
  return [...ids];
}

/** FeasibilityIssue 最小形状 — 避免跨模块硬依赖完整 DTO */
export type RiskBindingFeasibilityIssue = {
  id: string;
  semanticKey: string;
  priority: 'must_handle' | 'suggest_adjust' | 'pending_confirm';
  category: string;
  title: string;
  message: string;
  affectedDays: number[];
  severity: 'high' | 'medium' | 'low';
  issueKind: 'risk_constraint_binding';
  relatedConstraintIds: string[];
  actionRequired?: string;
  proofs?: Array<{
    entity: string;
    constraint: string;
    currentFact: string;
    evidenceSource: string;
    evidenceType: string;
    conclusion: string;
  }>;
};

export function buildFeasibilityIssuesFromBoundRisks(
  risks: Array<{
    id: string;
    knowledgeCode?: string;
    title: string;
    summary: string;
    executionGate?: string | null;
    constraintBinding?: RiskConstraintBindingAttachment;
  }>,
): RiskBindingFeasibilityIssue[] {
  const issues: RiskBindingFeasibilityIssue[] = [];
  for (const risk of risks) {
    const binding = risk.constraintBinding;
    if (!binding?.templateIds.length) continue;

    const blocked = binding.anyBlocked;
    const gate = risk.executionGate ?? binding.executionGate ?? 'AT_RISK';
    const priority =
      blocked || gate === 'STOP'
        ? 'must_handle'
        : gate === 'REPLAN_REQUIRED'
          ? 'suggest_adjust'
          : 'pending_confirm';
    const severity =
      priority === 'must_handle' ? 'high' : priority === 'suggest_adjust' ? 'medium' : 'low';
    const category = binding.feasibilityDimension ?? 'environment';
    const code = risk.knowledgeCode ?? risk.id;

    issues.push({
      id: `risk-binding:${risk.id}`,
      semanticKey: `risk_constraint_binding:${code}:${binding.primaryTemplateId ?? binding.templateIds[0]}`,
      priority,
      category,
      title: `${risk.title} → 约束`,
      message:
        binding.notesZh ??
        `风险 ${code}（${gate}）映射约束 ${binding.templateIds.join(', ')}`,
      affectedDays: [],
      severity,
      issueKind: 'risk_constraint_binding',
      relatedConstraintIds: binding.templateIds,
      actionRequired: blocked ? '需处理风险或改线以满足硬约束' : '关注约束影响',
      proofs: [
        {
          entity: code,
          constraint: binding.primaryTemplateId ?? binding.templateIds[0]!,
          currentFact: `executionGate=${gate}; templates=${binding.templateIds.join(',')}`,
          evidenceSource: 'execution_risk_constraint_binding',
          evidenceType: 'risk_constraint_binding',
          conclusion: blocked ? '硬阻断约束已激活' : '软/提示约束已关联',
        },
      ],
    });
  }
  return issues;
}

export function maxExecutionGateFromBindings(
  attachments: Array<RiskConstraintBindingAttachment | undefined>,
): 'ALLOW' | 'AT_RISK' | 'REPLAN_REQUIRED' | 'STOP' {
  const order = { ALLOW: 0, AT_RISK: 1, REPLAN_REQUIRED: 2, STOP: 3 } as const;
  let max: keyof typeof order = 'ALLOW';
  for (const a of attachments) {
    const g = (a?.executionGate ?? 'ALLOW') as keyof typeof order;
    if ((order[g] ?? 0) > order[max]) max = g in order ? g : max;
  }
  return max;
}
