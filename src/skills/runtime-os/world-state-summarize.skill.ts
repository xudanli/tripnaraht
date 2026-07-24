/**
 * worldState.summarize — P0 Runtime OS
 * Physical world → OperationalWorldState（信息层）；
 * 冰岛域由 IcelandOperationalDomainPipeline 产出类型化 slices；
 * 最终可执行性由 WorldOperationalArbitrator 裁决（与「堆字符串」解耦）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
import type { OperationalRiskLevel, OperationalWorldState } from './types/runtime-os.types';
import { IcelandOperationalDomainPipeline } from '../../world/domains/iceland/iceland-operational-domain.pipeline';
import { WorldOperationalArbitrator, type OperationalArbitration } from '../../world/operational/world-operational-arbitrator';
import { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { worldArbitrationToGovernanceLedgerEvents } from '../../governance/world-events/world-arbitration-to-ledger-events.util';

export interface WorldStateSummarizeInput extends SkillInput {
  tripId?: string;
  world?: WorldModelContext;
  /** @deprecated 仅遗留路径；新编排应使用 tripId + 冰岛 pipeline + arbitrator。 */
  slices?: {
    weather?: unknown;
    road?: unknown;
    safeTravel?: unknown;
    rental?: unknown;
    daylight?: unknown;
  };
  gatherIcelandDomainSlices?: boolean;
  /** 供裁决器使用的路线摘要（可选） */
  routeBrief?: { includesFRoad?: boolean; includesHighlands?: boolean };
  /** 供裁决器使用的车辆策略（可选） */
  vehiclePolicy?: { drivetrain?: '2WD' | '4WD' | 'AWD' | 'unknown'; camper?: boolean };
}

export interface WorldStateSummarizeOutput extends SkillOutput {
  operationalWorldState: OperationalWorldState;
  /** 冰岛域 pipeline 是否拉取到至少一条 typed slice */
  icelandSlicesGathered?: boolean;
  /** 运行裁决（约束仲裁器）；与 operationalWorldState 分离 */
  operationalArbitration?: OperationalArbitration;
}

@Injectable()
export class WorldStateSummarizeSkill implements Skill<WorldStateSummarizeInput, WorldStateSummarizeOutput> {
  private readonly logger = new Logger(WorldStateSummarizeSkill.name);

  metadata = {
    name: 'worldState.summarize',
    description:
      'worldState.summarize：汇总 physical 世界为 OperationalWorldState（冰岛 tripId 走 IcelandOperationalDomainPipeline + WorldOperationalArbitration）。在 planning/decision 阶段 policy.resolve/readiness 前需 OS 世界状态时调用。',
    version: '1.2.0',
    category: 'world' as const,
    toolGroup: 'CONTEXT' as const,
  };

  constructor(
    @Optional() private readonly worldBuild?: WorldBuildContextSkill,
    @Optional() private readonly icelandPipeline?: IcelandOperationalDomainPipeline,
    @Optional() private readonly worldArbitrator?: WorldOperationalArbitrator,
    @Optional() private readonly governanceLedger?: GovernanceLedgerStoreService,
  ) {}

  async execute(input: WorldStateSummarizeInput): Promise<WorldStateSummarizeOutput> {
    let world = input.world;
    let confidence = 0.72;
    let icelandSlicesGathered = false;

    if (!world && input.tripId?.trim()) {
      if (!this.worldBuild) {
        throw new Error('worldState.summarize: tripId 需要 WorldBuildContextSkill，但当前环境未注入');
      }
      const built = await this.worldBuild.execute({ tripId: input.tripId.trim() });
      world = built.world;
      if (built.missingPieces && Object.values(built.missingPieces).some(Boolean)) {
        confidence = Math.max(0.35, confidence - 0.12);
      }
    }

    if (world) {
      const owsPhysical = this.summarizeFromWorld(world);
      let operationalArbitration: OperationalArbitration | undefined;

      let typedSlices: import('../../world/contracts/operational-severity.contract').OperationalSlice[] = [];

      const runPipeline =
        input.gatherIcelandDomainSlices !== false &&
        world.physical.countryCode === 'IS' &&
        Boolean(input.tripId?.trim()) &&
        !!this.icelandPipeline;

      if (runPipeline) {
        try {
          const piped = await this.icelandPipeline!.run({
            tripId: input.tripId!.trim(),
            world,
          });
          typedSlices = piped.slices;
          icelandSlicesGathered = piped.gathered;
        } catch (e: any) {
          this.logger.warn(`[worldState.summarize] Iceland pipeline: ${e?.message ?? e}`);
        }
      }

      if (this.worldArbitrator) {
        operationalArbitration = this.worldArbitrator.arbitrate({
          operationalWorldState: owsPhysical,
          operationalSlices: typedSlices,
          route: input.routeBrief,
          vehiclePolicy: input.vehiclePolicy,
        });
      }

      const operationalWorldState: OperationalWorldState = {
        ...owsPhysical,
        confidence: Math.min(owsPhysical.confidence, confidence),
      };

      if (this.governanceLedger && operationalArbitration) {
        const l3 = worldArbitrationToGovernanceLedgerEvents({
          tripId: input.tripId?.trim(),
          operationalWorldState,
          operationalArbitration,
        });
        for (const ev of l3) {
          this.governanceLedger.appendEvent(ev);
        }
      }

      return {
        operationalWorldState,
        icelandSlicesGathered,
        operationalArbitration,
      };
    }

    if (input.slices && Object.keys(input.slices).length > 0) {
      this.logger.warn(
        '[worldState.summarize] legacy raw `slices` path — prefer tripId + IS pipeline + arbitration',
      );
      return {
        operationalWorldState: this.summarizeFromLegacyRawSlices(input.slices),
        icelandSlicesGathered: false,
      };
    }

    throw new Error('worldState.summarize: 需要提供 tripId、world 或 slices 之一');
  }

