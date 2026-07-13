export type RoleSlotKey =
  | 'primaryContact'
  | 'payer'
  | 'finalConfirmer'
  | 'advisor'
  | 'leader';

export type ResponsibilityOwnerKey =
  | 'planningOwner'
  | 'executionOwner'
  | 'paymentApprover'
  | 'finalApprover'
  | 'onTripLeader'
  | 'emergencyContact';

export const ROLE_SLOT_TO_COLLABORATOR_ROLE: Record<RoleSlotKey, string> = {
  primaryContact: 'PRIMARY_CONTACT',
  payer: 'PAYER',
  finalConfirmer: 'FINAL_CONFIRMER',
  advisor: 'ADVISOR',
  leader: 'LEADER',
};

export const ROLE_SLOT_TO_DEFAULT_TRIP_ROLE: Record<
  RoleSlotKey,
  'MEMBER' | 'PAYER' | 'FINAL_CONFIRMER' | 'GUARDIAN' | 'PRIMARY_CONTACT'
> = {
  primaryContact: 'PRIMARY_CONTACT',
  payer: 'PAYER',
  finalConfirmer: 'FINAL_CONFIRMER',
  advisor: 'MEMBER',
  leader: 'MEMBER',
};

export const ROLE_SLOT_TO_OWNER_KEY: Record<RoleSlotKey, ResponsibilityOwnerKey> = {
  advisor: 'planningOwner',
  leader: 'executionOwner',
  payer: 'paymentApprover',
  finalConfirmer: 'finalApprover',
  primaryContact: 'emergencyContact',
};

export const OWNER_KEY_TO_ROLE_SLOT: Record<ResponsibilityOwnerKey, RoleSlotKey | null> = {
  planningOwner: 'advisor',
  executionOwner: 'leader',
  paymentApprover: 'payer',
  finalApprover: 'finalConfirmer',
  onTripLeader: 'leader',
  emergencyContact: 'primaryContact',
};

export const ADVISOR_PATCH_ROLES = new Set(['OWNER', 'ADVISOR', 'EDITOR']);
