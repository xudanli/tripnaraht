/**
 * Experience Routing Policy — Nest 可注入门面（CGUS / VRPTW 共用）。
 */
import { Injectable, Optional } from '@nestjs/common';
import { MetaPolicyService } from '../optimization/meta/meta-policy.service';
import {
  EXPERIENCE_FLOW_SCHEMA_V1,
  type ExperienceFlowModel,
} from '../models/experience-flow.model';
import {
  computeGeneralizedEdgeCost,
  resolveExperienceRoutingWeights,
  type EdgeRoutingInput,
  type ExperienceRoutingMode,
  type ExperienceRoutingWeights,
} from './experience-routing-policy';

export interface EdgeMetrics {
  physicalTimeMs: number;
  frictionScore: number;
  informationGain: number;
}

export type DynamicRoutingWeights = {
  w1: number;
  w2: number;
  beta: number;
};

@Injectable()
export class ExperienceRoutingPolicyService {
  constructor(@Optional() private readonly metaPolicyService?: MetaPolicyService) {}

  getDynamicWeights(
    flowContext?: ExperienceFlowModel,
    mode?: ExperienceRoutingMode,
  ): DynamicRoutingWeights {
    if (this.metaPolicyService) {
      return this.metaPolicyService.getDynamicWeights(flowContext, mode);
    }
    const w = resolveExperienceRoutingWeights({ experienceFlow: flowContext, mode });
    return { w1: w.wPhysicalTime, w2: w.wFriction, beta: w.betaInformationGain };
  }

  resolveWeights(
    flowContext?: ExperienceFlowModel,
    mode?: ExperienceRoutingMode,
  ): ExperienceRoutingWeights {
    const { w1, w2, beta } = this.getDynamicWeights(flowContext, mode);
    return {
      wPhysicalTime: w1,
      wFriction: w2,
      betaInformationGain: beta,
    };
  }

  /**
   * Cost(i,j) = w1·Time(min) + w2·Friction − β·IG
   */
  computeGeneralizedEdgeCost(
    metrics: EdgeMetrics | EdgeRoutingInput,
    flowContext?: ExperienceFlowModel,
    mode?: ExperienceRoutingMode,
  ): number {
    const { w1, w2, beta } = this.getDynamicWeights(flowContext, mode);
    const physicalTimeMin =
      'physicalTimeMin' in metrics
        ? metrics.physicalTimeMin
        : Math.max(0, metrics.physicalTimeMs) / 60_000;
    const input: EdgeRoutingInput = {
      physicalTimeMin,
      frictionScore: metrics.frictionScore,
      informationGain: metrics.informationGain,
    };
    const cost =
      w1 * input.physicalTimeMin +
      w2 * input.frictionScore -
      beta * input.informationGain;
    return Math.max(0.1, cost);
  }

  balancedFallbackFlow(): ExperienceFlowModel {
    return {
      schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
      tempo: 'BALANCED',
      heterogeneityIndex: 0.55,
      surpriseBuffer: 0.2,
      currentFrictionCapacity: 0.58,
      narrativeTone: 'balanced_warm',
    };
  }
}
