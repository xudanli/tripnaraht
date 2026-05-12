/**
 * 将天气 delayFactor 转为对 ISO 日时刻（HH:mm）的增量，供驾驶段缓冲。
 * 不跨日：结果钳制在 00:00–23:59（当日行程轴）。
 */

import type { ISOTime } from '../world-model';

export function parseIsoTimeToMinutes(time: ISOTime): number {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return 0;
  }
  return h * 60 + m;
}

export function addMinutesToIsoTime(time: ISOTime, deltaMin: number): ISOTime {
  const raw = parseIsoTimeToMinutes(time) + deltaMin;
  const capped = Math.min(24 * 60 - 1, Math.max(0, raw));
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
