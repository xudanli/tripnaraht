import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MobileCredentialDocumentStorageService } from './mobile-credential-document-storage.service';
import {
  CREDENTIAL_DOCUMENT_TYPES,
  type CredentialDocumentDetailDto,
  type CredentialDocumentListItemDto,
  type CredentialDocumentStatus,
  type CredentialDocumentType,
  type CredentialDocumentsListResponseDto,
} from '../dto/mobile-credential-documents.dto';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface UploadCredentialDocumentInput {
  type?: string;
  expiresOn?: string;
  notes?: string;
  file?: Express.Multer.File;
}

@Injectable()
export class MobileCredentialDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MobileCredentialDocumentStorageService,
  ) {}

  async listDocuments(userId: string): Promise<CredentialDocumentsListResponseDto> {
    if (!isUuid(userId)) {
      return { items: [] };
    }
    const rows = await this.prisma.userCredentialDocument.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return { items: rows.map(toListItem) };
  }

  async uploadDocument(
    userId: string,
    input: UploadCredentialDocumentInput,
  ): Promise<CredentialDocumentDetailDto> {
    const type = assertDocumentType(input.type);
    const file = input.file;
    if (!file?.buffer?.length) {
      throw new BadRequestException('file 必填');
    }
    if (file.size > MAX_BYTES) {
      throw new PayloadTooLargeException('证件文件不得超过 10MB');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        '仅支持 image/jpeg、image/png、image/webp、application/pdf',
      );
    }
    if (input.expiresOn != null && input.expiresOn !== '') {
      if (!DATE_RE.test(input.expiresOn)) {
        throw new BadRequestException('expiresOn 须为 YYYY-MM-DD');
      }
    }

    const stored = await this.storage.save(
      userId,
      file.buffer,
      file.originalname || 'document',
      file.mimetype,
    );

    const row = await this.prisma.userCredentialDocument.create({
      data: {
        userId,
        type,
        status: 'pending',
        expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00Z`) : null,
        notes: input.notes?.trim() || null,
        storageKey: stored.storageKey,
        fileUrl: stored.fileUrl,
        mimeType: file.mimetype,
        fileSize: stored.fileSizeBytes,
        fileName: file.originalname || 'document',
      },
    });

    return this.toDetail(row);
  }

  async getDocument(
    userId: string,
    documentId: string,
  ): Promise<CredentialDocumentDetailDto> {
    const row = await this.findOwned(userId, documentId);
    return this.toDetail(row);
  }

  async deleteDocument(
    userId: string,
    documentId: string,
  ): Promise<{ deleted: true; id: string }> {
    const row = await this.findOwned(userId, documentId);
    await this.prisma.userCredentialDocument.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), status: 'missing' },
    });
    // Soft-delete keeps storageKey for audit; hard-delete file is optional.
    try {
      await this.storage.delete(row.storageKey);
    } catch {
      // ignore storage cleanup failures
    }
    return { deleted: true, id: row.id };
  }

  /** Latest non-deleted status per type for organizer view. */
  async getStatusByTypes(
    userId: string,
    types: readonly string[],
  ): Promise<Map<string, CredentialDocumentStatus>> {
    const rows = await this.prisma.userCredentialDocument.findMany({
      where: {
        userId,
        deletedAt: null,
        type: { in: [...types] },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const map = new Map<string, CredentialDocumentStatus>();
    for (const row of rows) {
      if (!map.has(row.type)) {
        map.set(row.type, row.status as CredentialDocumentStatus);
      }
    }
    return map;
  }

  private async findOwned(userId: string, documentId: string) {
    const row = await this.prisma.userCredentialDocument.findFirst({
      where: { id: documentId, userId, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException('证件不存在');
    }
    return row;
  }

  private async toDetail(row: {
    id: string;
    type: string;
    status: string;
    expiresOn: Date | null;
    notes: string | null;
    mimeType: string;
    fileName: string;
    numberLast4: string | null;
    storageKey: string;
    fileUrl: string | null;
    updatedAt: Date;
  }): Promise<CredentialDocumentDetailDto> {
    const signed = await this.storage.signDownloadUrl(row.storageKey, row.fileUrl);
    return {
      ...toListItem(row),
      notes: row.notes,
      mimeType: row.mimeType,
      fileName: row.fileName,
      signedUrl: signed.url,
      signedUrlExpiresAt: signed.expiresAt,
    };
  }
}

function toListItem(row: {
  id: string;
  type: string;
  status: string;
  expiresOn: Date | null;
  numberLast4: string | null;
  updatedAt: Date;
  storageKey?: string;
}): CredentialDocumentListItemDto {
  return {
    id: row.id,
    type: row.type as CredentialDocumentType,
    status: row.status as CredentialDocumentStatus,
    expiresOn: row.expiresOn
      ? row.expiresOn.toISOString().slice(0, 10)
      : null,
    updatedAt: row.updatedAt.toISOString(),
    hasFile: true,
    numberLast4: row.numberLast4,
  };
}

function assertDocumentType(type: string | undefined): CredentialDocumentType {
  if (!type || !(CREDENTIAL_DOCUMENT_TYPES as readonly string[]).includes(type)) {
    throw new BadRequestException('证件 type 未知');
  }
  return type as CredentialDocumentType;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
