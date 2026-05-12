export type { NeptunePatch, NeptunePatchTarget } from './neptune-patch.types';
export type { EcoCorrectionStrategy } from './minimal-correction-engine';
export {
  applyMinimalNeptunePatches,
  planMinimalNeptunePatches,
  resolveCorrectionStrategy,
} from './minimal-correction-engine';
export type { MinimalPatchApplyOutcome } from './minimal-correction-engine';
