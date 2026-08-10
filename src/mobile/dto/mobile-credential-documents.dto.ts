/** 证件资料库 — /api/mobile/users/me/documents */

export const CREDENTIAL_DOCUMENT_TYPES = [
  'drivers_license',
  'international_permit',
  'license_translation',
  'passport',
  'visa',
  'travel_insurance',
  'medical_note',
] as const;
export type CredentialDocumentType = (typeof CREDENTIAL_DOCUMENT_TYPES)[number];

export const CREDENTIAL_DOCUMENT_STATUSES = [
  'pending',
  'verified',
  'rejected',
  'expired',
  'missing',
  'not_applicable',
  'completed',
] as const;
export type CredentialDocumentStatus = (typeof CREDENTIAL_DOCUMENT_STATUSES)[number];

/** Organizer-facing status values (subset + trip-level). */
export const CREDENTIAL_STATUS_ITEM_STATUSES = [
  'completed',
  'pending',
  'not_applicable',
  'verified',
  'missing',
] as const;
export type CredentialStatusItemStatus = (typeof CREDENTIAL_STATUS_ITEM_STATUSES)[number];

export const ORGANIZER_CREDENTIAL_TYPES = [
  'drivers_license',
  'international_permit',
  'license_translation',
  'passport',
  'additional_driver_registration',
] as const;
export type OrganizerCredentialType = (typeof ORGANIZER_CREDENTIAL_TYPES)[number];

export interface CredentialDocumentListItemDto {
  id: string;
  type: CredentialDocumentType;
  status: CredentialDocumentStatus;
  expiresOn: string | null;
  updatedAt: string;
  hasFile: boolean;
  numberLast4?: string | null;
}

export interface CredentialDocumentsListResponseDto {
  items: CredentialDocumentListItemDto[];
}

export interface CredentialDocumentDetailDto extends CredentialDocumentListItemDto {
  notes: string | null;
  mimeType: string | null;
  fileName: string | null;
  /** Short-lived signed URL for preview; TTL ≤ 10 min. Never put in trip public payload. */
  signedUrl: string | null;
  signedUrlExpiresAt: string | null;
}

export interface CredentialStatusItemDto {
  type: OrganizerCredentialType | string;
  status: CredentialStatusItemStatus | string;
}

export interface MemberCredentialStatusResponseDto {
  memberId: string;
  displayName: string | null;
  items: CredentialStatusItemDto[];
}
