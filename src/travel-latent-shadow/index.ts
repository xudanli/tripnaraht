export type {
  ExplicitBaselineSnippet,
  LatentExplicitDivergence,
  LatentShadowHypothesis,
  LatentShadowReport,
  LatentHypothesisKind,
} from './latent-shadow.types';
export {
  LATENT_SHADOW_AUTHORITY,
  LATENT_SHADOW_SCHEMA,
} from './latent-shadow.types';
export {
  assertLatentImplicitParseShadowEnabled,
  isLatentImplicitParseKillSwitchEngaged,
  isLatentImplicitParseShadowEnabled,
} from './latent-shadow.kill-switch';
export {
  assertLatentShadowMustNotWritePlan,
  refuseLatentShadowPlanMutation,
  LATENT_SHADOW_WRITE_FORBIDDEN_CODE,
} from './assert-latent-shadow-must-not-write';
export { runLatentImplicitParseShadow } from './parse-latent-signals.shadow';
export type { LatentParseSignalInput } from './parse-latent-signals.shadow';
export { divergeLatentFromExplicitBaseline } from './diverge-from-explicit-baseline';
