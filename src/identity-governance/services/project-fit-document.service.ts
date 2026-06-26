import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  FitDocumentType,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../constants/project-fit-document.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { IdentityDocumentStorageService } from '../storage/identity-document-storage.service';
import { IdentityDocumentOcrService } from './identity-document-ocr.service';
import { mergeQualificationsFromDocuments, parseDocumentFields } from '../utils/document-ocr-parser.util';

export type UploadDocumentInput = {
  documentType: FitDocumentType;
  linkedQuestionKey?: string;
  locale?: string;
};

@Injectable()
export class ProjectFitDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly storage: IdentityDocumentStorageService,
    private readonly ocr: IdentityDocumentOcrService,
  ) {}

  async upload(
    userId: string,
    assessmentId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    input: UploadDocumentInput,
  ) {
    await this.assertAssessmentOwner(userId, assessmentId);

    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) {
      throw new BadRequestException('不支持的文件类型，请上传 JPG/PNG/WebP/PDF');
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('文件大小不能超过 10MB');
    }

    const stored = await this.storage.save(file.buffer, file.originalname, file.mimetype);

    const document = await this.prisma.projectFitDocument.create({
      data: {
        assessmentId,
        userId,
        documentType: input.documentType,
        fileName: file.originalname,
        mimeType: file.mimetype,
        storageKey: stored.storageKey,
        fileUrl: stored.fileUrl,
        fileSize: stored.fileSize,
        linkedQuestionKey: input.linkedQuestionKey ?? null,
        ocrStatus: file.mimetype === 'application/pdf' ? 'SKIPPED' : 'PENDING',
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'FIT_DOCUMENT_UPLOADED',
      targetType: 'PROJECT_FIT_DOCUMENT',
      targetId: document.id,
      after: { documentType: input.documentType, assessmentId },
    });

    if (document.ocrStatus === 'PENDING') {
      return this.processOcr(userId, document.id, file.buffer, input.locale);
    }

    return this.toPublicView(document);
  }

  async uploadFromBase64(
    userId: string,
    assessmentId: string,
    input: UploadDocumentInput & {
      fileName: string;
      mimeType: string;
      contentBase64: string;
    },
  ) {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    return this.upload(
      userId,
      assessmentId,
      {
        buffer,
        originalname: input.fileName,
        mimetype: input.mimeType,
        size: buffer.length,
      },
      input,
    );
  }

  async listForAssessment(userId: string, assessmentId: string) {
    await this.assertAssessmentOwner(userId, assessmentId);
    const rows = await this.prisma.projectFitDocument.findMany({
      where: { assessmentId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toPublicView(row));
  }

  async runOcr(userId: string, documentId: string, locale?: string) {
    const document = await this.requireOwnedDocument(userId, documentId);

    if (document.mimeType === 'application/pdf') {
      throw new BadRequestException('PDF 暂不支持自动 OCR，请上传图片或等待人工审核');
    }

    const fileBuffer = await this.loadFileBuffer(document.storageKey);
    return this.processOcr(userId, documentId, fileBuffer, locale);
  }

  private async processOcr(
    userId: string,
    documentId: string,
    fileBuffer: Buffer,
    locale?: string,
  ) {
    const document = await this.prisma.projectFitDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('证件不存在');

    await this.prisma.projectFitDocument.update({
      where: { id: documentId },
      data: { ocrStatus: 'PROCESSING' },
    });

    try {
      const ocrResult = await this.ocr.extractText(fileBuffer, {
        locale: locale ?? 'zh-CN',
        mimeType: document.mimeType,
      });
      const extractedFields = parseDocumentFields(
        document.documentType as FitDocumentType,
        ocrResult.lines,
      );

      const updated = await this.prisma.projectFitDocument.update({
        where: { id: documentId },
        data: {
          ocrStatus: 'COMPLETED',
          ocrResult: ocrResult as unknown as Prisma.InputJsonValue,
          extractedFields: extractedFields as unknown as Prisma.InputJsonValue,
        },
      });

      await this.syncExtractedFieldsToAnswers(document.assessmentId, userId);

      await this.auditLog.record({
        actorId: userId,
        action: 'FIT_DOCUMENT_OCR_COMPLETED',
        targetType: 'PROJECT_FIT_DOCUMENT',
        targetId: documentId,
        after: { provider: ocrResult.provider, documentType: document.documentType },
      });

      return this.toPublicView(updated);
    } catch (error) {
      await this.prisma.projectFitDocument.update({
        where: { id: documentId },
        data: { ocrStatus: 'FAILED' },
      });
      throw error;
    }
  }

  private async syncExtractedFieldsToAnswers(assessmentId: string, userId: string) {
    const docs = await this.prisma.projectFitDocument.findMany({
      where: { assessmentId, ocrStatus: 'COMPLETED' },
    });
    const extracted = docs.map((d) => (d.extractedFields ?? {}) as never);

    const qualificationTypes = mergeQualificationsFromDocuments(undefined, extracted);
    if (qualificationTypes.length > 0) {
      await this.prisma.fitAnswer.upsert({
        where: {
          assessmentId_questionKey: {
            assessmentId,
            questionKey: 'qualifications_held',
          },
        },
        create: {
          assessmentId,
          questionKey: 'qualifications_held',
          answer: qualificationTypes as unknown as Prisma.InputJsonValue,
          sensitivityLevel: 'MEDIUM',
        },
        update: {
          answer: qualificationTypes as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const idDoc = docs.find((d) => d.documentType === 'ID_CARD' || d.documentType === 'PASSPORT');
    if (idDoc?.extractedFields) {
      const fields = idDoc.extractedFields as { documentNumber?: string; expiryDate?: string };
      if (fields.documentNumber) {
        await this.prisma.fitAnswer.upsert({
          where: {
            assessmentId_questionKey: { assessmentId, questionKey: 'identity_document_ref' },
          },
          create: {
            assessmentId,
            questionKey: 'identity_document_ref',
            answer: {
              documentType: idDoc.documentType,
              documentNumberMasked: maskDocumentNumber(fields.documentNumber),
              expiryDate: fields.expiryDate ?? null,
            } as Prisma.InputJsonValue,
            sensitivityLevel: 'HIGH',
          },
          update: {
            answer: {
              documentType: idDoc.documentType,
              documentNumberMasked: maskDocumentNumber(fields.documentNumber),
              expiryDate: fields.expiryDate ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }

    await this.auditLog.record({
      actorId: userId,
      action: 'FIT_DOCUMENT_FIELDS_SYNCED',
      targetType: 'PROJECT_FIT_ASSESSMENT',
      targetId: assessmentId,
    });
  }

  private async loadFileBuffer(storageKey: string): Promise<Buffer> {
    if (storageKey.startsWith('/') || storageKey.includes(process.cwd())) {
      const { readFile } = await import('fs/promises');
      return readFile(storageKey);
    }
    throw new BadRequestException('OSS 文件 OCR 需配置本地可读路径或后续扩展 OSS 下载');
  }

  private toPublicView(row: {
    id: string;
    assessmentId: string;
    documentType: string;
    fileName: string;
    mimeType: string;
    fileUrl: string | null;
    fileSize: number;
    ocrStatus: string;
    extractedFields: unknown;
    linkedQuestionKey: string | null;
    createdAt: Date;
  }) {
    const extracted = row.extractedFields as { documentNumber?: string } | null;
    return {
      id: row.id,
      assessmentId: row.assessmentId,
      documentType: row.documentType,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileUrl: row.fileUrl,
      fileSize: row.fileSize,
      ocrStatus: row.ocrStatus,
      extractedFields: extracted
        ? {
            ...extracted,
            documentNumber: extracted.documentNumber
              ? maskDocumentNumber(extracted.documentNumber)
              : undefined,
          }
        : null,
      linkedQuestionKey: row.linkedQuestionKey,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async assertAssessmentOwner(userId: string, assessmentId: string) {
    const assessment = await this.prisma.projectFitAssessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('评估不存在');
    if (assessment.userId !== userId) throw new ForbiddenException('无权上传该评估的证件');
    if (!['NOT_STARTED', 'IN_PROGRESS'].includes(assessment.status)) {
      throw new BadRequestException('当前评估状态不可上传新证件，请重新发起评估');
    }
  }

  private async requireOwnedDocument(userId: string, documentId: string) {
    const document = await this.prisma.projectFitDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('证件不存在');
    if (document.userId !== userId) throw new ForbiddenException('无权操作该证件');
    return document;
  }
}

function maskDocumentNumber(value: string): string {
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}
