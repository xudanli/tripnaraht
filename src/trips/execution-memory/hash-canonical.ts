import { createHash } from 'crypto';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';

/** Stable JSON hash for overlay frames (order by legId). */
export function hashExecutionOverlayFrames(frames: ExecutionOverlayFrame[] | undefined): string {
  if (!frames?.length) {
    return createHash('sha256').update('overlay:empty', 'utf8').digest('hex').slice(0, 24);
  }
  const sorted = [...frames].sort((a, b) => a.legId.localeCompare(b.legId));
  const payload = JSON.stringify(sorted);
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 24);
}
