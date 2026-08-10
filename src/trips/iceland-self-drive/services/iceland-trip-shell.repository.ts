/**
 * Trip Shell repository — NOT PlanVersion, NOT applied itinerary.
 */

import { Injectable } from '@nestjs/common';
import type { TripShell } from '../types/iceland-trip-shell-preview.types';

@Injectable()
export class IcelandTripShellRepository {
  private readonly byId = new Map<string, TripShell>();

  create(shell: TripShell): TripShell {
    this.byId.set(shell.tripId, shell);
    return shell;
  }

  get(tripId: string): TripShell | undefined {
    return this.byId.get(tripId);
  }

  update(tripId: string, patch: Partial<TripShell>): TripShell | undefined {
    const cur = this.byId.get(tripId);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    this.byId.set(tripId, next);
    return next;
  }

  /** Test helper — never used as PlanVersion count */
  count(): number {
    return this.byId.size;
  }
}
