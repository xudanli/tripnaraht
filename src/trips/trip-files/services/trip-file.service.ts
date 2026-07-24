import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TripFile } from '@prisma/client';
import {
  ALLOWED_TRIP_FILE_MIME_TYPES,
  DEFAULT_STORAGE_QUOTA_BYTES,
  EXPIRING_SOON_DAYS,
  MAX_TRIP_FILE_SIZE_BYTES,
  TRIP_FILE_CATEGORIES,
} from '../trip-file.constants';
import {
  CreateTripFilePendingDto,
  TripFileDownloadResponse,
  TripFileItemDto,
  TripFileListQuery,
  TripFileListResponse,
  TripFileStatsResponse,
  isValidTripFileCategory,
} from '../dto/trip-file.dto';
import type {
  TripFileOverviewQuery,
  TripFileOverviewResponse,
} from '../dto/trip-file-overview.dto';
import {
  assembleOverviewResponse,
  type ItineraryFileSourceRow,
} from '../utils/trip-file-itinerary-sources.util';
import { TripFileAccessService } from './trip-file-access.service';
import { TripFileStorageService } from './trip-file-storage.service';

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class TripFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripFileAccessService,
    private readonly storage: TripFileStorageService,
  ) {}

  async listFiles(
    tripId: string,
    userId: string,
    query: TripFileListQuery,
  ): Promise<TripFileListResponse> {
    await this.access.assertTripMember(tripId, userId);
    await this.markExpiredFiles(tripId);

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const where = {
      tripId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tripFile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.tripFile.count({ where }),
    ]);

    return {
      items: items.map((f) => this.toItemDto(f)),
      total,
      limit,
      offset,
    };
  }

  async getOverview(
    tripId: string,
    userId: string,
    query: TripFileOverviewQuery,
  ): Promise<TripFileOverviewResponse> {
    await this.access.assertTripMember(tripId, userId);
    await this.markExpiredFiles(tripId);

    const [tripFiles, itineraryRows] = await Promise.all([
      this.prisma.tripFile.findMany({
        where: { tripId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.loadItineraryFileSources(tripId),
    ]);

    const { storageQuotaBytes } = await this.getStatsInternal(tripId);

    return assembleOverviewResponse({
      tripId,
      tripFiles: tripFiles.map((f) => this.toItemDto(f)),
      itineraryRows,
      query,
      storageQuotaBytes,
    });
  }

  async getStats(tripId: string, userId: string): Promise<TripFileStatsResponse> {
    await this.access.assertTripMember(tripId, userId);
    await this.markExpiredFiles(tripId);

    const files = await this.prisma.tripFile.findMany({ where: { tripId } });
    const now = Date.now();
    const expiringThreshold = now + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;

    const uploadedCount = files.filter((f) => f.status === 'UPLOADED').length;
    const pendingCount = files.filter((f) => f.status === 'PENDING').length;
    const expiringSoonCount = files.filter(
      (f) =>
        f.status === 'UPLOADED' &&
        f.expiresAt &&
        f.expiresAt.getTime() <= expiringThreshold &&
        f.expiresAt.getTime() >= now,
    ).length;

    const storageUsedBytes = files
      .filter((f) => f.status === 'UPLOADED')
      .reduce((sum, f) => sum + f.fileSizeBytes, 0);

    const quotaEnv = process.env.TRIP_FILES_STORAGE_QUOTA_BYTES;
    const storageQuotaBytes = quotaEnv
      ? parseInt(quotaEnv, 10)
      : DEFAULT_STORAGE_QUOTA_BYTES;

    const countByCategory = new Map<string, number>();
    for (const file of files) {
      countByCategory.set(file.category, (countByCategory.get(file.category) ?? 0) + 1);
    }

    const categories = TRIP_FILE_CATEGORIES.map((cat) => ({
      id: cat.id,
      title: cat.title,
      description: cat.description,
      count: countByCategory.get(cat.id) ?? 0,
    }));

    return {
      totalCount: files.length,
      uploadedCount,
      pendingCount,
      expiringSoonCount,
      storageUsedBytes,
      storageQuotaBytes,
      categories,
    };
  }

  async uploadFile(
    tripId: string,
    userId: string,
    file: MulterFile,
    input: {
      category: string;
      title?: string;
      description?: string;
      expiresAt?: string;
      itineraryItemId?: string;
    },
  ): Promise<TripFileItemDto> {
    await this.access.assertTripMember(tripId, userId);
    this.assertCategory(input.category);
    this.assertUploadFile(file);
    await this.assertStorageQuota(tripId, file.size);

    const stored = await this.storage.save(file.buffer, file.originalname, file.mimetype);
    const record = await this.prisma.tripFile.create({
      data: {
        tripId,
        uploadedByUserId: userId,
        category: input.category,
        status: 'UPLOADED',
        fileName: file.originalname,
        mimeType: file.mimetype,
        storageKey: stored.storageKey,
        fileUrl: stored.fileUrl,
        fileSizeBytes: stored.fileSizeBytes,
        title: input.title ?? file.originalname,
        description: input.description ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        itineraryItemId: input.itineraryItemId ?? null,
      },
    });

    return this.toItemDto(record);
  }

  async createPendingPlaceholder(
    tripId: string,
    userId: string,
    input: CreateTripFilePendingDto,
  ): Promise<TripFileItemDto> {
    await this.access.assertTripMember(tripId, userId);
    this.assertCategory(input.category);

    const record = await this.prisma.tripFile.create({
      data: {
        tripId,
        uploadedByUserId: userId,
        category: input.category,
        status: 'PENDING',
        title: input.title ?? null,
        description: input.description ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        itineraryItemId: input.itineraryItemId ?? null,
      },
    });

    return this.toItemDto(record);
  }

  async deleteFile(tripId: string, userId: string, fileId: string): Promise<{ deleted: true }> {
    await this.access.assertTripMember(tripId, userId);
    const record = await this.requireFile(tripId, fileId);

    if (record.storageKey) {
      await this.storage.delete(record.storageKey).catch(() => undefined);
    }

    await this.prisma.tripFile.delete({ where: { id: fileId } });
    return { deleted: true };
  }

  async getDownloadUrl(
    tripId: string,
    userId: string,
    fileId: string,
  ): Promise<TripFileDownloadResponse> {
    await this.access.assertTripMember(tripId, userId);
    const record = await this.requireFile(tripId, fileId);

    if (record.status !== 'UPLOADED' || !record.storageKey) {
      throw new BadRequestException('文件尚未上传，无法下载');
    }

    const downloadUrl = await this.storage.signDownloadUrl(record.storageKey, record.fileUrl);
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return {
      fileId: record.id,
      fileName: record.fileName ?? record.title ?? 'file',
      mimeType: record.mimeType,
      downloadUrl,
      expiresAt,
    };
  }

  private async requireFile(tripId: string, fileId: string): Promise<TripFile> {
    const record = await this.prisma.tripFile.findFirst({
      where: { id: fileId, tripId },
    });
    if (!record) {
      throw new NotFoundException(`文件 ${fileId} 不存在`);
    }
    return record;
  }

  private async assertStorageQuota(tripId: string, incomingBytes: number): Promise<void> {
    const stats = await this.getStatsInternal(tripId);
    if (stats.storageUsedBytes + incomingBytes > stats.storageQuotaBytes) {
      throw new BadRequestException('行程文件空间配额不足');
    }
  }

  private async getStatsInternal(tripId: string) {
    const files = await this.prisma.tripFile.findMany({
      where: { tripId, status: 'UPLOADED' },
    });
    const storageUsedBytes = files.reduce((sum, f) => sum + f.fileSizeBytes, 0);
    const quotaEnv = process.env.TRIP_FILES_STORAGE_QUOTA_BYTES;
    const storageQuotaBytes = quotaEnv
      ? parseInt(quotaEnv, 10)
      : DEFAULT_STORAGE_QUOTA_BYTES;
    return { storageUsedBytes, storageQuotaBytes };
  }

  private async loadItineraryFileSources(tripId: string): Promise<ItineraryFileSourceRow[]> {
    const rows = await this.prisma.itineraryItem.findMany({
      where: { TripDay: { tripId } },
      select: {
        id: true,
        type: true,
        bookingStatus: true,
        bookingConfirmation: true,
        bookingUrl: true,
        costCategory: true,
        note: true,
        startTime: true,
        tripDayId: true,
        TripDay: { select: { date: true } },
        Place: { select: { nameCN: true, nameEN: true, category: true } },
      },
      orderBy: [{ TripDay: { date: 'asc' } }, { startTime: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      type: String(row.type),
      bookingStatus: row.bookingStatus,
      bookingConfirmation: row.bookingConfirmation,
      bookingUrl: row.bookingUrl,
      costCategory: row.costCategory,
      note: row.note,
      startTime: row.startTime,
      tripDayId: row.tripDayId,
      tripDayDate: row.TripDay.date,
      placeName: row.Place?.nameCN ?? row.Place?.nameEN ?? null,
      placeCategory: row.Place?.category ? String(row.Place.category) : null,
    }));
  }

  private async markExpiredFiles(tripId: string): Promise<void> {
    await this.prisma.tripFile.updateMany({
      where: {
        tripId,
        status: 'UPLOADED',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }

  private assertCategory(category: string): void {
    if (!isValidTripFileCategory(category)) {
      throw new BadRequestException(
        `无效的文件分类: ${category}，可选: ${TRIP_FILE_CATEGORIES.map((c) => c.id).join(', ')}`,
      );
    }
  }

  private assertUploadFile(file: MulterFile): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('未收到文件内容');
    }
    if (file.size > MAX_TRIP_FILE_SIZE_BYTES) {
      throw new BadRequestException('文件大小不能超过 20MB');
    }
    if (
      !(ALLOWED_TRIP_FILE_MIME_TYPES as readonly string[]).includes(file.mimetype)
    ) {
      throw new BadRequestException('不支持的文件类型');
    }
  }

  private toItemDto(record: TripFile): TripFileItemDto {
    return {
      id: record.id,
      tripId: record.tripId,
      category: record.category,
      status: record.status,
      fileName: record.fileName,
      mimeType: record.mimeType,
      fileSizeBytes: record.fileSizeBytes,
      title: record.title,
      description: record.description,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      itineraryItemId: record.itineraryItemId,
      uploadedByUserId: record.uploadedByUserId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