  /**
   * @deprecated 仅兼容外部仍传匿名 JSON 的调用方；不应再扩展启发式规则。
   */
  private summarizeFromLegacyRawSlices(slices: NonNullable<WorldStateSummarizeInput['slices']>): OperationalWorldState {
    const blockingFactors: string[] = [];
    const warnings: string[] = [];
    const recommendedPolicies: string[] = [];
    let score = 0;

    const pushFromUnknown = (label: string, blob: unknown) => {
      if (blob == null) return;
      const s = typeof blob === 'string' ? blob : JSON.stringify(blob).slice(0, 4000).toLowerCase();
      if (/\bclosed\b|封路|关闭|hard violation|violation['"]?\s*:\s*['"]hard/i.test(s)) {
        blockingFactors.push(`${label}:closure_or_hard`);
        score += 3;
      }
      if (/\b(high|severe|critical|橙色|红色)\b|storm|暴风|封山/i.test(s)) {
        warnings.push(`${label}:elevated`);
        score += 1;
      }
    };

    pushFromUnknown('road', slices.road);
    pushFromUnknown('weather', slices.weather);
    pushFromUnknown('safeTravel', slices.safeTravel);
    pushFromUnknown('rental', slices.rental);
    pushFromUnknown('daylight', slices.daylight);

    if (score >= 1) {
      recommendedPolicies.push('migrate_to_typed_operational_slices_and_pipeline');
    }

    const operationalRisk: OperationalRiskLevel =
      blockingFactors.length > 0 || score >= 4 ? 'high' : score >= 1 ? 'medium' : 'low';

    return {
      operationalRisk,
      blockingFactors: [...new Set(blockingFactors)],
      warnings: [...new Set(warnings)],
      recommendedPolicies: [...new Set(recommendedPolicies)],
      confidence: 0.45,
    };
  }

  private summarizeFromWorld(world: WorldModelContext): OperationalWorldState {
    const blockingFactors: string[] = [];
    const warnings: string[] = [];
    const recommendedPolicies: string[] = [];
    let score = 0;

    const physical = world.physical;
    const weather = physical.weatherEvidence || [];
    for (const w of weather) {
      if (w.violation === 'HARD') {
        blockingFactors.push(`weather_hard:${w.segmentId || 'unknown'}`);
        score += 3;
      } else if (w.violation === 'SOFT') {
        warnings.push(`weather_soft:${w.segmentId || 'unknown'}`);
        score += 1;
      }
      if ((w.windGustMs ?? w.windSpeedMs) > 20) {
        warnings.push('high_wind_segments');
        score += 1;
      }
    }

    for (const r of physical.roadStates || []) {
      if (r.status === 'CLOSED') {
        blockingFactors.push(`road_closed:${r.roadId}`);
        score += 3;
      } else if (r.status === 'RESTRICTED' || r.status === 'SEASONAL') {
        warnings.push(`road_${r.status.toLowerCase()}:${r.roadId}`);
        score += 1;
      }
      if (r.requires4x4) {
        recommendedPolicies.push('require_4x4_where_marked');
      }
    }

    for (const hz of physical.hazardZones || []) {
      if (hz.level === 'HIGH') {
        warnings.push(`hazard_high:${hz.zoneId}`);
        score += 2;
      } else if (hz.level === 'MEDIUM') {
        warnings.push(`hazard_medium:${hz.zoneId}`);
        score += 1;
      }
    }

    for (const d of physical.demEvidence || []) {
      if (d.violation === 'HARD') {
        blockingFactors.push(`dem_hard:${d.segmentId}`);
        score += 2;
      } else if (d.violation === 'SOFT') {
        warnings.push(`dem_soft:${d.segmentId}`);
        score += 1;
      }
    }

    const climate = physical.climateSeasonality;
    if (climate && typeof climate.accessibilityScore === 'number' && climate.accessibilityScore < 0.35) {
      warnings.push('low_seasonal_accessibility');
      score += 1;
      recommendedPolicies.push('prefer_flexible_itinerary_buffer');
    }

    const human = world.human;
    if (human?.riskTolerance === 'LOW' && score >= 2) {
      recommendedPolicies.push('bias_conservative_when_user_risk_low');
    }

    if (blockingFactors.length) {
      recommendedPolicies.push('block_execution_until_blockers_cleared');
    }

    const operationalRisk: OperationalRiskLevel =
      blockingFactors.length > 0 || score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';

    return {
      operationalRisk,
      blockingFactors: [...new Set(blockingFactors)],
      warnings: [...new Set(warnings)],
      recommendedPolicies: [...new Set(recommendedPolicies)],
      confidence: Math.max(0.4, 0.92 - score * 0.04),
    };
  }
}
