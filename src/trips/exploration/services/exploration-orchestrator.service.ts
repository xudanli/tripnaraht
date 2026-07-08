import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripConstraintRegistryService } from '../../trip-constraint-solver/services/trip-constraint-registry.service';
import { getConstraintsVersion } from '../../trip-constraint-solver/utils/constraints-metadata.util';
import {
  EXPLORATION_ROUTE_VARIANT_STATUS,
  EXPLORATION_SCENARIO_STATUS,
} from '../constants/exploration-status.constants';
import type {
  GenerateExplorationCandidatesDto,
  PutExplorationPrinciplesDto,
  RouteSelectionDto,
} from '../dto/exploration.dto';
import type {
  ExplorationApplyResultView,
  ExplorationMaterializeResult,
  ExplorationRouteVariantView,
} from '../types/exploration.types';
import { readTripVersion } from '../utils/exploration-input.util';
import { ConsumerExplorationIssuesService } from './consumer-exploration-issues.service';
import { ExplorationCandidatesLifecycleService } from './exploration-candidates-lifecycle.service';
import { ExplorationItinerarySeederService } from './exploration-itinerary-seeder.service';
import { ExplorationReliabilityService } from './exploration-reliability.service';
import { ExplorationRouteDetailService } from './exploration-route-detail.service';
import { ExplorationRouteGenerationService } from './exploration-route-generation.service';
import { ExplorationScenarioService } from './exploration-scenario.service';
import { ExplorationTripMaterializerService } from './exploration-trip-materializer.service';
import { ExplorationPoiResolutionService } from './exploration-poi-resolution.service';
import { buildCompareDimensionsView } from '../config/exploration-compare-dimensions.config';
import { TravelDecisionContractPrincipleMappingService } from './travel-decision-contract-principle-mapping.service';
import { validateConsumerPrincipleSelections } from '../utils/validate-consumer-principles.util';
import {
  buildExplorationArchive,
  mergeTravelContextExplorationArchive,
  readRankedPrinciplesFromTripMetadata,
} from '../utils/exploration-archive.util';
import { AttractionExploreSeedService } from '../../attraction-explore/services/attraction-explore-seed.service';

@Injectable()
export class ExplorationOrchestratorService {
  private readonly logger = new Logger(ExplorationOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: ExplorationScenarioService,
    private readonly materializer: ExplorationTripMaterializerService,
    private readonly principleMapping: TravelDecisionContractPrincipleMappingService,
    private readonly constraintRegistry: TripConstraintRegistryService,
    private readonly issuesService: ConsumerExplorationIssuesService,
    private readonly reliability: ExplorationReliabilityService,
    private readonly itinerarySeeder: ExplorationItinerarySeederService,
    private readonly routeDetails: ExplorationRouteDetailService,
    private readonly routeGeneration: ExplorationRouteGenerationService,
    private readonly candidatesLifecycle: ExplorationCandidatesLifecycleService,
    private readonly poiResolution: ExplorationPoiResolutionService,
    @Optional() private readonly attractionExploreSeed?: AttractionExploreSeedService,
  ) {}

  async materialize(userId: string, scenarioId: string): Promise<ExplorationMaterializeResult> {
    const scenario = await this.scenarios.requireOwnedScenario(userId, scenarioId);

    if (
      scenario.status === EXPLORATION_SCENARIO_STATUS.MATERIALIZED &&
      scenario.tripId
    ) {
      const trip = await this.prisma.trip.findUniqueOrThrow({
        where: { id: scenario.tripId },
        select: { metadata: true },
      });
      return {
        scenarioId,
        tripId: scenario.tripId,
        tripVersion: readTripVersion(trip.metadata),
        decisionContractVersion: getConstraintsVersion(trip.metadata),
        materialized: true,
        idempotentReplay: true,
      };
    }

    if (scenario.status === EXPLORATION_SCENARIO_STATUS.MATERIALIZING) {
      throw new ConflictException({
        code: 'SCENARIO_MATERIALIZING',
        message: 'Scenario materialization already in progress',
      });
    }

    await this.scenarios.markMaterializing(scenarioId);

    try {
      const initialInput = this.scenarios.parseInitialInput(scenario.initialInput);
      const result = await this.materializer.materializeShell({
        userId,
        scenarioId,
        initialInput,
        researchProtocolId: scenario.researchProtocolId,
      });

      return {
        scenarioId,
        tripId: result.tripId,
        tripVersion: result.tripVersion,
        decisionContractVersion: result.decisionContractVersion,
        materialized: true,
        idempotentReplay: false,
      };
    } catch (err) {
      await this.prisma.explorationScenario.update({
        where: { id: scenarioId },
        data: { status: EXPLORATION_SCENARIO_STATUS.DRAFT },
      });
      throw err;
    }
  }

