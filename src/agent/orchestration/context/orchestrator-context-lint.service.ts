import { Injectable, Logger, Optional } from '@nestjs/common';
import { HarnessStepContractRegistryService } from '../../../harness/runtime/harness-step-contract.registry';
import { HarnessStepName } from '../../../harness/contracts/harness-step.types';
import { getAtPath } from '../../../harness/lib/dso-path.util';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import {
  PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY,
  REQUEST_FITNESS_PROFILE_LINES_KEY,
} from '../../memory/utils/fitness-travel-preference-prompt.util';
import { ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY } from '../../memory/utils/iceland-market-preference-prompt.util';
import { INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION } from '../graph/nodes/intake-request-sanitizer.util';
import type {
  OrchestratorContextLintBeforePhaseOptions,
  OrchestratorContextLintPhaseRule,
  OrchestratorContextLintResult,
} from './orchestrator-context-lint.types';

/** DSO 顶层允许字段（契约路径根 + 内核扩展；Phase 4a 显式化） */
export const DSO_TOP_LEVEL_ALLOWLIST = new Set([
  'userIntent',
  'tripState',
  'environmentState',
  'systemState',
  'constraints',
  'candidates',
  'optimizationHints',
  'riskLevel',
  'contextPackage',
  'decisionMeta',
  'history',
  'confidence',
  'worldStateSummary',
  'research_data',
  'beliefSamples',
  'uncertaintyProfile',
  'feedback',
  'requestId',
  'travelOntologyState',
  'harnessRuntime',
  'verification',
  'explain',
  'metadata',
]);

/** 不得出现在 request / OrchestratorState 上的旁路大字段 */
export const FORBIDDEN_TRANSIENT_REQUEST_KEYS = [
  REQUEST_FITNESS_PROFILE_LINES_KEY,
  PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY,
  ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY,
] as const;

const DEFAULT_MAX_PAYLOAD_BYTES = 100 * 1024;

@Injectable()
export class OrchestratorContextLintService {
  private readonly logger = new Logger(OrchestratorContextLintService.name);

  constructor(
    @Optional() private readonly harnessContracts?: HarnessStepContractRegistryService,
  ) {}

  isEnabled(): boolean {
    const v = process.env.ORCHESTRATOR_CONTEXT_LINT_ENABLED?.trim();
    return v === '1' || v === 'true';
  }

  isStrict(): boolean {
    const v = process.env.ORCHESTRATOR_CONTEXT_LINT_STRICT?.trim();
    return v === '1' || v === 'true';
  }

  private maxPayloadBytes(): number {
    const raw = process.env.ORCHESTRATOR_CONTEXT_LINT_MAX_BYTES?.trim();
    if (!raw) return DEFAULT_MAX_PAYLOAD_BYTES;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_PAYLOAD_BYTES;
  }

  /** 由 Harness 契约派生 Phase 边界（与 Kernel Harness 共用可读/可写路径） */
  getPhaseRule(phase: HarnessStepName): OrchestratorContextLintPhaseRule | undefined {
    const c = this.harnessContracts?.getContract(phase);
    if (!c) return undefined;
    return {
      allowedRead: [...c.readableStatePaths],
      allowedWrite: [...c.writableStatePaths],
      requiredInput: [...c.requiredInputPaths],
    };
  }

