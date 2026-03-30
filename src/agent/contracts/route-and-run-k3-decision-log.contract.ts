/**
 * K3 / WP-DK-P1-1：`route_and_run` 出口上 decision_log 与 evidence_refs 形状对齐
 *
 * 对齐 `AgentService.routeAndRunWithClaudeStateMachine`：`explain.decision_log`、
 * `payload.orchestrationResult.decision_log`、`state.decision_log` 应同序同 step。
 *
 * 抽样对齐 `.claude/claude_exec.md` §4：有 `step` 的条目建议具备 `timestamp`、`inputs_summary`、
 * `evidence_refs`（数组）；缺失时 **warnings** 不降低 `valid`（与 AO-04 一致）。
 */

export type K3ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function extractOrchestrationResult(res: unknown): Record<string, unknown> | undefined {
  if (!isRecord(res)) return undefined;
  const result = res.result;
  if (!isRecord(result)) return undefined;
  const payload = result.payload;
  if (!isRecord(payload)) return undefined;
  const orch = payload.orchestrationResult;
  return isRecord(orch) ? orch : undefined;
}

function stepSequence(log: unknown): string[] {
  if (!Array.isArray(log)) return [];
  return log.map((e) => (isRecord(e) && typeof e.step === 'string' ? e.step : ''));
}

/** 与 `claude-exec-route-and-run.contract` §4 警告口径一致（K3 三处日志均扫描） */
function warnClaudeExecDecisionLogEntryShape(log: unknown, label: string, warnings: string[]): void {
  if (!Array.isArray(log)) return;
  log.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    if (typeof entry.step !== 'string' || !entry.step.trim()) return;
    const stepTag = entry.step;
    if (typeof entry.timestamp !== 'string' || !entry.timestamp.trim()) {
      warnings.push(
        `K3 / CLAUDE_EXEC §4: ${label}[${index}] (${stepTag}) should have timestamp (ISO-8601)`,
      );
    }
    if (typeof entry.inputs_summary !== 'string') {
      warnings.push(
        `K3 / CLAUDE_EXEC §4: ${label}[${index}] (${stepTag}) should have inputs_summary string`,
      );
    }
    if (entry.evidence_refs !== undefined && !Array.isArray(entry.evidence_refs)) {
      warnings.push(
        `K3 / CLAUDE_EXEC §4: ${label}[${index}].evidence_refs should be an array when present`,
      );
    }
    if (entry.degradation_triggered !== undefined && typeof entry.degradation_triggered !== 'boolean') {
      warnings.push(
        `K3 / CLAUDE_EXEC §4: ${label}[${index}].degradation_triggered should be boolean when present`,
      );
    }
    if (entry.skills_called !== undefined && !Array.isArray(entry.skills_called)) {
      warnings.push(
        `K3 / CLAUDE_EXEC §4: ${label}[${index}].skills_called should be an array when present`,
      );
    }
  });
}

/**
 * 当存在 `orchestrationResult` 时，校验三处 decision_log 一致；并检查 evidence_refs 为数组。
 */
export function validateK3RouteAndRunDecisionLogAlignment(res: unknown): K3ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(res)) {
    return { valid: false, errors: ['response must be an object'], warnings: [] };
  }

  const orch = extractOrchestrationResult(res);
  if (!orch) {
    return { valid: true, errors: [], warnings: [] };
  }

  const explain = res.explain;
  const explainLog = isRecord(explain) && Array.isArray(explain.decision_log) ? explain.decision_log : undefined;

  const orchLog = Array.isArray(orch.decision_log) ? orch.decision_log : undefined;
  const state = isRecord(orch.state) ? orch.state : undefined;
  const stateLog = state && Array.isArray(state.decision_log) ? state.decision_log : undefined;

  if (orchLog !== undefined && orchLog.length > 0 && explainLog === undefined) {
    errors.push('K3: explain.decision_log missing while orchestrationResult.decision_log is non-empty');
  }

  if (explainLog !== undefined && orchLog !== undefined) {
    if (explainLog.length !== orchLog.length) {
      errors.push(
        `K3: explain.decision_log length ${explainLog.length} !== orchestrationResult.decision_log length ${orchLog.length}`,
      );
    } else {
      for (let i = 0; i < explainLog.length; i++) {
        const a = explainLog[i];
        const b = orchLog[i];
        const sa = isRecord(a) ? a.step : undefined;
        const sb = isRecord(b) ? b.step : undefined;
        if (sa !== sb) {
          errors.push(
            `K3: decision_log step mismatch at index ${i}: explain.step=${String(sa)} orchestration.decision_log.step=${String(sb)}`,
          );
        }
      }
    }
  }

  if (explainLog !== undefined && stateLog !== undefined) {
    const se = stepSequence(explainLog);
    const ss = stepSequence(stateLog);
    if (se.length !== ss.length) {
      errors.push(
        `K3: explain.decision_log length ${se.length} !== state.decision_log length ${ss.length}`,
      );
    } else {
      for (let i = 0; i < se.length; i++) {
        if (se[i] !== ss[i]) {
          errors.push(
            `K3: step mismatch explain vs state at index ${i}: ${se[i]} vs ${ss[i]}`,
          );
        }
      }
    }
  }

  if (orchLog !== undefined && stateLog !== undefined) {
    const so = stepSequence(orchLog);
    const ss = stepSequence(stateLog);
    if (so.length !== ss.length) {
      errors.push(
        `K3: orchestrationResult.decision_log length ${so.length} !== state.decision_log length ${ss.length}`,
      );
    } else {
      for (let i = 0; i < so.length; i++) {
        if (so[i] !== ss[i]) {
          errors.push(
            `K3: step mismatch orchestration vs state at index ${i}: ${so[i]} vs ${ss[i]}`,
          );
        }
      }
    }
  }

  if (explainLog) warnClaudeExecDecisionLogEntryShape(explainLog, 'explain.decision_log', warnings);
  if (orchLog) warnClaudeExecDecisionLogEntryShape(orchLog, 'orchestrationResult.decision_log', warnings);
  if (stateLog) warnClaudeExecDecisionLogEntryShape(stateLog, 'state.decision_log', warnings);

  return { valid: errors.length === 0, errors, warnings };
}
