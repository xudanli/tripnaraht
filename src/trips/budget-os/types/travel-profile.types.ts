import type { UserTravelProfile } from '../../../agent/memory/interfaces/user-travel-profile.interface';
import type { MatchSquarePersonaSnapshot } from '../../../match-square/utils/match-square-persona.util';
import type { MoneyDnaProfile } from './value-feedback.types';

/** Aggregated user travel identity — Odyssey + Money DNA + decision baseline */
export interface UserTravelProfileAggregate {
  userId: string;
  odyssey: MatchSquarePersonaSnapshot | null;
  moneyDna: MoneyDnaProfile | null;
  /** L1 context-engine travel profile (pace, risk, philosophy) */
  travelProfile: UserTravelProfile | null;
  updatedAt: string;
}
