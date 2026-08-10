/**
 * Dynamic DAG 输入校验（从 ClaudeOrchestrator 迁出）：
 * validatePlanInputs / validateSkillsInputs / injectWebBrowseUrlIfMissing。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  ExecutionPlan,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';
import {
  SKILL_VALIDATION_RULES,
  type SkillValidationRule,
} from '../services/skill-validation-rules.config';

import type {
  DagValidateInputsHost,
  DagValidateResult,
} from './dag-validate-inputs.host';

export function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * 使用验证规则验证 skill 输入参数。
 */
export function validateSkillInputWithRule(
  host: Pick<DagValidateInputsHost, 'extractCountryCodeFromMessage'>,
  skillName: string,
  input: Record<string, any>,
  rule: SkillValidationRule,
  context: AgentContext,
  request: RouteAndRunRequestDto,
): { missingParams: string[] } {
  void skillName;
  const missingParams: string[] = [];

  if (rule.extractors) {
    for (const [param, extractor] of Object.entries(rule.extractors)) {
      if (!hasValue(input[param])) {
        if (param === 'countryCode') {
          const countryCode = host.extractCountryCodeFromMessage(request.message);
          if (countryCode) {
            input[param] = countryCode;
          } else {
            const extracted = extractor(context, request);
            if (extracted) {
              input[param] = extracted;
            }
          }
        } else {
          const extracted = extractor(context, request);
          if (extracted) {
            input[param] = extracted;
          }
        }
      }
    }
  }

  if (rule.dependencies) {
    for (const dep of rule.dependencies) {
      const hasParam = hasValue(input[dep.param]);
      const hasAlternatives = dep.alternatives?.some(
        (alt) =>
          hasValue(input[alt]) ||
          (alt === 'tripId' && (context.tripId || request.trip_id)),
      );

      if (!hasParam && !hasAlternatives) {
        if (dep.alternatives && dep.alternatives.length > 0) {
          missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
        } else {
          missingParams.push(dep.param);
        }
      }
    }
  }

  return { missingParams };
}

function buildMissingResult(
  host: DagValidateInputsHost,
  missingParams: string[],
): DagValidateResult {
  const uniqueMissingParams = [...new Set(missingParams)];
  return {
    valid: false,
    missingParams: uniqueMissingParams,
    clarificationMessage: host.buildMissingParamClarificationMessage({
      message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
      missingParams: uniqueMissingParams,
    }),
    solutions: host.extractSolutionsFromError({
      message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
    }),
  };
}

/**
 * 验证执行计划的输入参数（plan 编排之后）。
 */
export async function runValidatePlanInputs(
  host: DagValidateInputsHost,
  plan: ExecutionPlan,
  context: AgentContext,
  request: RouteAndRunRequestDto,
): Promise<DagValidateResult> {
  const intentSnapshot = host.buildSkillInputIntentSnapshot(request, context);

  if (host.skillInputValidator) {
    const missingParams: string[] = [];
    const results: Record<string, any> = {};

    for (const step of plan.steps) {
      if (step.type === 'skill' && step.skillName) {
        const input = host.prepareSkillInput(
          step,
          results,
          context,
          request,
          intentSnapshot,
        );
        const skill = host.skillsRegistry?.getSkill?.(step.skillName);
        const metadata = skill?.metadata;
        const validationResult = host.skillInputValidator.validate(
          step.skillName,
          input,
          metadata,
          {
            context,
            request,
            stepResults: results,
            planSteps: plan.steps.map((s) => ({
              id: s.id,
              skillName: s.skillName,
            })),
          },
        );

        if (!validationResult.valid && validationResult.missingParams.length > 0) {
          missingParams.push(...validationResult.missingParams);
        }
      }
    }

    if (missingParams.length > 0) {
      return buildMissingResult(host, missingParams);
    }
    return { valid: true };
  }

  const missingParams: string[] = [];
  const results: Record<string, any> = {};

  for (const step of plan.steps) {
    if (step.type === 'skill' && step.skillName) {
      const input = host.prepareSkillInput(
        step,
        results,
        context,
        request,
        intentSnapshot,
      );
      const validationRule = SKILL_VALIDATION_RULES[step.skillName];

      if (validationRule) {
        const validationResult = validateSkillInputWithRule(
          host,
          step.skillName,
          input,
          validationRule,
          context,
          request,
        );
        if (validationResult.missingParams.length > 0) {
          missingParams.push(...validationResult.missingParams);
        }
      } else {
        host.logger.debug(
          `[Claude Orchestrator] Skill ${step.skillName} 没有配置验证规则，跳过验证`,
        );
      }
    }
  }

  if (missingParams.length > 0) {
    return buildMissingResult(host, missingParams);
  }
  return { valid: true };
}

