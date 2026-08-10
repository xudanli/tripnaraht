/**
 * MVP booking import: no real OCR — heuristic extract from text / filename / Booking URL.
 * Client confirms on review page, then PATCH …/booking.
 */

import { randomUUID } from 'crypto';
import type {
  BookingImportDocumentRecord,
  BookingImportDraft,
  BookingImportResultDto,
  BookingImportSourceHint,
} from '../types/booking-import.types';

const CONFIRMATION_PATTERNS: RegExp[] = [
  /(?:confirmation(?:\s*(?:number|no\.?|#|code))?|确认号|预订号|订单号|booking\s*(?:number|no\.?|#|ref(?:erence)?))\s*[:：#]?\s*([A-Z0-9][A-Z0-9\-]{4,31})/i,
  /\b(?:conf|ref|pnr)\s*[:：#]?\s*([A-Z0-9][A-Z0-9\-]{5,31})\b/i,
  /\b([A-Z]{2,4}\d{6,12})\b/,
  /\b(\d{8,14})\b/,
];

const GUEST_PATTERNS: RegExp[] = [
  /(?:guest(?:\s*name)?|traveler|旅客|客人|入住人)\s*[:：]\s*([^\n\r,]{2,80})/i,
];

const PLACE_PATTERNS: RegExp[] = [
  /(?:hotel|property|住宿|酒店|民宿)\s*[:：]\s*([^\n\r]{2,100})/i,
  /(?:you(?:'re| are)\s+staying\s+at)\s+([^\n\r.]{2,100})/i,
];

const CHECK_IN_PATTERNS: RegExp[] = [
  /(?:check[\s-]?in|入住|入住日)\s*[:：]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
];

const CHECK_OUT_PATTERNS: RegExp[] = [
  /(?:check[\s-]?out|退房|退房日)\s*[:：]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
];

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

const PLATFORM_HOSTS: Array<{ host: RegExp; platform: string }> = [
  { host: /booking\.com/i, platform: 'booking.com' },
  { host: /airbnb\./i, platform: 'airbnb' },
  { host: /hotels\.com/i, platform: 'hotels.com' },
  { host: /expedia\./i, platform: 'expedia' },
  { host: /agoda\./i, platform: 'agoda' },
  { host: /tripadvisor\./i, platform: 'tripadvisor' },
  { host: /getyourguide\./i, platform: 'getyourguide' },
  { host: /viator\./i, platform: 'viator' },
  { host: /klook\./i, platform: 'klook' },
];

export interface BookingImportRecognizeInput {
  text?: string;
  fileName?: string;
  contentType?: string;
  buffer?: Buffer;
  sourceHint?: BookingImportSourceHint;
  /** Fallback place name from itinerary item Place */
  placeNameHint?: string | null;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]?.trim()) return m[1].trim().replace(/\s+/g, ' ');
  }
  return undefined;
}

function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    let y = Number(slash[3]);
    if (y < 100) y += 2000;
    // Prefer DMY (common in EU emails); if month>12 swap to MDY
    let day = d;
    let month = m;
    if (month > 12 && day <= 12) {
      day = m;
      month = d;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return undefined;
}

function detectPlatform(text: string, url?: string): string | undefined {
  const hay = `${url ?? ''} ${text}`;
  for (const row of PLATFORM_HOSTS) {
    if (row.host.test(hay)) return row.platform;
  }
  return undefined;
}

function extractBookingUrl(text: string): string | undefined {
  const urls = text.match(URL_RE) ?? [];
  const preferred = urls.find((u) =>
    PLATFORM_HOSTS.some((p) => p.host.test(u)),
  );
  return preferred ?? urls[0];
}

function confirmationFromBookingUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const keys = [
      'confirmation',
      'confirmation_number',
      'confirmationNumber',
      'bn',
      'booking_number',
      'ref',
      'reference',
      'reservation_id',
      'pin',
    ];
    for (const k of keys) {
      const v = u.searchParams.get(k);
      if (v && /^[A-Za-z0-9\-]{4,32}$/.test(v)) return v;
    }
    // path segment like /confirmation/ABC123
    const pathMatch = u.pathname.match(
      /(?:confirmation|reservation|booking)\/([A-Za-z0-9\-]{4,32})/i,
    );
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    // ignore invalid URL
  }
  return undefined;
}

function placeFromFileName(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  if (base.length < 3) return undefined;
  // Skip generic upload names
  if (/^(img|image|screenshot|scan|photo|order|booking|email|pdf)\s*\d*$/i.test(base)) {
    return undefined;
  }
  return base.slice(0, 100);
}

function bufferAsUtf8Text(buffer?: Buffer, contentType?: string): string {
  if (!buffer?.length) return '';
  const ct = (contentType ?? '').toLowerCase();
  const looksText =
    ct.startsWith('text/') ||
    ct.includes('json') ||
    ct.includes('xml') ||
    ct === 'application/pdf' || // may be binary; still try
    ct === '';
  if (!looksText && ct.startsWith('image/')) return '';
  const sample = buffer.slice(0, Math.min(buffer.length, 200_000));
  // Heuristic: mostly printable → treat as text (email paste / OCR dump)
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 128) {
      printable += 1;
    }
  }
  if (printable / sample.length < 0.85) return '';
  return sample.toString('utf8');
}

