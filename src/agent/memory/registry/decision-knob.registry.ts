import type { DecisionParams } from '../interfaces/decision-params.interface';
import type { MemoryAtom } from '../strategies/conflict-resolver.strategy';

export type MemoryFieldKey =
  | 'pacePreference'
  | 'riskTolerance'
  | 'altitudeTolerance'
  | 'travelPhilosophy'
  | 'geoPreference';

export interface KnobApplication {
  /** Stable key for audit */
  key: MemoryFieldKey;
  /** Short reason code (non-PII) */
  reason: string;
  /** [0,1] strength after conflict/decay */
  strength01: number;
}

export type KnobApplyFn<T> = (args: {
  params: DecisionParams;
  atom: MemoryAtom<T>;
  strength01: number;
  audit: KnobApplication[];
}) => void;

/**
 * Decision Knob Registry
 *
 * Explicit registration of MemoryField → DecisionParams mapping.
 * Do NOT hardcode ad-hoc mappings outside this registry.
 */
export class DecisionKnobRegistry {
  private readonly fns = new Map<MemoryFieldKey, KnobApplyFn<any>>();

  register<T>(key: MemoryFieldKey, fn: KnobApplyFn<T>): void {
    this.fns.set(key, fn as KnobApplyFn<any>);
  }

  has(key: MemoryFieldKey): boolean {
    return this.fns.has(key);
  }

  apply<T>(key: MemoryFieldKey, args: Parameters<KnobApplyFn<T>>[0]): void {
    const fn = this.fns.get(key);
    if (!fn) return;
    fn(args);
  }
}

