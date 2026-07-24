import { Injectable, Logger } from '@nestjs/common';
import type { AuditIssue, AuditResult, EvolvableSkill } from '../interfaces/skill-evolver.types';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';

export interface AuditOptions {
  /** fixture/seed 演示时：仅 heuristic 的 critical 失败会阻断 */
  relaxed?: boolean;
}

export const AUDIT_RULES = [
  { id: 'R1', name: '静默绕过检测', description: '规则是否可能被忽略而不触发警告', severity: 'critical' as const },
  { id: 'R2', name: '逻辑一致性', description: '规则之间是否存在矛盾', severity: 'critical' as const },
  { id: 'R3', name: '完备性检查', description: '是否覆盖已知边界情况', severity: 'high' as const },
  { id: 'R4', name: '可操作性', description: '规则是否足够具体可执行', severity: 'high' as const },
  { id: 'R5', name: '无副作用', description: '新规则是否在其他场景引入问题', severity: 'high' as const },
  { id: 'R6', name: '安全审查', description: '是否包含密钥/密码等敏感模式', severity: 'critical' as const },
  { id: 'R7', name: '冗余检测', description: '是否存在重复或等价规则', severity: 'medium' as const },
  { id: 'R8', name: '退化保护', description: '新版本是否丢失旧版关键能力', severity: 'critical' as const },
  { id: 'R9', name: '格式规范', description: 'Markdown 结构与可读性', severity: 'low' as const },
];

const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule_id: { type: 'string' },
          severity: { type: 'string' },
          status: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['rule_id', 'severity', 'status', 'description'],
      },
    },
  },
  required: ['passed', 'issues'],
};

@Injectable()
export class IndependentAuditorService {
  private readonly logger = new Logger(IndependentAuditorService.name);

  constructor(private readonly llm: SkillEvolverLlmHelper) {}

  async audit(
    newSkill: EvolvableSkill,
    oldSkill: EvolvableSkill,
    options?: AuditOptions,
  ): Promise<AuditResult> {
    const rulesText = AUDIT_RULES.map(
      (r) => `[${r.id}] ${r.name} (${r.severity})\n  ${r.description}`,
    ).join('\n');

    const prompt = `你是独立技能审计员（与编辑者分离）。按规则检查新版本。

--- 待审计 ---
${newSkill.body.slice(0, 5000)}

--- 参考旧版 ---
${oldSkill.body.slice(0, 5000)}

--- 规则 ---
${rulesText}

对每条规则输出 PASS/FAIL/WARNING。critical/high 的 FAIL 导致 passed=false。
返回 JSON: { passed, issues: [{ rule_id, severity, status, description }] }`;

    const heuristic = this.heuristicAudit(newSkill, oldSkill);
    const raw = await this.llm.structured<{ passed: boolean; issues: Array<Record<string, string>> }>(
      prompt,
      AUDIT_SCHEMA,
      {
        passed: heuristic.passed,
        issues: heuristic.issues.map((i) => ({
          rule_id: i.ruleId,
          severity: i.severity,
          status: i.status,
          description: i.description,
        })),
      },
    );

    const issues: AuditIssue[] = (raw.issues ?? []).map((i) => ({
      ruleId: i.rule_id ?? 'R?',
      severity: (i.severity as AuditIssue['severity']) ?? 'medium',
      status: (i.status as AuditIssue['status']) ?? 'WARNING',
      description: i.description ?? '',
    }));

    const passed = this.resolvePassed(newSkill, oldSkill, issues, heuristic, options?.relaxed === true);

    this.logger.log(`[IndependentAuditor] ${newSkill.skillId} passed=${passed} issues=${issues.length} relaxed=${!!options?.relaxed}`);
    return { passed, issues, rawResponse: JSON.stringify(raw) };
  }

  private resolvePassed(
    newSkill: EvolvableSkill,
    oldSkill: EvolvableSkill,
    issues: AuditIssue[],
    heuristic: AuditResult,
    relaxed: boolean,
  ): boolean {
    if (!heuristic.passed) return false;

    const secretPattern = /(api[_-]?key|password|secret)\s*[:=]\s*['"][^'"]+['"]/i;
    const blocking = issues.filter((i) => {
      if (i.status !== 'FAIL') return false;
      if (i.ruleId === 'R6') return secretPattern.test(newSkill.body);
      if (i.ruleId === 'R8') return newSkill.body.length < oldSkill.body.length * 0.5;
      if (relaxed) return false;
      return i.severity === 'critical' || i.severity === 'high';
    });

    return blocking.length === 0;
  }

  private heuristicAudit(newSkill: EvolvableSkill, oldSkill: EvolvableSkill): AuditResult {
    const issues: AuditIssue[] = [];
    const secretPattern = /(api[_-]?key|password|secret)\s*[:=]\s*['"][^'"]+['"]/i;
    if (secretPattern.test(newSkill.body)) {
      issues.push({
        ruleId: 'R6',
        severity: 'critical',
        status: 'FAIL',
        description: '检测到疑似硬编码密钥',
      });
    }
    if (newSkill.body.length < oldSkill.body.length * 0.5) {
      issues.push({
        ruleId: 'R8',
        severity: 'critical',
        status: 'FAIL',
        description: '正文长度相对旧版缩水超过 50%',
      });
    }
    const passed = !issues.some((i) => i.status === 'FAIL' && ['critical', 'high'].includes(i.severity));
    return { passed, issues };
  }
}
