import { Injectable } from '@nestjs/common';
import type { ResearchAssetScope } from '../../utils/research-asset-scope.util';
import { isResearchAssetScope } from '../../utils/research-asset-scope.util';
import { HotelResearchMember } from './hotel-research.member';
import { FlightResearchMember } from './flight-research.member';
import { TransportResearchMember } from './transport-research.member';
import { DestinationResearchMember } from './destination-research.member';
import { ComplianceResearchMember } from './compliance-research.member';
import type { IResearchMember } from './research-member.interface';
import type { ResearchTopologyPlan } from './research-topology.types';

/**
 * MAT 3.0：Member 注册表（destination / hotel / flight / transport / compliance）。
 */
@Injectable()
export class ResearchMemberRegistry {
  constructor(
    public readonly destination: DestinationResearchMember,
    public readonly hotel: HotelResearchMember,
    public readonly flight: FlightResearchMember,
    public readonly transport: TransportResearchMember,
    public readonly compliance: ComplianceResearchMember,
  ) {}

  /**
   * 按研究执行模式生成拓扑（单轨入口）：transport_only / full / scoped_partial。
   * - full：与 Monolith 一致，先 transport（preParallel），再并行 destination（hotel/flight 仍由 scoped 触发，不在 full 默认并行中）。
   * - scoped_partial：`buildTopologyPlan(scopes)` + 无 preParallel。
   */
  buildTopologyPlanForResearchExecution(args: {
    effectiveMode: 'full' | 'transport_only' | 'scoped_partial';
    scopesForTopology: readonly ResearchAssetScope[];
    hasTrip: boolean;
  }): ResearchTopologyPlan {
    const { effectiveMode, scopesForTopology, hasTrip } = args;
    if (!hasTrip) {
      return { parallel: [], sequential: [] };
    }
    if (effectiveMode === 'transport_only') {
      return { parallel: [], sequential: [{ id: this.transport.memberId, kind: 'transport' }] };
    }
    if (effectiveMode === 'full') {
      return {
        preParallelSequential: [{ id: this.transport.memberId, kind: 'transport' }],
        parallel: [{ id: this.destination.memberId, kind: 'destination' }],
        sequential: [{ id: this.compliance.memberId, kind: 'compliance' }],
      };
    }
    return this.buildTopologyPlan(scopesForTopology);
  }

  /**
   * 将任意 scope 列表规范为资产域（丢弃非 ResearchAssetScope 字符串，避免污染拓扑）。
   */
  static normalizeScopesForTopology(raw: readonly string[] | undefined): ResearchAssetScope[] {
    if (!raw?.length) return [];
    return raw.filter((s): s is ResearchAssetScope => isResearchAssetScope(s));
  }

  /**
   * 拓扑：destination（含 compliance 触发的大包）与 hotel、flight 并行；
   * transport 串行；compliance（SafeTravel 等）始终排在 sequential 最后。
   */
  buildTopologyPlan(scopes: readonly ResearchAssetScope[]): ResearchTopologyPlan {
    const parallel: ResearchTopologyPlan['parallel'] = [];
    if (scopes.includes('destination') || scopes.includes('compliance')) {
      parallel.push({ id: this.destination.memberId, kind: 'destination' });
    }
    if (scopes.includes('hotel')) parallel.push({ id: this.hotel.memberId, kind: 'hotel' });
    if (scopes.includes('flight')) parallel.push({ id: this.flight.memberId, kind: 'flight' });
    const sequential: ResearchTopologyPlan['sequential'] = [];
    if (scopes.includes('transport')) {
      sequential.push({ id: this.transport.memberId, kind: 'transport' });
    }
    if (scopes.includes('compliance')) {
      sequential.push({ id: this.compliance.memberId, kind: 'compliance' });
    }
    return { parallel, sequential };
  }

  /** 与 `researchScopesToRecompute` 对齐：返回本进程已注册的 Member id（用于审计 / 观测）。 */
  memberIdsForScopes(scopes: readonly ResearchAssetScope[] | undefined): string[] {
    if (!scopes?.length) return [];
    const ids: string[] = [];
    if (scopes.includes('destination') || scopes.includes('compliance')) {
      ids.push(this.destination.memberId);
    }
    if (scopes.includes('hotel')) ids.push(this.hotel.memberId);
    if (scopes.includes('flight')) ids.push(this.flight.memberId);
    if (scopes.includes('transport')) ids.push(this.transport.memberId);
    if (scopes.includes('compliance')) ids.push(this.compliance.memberId);
    return ids;
  }

  membersForScopes(scopes: readonly ResearchAssetScope[] | undefined): IResearchMember[] {
    if (!scopes?.length) return [];
    const out: IResearchMember[] = [];
    if (scopes.includes('hotel')) out.push(this.hotel);
    if (scopes.includes('flight')) out.push(this.flight);
    return out;
  }
}
