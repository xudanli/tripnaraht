/**
 * Effective Plan write guard — only execute/rollback may call setEffective when enabled.
 * Modes: OFF | SHADOW | ENFORCE (see canonical-mutation-commit-guard.config.ts)
 */

export {
  isEffectivePlanWriteGuardEnabled,
  isEffectivePlanWriteGuardEnforce,
  isEffectivePlanWriteGuardShadow,
  resolveEffectivePlanWriteGuardMode,
  type EffectivePlanWriteGuardMode,
} from './canonical-mutation-commit-guard.config';
