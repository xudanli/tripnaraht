/**
 * Second-pass stamp: RepairEvaluator outputs → overlay repair hints + slight reliability ding.
 * Keeps initial ExecutionOverlayFrame free of repair circular dependency.
 */

import type { RepairInstruction } from '../decision/repair/repair-action.types';
import type { ExecutionOverlayFrame } from './execution-overlay-frame.types';

export function mergeRepairHintsIntoFrames(
  frames: ExecutionOverlayFrame[],
  repairs: RepairInstruction[],
): ExecutionOverlayFrame[] {
  if (!frames.length || !repairs.length) {
    return frames;
  }

  return frames.map(frame => {
    const hitting = repairs.filter(r => r.targetSlotIds.includes(frame.legId));
    if (!hitting.length) {
      return frame;
    }
    hitting.sort((a, b) => a.priority - b.priority);
    const top = hitting[0]!;
    let reliabilityScore = frame.reliabilityScore - 0.08;
    reliabilityScore = Math.max(0.08, Math.min(1, reliabilityScore));
    return {
      ...frame,
      repair: { recommended: true, type: top.action },
      reliabilityScore,
      annotations: frame.annotations,
    };
  });
}
