/**
 * Travel Memory Runtime — Scope（防记忆污染）。
 * @see ADR-TRAVEL-MEMORY-RUNTIME
 */

export type MemoryScope =
  | 'GLOBAL_USER'
  | 'USER_COUNTRY'
  | 'USER_TRIP_TYPE'
  | 'TRIP'
  | 'TRIP_MEMBER'
  | 'TEAM'
  | 'SESSION'
  | 'DAY'
  | 'DECISION';

export type MemorySubjectType = 'USER' | 'TRIP' | 'TEAM' | 'TRIP_MEMBER' | 'SESSION';

export type MemorySubject = {
  type: MemorySubjectType;
  id: string;
};
