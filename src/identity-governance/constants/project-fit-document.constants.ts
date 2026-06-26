export const FIT_DOCUMENT_TYPES = [
  'ID_CARD',
  'PASSPORT',
  'QUALIFICATION_CERT',
  'MEDICAL_CERT',
  'INSURANCE',
  'OTHER',
] as const;
export type FitDocumentType = (typeof FIT_DOCUMENT_TYPES)[number];

export const FIT_DOCUMENT_OCR_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
] as const;
export type FitDocumentOcrStatus = (typeof FIT_DOCUMENT_OCR_STATUSES)[number];

export const APPEAL_TARGET_TYPES = [
  'APPLICATION',
  'FIT_ASSESSMENT',
  'ELIGIBILITY_DECISION',
] as const;
export type AppealTargetType = (typeof APPEAL_TARGET_TYPES)[number];

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export type ExtractedDocumentFields = {
  fullName?: string;
  documentNumber?: string;
  expiryDate?: string;
  issueDate?: string;
  nationality?: string;
  qualificationTypes?: string[];
  rawLines?: string[];
};
