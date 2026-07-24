/**
 * ONT-P2-03A — Opt-in consent registry (AND with trip allowlist)
 */

import {
  SELECTED_USER_APPROVED_TRIP_IDS,
  SELECTED_USER_APPROVED_USER_IDS,
  SELECTED_USER_CONSENT_VERSION,
} from './authorization';

export interface UserOptInRecord {
  userId: string;
  tripId: string;
  consentVersion: string;
  optedInAt: string;
  destination: 'IS';
  active: boolean;
}

export class UserOptInConsentStore {
  private readonly byKey = new Map<string, UserOptInRecord>();

  private key(userId: string, tripId: string): string {
    return `${userId}::${tripId}`;
  }

  record(optIn: UserOptInRecord): void {
    this.byKey.set(this.key(optIn.userId, optIn.tripId), optIn);
  }

  hasValidOptIn(userId: string, tripId: string): boolean {
    const r = this.byKey.get(this.key(userId, tripId));
    return (
      !!r &&
      r.active &&
      r.destination === 'IS' &&
      r.consentVersion === SELECTED_USER_CONSENT_VERSION &&
      r.userId === userId &&
      r.tripId === tripId
    );
  }

  /** Seed pilot cohort fixtures */
  seedPilotCohort(nowMs?: number): void {
    const at = new Date(nowMs ?? Date.now()).toISOString();
    const trips = SELECTED_USER_APPROVED_TRIP_IDS;
    const users = SELECTED_USER_APPROVED_USER_IDS;
    for (let i = 0; i < users.length; i++) {
      const tripId = trips[i % trips.length]!;
      this.record({
        userId: users[i]!,
        tripId,
        consentVersion: SELECTED_USER_CONSENT_VERSION,
        optedInAt: at,
        destination: 'IS',
        active: true,
      });
    }
  }

  clear(): void {
    this.byKey.clear();
  }
}

export function isApprovedSelectedTrip(tripId: string): boolean {
  return (SELECTED_USER_APPROVED_TRIP_IDS as readonly string[]).includes(tripId);
}

export function isApprovedSelectedUser(userId: string): boolean {
  return (SELECTED_USER_APPROVED_USER_IDS as readonly string[]).includes(userId);
}
