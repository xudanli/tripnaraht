/**
 * Harness trace 三态模式（`off` | `full` | `on-failure`）。
 * @see docs/harness-1x-roadmap.md
 */

export type HarnessTraceMode = 'off' | 'full' | 'on-failure';

export interface HarnessTraceConfig {
  mode: HarnessTraceMode;
  exportDir?: string;
  /** 独立于 on-failure：仅在 `full` 模式下对成功路径按率采样 append（默认 1 = 全记） */
  sampleRate?: number;
}

export function getHarnessTraceMode(): HarnessTraceMode {
  const envVal = process.env.HARNESS_TRACE_MODE?.trim();
  if (envVal === 'off' || envVal === 'full' || envVal === 'on-failure') {
    return envVal;
  }
  return process.env.HARNESS_RECORD_TRACE === '1' ? 'full' : 'off';
}

/** 是否跳过逐步 `appendStep`（`off` 与 `on-failure` 均为 true） */
export function shouldSkipHarnessTraceAppend(): boolean {
  return getHarnessTraceMode() !== 'full';
}

/** 是否在 Harness 步骤失败时逆向合成黑匣子轨迹 */
export function shouldRecordOnFailureRetrofit(): boolean {
  return getHarnessTraceMode() === 'on-failure';
}

/** 编排成功/终态收口是否写入内存 trace（仅 `full`） */
export function shouldFinalizeHarnessTraceOnOrchestrationExit(): boolean {
  return getHarnessTraceMode() === 'full';
}

export function parseHarnessTraceConfig(): HarnessTraceConfig {
  const mode = getHarnessTraceMode();
  const exportDir = process.env.HARNESS_TRACE_EXPORT_DIR?.trim() || undefined;
  const rawRate = process.env.HARNESS_TRACE_SAMPLE_RATE?.trim();
  let sampleRate: number | undefined;
  if (rawRate) {
    const n = Number(rawRate);
    if (Number.isFinite(n) && n >= 0 && n <= 1) sampleRate = n;
  }
  return { mode, exportDir, sampleRate };
}

/**
 * `full` 模式下成功路径是否应 append（采样；未设或 1 表示全记）。
 * `on-failure` / `off` 恒为 false。
 */
export function shouldAppendSuccessStepInFullMode(requestSalt?: string): boolean {
  if (getHarnessTraceMode() !== 'full') return false;
  const rate = parseHarnessTraceConfig().sampleRate;
  if (rate == null || rate >= 1) return true;
  if (rate <= 0) return false;
  const salt = requestSalt ?? '';
  let h = 0;
  for (let i = 0; i < salt.length; i++) h = (h * 31 + salt.charCodeAt(i)) >>> 0;
  return h / 0xffffffff < rate;
}
