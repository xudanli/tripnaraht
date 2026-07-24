import { Injectable } from '@nestjs/common';
import type { UserTravelProfile } from '../../../agent/memory/interfaces/user-travel-profile.interface';
import { buildPersonaSnapshot } from '../../../odyssey-intake/utils/odyssey-persona-snapshot.util';
import { PrismaService } from '../../../prisma/prisma.service';
import type { UserTravelProfileAggregate } from '../types/travel-profile.types';
import { MoneyDnaService } from './money-dna.service';

@Injectable()
export class TravelProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moneyDnaService: MoneyDnaService,
  ) {}

  async getAggregate(userId: string): Promise<UserTravelProfileAggregate> {
    const [user, moneyDna, travelRow] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      }),
      this.moneyDnaService.getProfile(userId),
      this.prisma.userTravelProfile.findUnique({ where: { userId } }),
    ]);

    const odyssey = user
      ? buildPersonaSnapshot({
          displayName: user.displayName,
          preferences: user.profile?.preferences,
        })
      : null;

    const travelProfile = travelRow ? this.mapTravelProfile(travelRow) : null;

    const timestamps = [
      moneyDna?.lastUpdatedAt,
      travelRow?.updatedAt.toISOString(),
      user?.updatedAt.toISOString(),
    ].filter(Boolean) as string[];

    return {
      userId,
      odyssey,
      moneyDna,
      travelProfile,
      updatedAt: timestamps.sort().pop() ?? new Date().toISOString(),
    };
  }

  private mapTravelProfile(row: {
    userId: string;
    pacePreference: string | null;
    altitudeTolerance: string | null;
    riskTolerance: string | null;
    travelPhilosophy: string | null;
    preferredRouteTypes: string[];
    confidence: number;
    source: string;
    extendedProfile: unknown;
    updatedAt: Date;
  }): UserTravelProfile {
    const extended = (row.extendedProfile ?? {}) as Record<string, unknown>;
    return {
      userId: row.userId,
      pacePreference: row.pacePreference as UserTravelProfile['pacePreference'],
      altitudeTolerance: row.altitudeTolerance as UserTravelProfile['altitudeTolerance'],
      riskTolerance: row.riskTolerance as UserTravelProfile['riskTolerance'],
      travelPhilosophy: row.travelPhilosophy as UserTravelProfile['travelPhilosophy'],
      preferredRouteTypes: row.preferredRouteTypes as UserTravelProfile['preferredRouteTypes'],
      companions: extended.companions as UserTravelProfile['companions'],
      deviceInfo: extended.deviceInfo as UserTravelProfile['deviceInfo'],
      timeWindow: extended.timeWindow as UserTravelProfile['timeWindow'],
      emotionalState: extended.emotionalState as UserTravelProfile['emotionalState'],
      drivingFatiguePreferences:
        extended.drivingFatiguePreferences as UserTravelProfile['drivingFatiguePreferences'],
      confidence: row.confidence,
      source: row.source as UserTravelProfile['source'],
      updatedAt: row.updatedAt,
    };
  }
}
