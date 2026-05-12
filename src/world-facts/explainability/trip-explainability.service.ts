import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WorldFactResolverService } from '../world-fact-resolver.service';
import type { DecisionFactor } from '../decision-awareness.types';
import type { TripExplainabilityPayload } from './trip-explainability.types';
import { DecisionFactorFactoryService } from '../decision-factor.factory';
import { routeVehicleFactKey } from '../builders/route-access.builder';

/**
 * Phase 3A：行程级 Explainability 聚合（事实 → 因果摘要），不调用 Planner/Gate。
 */
@Injectable()
export class TripExplainabilityService {
  private readonly logger = new Logger(TripExplainabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: WorldFactResolverService,
    private readonly config: ConfigService,
    private readonly decisionFactorFactory: DecisionFactorFactoryService,
  ) {}

  private snapshotVersionDefault(): string {
    return (
      this.config.get<string>('WORLD_FACT_SNAPSHOT_VERSION') ??
      process.env.WORLD_FACT_SNAPSHOT_VERSION ??
      'poc/v1'
    );
  }

  /** 与 ContextEngineer 对齐：destination 可能为 IS_WINTER → IS */
  extractCountryCode(destination: string): string | undefined {
    const dest = destination.trim().toUpperCase();
    const cc = dest.includes('_') ? dest.split('_')[0]! : dest;
    if (cc.length === 2 && /^[A-Z]{2}$/.test(cc)) return cc;
    return undefined;
  }

  async buildTripExplainability(params: { tripId: string }): Promise<TripExplainabilityPayload> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: params.tripId },
      select: { id: true, destination: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip not found: ${params.tripId}`);
    }

    const countryCode = this.extractCountryCode(trip.destination);
    const decisionFactors: DecisionFactor[] = [];
    const snapshotVersions: string[] = [this.snapshotVersionDefault()];

    if (!countryCode) {
      return {
        tripId: trip.id,
        destination: trip.destination,
        countryCode: undefined,
        worldSnapshotVersion: this.snapshotVersionDefault(),
        decisionFactors: [] as DecisionFactor[],
        generatedAt: new Date().toISOString(),
        destinationCountryUnresolved: true,
      };
    }

    await this.appendWindFactors(countryCode, decisionFactors, snapshotVersions);

    await this.appendRouteVehicleFactor(trip.metadata, decisionFactors, snapshotVersions);

    const worldSnapshotVersion =
      snapshotVersions.filter(Boolean).sort().reverse()[0] ?? this.snapshotVersionDefault();

    return {
      tripId: trip.id,
      destination: trip.destination,
      countryCode,
      worldSnapshotVersion,
      decisionFactors,
      generatedAt: new Date().toISOString(),
    };
  }

  private async appendWindFactors(
    countryCode: string,
    factors: DecisionFactor[],
    snapshotVersions: string[],
  ): Promise<void> {
    try {
      const resolved = await this.resolver.resolveLatestBySubjectPredicate(
        'country',
        countryCode,
        'aggregated_wind_mps',
      );
      if (resolved?.fact.snapshotVersion) snapshotVersions.push(resolved.fact.snapshotVersion);

      const verbose =
        process.env.TRIP_EXPLAINABILITY_VERBOSE === '1' ||
        this.config.get<string>('TRIP_EXPLAINABILITY_VERBOSE') === '1';
      factors.push(
        ...this.decisionFactorFactory.decisionFactorsFromCountryWindResolved(resolved, {
          verboseLowWind: verbose,
        }),
      );
    } catch (e: any) {
      this.logger.warn(`TripExplainability wind factor failed: ${e?.message ?? e}`);
    }
  }

  /** metadata 上若挂了 routeDirectionId，则尝试展示路段车型要求事实（若有） */
  private async appendRouteVehicleFactor(
    metadata: unknown,
    factors: DecisionFactor[],
    snapshotVersions: string[],
  ): Promise<void> {
    const meta = metadata as Record<string, unknown> | null;
    const rdId =
      (typeof meta?.routeDirectionId === 'string' && meta.routeDirectionId) ||
      (typeof meta?.route_direction_id === 'string' && meta.route_direction_id) ||
      undefined;
    if (!rdId) return;

    try {
      const resolved = await this.resolver.resolveLatestByFactKey(routeVehicleFactKey(rdId));
      if (resolved?.fact.snapshotVersion) snapshotVersions.push(resolved.fact.snapshotVersion);
      factors.push(
        ...this.decisionFactorFactory.decisionFactorsFromRouteVehicleResolved(resolved, rdId),
      );
    } catch (e: any) {
      this.logger.warn(`TripExplainability route vehicle factor failed: ${e?.message ?? e}`);
    }
  }
}
