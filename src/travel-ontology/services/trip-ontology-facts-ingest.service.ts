/**
 * Exploration / Trip 条件变更 → world_facts ingest（冰岛 P0）
 */

import { Injectable, Logger } from '@nestjs/common';
import { WorldFactService } from '../../world-facts/world-fact.service';
import { requiresSchengenVisa } from '../../trips/readiness/types/trip-context.types';
import type { ExplorationInsuranceCoverageTier } from '../../trips/exploration/config/exploration-insurance.config';
import { projectExplorationInsuranceTier } from '../adapters/exploration-insurance-tier.adapter';
import { projectExplorationRentalContractFacts } from '../adapters/exploration-rental-contract.adapter';
import { TRAVEL_WORLD_PREDICATES } from '../contracts/travel-world-fact.types';
import type { ExplorationInput } from '../../trips/exploration/types/exploration.types';

const REMOTE_HIGHLANDS_STRATEGY = 'remote-highlands-south';
const DEPTH_SOUTH_COAST_STRATEGY = 'depth-south-coast';

@Injectable()
export class TripOntologyFactsIngestService {
  private readonly logger = new Logger(TripOntologyFactsIngestService.name);

  constructor(private readonly worldFacts: WorldFactService) {}

  /** 探索选路后写入车辆与路线 Ontology 事实 */
  async ingestExplorationRouteSelection(input: {
    tripId: string;
    vehicleType: '2WD' | '4WD' | 'AWD';
    strategyId?: string;
    routeId?: string;
  }): Promise<{ factIds: string[] }> {
    const factIds: string[] = [];

    const vehicle = await this.worldFacts.appendTripScoped({
      tripId: input.tripId,
      keySuffix: 'rental_vehicle_drivetrain',
      subjectType: 'RentalVehicle',
      subjectId: `trip_${input.tripId}_vehicle`,
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      valueJson: { payload: input.vehicleType },
      confidence: 0.95,
      sourceType: 'user_declaration',
      sourceRef: 'exploration_mobility_context',
      observedAt: new Date(),
    });
    factIds.push(vehicle.id);

    if (input.strategyId === REMOTE_HIGHLANDS_STRATEGY) {
      const segment = await this.worldFacts.appendTripScoped({
        tripId: input.tripId,
        keySuffix: 'route_seg_f208_capability',
        subjectType: 'RouteSegment',
        subjectId: 'seg_f208',
        predicate: TRAVEL_WORLD_PREDICATES.REQUIRED_VEHICLE_CAPABILITY,
        valueJson: { payload: '4WD' },
        confidence: 0.9,
        sourceType: 'official',
        sourceRef: 'iceland_destination_pack',
        observedAt: new Date(),
      });
      factIds.push(segment.id);
    }

    if (input.strategyId === DEPTH_SOUTH_COAST_STRATEGY) {
      const river = await this.worldFacts.appendTripScoped({
        tripId: input.tripId,
        keySuffix: 'route_seg_river_crossing',
        subjectType: 'RouteSegment',
        subjectId: 'seg_river_crossing',
        predicate: 'route.hasRiverCrossing',
        valueJson: { payload: true },
        confidence: 0.85,
        sourceType: 'official',
        sourceRef: 'iceland_destination_pack',
        observedAt: new Date(),
      });
      factIds.push(river.id);
    }

    this.logger.log(
      `Ingested ${factIds.length} ontology facts for trip ${input.tripId} route=${input.routeId ?? 'n/a'}`,
    );
    return { factIds };
  }

