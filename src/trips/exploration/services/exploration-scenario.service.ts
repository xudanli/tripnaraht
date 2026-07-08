import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EXPLORATION_SCENARIO_STATUS,
  type ExploreEntryVariant,
} from '../constants/exploration-status.constants';
import { CONSUMER_ENTRY_VARIANTS } from '../config/exploration-conditions.config';
import type { CreateExplorationScenarioDto } from '../dto/exploration.dto';
import type { PatchExplorationConditionsDto } from '../dto/exploration-conditions.dto';
import type {
  ExplorationInput,
  ExplorationScenarioDetailView,
  ExplorationScenarioView,
} from '../types/exploration.types';
import { resolveResearchProtocol } from '../config/exploration-protocol.registry';
import { ExplorationConditionsService } from './exploration-conditions.service';
import { ExplorationCandidatesLifecycleService } from './exploration-candidates-lifecycle.service';
import { ExplorationTripConditionsSyncService } from './exploration-trip-conditions-sync.service';

@Injectable()
export class ExplorationScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conditions: ExplorationConditionsService,
    private readonly candidatesLifecycle: ExplorationCandidatesLifecycleService,
    private readonly tripConditionsSync: ExplorationTripConditionsSyncService,
  ) {}

  async create(userId: string, dto: CreateExplorationScenarioDto) {
    const protocolId = this.conditions.resolveProtocolId(dto);
    const initialInput = this.conditions.buildInitialInput(dto, protocolId);
    const lockedFields = this.conditions.resolveLockedFields(protocolId);
    const assignedVariant = this.pickEntryVariant(protocolId);

    const scenarioId = randomUUID();
    const scenario = await this.prisma.explorationScenario.create({
      data: {
        id: scenarioId,
        contextId: scenarioId,
        userId,
        status: EXPLORATION_SCENARIO_STATUS.DRAFT,
        researchProtocolId: protocolId,
        participantCode: dto.participantCode ?? null,
        initialInput: initialInput as unknown as Prisma.InputJsonValue,
        assignedVariant,
      },
    });

    const session = await this.prisma.productDiscoverySession.create({
      data: {
        scenarioId: scenario.id,
        userId,
        participantCode: dto.participantCode ?? null,
        protocolId: protocolId ?? 'consumer',
        entryVariant: assignedVariant,
        metadata: {
          exploration_session_started: new Date().toISOString(),
          mode: protocolId ? 'RESEARCH' : 'CONSUMER',
        },
      },
    });

    const view = this.serialize(scenario);
    return {
      scenario: view,
      sessionId: session.id,
      lockedFields,
      conditions: this.conditions.toConditionsView(initialInput),
    };
  }

  async getById(userId: string, scenarioId: string): Promise<ExplorationScenarioView> {
    const scenario = await this.requireOwnedScenario(userId, scenarioId);
    return this.serialize(scenario);
  }

  async getDetail(userId: string, scenarioId: string): Promise<ExplorationScenarioDetailView> {
    const scenario = await this.requireOwnedScenario(userId, scenarioId);
    const session = await this.prisma.productDiscoverySession.findUnique({
      where: { scenarioId },
      select: { id: true },
    });
    const initialInput = this.parseInitialInput(scenario.initialInput);
    const lockedFields = this.conditions.resolveLockedFields(scenario.researchProtocolId);

    return {
      ...this.serialize(scenario),
      sessionId: session?.id ?? null,
      lockedFields,
      scenario: this.conditions.toConditionsView(initialInput) as ExplorationScenarioDetailView['scenario'],
      materializationStatus: scenario.status as ExplorationScenarioDetailView['materializationStatus'],
    };
  }

  async patchConditions(
    userId: string,
    scenarioId: string,
    patch: PatchExplorationConditionsDto,
  ) {
    const scenario = await this.requireOwnedScenario(userId, scenarioId);
    this.assertConditionsPatchAllowed(scenario.status);

    if (scenario.status === EXPLORATION_SCENARIO_STATUS.MATERIALIZED) {
      if (await this.candidatesLifecycle.hasSelectedRoute(scenarioId)) {
        throw new ConflictException({
          code: 'ROUTE_ALREADY_SELECTED',
          message: 'Cannot update conditions after a route has been selected',
        });
      }
    }

    const lockedFields = this.conditions.resolveLockedFields(scenario.researchProtocolId);
    const current = this.parseInitialInput(scenario.initialInput);
    const next = this.conditions.applyPatch(current, patch, lockedFields);

    const updated = await this.prisma.explorationScenario.update({
      where: { id: scenarioId },
      data: {
        initialInput: next as unknown as Prisma.InputJsonValue,
      },
    });

    if (
      scenario.status === EXPLORATION_SCENARIO_STATUS.MATERIALIZED &&
      scenario.tripId
    ) {
      await this.tripConditionsSync.syncTripFromInput(scenario.tripId, next);
    }

    const candidatesInvalidated = await this.candidatesLifecycle.invalidateDrafts(scenarioId);

    return {
      scenarioId,
      lockedFields,
      scenario: this.conditions.toConditionsView(next),
      materializationStatus: updated.status,
      tripSynced: Boolean(
        scenario.status === EXPLORATION_SCENARIO_STATUS.MATERIALIZED && scenario.tripId,
      ),
      candidatesInvalidated,
      candidatesStatus: await this.candidatesLifecycle.getStatus(scenarioId),
    };
  }

  private assertConditionsPatchAllowed(status: string) {
    const allowed = new Set<string>([
      EXPLORATION_SCENARIO_STATUS.DRAFT,
      EXPLORATION_SCENARIO_STATUS.MATERIALIZED,
    ]);
    if (!allowed.has(status)) {
      throw new ConflictException({
        code: 'SCENARIO_CONDITIONS_LOCKED',
        message: 'Conditions cannot be updated in the current scenario status',
        status,
      });
    }
  }

  async requireOwnedScenario(userId: string, scenarioId: string) {
    const scenario = await this.prisma.explorationScenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) {
      throw new NotFoundException(`Exploration scenario ${scenarioId} not found`);
    }
    if (scenario.userId !== userId) {
      throw new ForbiddenException('Not allowed to access this exploration scenario');
    }
    return scenario;
  }

  async markMaterializing(scenarioId: string) {
    return this.prisma.explorationScenario.update({
      where: { id: scenarioId },
      data: { status: EXPLORATION_SCENARIO_STATUS.MATERIALIZING },
    });
  }

  async markMaterialized(scenarioId: string, tripId: string) {
    return this.prisma.explorationScenario.update({
      where: { id: scenarioId },
      data: {
        status: EXPLORATION_SCENARIO_STATUS.MATERIALIZED,
        tripId,
        materializedAt: new Date(),
      },
    });
  }

  async assertMaterialized(userId: string, scenarioId: string) {
    const scenario = await this.requireOwnedScenario(userId, scenarioId);
    if (
      scenario.status !== EXPLORATION_SCENARIO_STATUS.MATERIALIZED ||
      !scenario.tripId
    ) {
      throw new ConflictException({
        code: 'SCENARIO_NOT_MATERIALIZED',
        message: 'Scenario must be materialized before this operation',
        scenarioId,
        status: scenario.status,
      });
    }
    return scenario;
  }

  parseInitialInput(raw: unknown): ExplorationInput {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('Invalid exploration initialInput');
    }
    return raw as ExplorationInput;
  }

  private serialize(scenario: {
    id: string;
    contextId: string;
    tripId: string | null;
    status: string;
    researchProtocolId: string | null;
    participantCode: string | null;
    initialInput: unknown;
    assignedVariant: string | null;
    materializedAt: Date | null;
    createdAt: Date;
  }): ExplorationScenarioView {
    return {
      scenarioId: scenario.id,
      contextId: scenario.contextId,
      tripId: scenario.tripId,
      status: scenario.status as ExplorationScenarioView['status'],
      researchProtocolId: scenario.researchProtocolId,
      participantCode: scenario.participantCode,
      initialInput: this.parseInitialInput(scenario.initialInput),
      assignedVariant: (scenario.assignedVariant as ExploreEntryVariant | null) ?? null,
      materializedAt: scenario.materializedAt?.toISOString() ?? null,
      createdAt: scenario.createdAt.toISOString(),
    };
  }

  private pickEntryVariant(protocolId: string | null): ExploreEntryVariant | null {
    if (protocolId) {
      const protocol = resolveResearchProtocol(protocolId);
      if (protocol?.entryVariants?.length) {
        const idx = Math.floor(Math.random() * protocol.entryVariants.length);
        return protocol.entryVariants[idx] ?? null;
      }
    }
    const idx = Math.floor(Math.random() * CONSUMER_ENTRY_VARIANTS.length);
    return CONSUMER_ENTRY_VARIANTS[idx] ?? null;
  }
}
