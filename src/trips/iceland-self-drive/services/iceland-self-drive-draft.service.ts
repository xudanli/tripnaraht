import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EXPLORATION_SCENARIO_STATUS } from '../../exploration/constants/exploration-status.constants';
import type { UpsertIcelandSelfDriveDraftDto } from '../dto/upsert-iceland-self-drive-draft.dto';
import { PRODUCT_LINE_ICELAND_SELF_DRIVE } from '../dto/iceland-self-drive-enums';
import type { IcelandSelfDriveDraftRecord } from '../types/iceland-self-drive.types';

const DRAFT_KIND = 'iceland_self_drive_draft';
const DRAFT_VARIANT = 'ISD_DRAFT';

interface DraftInitialInput {
  kind: typeof DRAFT_KIND;
  productLine: typeof PRODUCT_LINE_ICELAND_SELF_DRIVE;
  wizard: Record<string, unknown>;
  step: number | null;
}

@Injectable()
export class IcelandSelfDriveDraftService {
  private readonly logger = new Logger(IcelandSelfDriveDraftService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    userId: string,
    dto: UpsertIcelandSelfDriveDraftDto,
    draftId?: string,
  ): Promise<IcelandSelfDriveDraftRecord> {
    const wizard = this.dtoToWizard(dto);
    const step = dto.step ?? null;
    const payload: DraftInitialInput = {
      kind: DRAFT_KIND,
      productLine: PRODUCT_LINE_ICELAND_SELF_DRIVE,
      wizard,
      step,
    };

    if (draftId) {
      const existing = await this.requireOwnedDraft(userId, draftId);
      const updated = await this.prisma.explorationScenario.update({
        where: { id: existing.id },
        data: {
          initialInput: payload as unknown as Prisma.InputJsonValue,
          status: EXPLORATION_SCENARIO_STATUS.DRAFT,
        },
      });
      return this.serialize(updated);
    }

    const id = randomUUID();
    const created = await this.prisma.explorationScenario.create({
      data: {
        id,
        contextId: id,
        userId,
        status: EXPLORATION_SCENARIO_STATUS.DRAFT,
        researchProtocolId: null,
        initialInput: payload as unknown as Prisma.InputJsonValue,
        assignedVariant: DRAFT_VARIANT,
      },
    });
    this.logger.log(`Created iceland self-drive draft ${id} for user ${userId}`);
    return this.serialize(created);
  }

  async get(userId: string, draftId: string): Promise<IcelandSelfDriveDraftRecord> {
    const row = await this.requireOwnedDraft(userId, draftId);
    return this.serialize(row);
  }

  async list(userId: string): Promise<{ items: IcelandSelfDriveDraftRecord[] }> {
    const rows = await this.prisma.explorationScenario.findMany({
      where: {
        userId,
        status: EXPLORATION_SCENARIO_STATUS.DRAFT,
        tripId: null,
        assignedVariant: DRAFT_VARIANT,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return { items: rows.filter((r) => this.isDraftInput(r.initialInput)).map((r) => this.serialize(r)) };
  }

  async markConsumed(userId: string, draftId: string): Promise<void> {
    const row = await this.requireOwnedDraft(userId, draftId);
    await this.prisma.explorationScenario.update({
      where: { id: row.id },
      data: { status: EXPLORATION_SCENARIO_STATUS.COMPLETED },
    });
  }

  private async requireOwnedDraft(userId: string, draftId: string) {
    const row = await this.prisma.explorationScenario.findUnique({
      where: { id: draftId },
    });
    if (!row || !this.isDraftInput(row.initialInput)) {
      throw new NotFoundException({
        code: 'DRAFT_NOT_FOUND',
        message: `Draft ${draftId} not found`,
      });
    }
    if (row.userId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Not the owner of this draft',
      });
    }
    if (row.tripId) {
      throw new NotFoundException({
        code: 'DRAFT_ALREADY_MATERIALIZED',
        message: 'Draft has already been converted to a trip',
      });
    }
    return row;
  }

  private isDraftInput(raw: unknown): raw is DraftInitialInput {
    if (!raw || typeof raw !== 'object') return false;
    const o = raw as Record<string, unknown>;
    return o.kind === DRAFT_KIND && o.productLine === PRODUCT_LINE_ICELAND_SELF_DRIVE;
  }

  private serialize(row: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    initialInput: unknown;
  }): IcelandSelfDriveDraftRecord {
    const input = row.initialInput as DraftInitialInput;
    return {
      draftId: row.id,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      step: input.step ?? null,
      wizard: input.wizard ?? {},
    };
  }

  private dtoToWizard(dto: UpsertIcelandSelfDriveDraftDto): Record<string, unknown> {
    const wizard: Record<string, unknown> = {};
    if (dto.destinationCode !== undefined) wizard.destinationCode = dto.destinationCode;
    if (dto.productLine !== undefined) wizard.productLine = dto.productLine;
    if (dto.dateRange !== undefined) wizard.dateRange = dto.dateRange;
    if (dto.arrivalAt !== undefined) wizard.arrivalAt = dto.arrivalAt;
    if (dto.departureAt !== undefined) wizard.departureAt = dto.departureAt;
    if (dto.travelerCount !== undefined) wizard.travelerCount = dto.travelerCount;
    if (dto.startLocationCode !== undefined) {
      wizard.startLocationCode = dto.startLocationCode;
    }
    if (dto.endLocationCode !== undefined) wizard.endLocationCode = dto.endLocationCode;
    if (dto.endSameAsStart !== undefined) wizard.endSameAsStart = dto.endSameAsStart;
    if (dto.vehicleAcquisition !== undefined) {
      wizard.vehicleAcquisition = dto.vehicleAcquisition;
    }
    if (dto.regionIds !== undefined) wizard.regionIds = dto.regionIds;
    if (dto.bookings !== undefined) wizard.bookings = dto.bookings;
    if (dto.skipBookings !== undefined) wizard.skipBookings = dto.skipBookings;
    if (dto.fillBookingsLater !== undefined) {
      wizard.fillBookingsLater = dto.fillBookingsLater;
    }
    return wizard;
  }
}
