/**
 * §13.E（PRD）/ I5：主编排退避成功路径下的 observability 形状契约。
 *
 * - 与 `RouteAndRunResponseDto.observability` 中 `recovery_trace`、`recovery_retry_attempts` 对齐。
 * - 不替代 route_and_run 集成测试；提供无 Nest 依赖的可执行门禁，供 CI 与Replay 聚合前置校验。
 *
 * Recovery Engine（算法）与两种 Loop（route_and-run vs executeWithI5Recovery）入口分离 —
 * 本契约只约束「对外可观测的轨迹」，不要求合并 Service。
 */

export type ValidateRecoveryTraceContractOptions = {
  /**
   * 为 true 时，每条 trace 行必须含 `elapsed_ms` 与 `recorded_at`（I5：retry 可计量、可回放）。
   * 契约测试与 §13.E 加固门禁建议开启。
   */
  requireWallClockFields?: boolean;
};

function isIsoLike(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

/**
 * 校验 `observability` 片段中 recovery 相关字段的一致性。
 */
export function validateRouteAndRunRecoveryTraceContract(
  observability: unknown,
  options?: ValidateRecoveryTraceContractOptions,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requireWallClock = options?.requireWallClockFields === true;

  if (observability === null || typeof observability !== 'object') {
    return { valid: false, errors: ['observability must be a non-null object'] };
  }

  const obs = observability as Record<string, unknown>;
  const attemptsRaw = obs.recovery_retry_attempts;
  const traceRaw = obs.recovery_trace;

  const hasAttempts = typeof attemptsRaw === 'number' && Number.isFinite(attemptsRaw);
  const hasTrace = Array.isArray(traceRaw);

  if (!hasAttempts && !hasTrace) {
    return { valid: true, errors: [] };
  }

  if (hasAttempts && attemptsRaw! < 0) {
    errors.push('recovery_retry_attempts must be >= 0');
  }

  if (hasAttempts && attemptsRaw === 0) {
    if (hasTrace && traceRaw.length > 0) {
      errors.push('recovery_retry_attempts is 0 but recovery_trace is non-empty');
    }
    return { valid: errors.length === 0, errors };
  }

  if (hasAttempts && attemptsRaw! > 0) {
    if (!hasTrace) {
      errors.push('recovery_retry_attempts > 0 requires recovery_trace array');
      return { valid: false, errors };
    }
    if (traceRaw.length !== attemptsRaw) {
      errors.push(
        `recovery_trace.length (${traceRaw.length}) must equal recovery_retry_attempts (${attemptsRaw})`,
      );
    }
  }

  if (hasTrace && traceRaw.length > 0) {
    if (!hasAttempts) {
      errors.push('non-empty recovery_trace requires numeric recovery_retry_attempts');
    }

    for (let i = 0; i < traceRaw.length; i++) {
      const row = traceRaw[i];
      const prefix = `recovery_trace[${i}]`;
      if (row === null || typeof row !== 'object') {
        errors.push(`${prefix} must be an object`);
        continue;
      }
      const r = row as Record<string, unknown>;

      if (typeof r.attempt !== 'number' || !Number.isFinite(r.attempt) || r.attempt < 1) {
        errors.push(`${prefix}.attempt must be a finite number >= 1`);
      } else if (Math.floor(r.attempt) !== r.attempt) {
        errors.push(`${prefix}.attempt must be an integer`);
      } else if (r.attempt !== i + 1) {
        errors.push(`${prefix}.attempt expected ${i + 1}, got ${r.attempt}`);
      }

      if (typeof r.backoff_ms !== 'number' || !Number.isFinite(r.backoff_ms) || r.backoff_ms < 0) {
        errors.push(`${prefix}.backoff_ms must be a finite number >= 0`);
      }

      if (r.failure_code !== undefined && typeof r.failure_code !== 'string') {
        errors.push(`${prefix}.failure_code must be a string when present`);
      }

      if (requireWallClock) {
        if (typeof r.elapsed_ms !== 'number' || !Number.isFinite(r.elapsed_ms) || r.elapsed_ms < 0) {
          errors.push(`${prefix}.elapsed_ms must be a finite number >= 0 (I5 wall-clock)`);
        }
        if (typeof r.recorded_at !== 'string' || !isIsoLike(r.recorded_at)) {
          errors.push(`${prefix}.recorded_at must be an ISO-8601-like string (I5 replay)`);
        }
      } else {
        if (r.elapsed_ms !== undefined && (typeof r.elapsed_ms !== 'number' || !Number.isFinite(r.elapsed_ms))) {
          errors.push(`${prefix}.elapsed_ms must be a finite number when present`);
        }
        if (r.recorded_at !== undefined && typeof r.recorded_at !== 'string') {
          errors.push(`${prefix}.recorded_at must be a string when present`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
