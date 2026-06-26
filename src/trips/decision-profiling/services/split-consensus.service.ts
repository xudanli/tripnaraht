import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildWalletRuleFromConsensus,
  DEFAULT_HYBRID_BREAKDOWN,
  hybridBreakdownFromCategoryRules,
} from '../../budget-os/utils/split-consensus-wallet-bridge.util';
import type { CategoryPaymentRule } from '../../budget-os/types/travel-wallet.types';
import { TravelWalletService } from '../../budget-os/services/travel-wallet.service';
import type {
  SplitConsensusState,
  SplitMechanismMode,
  SplitMechanismOption,
} from '../types/decision-profiling.types';
import {
  pickRecommendedMode,
  recommendSplitMechanisms,
  simulateSplit,
} from '../utils/split-mechanism.util';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { DecisionProfilingAccessService } from './decision-profiling-access.service';
import { FrictionRadarService } from './friction-radar.service';

type SimulationInput = {
  totalEstimate?: number;
  currency?: string;
  lockedHybridBreakdown?: Record<string, SplitMechanismMode>;
};

@Injectable()
export class SplitConsensusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DecisionProfilingAccessService,
    private readonly frictionRadar: FrictionRadarService,
    private readonly wallet: TravelWalletService,
  ) {}

  async getState(tripId: string, userId: string): Promise<SplitConsensusState> {
    await this.access.assertTripMember(tripId, userId);
    const memberIds = await this.access.listMemberIds(tripId);
    const names = await this.access.resolveDisplayNames(memberIds);

    const radar = await this.frictionRadar.getRadar(tripId, userId);
    let options = recommendSplitMechanisms(radar.compatibility);
    const recommendedMode = pickRecommendedMode(options);

    const row = await this.prisma.tripSplitMechanismConsensus.findUnique({ where: { tripId } });
    const confirmations = (row?.confirmations ?? {}) as Record<string, string>;
    const selectedMode = (row?.selectedMode as SplitMechanismMode | null) ?? null;
    const simulationInput = row?.simulationInput as SimulationInput | null;

    if (row?.lockedAt && row.lockedMode === 'hybrid') {
      const lockedBreakdown = await this.resolveLockedHybridBreakdown(tripId, row);
      options = this.enrichHybridOption(options, lockedBreakdown);
    }

    const members = memberIds.map((id) => ({
      userId: id,
      displayName: names.get(id) ?? id.slice(0, 8),
    }));

    return {
      tripId,
      recommendedMode,
      options,
      simulation: simulationInput?.totalEstimate
        ? simulateSplit(members, simulationInput.totalEstimate, simulationInput.currency)
        : null,
      selectedMode,
      confirmations: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        confirmedAt: confirmations[m.userId] ?? null,
      })),
      lockedAt: row?.lockedAt?.toISOString() ?? null,
      lockedMode: (row?.lockedMode as SplitMechanismMode | null) ?? null,
      allConfirmed: memberIds.every((id) => Boolean(confirmations[id])),
    };
  }

  async selectMode(
    tripId: string,
    userId: string,
    mode: SplitMechanismMode,
  ): Promise<SplitConsensusState> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.prisma.tripSplitMechanismConsensus.findUnique({ where: { tripId } });
    if (row?.lockedAt) {
      throw new BadRequestException('分摊机制已锁定，无法修改');
    }

    const radar = await this.frictionRadar.getRadar(tripId, userId);
    const recommendedMode = pickRecommendedMode(recommendSplitMechanisms(radar.compatibility));

    await this.prisma.tripSplitMechanismConsensus.upsert({
      where: { tripId },
      create: {
        tripId,
        recommendedMode,
        selectedMode: mode,
        confirmations: toInputJsonValue({}),
      },
      update: { selectedMode: mode },
    });

    return this.getState(tripId, userId);
  }

  async simulate(
    tripId: string,
    userId: string,
    totalEstimate: number,
    currency = 'CNY',
  ): Promise<SplitConsensusState> {
    await this.access.assertTripMember(tripId, userId);
    const radar = await this.frictionRadar.getRadar(tripId, userId);
    const recommendedMode = pickRecommendedMode(recommendSplitMechanisms(radar.compatibility));
    const existing = await this.prisma.tripSplitMechanismConsensus.findUnique({ where: { tripId } });
    const prev = (existing?.simulationInput ?? {}) as SimulationInput;

    await this.prisma.tripSplitMechanismConsensus.upsert({
      where: { tripId },
      create: {
        tripId,
        recommendedMode,
        simulationInput: toInputJsonValue({ ...prev, totalEstimate, currency }),
        confirmations: toInputJsonValue({}),
      },
      update: {
        simulationInput: toInputJsonValue({ ...prev, totalEstimate, currency }),
      },
    });

    return this.getState(tripId, userId);
  }

  async confirm(tripId: string, userId: string): Promise<SplitConsensusState> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.prisma.tripSplitMechanismConsensus.findUnique({ where: { tripId } });
    if (!row?.selectedMode) {
      throw new BadRequestException('请先选择分摊机制');
    }
    if (row.lockedAt) {
      return this.getState(tripId, userId);
    }

    const confirmations = { ...(row.confirmations as Record<string, string>) };
    confirmations[userId] = new Date().toISOString();

    const memberIds = await this.access.listMemberIds(tripId);
    const allConfirmed = memberIds.every((id) => Boolean(confirmations[id]));
    const selectedMode = row.selectedMode as SplitMechanismMode;
    const prevSim = (row.simulationInput ?? {}) as SimulationInput;

    const radar = await this.frictionRadar.getRadar(tripId, userId);
    const hybridOption = recommendSplitMechanisms(radar.compatibility).find(
      (o) => o.mode === 'hybrid',
    );
    const hybridBreakdown = selectedMode === 'hybrid'
      ? (hybridOption?.hybridBreakdown ?? DEFAULT_HYBRID_BREAKDOWN)
      : undefined;

    await this.prisma.tripSplitMechanismConsensus.update({
      where: { tripId },
      data: {
        confirmations: toInputJsonValue(confirmations),
        ...(allConfirmed
          ? {
              lockedAt: new Date(),
              lockedMode: selectedMode,
              simulationInput: toInputJsonValue({
                ...prevSim,
                ...(hybridBreakdown ? { lockedHybridBreakdown: hybridBreakdown } : {}),
              }),
            }
          : {}),
      },
    });

    if (allConfirmed) {
      await this.applyWalletRule(tripId, selectedMode, memberIds.length, hybridBreakdown);
    }

    return this.getState(tripId, userId);
  }

  private async applyWalletRule(
    tripId: string,
    mode: SplitMechanismMode,
    memberCount: number,
    hybridBreakdown?: Record<string, SplitMechanismMode>,
  ) {
    const input = buildWalletRuleFromConsensus(mode, memberCount, hybridBreakdown);
    await this.wallet.applyConsensusLockedRule(tripId, input);
  }

  private async resolveLockedHybridBreakdown(
    tripId: string,
    row: { simulationInput: unknown; lockedMode: string | null },
  ): Promise<Record<string, SplitMechanismMode>> {
    const sim = row.simulationInput as SimulationInput | null;
    if (sim?.lockedHybridBreakdown) {
      return sim.lockedHybridBreakdown;
    }

    const walletRule = await this.prisma.tripWalletRule.findUnique({ where: { tripId } });
    const fromWallet = hybridBreakdownFromCategoryRules(
      walletRule?.categoryRules as unknown as Record<string, CategoryPaymentRule> | null,
    );
    return fromWallet ?? DEFAULT_HYBRID_BREAKDOWN;
  }

  private enrichHybridOption(
    options: SplitMechanismOption[],
    hybridBreakdown: Record<string, SplitMechanismMode>,
  ): SplitMechanismOption[] {
    return options.map((option) =>
      option.mode === 'hybrid'
        ? { ...option, hybridBreakdown }
        : option,
    );
  }
}