/**
 * 验证 Skills 输入参数（plan 编排之前）。
 */
export async function runValidateSkillsInputs(
  host: DagValidateInputsHost,
  skillsPlan: SkillsPlan,
  context: AgentContext,
  request: RouteAndRunRequestDto,
): Promise<DagValidateResult> {
  if (host.skillInputValidator) {
    const missingParams: string[] = [];

    for (const skillSelection of skillsPlan.selectedSkills) {
      if (skillSelection.skillName) {
        const skill = host.skillsRegistry?.getSkill?.(skillSelection.skillName);
        const metadata = skill?.metadata;
        const input = (skillSelection.input || {}) as Record<string, unknown>;
        const validationResult = host.skillInputValidator.validate(
          skillSelection.skillName,
          input,
          metadata,
          {
            context,
            request,
            stepResults: {},
          },
        );

        if (!validationResult.valid && validationResult.missingParams.length > 0) {
          missingParams.push(...validationResult.missingParams);
        }
      }
    }

    if (missingParams.length > 0) {
      return buildMissingResult(host, missingParams);
    }
    return { valid: true };
  }

  const missingParams: string[] = [];

  for (const skillSelection of skillsPlan.selectedSkills) {
    if (skillSelection.skillName) {
      const validationRule = SKILL_VALIDATION_RULES[skillSelection.skillName];
      if (validationRule) {
        const input = (skillSelection.input || {}) as Record<string, any>;
        const validationResult = validateSkillInputWithRule(
          host,
          skillSelection.skillName,
          input,
          validationRule,
          context,
          request,
        );
        if (validationResult.missingParams.length > 0) {
          missingParams.push(...validationResult.missingParams);
        }
      }
    }
  }

  if (missingParams.length > 0) {
    return buildMissingResult(host, missingParams);
  }
  return { valid: true };
}

/**
 * 当 Skills 仅包含 web.browse 且未提供 url 时，用用户 message 拼 DuckDuckGo 搜索 URL。
 */
export function injectWebBrowseUrlIfMissing(
  skillsPlan: SkillsPlan,
  request: RouteAndRunRequestDto,
  logger?: Pick<DagValidateInputsHost['logger'], 'debug'>,
): void {
  const hasBrowse = skillsPlan.selectedSkills.some((s) => s.skillName === 'web.browse');
  if (!hasBrowse) return;
  const msg = request.message?.trim();
  if (!msg) return;
  const q = msg.length > 400 ? `${msg.slice(0, 400)}…` : msg;
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  for (const sel of skillsPlan.selectedSkills) {
    if (sel.skillName !== 'web.browse') continue;
    if (!sel.input) sel.input = {} as Record<string, unknown>;
    const url = (sel.input as { url?: unknown }).url;
    if (typeof url !== 'string' || !url.trim()) {
      (sel.input as { url: string; query?: string }).url = searchUrl;
      if (!(sel.input as { query?: string }).query) {
        (sel.input as { query: string }).query = msg;
      }
      logger?.debug(
        `[Claude Orchestrator] web.browse 缺 url，已注入 DuckDuckGo 搜索 URL`,
      );
    }
  }
}
