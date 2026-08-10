/** Booking import draft — extract only; writeback stays PATCH …/booking */

export const BOOKING_IMPORT_SOURCE_HINTS = [
  'order_ocr',
  'email_ocr',
  'email_paste',
  'booking_url',
] as const;
export type BookingImportSourceHint = (typeof BOOKING_IMPORT_SOURCE_HINTS)[number];

export const BOOKING_IMPORT_STATUSES = ['ready', 'processing', 'failed'] as const;
export type BookingImportStatus = (typeof BOOKING_IMPORT_STATUSES)[number];

export interface BookingImportDraft {
  placeName?: string;
  confirmation?: string;
  bookingUrl?: string;
  platform?: string;
  guestName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  source: BookingImportSourceHint;
}

export interface BookingImportResultDto {
  docId?: string;
  status: BookingImportStatus;
  fileName?: string;
  contentType?: string;
  warnings: string[];
  draft: BookingImportDraft;
  errorMessage?: string;
}

export interface BookingImportDocumentRecord extends BookingImportResultDto {
  docId: string;
  itemId: string;
  createdAt: string;
  updatedAt: string;
}