function resolveSourceHint(
  input: BookingImportRecognizeInput,
  text: string,
): BookingImportSourceHint {
  if (input.sourceHint) return input.sourceHint;
  const name = (input.fileName ?? '').toLowerCase();
  if (name.includes('email') || name.includes('邮件')) return 'email_ocr';
  if (/https?:\/\/|booking\.com/i.test(text)) return 'booking_url';
  if (input.text && !input.buffer) {
    return /https?:\/\//i.test(input.text) && input.text.trim().length < 500
      ? 'booking_url'
      : 'email_paste';
  }
  return 'order_ocr';
}

export function recognizeBookingImportDraft(
  input: BookingImportRecognizeInput,
): BookingImportResultDto {
  const fromBuffer = bufferAsUtf8Text(input.buffer, input.contentType);
  const text = [input.text ?? '', fromBuffer, input.fileName ?? '']
    .filter(Boolean)
    .join('\n');

  if (!text.trim() && !(input.buffer && input.buffer.length > 0)) {
    return {
      status: 'failed',
      warnings: [],
      draft: { source: input.sourceHint ?? 'order_ocr' },
      errorMessage: 'Empty import payload',
      fileName: input.fileName,
      contentType: input.contentType,
    };
  }

  const source = resolveSourceHint(input, text);
  const bookingUrl = extractBookingUrl(text);
  const confirmation =
    firstMatch(text, CONFIRMATION_PATTERNS) ??
    (bookingUrl ? confirmationFromBookingUrl(bookingUrl) : undefined);
  const guestName = firstMatch(text, GUEST_PATTERNS);
  const placeName =
    firstMatch(text, PLACE_PATTERNS) ??
    placeFromFileName(input.fileName) ??
    (input.placeNameHint?.trim() || undefined);
  const checkInDate = normalizeDate(firstMatch(text, CHECK_IN_PATTERNS));
  const checkOutDate = normalizeDate(firstMatch(text, CHECK_OUT_PATTERNS));
  const platform = detectPlatform(text, bookingUrl);

  const warnings: string[] = [];
  if (!confirmation) warnings.push('confirmation_not_found');
  if (!bookingUrl && source === 'booking_url') warnings.push('booking_url_not_found');
  if (!placeName) warnings.push('place_name_not_found');

  // Image/PDF with no extractable text: still ready with soft warnings so iOS can review
  const hasBinaryOnly =
    Boolean(input.buffer?.length) &&
    !fromBuffer &&
    !(input.text ?? '').trim() &&
    Boolean(input.fileName);

  if (hasBinaryOnly && !confirmation && !bookingUrl) {
    warnings.push('ocr_text_unavailable');
  }

  const draft: BookingImportDraft = {
    source,
    ...(placeName ? { placeName } : {}),
    ...(confirmation ? { confirmation } : {}),
    ...(bookingUrl ? { bookingUrl } : {}),
    ...(platform ? { platform } : {}),
    ...(guestName ? { guestName } : {}),
    ...(checkInDate ? { checkInDate } : {}),
    ...(checkOutDate ? { checkOutDate } : {}),
  };

  return {
    status: 'ready',
    warnings,
    draft,
    fileName: input.fileName,
    contentType: input.contentType,
  };
}

export function createBookingImportDocumentRecord(
  itemId: string,
  input: BookingImportRecognizeInput,
): BookingImportDocumentRecord {
  const now = new Date().toISOString();
  const recognized = recognizeBookingImportDraft(input);
  return {
    ...recognized,
    docId: randomUUID(),
    itemId,
    createdAt: now,
    updatedAt: now,
  };
}

export function toBookingImportResultDto(
  record: BookingImportDocumentRecord,
): BookingImportResultDto {
  return {
    docId: record.docId,
    status: record.status,
    fileName: record.fileName,
    contentType: record.contentType,
    warnings: record.warnings,
    draft: record.draft,
    ...(record.errorMessage ? { errorMessage: record.errorMessage } : {}),
  };
}
