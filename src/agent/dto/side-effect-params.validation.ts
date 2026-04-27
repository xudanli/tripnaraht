import { plainToInstance } from 'class-transformer';
import {
  validateSync,
  ValidationArguments,
  ValidationError,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { FINANCIAL_HOLD_HANDLER_ID, FinancialHoldSideEffectParamsDto } from './financial-hold-side-effect-params.dto';

const FH_VALIDATE_OPTS = { whitelist: true, forbidNonWhitelisted: true } as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function formatClassValidatorErrors(errs: ValidationError[]): string {
  const out: string[] = [];
  const walk = (e: ValidationError) => {
    if (e.constraints) out.push(...Object.values(e.constraints));
    e.children?.forEach(walk);
  };
  for (const e of errs) walk(e);
  return out.join('; ');
}

export function assertFinancialHoldParams(params: unknown): { ok: true } | { ok: false; message: string } {
  if (!isPlainObject(params)) {
    return { ok: false, message: 'params must be a non-array object' };
  }
  const inst = plainToInstance(FinancialHoldSideEffectParamsDto, params, { enableImplicitConversion: true });
  const errs = validateSync(inst, FH_VALIDATE_OPTS);
  if (errs.length) {
    return { ok: false, message: formatClassValidatorErrors(errs) || 'params failed validation' };
  }
  return { ok: true };
}

/**
 * Per-handler validation for side-effect `params` objects (patches, replace cells).
 * Unknown handler ids: require a non-array plain object; extra keys are allowed for forward compatibility.
 */
export function assertSideEffectParamsForHandler(
  handlerId: string,
  params: unknown,
): { ok: true } | { ok: false; message: string } {
  if (params == null) {
    return { ok: false, message: 'params must be a non-null object' };
  }
  if (handlerId === FINANCIAL_HOLD_HANDLER_ID) {
    return assertFinancialHoldParams(params);
  }
  if (!isPlainObject(params)) {
    return { ok: false, message: 'params must be a non-array object' };
  }
  return { ok: true };
}

export function assertSideEffectOverridesTree(
  overrides: unknown,
): { ok: true } | { ok: false; message: string } {
  if (overrides == null || !isPlainObject(overrides)) {
    return { ok: false, message: 'overrides must be a non-null object' };
  }
  for (const [actionName, handlers] of Object.entries(overrides)) {
    if (!isPlainObject(handlers)) {
      return { ok: false, message: `overrides[${JSON.stringify(actionName)}] must be a non-null object` };
    }
    for (const [handlerId, params] of Object.entries(handlers)) {
      const r = assertSideEffectParamsForHandler(handlerId, params);
      if (r.ok === false) {
        return { ok: false, message: `${actionName} / ${handlerId}: ${r.message}` };
      }
    }
  }
  return { ok: true };
}

@ValidatorConstraint({ name: 'sideEffectPatchItemParams', async: false })
export class SideEffectParamPatchItemConstraint implements ValidatorConstraintInterface {
  /** Used as a *property* validator on `params` (same DTO is `args.object`). */
  validate(value: unknown, args: ValidationArguments) {
    if (value == null) return true;
    const o = args.object as { handler_id?: string };
    return assertSideEffectParamsForHandler(String(o.handler_id ?? ''), value).ok;
  }

  defaultMessage(args: ValidationArguments) {
    if (args.value == null) return 'invalid';
    const p = args.object as { handler_id?: string };
    const r = assertSideEffectParamsForHandler(String(p.handler_id ?? ''), args.value);
    return r.ok === false ? r.message : 'params failed validation';
  }
}

@ValidatorConstraint({ name: 'sideEffectOverridesTree', async: false })
export class SideEffectOverridesTreeConstraint implements ValidatorConstraintInterface {
  validate(overrides: unknown) {
    return assertSideEffectOverridesTree(overrides).ok;
  }

  defaultMessage(args: ValidationArguments) {
    const r = assertSideEffectOverridesTree(args.value);
    return r.ok === false ? r.message : 'overrides failed validation';
  }
}
