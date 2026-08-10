/**
 * Facade: Golden Set seed → arrange input for Initial Plan (no PlanVersion write).
 */

import { Injectable } from '@nestjs/common';
import type {
  InitialPlanArrangeInput,
  InitialPlanSeedInput,
  InitialPlanSeedResult,
} from '../types/iceland-initial-plan-seed.types';
import { IcelandInitialPlanSeedService } from './iceland-initial-plan-seed.service';
import { IcelandInitialPlanArrangeProjector } from './iceland-initial-plan-arrange-projector.service';
import {
  buildInitialPlanSeedInputFromCreate,
  type IcelandCreateSeedContext,
} from './iceland-initial-plan-create-bridge.util';

@Injectable()
export class IcelandInitialPlanPipelineService {
  constructor(
    private readonly seedService: IcelandInitialPlanSeedService,
    private readonly projector: IcelandInitialPlanArrangeProjector,
  ) {}

  /**
   * Create-path entry: DTO/context → Golden Set seed → arrange input.
   * Caller must still run Gate → Solver → Verify → Preview → Confirm → Apply.
   * Never writes PlanVersion.
   */
  async buildArrangeInputFromCreate(
    ctx: IcelandCreateSeedContext,
    opts?: { softAltMaxAttractions?: number },
  ): Promise<{
    seed: InitialPlanSeedResult;
    arrange: InitialPlanArrangeInput;
  }> {
    return this.buildArrangeInput(buildInitialPlanSeedInputFromCreate(ctx), opts);
  }

  async buildArrangeInput(
    input: InitialPlanSeedInput,
    opts?: { softAltMaxAttractions?: number },
  ): Promise<{
    seed: InitialPlanSeedResult;
    arrange: InitialPlanArrangeInput;
  }> {
    const seed = await this.seedService.seed(input);
    let arrange = this.projector.project(seed, input.tripId);
    if (opts?.softAltMaxAttractions != null) {
      arrange = this.projector.applySoftAlternativeTimePressure(arrange, {
        maxAttractions: opts.softAltMaxAttractions,
      });
    }
    // Safety contract
    if (arrange.writesPlanVersion !== false) {
      throw new Error('Initial Plan arrange input must not write PlanVersion');
    }
    if (arrange.requiresPreviewConfirmApply !== true) {
      throw new Error('Initial Plan must require Preview→Confirm→Apply');
    }
    for (const exp of arrange.experienceCandidates) {
      if (exp.status !== 'NEEDS_BOOKING_VERIFICATION' && exp.status !== 'DISCOVERED') {
        throw new Error(`Experience ${exp.experienceProductId} invalid status`);
      }
    }
    return { seed, arrange };
  }
}