  /**
   * Materialize 后写入入境资格占位事实（冰岛 + 需申根签证国籍）。
   * 无有效签证证据时 → ENTRY_ELIGIBILITY UNKNOWN（Harness ONT-SCENARIO-004 对齐）。
   */
  async ingestEntryEligibilityIfNeeded(input: {
    tripId: string;
    destinationCodes: string[];
    nationality?: string;
  }): Promise<{ factIds: string[] }> {
    const isIceland = input.destinationCodes.some((c) => c.toUpperCase() === 'IS');
    if (!isIceland) return { factIds: [] };

    // 无 UserProfile 国籍时默认 CN（冰岛 research 基线）；materializer 优先传入 profile 值
    const nationality = (input.nationality ?? 'CN').toUpperCase();
    if (!requiresSchengenVisa(nationality)) return { factIds: [] };

    const factIds: string[] = [];
    const travelerId = `traveler_${input.tripId}_primary`;

    const nationalityFact = await this.worldFacts.appendTripScoped({
      tripId: input.tripId,
      keySuffix: 'traveler_nationality',
      subjectType: 'Traveler',
      subjectId: travelerId,
      predicate: 'immigration.nationality',
      valueJson: { payload: nationality },
      confidence: 0.9,
      sourceType: 'user_declaration',
      sourceRef: 'exploration_materialize_default',
      observedAt: new Date(),
    });
    factIds.push(nationalityFact.id);

    const visaRequired = await this.worldFacts.appendTripScoped({
      tripId: input.tripId,
      keySuffix: 'visa_required_is',
      subjectType: 'Traveler',
      subjectId: travelerId,
      predicate: TRAVEL_WORLD_PREDICATES.VISA_REQUIRED,
      valueJson: { payload: true },
      confidence: 0.99,
      sourceType: 'official',
      sourceRef: 'schengen_entry_rules',
      observedAt: new Date(),
    });
    factIds.push(visaRequired.id);

    const eligibility = await this.worldFacts.appendTripScoped({
      tripId: input.tripId,
      keySuffix: 'entry_eligibility',
      subjectType: 'Traveler',
      subjectId: travelerId,
      predicate: TRAVEL_WORLD_PREDICATES.ENTRY_ELIGIBILITY,
      valueJson: {
        payload: {
          status: 'UNKNOWN',
          visaRequired: true,
          missingDocuments: ['SCHENGEN_VISA'],
        },
      },
      confidence: 0.5,
      sourceType: 'model_inference',
      sourceRef: 'entry_eligibility_engine',
      observedAt: new Date(),
    });
    factIds.push(eligibility.id);

    this.logger.log(
      `Ingested ${factIds.length} entry eligibility facts for trip ${input.tripId} nationality=${nationality}`,
    );
    return { factIds };
  }

  /**
   * 探索条件页保险档位 → InsurancePolicy 事实（用户声明权威）。
   * 冰岛目的地默认 STANDARD（research protocol 基线）。
   */
  async ingestExplorationInsuranceDeclaration(input: {
    tripId: string;
    destinationCodes: string[];
    coverageTier?: ExplorationInsuranceCoverageTier;
  }): Promise<{ factIds: string[] }> {
    const isIceland = input.destinationCodes.some((c) => c.toUpperCase() === 'IS');
    if (!isIceland) return { factIds: [] };

    const tier = input.coverageTier ?? 'STANDARD';
    const projection = projectExplorationInsuranceTier(tier);
    if (!projection) return { factIds: [] };

    const factIds: string[] = [];
    const policyId = `trip_${input.tripId}_rental_insurance`;

    const covers = await this.worldFacts.appendTripScoped({
      tripId: input.tripId,
      keySuffix: 'insurance_covers_damage',
      subjectType: 'InsurancePolicy',
      subjectId: policyId,
      predicate: TRAVEL_WORLD_PREDICATES.COVERS_DAMAGE_CAUSE,
      valueJson: { payload: projection.coveredCauses },
      confidence: projection.confidence,
      sourceType: 'user_declaration',
      sourceRef: projection.sourceRef,
      observedAt: new Date(),
    });
    factIds.push(covers.id);

    if (projection.excludedCauses.length > 0) {
      const excludes = await this.worldFacts.appendTripScoped({
        tripId: input.tripId,
        keySuffix: 'insurance_excludes_damage',
        subjectType: 'InsurancePolicy',
        subjectId: policyId,
        predicate: TRAVEL_WORLD_PREDICATES.EXCLUDES_DAMAGE_CAUSE,
        valueJson: { payload: projection.excludedCauses },
        confidence: Math.max(0.5, projection.confidence - 0.1),
        sourceType: 'user_declaration',
        sourceRef: projection.sourceRef,
        observedAt: new Date(),
      });
      factIds.push(excludes.id);
    }

    this.logger.log(
      `Ingested ${factIds.length} insurance ontology facts for trip ${input.tripId} tier=${tier}`,
    );
    return { factIds };
  }

  /**
   * 探索条件 → RentalContract + Flight 取车窗口事实（冰岛 P0）。
   * 2WD 默认写入 F 路禁止条款；取车时间用于 ONT-SCENARIO-005 评估。
   */
  async ingestExplorationRentalContract(input: {
    tripId: string;
    explorationInput: ExplorationInput;
  }): Promise<{ factIds: string[] }> {
    const drafts = projectExplorationRentalContractFacts(input.explorationInput);
    if (drafts.length === 0) return { factIds: [] };

    const factIds: string[] = [];
    for (const draft of drafts) {
      const row = await this.worldFacts.appendTripScoped({
        tripId: input.tripId,
        keySuffix: draft.keySuffix,
        subjectType: draft.subjectType,
        subjectId: draft.subjectId,
        predicate: draft.predicate,
        valueJson: { payload: draft.payload },
        confidence: draft.confidence,
        sourceType: draft.sourceType,
        sourceRef: draft.sourceRef,
        observedAt: new Date(),
      });
      factIds.push(row.id);
    }

    this.logger.log(
      `Ingested ${factIds.length} rental contract ontology facts for trip ${input.tripId}`,
    );
    return { factIds };
  }
}
