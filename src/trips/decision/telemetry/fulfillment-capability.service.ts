/**
 * Fulfillment Capability Service — B 端履约能力画像（冰岛 MVP）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { FulfillmentCapabilityRecordInput } from './fulfillment-capability.types';

@Injectable()
export class FulfillmentCapabilityService {
  private readonly logger = new Logger(FulfillmentCapabilityService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async record(input: FulfillmentCapabilityRecordInput): Promise<{ id: string } | null> {
    if (!this.prisma) {
      this.logger.warn('[Fulfillment] Prisma unavailable, skip record');
      return null;
    }

    const row = await this.prisma.fulfillmentCapabilityRecord.create({
      data: {
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        countryCode: input.countryCode.toUpperCase(),
        capabilityType: input.capabilityType,
        capabilityKey: input.capabilityKey,
        metrics: input.metrics as object,
        evidenceTripIds: input.evidenceTripIds ?? [],
        metadata: (input.metadata ?? {}) as object,
      },
    });

    this.logger.log(
      `[Fulfillment] recorded ${input.capabilityType}/${input.capabilityKey} supplier=${input.supplierId}`,
    );
    return { id: row.id };
  }

  async listByCountry(
    countryCode: string,
    options?: { capabilityType?: string; supplierId?: string; limit?: number },
  ) {
    if (!this.prisma) return [];
    return this.prisma.fulfillmentCapabilityRecord.findMany({
      where: {
        countryCode: countryCode.toUpperCase(),
        ...(options?.capabilityType ? { capabilityType: options.capabilityType } : {}),
        ...(options?.supplierId ? { supplierId: options.supplierId } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }
}
