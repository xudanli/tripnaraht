import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createDefaultUserTravelProfile } from '../../agent/memory/interfaces/user-travel-profile.interface';
import type { AgentMemoryContext } from '../../agent/memory/interfaces/agent-memory-context.interface';
import { resolveEffectiveTravelerContext } from '../../travel-memory/effective-context/resolve-effective-traveler-context.util';
import type { EffectiveTravelerContextV1 } from '../../travel-memory/effective-context/effective-traveler-context.types';
import { TripOverrideService } from '../../travel-memory/traveler-memory/trip-override.service';
import { TravelMemoryRuntimeService } from '../../travel-memory/runtime/travel-memory-runtime.service';
import { resolveEffectiveTravelerContextConsumeMode } from '../../travel-memory/effective-context/resolve-etc-consume-mode.util';
import {
  buildTravelerContextInspectorView,
  type TravelerContextInspectorView,
} from './build-etc-inspector-view.util';

function emptyMemory(partial: Partial<AgentMemoryContext>): AgentMemoryContext {
  return {
    snapshotId: 'ks-etc-inspector',
    snapshotVersion: 1,
    requestId: `ks-etc-${Date.now()}`,
    userId: partial.userId ?? null,
    tripId: partial.tripId ?? null,
    userProfile: null,
    userBasics: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: [],
    recentTripFeedbacks: [],
    domainInfluenceDigest: null,
    wishConstraintDigest: null,
    privateWishDigest: null,
    decisionProfilingDigest: null,
    negotiationDigest: null,
    loadedAt: new Date().toISOString(),
    observability: { layers: ['knowledge_system_etc_inspector'] },
    ...partial,
  };
}

@Injectable()
export class KnowledgeTravelerContextService {
  private readonly logger = new Logger(KnowledgeTravelerContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripOverride: TripOverrideService,
    private readonly memoryRuntime: TravelMemoryRuntimeService,
  ) {}

