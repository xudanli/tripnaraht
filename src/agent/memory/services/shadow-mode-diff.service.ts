import { Injectable } from '@nestjs/common';
import type { DecisionParams } from '../interfaces/decision-params.interface';

export interface DecisionParamsDiff {
  changedKeys: string[];
  before: DecisionParams;
  after: DecisionParams;
}

function deepDiffKeys(a: any, b: any, base = ''): string[] {
  if (a === b) return [];
  const keys = new Set<string>([
    ...Object.keys(a ?? {}),
    ...Object.keys(b ?? {}),
  ]);
  const out: string[] = [];
  for (const k of keys) {
    const nextBase = base ? `${base}.${k}` : k;
    const av = a?.[k];
    const bv = b?.[k];
    const bothObj =
      av != null &&
      bv != null &&
      typeof av === 'object' &&
      typeof bv === 'object' &&
      !Array.isArray(av) &&
      !Array.isArray(bv);
    if (bothObj) out.push(...deepDiffKeys(av, bv, nextBase));
    else if (av !== bv) out.push(nextBase);
  }
  return out;
}

@Injectable()
export class ShadowModeDiffService {
  /**
   * dry_run mode: compute diff but do not affect execution.
   */
  diff(before: DecisionParams, after: DecisionParams): DecisionParamsDiff {
    return {
      changedKeys: deepDiffKeys(before, after),
      before,
      after,
    };
  }
}