  async savePrinciples(userId: string, scenarioId: string, dto: PutExplorationPrinciplesDto) {
    validateConsumerPrincipleSelections(dto.principles);
    await this.materialize(userId, scenarioId);
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    const tripId = scenario.tripId!;

    const initialInput = this.scenarios.parseInitialInput(scenario.initialInput);
    const mapping = this.principleMapping.mapConsumerPrinciples(dto.principles, {
      input: initialInput,
      destinationCode: initialInput.destinationCodes[0],
    });

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { metadata: true },
    });

    const { contract, constraints } = await this.constraintRegistry.patchContract(
      tripId,
      userId,
      {
        constraintsVersion: getConstraintsVersion(trip.metadata),
        objectives: { rankedPrinciples: mapping.rankedPrinciples },
      },
    );

    const cards = this.principleMapping.listConsumerPrincipleCards().map((card) => {
      const sel = dto.principles.find((p) => p.principleId === card.principleId);
      return sel ? { ...card, rank: sel.rank } : card;
    });

    await this.syncExplorationArchiveToTrip(scenarioId, tripId);

    return {
      consumerPrinciples: cards.filter((c) => 'rank' in c),
      contract,
      constraintsVersion: constraints.constraintsVersion,
      candidatesInvalidated: await this.candidatesLifecycle.invalidateDrafts(scenarioId),
      candidatesStatus: await this.candidatesLifecycle.getStatus(scenarioId),
    };
  }

  async getCandidatesStatus(scenarioId: string) {
    return this.candidatesLifecycle.getStatus(scenarioId);
  }

  async regenerateCandidates(
    userId: string,
    scenarioId: string,
  ): Promise<{
    generationVersion: number;
    generationMode: string;
    candidates: ExplorationRouteVariantView[];
    previousStatus: string;
  }> {
    await this.scenarios.assertMaterialized(userId, scenarioId);

    if (await this.candidatesLifecycle.hasSelectedRoute(scenarioId)) {
      throw new ConflictException({
        code: 'ROUTE_ALREADY_SELECTED',
        message: 'Cannot regenerate candidates after a route has been selected',
      });
    }

    const previousStatus = (await this.candidatesLifecycle.getStatus(scenarioId)).status;
    await this.candidatesLifecycle.invalidateDrafts(scenarioId);

    const result = await this.generateCandidates(userId, scenarioId, { force: true });
    return { ...result, previousStatus };
  }

  async generateCandidates(
    userId: string,
    scenarioId: string,
    dto: GenerateExplorationCandidatesDto,
  ): Promise<{
    generationVersion: number;
    generationMode: string;
    candidates: ExplorationRouteVariantView[];
    dimensions?: ReturnType<typeof buildCompareDimensionsView>;
  }> {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    const tripId = scenario.tripId!;
    const protocolId = scenario.researchProtocolId;
    const initialInput = this.scenarios.parseInitialInput(scenario.initialInput);
    const destinationCode = initialInput.destinationCodes[0] ?? 'IS';

    const existing = await this.prisma.explorationRouteVariant.findMany({
      where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT },
      orderBy: { createdAt: 'asc' },
    });

    if (existing.length > 0 && dto.idempotencyKey && !dto.force) {
      return {
        generationVersion: existing[0]?.generationVersion ?? 1,
        generationMode: this.routeGeneration.getActiveMode(),
        candidates: await this.serializeVariants(existing, destinationCode),
        dimensions: buildCompareDimensionsView(),
      };
    }

    if (existing.length > 0 && !dto.idempotencyKey && !dto.force) {
      return {
        generationVersion: Math.max(...existing.map((v) => v.generationVersion)),
        generationMode: this.routeGeneration.getActiveMode(),
        candidates: await this.serializeVariants(existing, destinationCode),
        dimensions: buildCompareDimensionsView(),
      };
    }

    const generationVersion = dto.force
      ? await this.candidatesLifecycle.nextGenerationVersion(scenarioId)
      : 1;
    const { mode, variants: rawVariants } = await this.routeGeneration.generate({
      scenarioId,
      tripId,
      destinationCode,
      protocolId,
      initialInput,
      generationVersion,
    });

    const variants = await this.poiResolution.enrichVariants(rawVariants, destinationCode);

    if (variants.length === 0) {
      return {
        generationVersion,
        generationMode: mode,
        candidates: [],
        dimensions: buildCompareDimensionsView(),
      };
    }

    await this.prisma.$transaction(
      variants.map((b) =>
        this.prisma.explorationRouteVariant.upsert({
          where: {
            scenarioId_routeId: { scenarioId, routeId: b.routeId },
          },
          create: {
            scenarioId,
            tripId,
            routeId: b.routeId,
            strategyId: b.strategyId,
            variantBranchKey: b.variantBranchKey,
            itineraryVersion: 1,
            status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT,
            title: b.title,
            narrative: b.narrative,
            metrics: b.metrics as unknown as Prisma.InputJsonValue,
            gains: b.gains as unknown as Prisma.InputJsonValue,
            sacrifices: b.sacrifices as unknown as Prisma.InputJsonValue,
            generationVersion,
            generationSource: b.generationSource,
            routeDetail: (b.routeDetail ?? null) as unknown as Prisma.InputJsonValue,
          },
          update: {
            tripId,
            strategyId: b.strategyId,
            variantBranchKey: b.variantBranchKey,
            status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT,
            title: b.title,
            narrative: b.narrative,
            metrics: b.metrics as unknown as Prisma.InputJsonValue,
            gains: b.gains as unknown as Prisma.InputJsonValue,
            sacrifices: b.sacrifices as unknown as Prisma.InputJsonValue,
            generationVersion,
            generationSource: b.generationSource,
            routeDetail: (b.routeDetail ?? null) as unknown as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    const rows = await this.prisma.explorationRouteVariant.findMany({
      where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT },
      orderBy: { createdAt: 'asc' },
    });

    return {
      generationVersion,
      generationMode: mode,
      candidates: await this.serializeVariants(rows, destinationCode),
      dimensions: buildCompareDimensionsView(),
    };
  }

  async selectRoute(userId: string, scenarioId: string, dto: RouteSelectionDto) {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    const variant = await this.prisma.explorationRouteVariant.findFirst({
      where: { scenarioId, routeId: dto.routeId },
    });
    if (!variant) {
      throw new ConflictException(`Route ${dto.routeId} not found for scenario`);
    }

    await this.prisma.$transaction([
      this.prisma.explorationRouteVariant.updateMany({
        where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
        data: { status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
      }),
      this.prisma.explorationRouteVariant.update({
        where: { id: variant.id },
        data: { status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
      }),
    ]);

    const researchData = {
      selectedRouteId: dto.routeId,
      selectionReason: dto.selectionReason,
      prioritizedGainIds: dto.prioritizedGainIds ?? [],
      acceptedSacrificeIds: dto.acceptedSacrificeIds ?? [],
      concernText: dto.concernText,
    };

    await this.prisma.productDiscoverySession.updateMany({
      where: { scenarioId },
      data: {
        metadata: {
          routeSelection: researchData,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.syncExplorationArchiveToTrip(scenarioId, scenario.tripId!, {
      explorationSelectionSummary: {
        routeId: dto.routeId,
        strategyId: variant.strategyId,
        prioritizedGainIds: researchData.prioritizedGainIds,
        acceptedSacrificeIds: researchData.acceptedSacrificeIds,
      },
    });

    const initialInput = this.scenarios.parseInitialInput(scenario.initialInput);
    await this.itinerarySeeder.seedForSelectedRoute({
      tripId: scenario.tripId!,
      strategyId: variant.strategyId,
      routeId: dto.routeId,
      initialInput,
    });

    if (this.attractionExploreSeed) {
      await this.attractionExploreSeed
        .seedFromExplorationRoute({
          tripId: scenario.tripId!,
          scenarioId,
          routeId: dto.routeId,
          strategyId: variant.strategyId,
        })
        .catch((err) =>
          this.logger.warn(
            `Attraction explore seed from route failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    return { routeId: dto.routeId, strategyId: variant.strategyId };
  }

  async listIssues(userId: string, scenarioId: string) {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    return this.issuesService.listIssuesForScenario({
      tripId: scenario.tripId!,
      protocolId: scenario.researchProtocolId,
    });
  }

  async runCheck(userId: string, scenarioId: string, asyncMode?: boolean) {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    return this.reliability.runCheck({
      scenarioId,
      tripId: scenario.tripId!,
      userId,
      protocolId: scenario.researchProtocolId,
      asyncMode,
    });
  }

  async getCheckJob(userId: string, jobId: string) {
    const job = await this.reliability.getCheckJob(jobId);
    await this.scenarios.requireOwnedScenario(userId, job.scenarioId);
    const scenario = await this.scenarios.getById(userId, job.scenarioId);
    return this.reliability.getCheckJobWithIssues(jobId, scenario.researchProtocolId);
  }

  async getRepairOptions(userId: string, scenarioId: string, problemId: string) {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    return this.reliability.getRepairOptions(scenario.tripId!, problemId);
  }

  async submitDecision(
    userId: string,
    scenarioId: string,
    problemId: string,
    body: { optionId: string; reason?: string; acknowledgement?: string[] },
  ) {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    const result = await this.reliability.submitDecision(scenario.tripId!, problemId, userId, {
      selectedActionId: body.optionId,
      reason: body.reason,
      acknowledgement: body.acknowledgement,
    });

    await this.prisma.productDiscoverySession.updateMany({
      where: { scenarioId },
      data: {
        metadata: {
          selectedDecisionOptionId: body.optionId,
          selectedProblemId: problemId,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return result;
  }

  async applyDecision(
    userId: string,
    scenarioId: string,
    problemId: string,
  ): Promise<ExplorationApplyResultView> {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    const result = await this.reliability.applyDecision(scenario.tripId!, problemId, userId);

    await this.prisma.productDiscoverySession.updateMany({
      where: { scenarioId },
      data: {
        metadata: {
          decisionApplied: true,
          revalidationResult: result.revalidation?.status,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const issues = await this.issuesService.listIssuesForScenario({
      tripId: scenario.tripId!,
      protocolId: scenario.researchProtocolId,
    });

    const resolved =
      result.revalidation?.status === 'PASSED' ||
      result.problem?.workflowStatus === 'RESOLVED';

    return {
      apply: result,
      revalidation: result.revalidation,
      originalProblem: {
        problemId,
        resolved,
        workflowStatus: result.problem?.workflowStatus,
        executionStatus: result.problem?.executionStatus,
      },
      issues,
    };
  }

  async getRouteDetail(userId: string, scenarioId: string, routeId: string) {
    const scenario = await this.scenarios.requireOwnedScenario(userId, scenarioId);
    const initialInput = this.scenarios.parseInitialInput(scenario.initialInput);
    const destinationCode = initialInput.destinationCodes[0] ?? 'IS';

    const variant = await this.prisma.explorationRouteVariant.findFirst({
      where: { scenarioId, routeId },
    });

    const routeDetail = variant
      ? await this.ensureVariantRouteDetailWithResolvedPois(variant, destinationCode)
      : undefined;

    return this.routeDetails.requireRouteDetail(routeId, {
      title: variant?.title,
      narrative: variant?.narrative,
      routeDetail,
      tagline: undefined,
    });
  }

  async revalidate(userId: string, scenarioId: string) {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    return this.reliability.revalidate({
      tripId: scenario.tripId!,
      protocolId: scenario.researchProtocolId,
    });
  }

  private async serializeVariants(
    rows: Array<Parameters<ExplorationOrchestratorService['serializeVariant']>[0]>,
    destinationCode: string,
  ): Promise<ExplorationRouteVariantView[]> {
    return Promise.all(rows.map((row) => this.serializeVariant(row, destinationCode)));
  }

  private async serializeVariant(
    row: {
    id: string;
    routeId: string;
    strategyId: string;
    variantBranchKey: string;
    itineraryVersion: number;
    status: string;
    title: string | null;
    narrative: string | null;
    metrics: unknown;
    gains: unknown;
    sacrifices: unknown;
    generationVersion: number;
    generationSource?: string | null;
    routeDetail?: unknown;
  },
    destinationCode?: string,
  ): Promise<ExplorationRouteVariantView> {
    const preview = this.routeDetails.getRoutePreview(row.routeId, {
      routeDetail: row.routeDetail,
    });
    const resolvedPois = destinationCode
      ? await this.resolveCandidateResolvedPois(row, destinationCode)
      : [];

    return {
      routeId: row.routeId,
      strategyId: row.strategyId,
      variantId: row.variantBranchKey,
      itineraryVersion: row.itineraryVersion,
      status: row.status as ExplorationRouteVariantView['status'],
      title: row.title ?? '',
      narrative: row.narrative ?? '',
      metrics: (row.metrics as Record<string, number>) ?? {},
      gains: (row.gains as Array<{ id: string; label: string }>) ?? [],
      sacrifices: (row.sacrifices as Array<{ id: string; label: string }>) ?? [],
      generationVersion: row.generationVersion,
      generationSource: row.generationSource ?? undefined,
      ...(preview ? { preview: preview.preview } : {}),
      resolvedPois,
    };
  }

  /** Compare / 详情联调 — 保证 routeDetail JSON 含 resolvedPois，并在缺失时回写 DB */
  private async ensureVariantRouteDetailWithResolvedPois(
    variant: {
      id: string;
      routeDetail?: unknown;
      narrative?: string | null;
    },
    destinationCode: string,
  ): Promise<unknown> {
    const parsed = this.routeDetails.parseStoredRouteDetail(variant.routeDetail);
    if (!parsed) return variant.routeDetail;

    const resolvedPois = await this.poiResolution.resolveForRouteDetail(
      parsed,
      variant.narrative,
      destinationCode,
    );

    if (Array.isArray(parsed.resolvedPois)) {
      return this.poiResolution.mergeResolvedPoisIntoDetail(parsed, resolvedPois);
    }

    const merged = this.poiResolution.mergeResolvedPoisIntoDetail(parsed, resolvedPois);
    await this.prisma.explorationRouteVariant.update({
      where: { id: variant.id },
      data: { routeDetail: merged as unknown as Prisma.InputJsonValue },
    });
    return merged;
  }

  private async syncExplorationArchiveToTrip(
    scenarioId: string,
    tripId: string,
    extraMetadata?: Record<string, unknown>,
  ): Promise<void> {
    const [scenario, trip, routeVariants] = await Promise.all([
      this.prisma.explorationScenario.findUniqueOrThrow({
        where: { id: scenarioId },
        select: { researchProtocolId: true, materializedAt: true },
      }),
      this.prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: { metadata: true },
      }),
      this.prisma.explorationRouteVariant.findMany({
        where: { scenarioId },
        select: { routeId: true, status: true },
      }),
    ]);

    const existingMetadata = (trip.metadata as Record<string, unknown>) ?? {};
    const explorationArchive = buildExplorationArchive({
      variants: routeVariants,
      researchProtocolId: scenario.researchProtocolId,
      materializedAt: scenario.materializedAt?.toISOString(),
      principles: readRankedPrinciplesFromTripMetadata(existingMetadata),
    });

    const metadata = {
      ...mergeTravelContextExplorationArchive(existingMetadata, {
        contextId: scenarioId,
        explorationArchive,
      }),
      ...extraMetadata,
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });
  }

  private async resolveCandidateResolvedPois(
    row: {
      id: string;
      routeDetail?: unknown;
      narrative?: string | null;
    },
    destinationCode: string,
  ): Promise<ExplorationRouteVariantView['resolvedPois']> {
    const parsed = this.routeDetails.parseStoredRouteDetail(row.routeDetail);
    if (!parsed) return [];

    const merged = await this.ensureVariantRouteDetailWithResolvedPois(row, destinationCode);
    const detail = merged as { resolvedPois?: ExplorationRouteVariantView['resolvedPois'] };
    return detail.resolvedPois ?? [];
  }
}
