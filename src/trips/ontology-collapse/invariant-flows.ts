import type { InvariantFlow, RawObservation } from './ontology-dissolution.types';
import { detectStableRegularities } from './stable-regularities';

/**
 * Invariant flows — persistence without symbolic classification.
 */
export function detectInvariantFlows(stream: RawObservation[]): InvariantFlow[] {
  const regs = detectStableRegularities(stream);
  return regs.map(r => {
    const span = r.tickEnd - r.tickStart;
    const ticks =
      stream.filter(o => o.tick >= r.tickStart && o.tick <= r.tickEnd).length || 1;
    const mean =
      stream
        .filter(o => o.tick >= r.tickStart && o.tick <= r.tickEnd)
        .reduce((s, o) => s + o.signal, 0) / ticks;
    const varSum = stream
      .filter(o => o.tick >= r.tickStart && o.tick <= r.tickEnd)
      .reduce((s, o) => s + (o.signal - mean) ** 2, 0);
    const variance = ticks > 0 ? varSum / ticks : 1;
    const selfSustaining = span >= 1 && variance < 1e-4 && ticks >= 2;

    return {
      fingerprint: r.fingerprint,
      tickStart: r.tickStart,
      tickEnd: r.tickEnd,
      selfSustaining,
    };
  });
}
