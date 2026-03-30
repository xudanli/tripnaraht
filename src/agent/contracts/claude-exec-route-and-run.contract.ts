/**
 * AO-04：`route_and_run` 响应中与 `.claude/claude_exec.md` 可对齐的可校验切片。
 *
 * 与协议差异（刻意收窄）：
 * - 校验路径为 `result.payload.orchestrationResult.state`，不是 Claude 协议顶层 JSON。
 * - 不要求 `state` 上同时存在 `gate_result` / `itinerary` / `alternatives`（与 `claude_exec` 顶层「必带」不同）。
 * - `alternatives` 为 Orchestrator 的 POI/路线槽位，非协议示例中的 `{ id, title, reason, tradeoffs }`。
 * - `itinerary.items[].location_ref` 为 `{ name }` 等对象，非协议中的 string。
 * - `decision_log` 条目建议字段（`claude_exec` Decision Log 硬结构）多为 warnings；`AO04_ROUTE_AND_RUN_STRICT=1` 时并入 errors。
 *
 * 存在 `state.gate_result` 时：`gate_result` 字段须为下列枚举之一。
 */
/** `claude_exec` OUTPUT CONTRACT 中 `gate_result.gate_result` 的允许取值（OrchestratorState 对齐） */
export const AO04_GATE_RESULT_STATUSES = [
  'ALLOW',
  'ADJUST_REQUIRED',
  'BLOCK',
  'NEED_USER_CONFIRM',
] as const;

export type Ao04GateResultStatus = (typeof AO04_GATE_RESULT_STATUSES)[number];

function isAo04GateResultStatus(s: string): s is Ao04GateResultStatus {
  return (AO04_GATE_RESULT_STATUSES as readonly string[]).includes(s);
}

export type Ao04ValidationResult = {
  valid: boolean;
  errors: string[];
  /** 不阻断，但违反 CLAUDE_EXEC 建议时列出 */
  warnings: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 集成/预发：`AO04_ROUTE_AND_RUN_STRICT=1` 时将 **warnings** 并入 errors，`valid` 为 false */
function isAo04RouteAndRunStrict(): boolean {
  const v = process.env.AO04_ROUTE_AND_RUN_STRICT;
  return v === '1' || v === 'true';
}

/**
 * 从 `RouteAndRunResponseDto` 或同类 JSON 取出 `orchestrationResult.state`
 */
export function extractOrchestratorStateFromRouteAndRunResponse(res: unknown): Record<string, unknown> | undefined {
  if (!isRecord(res)) return undefined;
  const result = res.result;
  if (!isRecord(result)) return undefined;
  const payload = result.payload;
  if (!isRecord(payload)) return undefined;
  const orchestrationResult = payload.orchestrationResult;
  if (!isRecord(orchestrationResult)) return undefined;
  const state = orchestrationResult.state;
  if (!isRecord(state)) return undefined;
  return state;
}

export function countOrchestratorAlternatives(alternatives: unknown): number {
  if (!isRecord(alternatives)) return 0;
  const pois = Array.isArray(alternatives.alternative_pois) ? alternatives.alternative_pois.length : 0;
  const routes = Array.isArray(alternatives.alternative_routes) ? alternatives.alternative_routes.length : 0;
  return pois + routes;
}

/** CLAUDE_EXEC §4：有 `step` 的条目建议具备 timestamp / inputs_summary 等（warnings 不降低 valid） */
function warnDecisionLogEntriesClaudeExec(decisionLog: unknown, warnings: string[]): void {
  if (!Array.isArray(decisionLog)) return;
  decisionLog.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    if (typeof entry.step !== 'string' || !entry.step.trim()) return;
    const label = entry.step;
    if (typeof entry.timestamp !== 'string' || !entry.timestamp.trim()) {
      warnings.push(
        `CLAUDE_EXEC §4: state.decision_log[${index}] (${label}) should have timestamp (ISO-8601)`,
      );
    }
    if (typeof entry.inputs_summary !== 'string') {
      warnings.push(`CLAUDE_EXEC §4: state.decision_log[${index}] (${label}) should have inputs_summary string`);
    }
    if (entry.evidence_refs !== undefined && !Array.isArray(entry.evidence_refs)) {
      warnings.push(
        `CLAUDE_EXEC §4: state.decision_log[${index}].evidence_refs should be an array when present`,
      );
    }
    if (entry.degradation_triggered !== undefined && typeof entry.degradation_triggered !== 'boolean') {
      warnings.push(
        `CLAUDE_EXEC §4: state.decision_log[${index}].degradation_triggered should be boolean when present`,
      );
    }
    if (entry.skills_called !== undefined && !Array.isArray(entry.skills_called)) {
      warnings.push(
        `CLAUDE_EXEC §4: state.decision_log[${index}].skills_called should be an array when present`,
      );
    }
  });
}

/**
 * 校验 `route_and_run` 响应包络 + 编排状态关键字段（AO-04 首轮）
 */