  async inspect(tripId: string): Promise<TravelerContextInspectorView> {
    if (tripId === 'demo-ks-phase4') {
      return this.demoInspect();
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        TripCollaborator: {
          where: { role: { in: ['OWNER', 'owner'] } },
          take: 1,
          select: { userId: true },
        },
      },
    });

    let userId = trip?.TripCollaborator?.[0]?.userId ?? null;
    if (!userId && trip) {
      const anyMember = await this.prisma.tripCollaborator.findFirst({
        where: { tripId },
        select: { userId: true },
        orderBy: { createdAt: 'asc' },
      });
      userId = anyMember?.userId ?? null;
    }
    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    const etc = await this.resolveEtcForTrip(tripId, userId);
    return buildTravelerContextInspectorView({ tripId, userId, etc });
  }

  async diff(tripId: string) {
    const view = await this.inspect(tripId);
    return {
      tripId,
      consumeMode: view.consumeMode,
      layerDiff: view.layerDiff,
      sourceBreakdown: view.sourceBreakdown,
      note: 'Long-term Memory → Trip Override → Effective Context',
    };
  }

  coverageStats(): {
    etcConsumeMode: 'off' | 'shadow' | 'active';
    etcConsumeCoverage: number | null;
    note: string;
  } {
    const mode = resolveEffectiveTravelerContextConsumeMode();
    return {
      etcConsumeMode: mode,
      /** 1 when active, 0.5 shadow, 0 off — ops health proxy */
      etcConsumeCoverage: mode === 'active' ? 1 : mode === 'shadow' ? 0.5 : 0,
      note: 'Set EFFECTIVE_TRAVELER_CONTEXT_CONSUME=active for Gate/ETC SSOT',
    };
  }

  private async resolveEtcForTrip(
    tripId: string,
    userId: string | null,
  ): Promise<EffectiveTravelerContextV1> {
    let userProfile = null;
    let userBasics: AgentMemoryContext['userBasics'] = null;
    let travelPreference: AgentMemoryContext['travelPreference'] = null;

    if (userId && this.prisma.isDbConnected()) {
      try {
        const [profile, travel] = await Promise.all([
          this.prisma.userProfile.findUnique({
            where: { userId },
            select: { preferences: true },
          }),
          this.prisma.userTravelProfile.findUnique({ where: { userId } }),
        ]);
        if (travel) {
          userProfile = {
            ...createDefaultUserTravelProfile(userId),
            pacePreference: (travel as { pacePreference?: string }).pacePreference as
              | 'SLOW'
              | 'MODERATE'
              | 'FAST'
              | undefined,
            riskTolerance: (travel as { riskTolerance?: string }).riskTolerance as
              | 'LOW'
              | 'MEDIUM'
              | 'HIGH'
              | undefined,
            travelPhilosophy: (travel as { travelPhilosophy?: string }).travelPhilosophy as
              | 'RELAXED'
              | 'BALANCED'
              | 'INTENSIVE'
              | undefined,
            confidence: 0.7,
            source: 'explicit' as const,
          };
        }
        const prefs =
          profile?.preferences &&
          typeof profile.preferences === 'object' &&
          !Array.isArray(profile.preferences)
            ? (profile.preferences as Record<string, unknown>)
            : null;
        if (prefs) {
          userBasics = {
            dietaryRestrictions: Array.isArray(prefs.dietaryRestrictions)
              ? (prefs.dietaryRestrictions as string[])
              : undefined,
            preferredAttractionTypes: Array.isArray(prefs.preferredAttractionTypes)
              ? (prefs.preferredAttractionTypes as string[])
              : undefined,
          };
          travelPreference = {
            pacePreference: prefs.pacePreference as string | undefined,
            mergedInterests: Array.isArray(prefs.interests)
              ? (prefs.interests as string[])
              : undefined,
          };
        }
      } catch (e) {
        this.logger.warn(
          `ETC inspector profile load failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    const overrides = this.tripOverride.listTripOverrides(tripId);
    const travelerMemories =
      userId != null
        ? this.memoryRuntime.listTravelerMemories(userId, {
            includeCandidates: false,
            includeLegacy: true,
          })
        : [];

    // Attach trip-scoped memories onto assembled path via memory only;
    // resolveEffectiveTravelerContext reads OS + TMR fields from AgentMemoryContext.
    // Trip overrides live in runtime ledger under tripId — project via getTripMemory.
    const tripMem = this.memoryRuntime.getTripMemory(tripId);

    const memory = emptyMemory({
      userId,
      tripId,
      userProfile,
      userBasics,
      travelPreference,
    });

    let etc = resolveEffectiveTravelerContext({ memory });

    // If L2 overrides exist in ledger but weren't projected (TMR path), annotate observability
    if (overrides.length > 0 || (tripMem as { travelerOverrides?: unknown[] })?.travelerOverrides) {
      this.logger.debug(
        `ETC inspector trip=${tripId} overrides=${overrides.length} l1Memories=${travelerMemories.length}`,
      );
    }

    const mode = resolveEffectiveTravelerContextConsumeMode();
    if (mode === 'active') {
      etc = { ...etc, consumptionMode: 'ACTIVE' };
    }

    return etc;
  }

  private demoInspect(): TravelerContextInspectorView {
    const tripId = 'demo-ks-phase4';
    const userId = 'demo-traveler';
    const profile = {
      ...createDefaultUserTravelProfile(userId),
      pacePreference: 'SLOW' as const,
      riskTolerance: 'LOW' as const,
      travelPhilosophy: 'RELAXED' as const,
      confidence: 0.85,
      source: 'explicit' as const,
    };

    // L1 from OS
    let etc = resolveEffectiveTravelerContext({
      memory: emptyMemory({
        userId,
        tripId,
        userProfile: profile,
        userBasics: {
          dietaryRestrictions: ['no_pork'],
          preferredAttractionTypes: ['NATURE', 'PHOTOGRAPHY'],
        },
        travelPreference: {
          pacePreference: 'SLOW',
          mergedInterests: ['NATURE'],
        },
      }),
    });

    // Simulate L2 override winning on pace (inspector demo)
    const paceL1 = etc.effective.pace;
    const paceL2 = paceL1
      ? {
          ...paceL1,
          value: 'RELAXED',
          layer: 'L2_TRIP_OVERRIDE' as const,
          sourceScope: 'L2_TRIP_OVERRIDE' as const,
          overridePolicy: 'L2_WINS' as const,
          sourceRefs: ['demo:trip_override:pace'],
          confidence: 0.95,
          overriddenByKey: undefined,
        }
      : null;

    if (paceL2 && paceL1) {
      const items = etc.items.map((it) =>
        it.key === 'pace' && it.layer === 'L1_PERSISTENT'
          ? { ...it, overriddenByKey: 'pace@L2' }
          : it,
      );
      items.push(paceL2);
      etc = {
        ...etc,
        items,
        effective: { ...etc.effective, pace: paceL2 },
        tripOverridesApplied: ['pace'],
        byDomain: {
          ...etc.byDomain,
          PACE: [
            ...(etc.byDomain.PACE ?? []).filter((i) => i.layer !== 'L2_TRIP_OVERRIDE'),
            paceL2,
          ],
        },
        consumptionMode: 'ACTIVE',
      };
    }

    return buildTravelerContextInspectorView({ tripId, userId, etc });
  }
}
