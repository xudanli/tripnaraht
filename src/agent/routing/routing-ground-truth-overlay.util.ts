/**
 * P0-4：RoutingClassifierEval 人工 ground_truth overlay SSOT。
 */

import fs from 'fs';
import path from 'path';
import type {
  RoutingClassifierEvalGroundTruth,
  RoutingClassifierEvalSampleV1,
  RoutingClassifierTier,
} from './routing-classifier-eval.types';
import { analyzeRoutingTierMismatch } from './routing-tier-projection.util';

export type RoutingGroundTruthOverlayMap = Record<string, Partial<RoutingClassifierEvalGroundTruth>>;

export interface RoutingGroundTruthOverlayFile {
  schemaId: 'tripnara.routing_ground_truth_overlay@v1';
  version: 1;
  description?: string;
  overlays: RoutingGroundTruthOverlayMap;
}

export const DEFAULT_ROUTING_GROUND_TRUTH_OVERLAY_PATH = path.join(
  __dirname,
  'routing-ground-truth-overlay.json',
);

export function resolveRoutingGroundTruthOverlayPath(customPath?: string): string {
  const env = process.env.ROUTING_EVAL_GROUND_TRUTH_OVERLAY?.trim();
  return customPath?.trim() || env || DEFAULT_ROUTING_GROUND_TRUTH_OVERLAY_PATH;
}

export function loadRoutingGroundTruthOverlay(
  customPath?: string,
): RoutingGroundTruthOverlayMap {
  const filePath = resolveRoutingGroundTruthOverlayPath(customPath);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as
    | RoutingGroundTruthOverlayFile
    | RoutingGroundTruthOverlayMap;
  if ('overlays' in parsed && parsed.overlays && typeof parsed.overlays === 'object') {
    return parsed.overlays as RoutingGroundTruthOverlayMap;
  }
  return parsed as RoutingGroundTruthOverlayMap;
}

export function lookupGroundTruthOverlay(
  overlay: RoutingGroundTruthOverlayMap,
  fixtureId: string,
  sampleId: string,
): Partial<RoutingClassifierEvalGroundTruth> | undefined {
  return overlay[fixtureId] ?? overlay[sampleId];
}

export function applyGroundTruthOverlayToSample(
  sample: RoutingClassifierEvalSampleV1,
  fixtureId: string,
  overlay: RoutingGroundTruthOverlayMap,
): boolean {
  const patch = lookupGroundTruthOverlay(overlay, fixtureId, sample.sample_id);
  if (!patch) {
    return false;
  }
  sample.ground_truth = {
    ...sample.ground_truth,
    ...patch,
    annotatorNotes: patch.annotatorNotes ?? sample.ground_truth.annotatorNotes,
  };
  return true;
}

export function bumpConfusion(
  confusion: Record<string, number>,
  mismatch: string,
): void {
  if (mismatch === 'NONE') {
    confusion.match = (confusion.match ?? 0) + 1;
    return;
  }
  confusion[mismatch] = (confusion[mismatch] ?? 0) + 1;
}

export function computeTierConfusion(
  left: RoutingClassifierTier,
  right: RoutingClassifierTier,
): Record<string, number> {
  const confusion = { match: 0, OVER_ROUTING: 0, UNDER_ROUTING: 0 };
  bumpConfusion(confusion, analyzeRoutingTierMismatch(left, right));
  return confusion;
}

export function mergeConfusion(
  target: Record<string, number>,
  delta: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(delta)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

export function summarizeLabeledEval(samples: RoutingClassifierEvalSampleV1[]): {
  labeled_vs_shadow: Record<string, number>;
  production_vs_labeled: Record<string, number>;
  unresolved_labeled_mismatch_ids: string[];
} {
  const labeledVsShadow = { match: 0, OVER_ROUTING: 0, UNDER_ROUTING: 0 };
  const productionVsLabeled = { match: 0, OVER_ROUTING: 0, UNDER_ROUTING: 0 };
  const unresolved: string[] = [];

  for (const sample of samples) {
    const shadow = sample.shadow_output?.shadowRouting;
    if (!shadow) {
      unresolved.push(sample.sample_id);
      continue;
    }
    mergeConfusion(
      labeledVsShadow,
      computeTierConfusion(sample.ground_truth.targetRouting, shadow),
    );
    mergeConfusion(
      productionVsLabeled,
      computeTierConfusion(sample.current_rule_output.actualRouting, sample.ground_truth.targetRouting),
    );
    const labeledMismatch = analyzeRoutingTierMismatch(sample.ground_truth.targetRouting, shadow);
    if (labeledMismatch !== 'NONE') {
      unresolved.push(sample.sample_id);
    }
  }

  return {
    labeled_vs_shadow: labeledVsShadow,
    production_vs_labeled: productionVsLabeled,
    unresolved_labeled_mismatch_ids: unresolved,
  };
}