  lintBeforePhase(
    phase: HarnessStepName,
    dso: DecisionState,
    options?: OrchestratorContextLintBeforePhaseOptions,
  ): OrchestratorContextLintResult {
    if (!this.isEnabled()) {
      return { ok: true, code: 'LINT_DISABLED' };
    }

    const violations: string[] = [];
    const rule = this.getPhaseRule(phase);
    if (!rule) {
      return {
        ok: false,
        code: 'PHASE_RULE_MISSING',
        phase,
        message: `No harness contract for phase ${String(phase)}`,
        violations,
      };
    }

    for (const path of rule.requiredInput) {
      const v = getAtPath(dso, path);
      if (v === undefined || v === null) {
        violations.push(`requiredInput missing: ${path}`);
      }
    }

    for (const key of Object.keys(dso as object)) {
      if (!DSO_TOP_LEVEL_ALLOWLIST.has(key)) {
        violations.push(`DSO top-level key not allowlisted: ${key}`);
      }
    }

    const transient = this.collectForbiddenTransientKeys(dso, 3);
    for (const k of transient) {
      violations.push(`forbidden transient key on DSO: ${k}`);
    }

    if (options?.requestPayload) {
      for (const fk of FORBIDDEN_TRANSIENT_REQUEST_KEYS) {
        if (fk in options.requestPayload && options.requestPayload[fk] != null) {
          violations.push(
            `request payload must not carry ${fk}; use travelPreference / DSO hydration`,
          );
        }
      }
      const reqOpts = (options.requestPayload as { options?: Record<string, unknown> }).options;
      if (
        phase !== HarnessStepName.INTAKE &&
        reqOpts &&
        INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION in reqOpts &&
        reqOpts[INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION] != null
      ) {
        violations.push(
          `request.options must not carry ${INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION} after INTAKE; consume at intake funnel`,
        );
      }
    }

    if (options?.orchestratorState) {
      const orchViolations = this.lintOrchestratorStateInternal(options.orchestratorState);
      violations.push(...orchViolations);
    }

    const visibilityPayload = this.buildPhaseVisibilityPayload(dso, rule.allowedRead);
    const payloadBytes = this.calculatePayloadSize(visibilityPayload);
    const maxBytes = this.maxPayloadBytes();
    if (payloadBytes > maxBytes) {
      violations.push(
        `phase visibility payload ${payloadBytes} bytes exceeds max ${maxBytes} (${phase})`,
      );
    }

    if (violations.length > 0) {
      const message = violations.join('; ');
      if (!this.isStrict()) {
        this.logger.warn(`[ContextLint] phase=${String(phase)} requestId=${options?.requestId ?? 'n/a'} ${message}`);
      }
      const code = violations.some((v) => v.includes('bytes exceeds'))
        ? 'CONTEXT_SIZE_EXCEEDED'
        : violations.some((v) => v.startsWith('forbidden transient') || v.includes('must not carry'))
          ? 'FORBIDDEN_TRANSIENT_KEY'
          : violations.some((v) => v.startsWith('DSO top-level'))
            ? 'DSO_TOP_LEVEL_VIOLATION'
            : violations.some((v) => v.startsWith('OrchestratorState'))
              ? 'ORCHESTRATOR_STATE_VIOLATION'
              : 'REQUIRED_INPUT_MISSING';
      return {
        ok: false,
        code,
        phase,
        message,
        payloadBytes,
        violations,
      };
    }

    return { ok: true, phase, payloadBytes };
  }

  lintOrchestratorState(state: OrchestratorState): OrchestratorContextLintResult {
    if (!this.isEnabled()) return { ok: true, code: 'LINT_DISABLED' };
    const violations = this.lintOrchestratorStateInternal(state);
    if (violations.length === 0) return { ok: true };
    return {
      ok: false,
      code: 'ORCHESTRATOR_STATE_VIOLATION',
      message: violations.join('; '),
      violations,
    };
  }

  private lintOrchestratorStateInternal(state: OrchestratorState): string[] {
    const violations: string[] = [];
    const raw = state as unknown as Record<string, unknown>;
    for (const fk of FORBIDDEN_TRANSIENT_REQUEST_KEYS) {
      if (fk in raw && raw[fk] != null) {
        violations.push(`OrchestratorState must not carry ${fk}`);
      }
    }
    const transient = this.collectForbiddenTransientKeys(state, 2);
    for (const k of transient) {
      violations.push(`OrchestratorState transient key: ${k}`);
    }
    return violations;
  }

  private buildPhaseVisibilityPayload(
    dso: DecisionState,
    readablePaths: string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const p of readablePaths) {
      out[p] = getAtPath(dso, p);
    }
    return out;
  }

  calculatePayloadSize(payload: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  /**
   * 浅层遍历检测 `__*` 与已知旁路键（体能 Profile 行等未收敛字段）。
   */
  collectForbiddenTransientKeys(root: unknown, maxDepth: number, path = ''): string[] {
    if (root == null || maxDepth < 0) return [];
    if (typeof root !== 'object') return [];
    const found: string[] = [];
    const obj = root as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const full = path ? `${path}.${k}` : k;
      if ((FORBIDDEN_TRANSIENT_REQUEST_KEYS as readonly string[]).includes(k)) {
        found.push(full);
      } else if (k.startsWith('__') && k.length > 2) {
        found.push(full);
      }
      if (v != null && typeof v === 'object' && !Array.isArray(v) && maxDepth > 0) {
        found.push(...this.collectForbiddenTransientKeys(v, maxDepth - 1, full));
      }
    }
    return found;
  }
}
