import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminQualityMarkService {
  private readonly logger = new Logger(AdminQualityMarkService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async list(input: {
    skip: number;
    take: number;
    targetType?: string;
    targetId?: string;
    label?: string;
    autoSampled?: boolean;
  }) {
    if (!this.prisma?.isDbConnected()) {
      return { ok: false, message: 'Database not connected', total: 0, rows: [] as any[] };
    }
    const where: any = {};
    if (input.targetType) where.targetType = input.targetType;
    if (input.targetId) where.targetId = input.targetId;
    if (input.label) where.label = input.label;
    if (input.autoSampled !== undefined) {
      where.meta = { path: ['auto_sampled'], equals: input.autoSampled } as any;
    }
    try {
      const [total, rows] = await Promise.all([
        this.prisma.adminQualityMark.count({ where }),
        this.prisma.adminQualityMark.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: input.skip,
          take: input.take,
        }),
      ]);
      return {
        ok: true,
        total,
        rows: rows.map((r) => ({
          id: r.id,
          created_at: r.createdAt.toISOString(),
          actor: r.actor,
          target_type: r.targetType,
          target_id: r.targetId,
          label: r.label,
          comment: r.comment,
          meta: r.meta ?? null,
        })),
      };
    } catch (e: any) {
      this.logger.warn(`quality mark list failed: ${e?.message ?? e}`);
      return { ok: false, message: e?.message ?? String(e), total: 0, rows: [] as any[] };
    }
  }

  async getById(id: string) {
    if (!this.prisma?.isDbConnected()) {
      return { ok: false, message: 'Database not connected' };
    }
    try {
      const r = await this.prisma.adminQualityMark.findUnique({ where: { id } });
      if (!r) return { ok: false, message: 'Not found' };
      return {
        ok: true,
        row: {
          id: r.id,
          created_at: r.createdAt.toISOString(),
          actor: r.actor,
          target_type: r.targetType,
          target_id: r.targetId,
          label: r.label,
          comment: r.comment,
          meta: r.meta ?? null,
        },
      };
    } catch (e: any) {
      this.logger.warn(`quality mark get failed: ${e?.message ?? e}`);
      return { ok: false, message: e?.message ?? String(e) };
    }
  }

  async update(id: string, patch: { label?: string; comment?: string | null; meta?: Record<string, unknown> | null }) {
    if (!this.prisma?.isDbConnected()) {
      return { ok: false, message: 'Database not connected' };
    }
    try {
      const updated = await this.prisma.adminQualityMark.update({
        where: { id },
        data: {
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
          ...(patch.meta !== undefined ? { meta: patch.meta as any } : {}),
        },
      });
      return { ok: true, id: updated.id };
    } catch (e: any) {
      this.logger.warn(`quality mark update failed: ${e?.message ?? e}`);
      return { ok: false, message: e?.message ?? String(e) };
    }
  }

  async create(input: {
    actor?: string | null;
    targetType: string;
    targetId: string;
    label: string;
    comment?: string | null;
    meta?: Record<string, unknown> | null;
  }) {
    if (!this.prisma?.isDbConnected()) {
      return { ok: false, message: 'Database not connected' };
    }
    try {
      const row = await this.prisma.adminQualityMark.create({
        data: {
          actor: input.actor ?? null,
          targetType: input.targetType,
          targetId: input.targetId,
          label: input.label,
          comment: input.comment ?? null,
          meta: input.meta === undefined ? undefined : (input.meta as object),
        },
      });
      return { ok: true, id: row.id };
    } catch (e: any) {
      this.logger.warn(`quality mark create failed: ${e?.message ?? e}`);
      return { ok: false, message: e?.message ?? String(e) };
    }
  }
}

