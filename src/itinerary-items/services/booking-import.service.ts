import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createBookingImportDocumentRecord,
  toBookingImportResultDto,
} from '../utils/booking-import.heuristic.util';
import {
  BOOKING_IMPORT_SOURCE_HINTS,
  type BookingImportDocumentRecord,
  type BookingImportResultDto,
  type BookingImportSourceHint,
} from '../types/booking-import.types';

function normalizeSourceHint(
  value?: string,
): BookingImportSourceHint | undefined {
  if (!value) return undefined;
  return (BOOKING_IMPORT_SOURCE_HINTS as readonly string[]).includes(value)
    ? (value as BookingImportSourceHint)
    : undefined;
}

function inferTextSourceHint(text: string): BookingImportSourceHint {
  const t = text.trim();
  if (/^https?:\/\//i.test(t) && t.length < 500) return 'booking_url';
  return 'email_paste';
}

export interface BookingDocumentUploadInput {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  sourceHint?: BookingImportSourceHint;
}

export interface BookingTextImportInput {
  text: string;
  sourceHint?: BookingImportSourceHint;
}

/**
 * In-memory doc store for poll GET (MVP stub OCR returns ready immediately).
 * Keyed by itemId → docId. Lost on restart (client falls back to local stub).
 */
@Injectable()
export class BookingImportService {
  private readonly docs = new Map<string, Map<string, BookingImportDocumentRecord>>();

  constructor(private readonly prisma: PrismaService) {}

  async uploadDocument(
    itemId: string,
    input: BookingDocumentUploadInput,
  ): Promise<BookingImportResultDto> {
    const placeNameHint = await this.requireItemPlaceName(itemId);
    const record = createBookingImportDocumentRecord(itemId, {
      buffer: input.buffer,
      fileName: input.originalname,
      contentType: input.mimetype,
      sourceHint: normalizeSourceHint(input.sourceHint),
      placeNameHint,
    });
    this.putDoc(record);
    return toBookingImportResultDto(record);
  }

  async getDocument(itemId: string, docId: string): Promise<BookingImportResultDto> {
    await this.requireItemPlaceName(itemId);
    const record = this.docs.get(itemId)?.get(docId);
    if (!record) {
      throw new NotFoundException(`找不到预订导入文档 (docId: ${docId})`);
    }
    return toBookingImportResultDto(record);
  }

  async importText(
    itemId: string,
    input: BookingTextImportInput,
  ): Promise<BookingImportResultDto> {
    const placeNameHint = await this.requireItemPlaceName(itemId);
    const text = (input.text ?? '').trim();
    const record = createBookingImportDocumentRecord(itemId, {
      text,
      sourceHint: normalizeSourceHint(input.sourceHint) ?? inferTextSourceHint(text),
      placeNameHint,
    });
    this.putDoc(record);
    return {
      ...toBookingImportResultDto(record),
      fileName: undefined,
      contentType: undefined,
    };
  }

  private async requireItemPlaceName(itemId: string): Promise<string | null> {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: { Place: { select: { nameCN: true, nameEN: true } } },
    });
    if (!item) {
      throw new NotFoundException(`找不到指定的行程项 (ID: ${itemId})`);
    }
    return item.Place?.nameCN ?? item.Place?.nameEN ?? null;
  }

  private putDoc(record: BookingImportDocumentRecord): void {
    let byItem = this.docs.get(record.itemId);
    if (!byItem) {
      byItem = new Map();
      this.docs.set(record.itemId, byItem);
    }
    byItem.set(record.docId, record);
  }
}
