import type { Logger } from '@nestjs/common';

const throttleState = new Map<string, { at: number; suppressed: number }>();

/**
 * 开发环境 DEBUG 节流：相同 key 在 intervalMs 内只打一条，并汇总 suppressed 次数。
 */
export function logThrottledDebug(
  logger: Logger,
  key: string,
  message: string,
  intervalMs = 15000,
): void {
  const now = Date.now();
  const prev = throttleState.get(key);
  if (prev && now - prev.at < intervalMs) {
    prev.suppressed += 1;
    return;
  }

  let suffix = '';
  if (prev && prev.suppressed > 0) {
    suffix = ` (suppressed ${prev.suppressed} similar in ${intervalMs / 1000}s)`;
  }
  throttleState.set(key, { at: now, suppressed: 0 });
  logger.debug(`${message}${suffix}`);
}