export function validateAo04RouteAndRunContract(res: unknown): Ao04ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(res)) {
    return { valid: false, errors: ['response must be an object'], warnings: [] };
  }
  if (typeof res.request_id !== 'string' || !res.request_id.trim()) {
    errors.push('missing or empty top-level request_id');
  }

  const state = extractOrchestratorStateFromRouteAndRunResponse(res);
  if (!state) {
    errors.push('missing result.payload.orchestrationResult.state');
    return { valid: errors.length === 0, errors, warnings };
  }

  if (typeof state.request_id !== 'string' || !state.request_id.trim()) {
    errors.push('state.request_id must be a non-empty string');
  }

  if (!Array.isArray(state.decision_log)) {
    errors.push('state.decision_log must be an array');
  }
  if (!Array.isArray(state.errors)) {
    errors.push('state.errors must be an array');
  }

  if (Array.isArray(state.decision_log)) {
    warnDecisionLogEntriesClaudeExec(state.decision_log, warnings);
  }

  const meta = state.metadata;
  if (meta !== undefined) {
    if (!isRecord(meta)) {
      errors.push('state.metadata must be an object when present');
    } else {
      if (typeof meta.started_at !== 'string') {
        errors.push('state.metadata.started_at must be a string when metadata is present');
      }
      if (typeof meta.last_updated_at !== 'string') {
        errors.push('state.metadata.last_updated_at must be a string when metadata is present');
      }
    }
  }

  const gr = state.gate_result;
  if (gr !== undefined) {
    if (!isRecord(gr)) {
      errors.push('state.gate_result must be an object when present');
    } else {
      if (typeof gr.gate_result !== 'string' || !gr.gate_result.trim()) {
        errors.push('state.gate_result.gate_result must be a non-empty string');
      } else if (!isAo04GateResultStatus(gr.gate_result)) {
        errors.push(
          `state.gate_result.gate_result must be one of: ${AO04_GATE_RESULT_STATUSES.join(', ')}`,
        );
      }
      if (!Array.isArray(gr.violations)) {
        errors.push('state.gate_result.violations must be an array when gate_result is present');
      }
      if (!Array.isArray(gr.required_adjustments)) {
        errors.push('state.gate_result.required_adjustments must be an array when gate_result is present');
      }
      if (gr.evidence_refs !== undefined && !Array.isArray(gr.evidence_refs)) {
        errors.push('state.gate_result.evidence_refs must be an array when present');
      }
      if (gr.confidence !== undefined && typeof gr.confidence !== 'number') {
        errors.push('state.gate_result.confidence must be a number when present');
      }
      if (Array.isArray(gr.violations)) {
        gr.violations.forEach((v, vi) => {
          if (!isRecord(v)) {
            errors.push(`state.gate_result.violations[${vi}] must be an object`);
            return;
          }
          for (const key of ['type', 'severity', 'detail'] as const) {
            if (typeof v[key] !== 'string') {
              errors.push(`state.gate_result.violations[${vi}].${key} must be a string`);
            }
          }
        });
      }
      if (Array.isArray(gr.required_adjustments)) {
        gr.required_adjustments.forEach((a, ai) => {
          if (!isRecord(a)) {
            errors.push(`state.gate_result.required_adjustments[${ai}] must be an object`);
            return;
          }
          if (typeof a.action !== 'string' || !String(a.action).trim()) {
            errors.push(
              `state.gate_result.required_adjustments[${ai}].action must be a non-empty string`,
            );
          }
          if (typeof a.why !== 'string') {
            errors.push(`state.gate_result.required_adjustments[${ai}].why must be a string`);
          }
        });
      }
      const status = gr.gate_result;
      if (status === 'BLOCK' && countOrchestratorAlternatives(state.alternatives) < 1) {
        warnings.push(
          'CLAUDE_EXEC: gate_result BLOCK 建议 alternatives >= 1（OrchestratorState.alternatives 内 POI/路线合计）',
        );
      }
    }
  }

  const itin = state.itinerary;
  if (itin !== undefined) {
    if (!isRecord(itin)) {
      errors.push('state.itinerary must be an object when present');
    } else if (!Array.isArray(itin.days)) {
      errors.push('state.itinerary.days must be an array when present');
    } else {
      itin.days.forEach((day, di) => {
        if (!isRecord(day)) {
          errors.push(`state.itinerary.days[${di}] must be an object`);
          return;
        }
        if (typeof day.date !== 'string') {
          errors.push(`state.itinerary.days[${di}].date must be a string`);
        }
        if (!Array.isArray(day.items)) {
          errors.push(`state.itinerary.days[${di}].items must be an array`);
          return;
        }
        day.items.forEach((item, ii) => {
          if (!isRecord(item)) {
            errors.push(`state.itinerary.days[${di}].items[${ii}] must be an object`);
            return;
          }
          if (typeof item.type !== 'string' || !item.type.trim()) {
            errors.push(`itinerary item [day ${di} item ${ii}].type must be a non-empty string`);
          }
          if (!Array.isArray(item.evidence_refs)) {
            errors.push(`itinerary item [day ${di} item ${ii}].evidence_refs must be an array`);
          }
          if (item.verified !== undefined && typeof item.verified !== 'boolean') {
            errors.push(`itinerary item [day ${di} item ${ii}].verified must be boolean when present`);
          }
          const loc = item.location_ref;
          if (loc !== undefined) {
            if (!isRecord(loc)) {
              errors.push(`itinerary item [day ${di} item ${ii}].location_ref must be an object`);
            } else if (typeof loc.name !== 'string' || !loc.name.trim()) {
              errors.push(`itinerary item [day ${di} item ${ii}].location_ref.name must be a non-empty string`);
            }
          }
        });
      });
    }
  }

  const todo = state.todo_verification_list;
  if (todo !== undefined) {
    if (!Array.isArray(todo)) {
      errors.push('state.todo_verification_list must be an array when present');
    } else {
      todo.forEach((item, i) => {
        if (!isRecord(item)) {
          errors.push(`state.todo_verification_list[${i}] must be an object`);
          return;
        }
        for (const key of ['field', 'missing_reason', 'required_skill'] as const) {
          if (typeof item[key] !== 'string') {
            errors.push(`state.todo_verification_list[${i}].${key} must be a string`);
          }
        }
      });
    }
  }

  let valid = errors.length === 0;
  if (isAo04RouteAndRunStrict() && warnings.length > 0) {
    valid = false;
    for (const w of warnings) {
      errors.push(`AO-04 strict: ${w}`);
    }
  }

  return { valid, errors, warnings };
}
