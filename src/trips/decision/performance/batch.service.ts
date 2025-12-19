// src/trips/decision/performance/batch.service.ts

/**
 * 性能优化：批量计算
 */

import { Injectable, Logger } from '@nestjs/common';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';

@Injectable()
export class BatchProcessingService {
  private readonly logger = new Logger(BatchProcessingService.name);

  /**
   * 批量生成计划
   */
  async batchGeneratePlans(
    states: TripWorldState[],
    generator: (state: TripWorldState) => Promise<{ plan: TripPlan; log: any }>
  ): Promise<Array<{ state: TripWorldState; plan: TripPlan; log: any }>> {
    this.logger.log(`Batch generating ${states.length} plans`);

    const results = await Promise.all(
      states.map(async state => {
        try {
          const { plan, log } = await generator(state);
          return { state, plan, log };
        } catch (error) {
          this.logger.error(`Failed to generate plan for state:`, error);
          return null;
        }
      })
    );

    const validResults = results.filter(
      (r): r is { state: TripWorldState; plan: TripPlan; log: any } =>
        r !== null
    );

    this.logger.log(
      `Batch generation completed: ${validResults.length}/${states.length} succeeded`
    );

    return validResults;
  }

  /**
   * 批量校验约束
   */
  async batchCheckConstraints(
    plans: Array<{ plan: TripPlan; state: TripWorldState }>,
    checker: (state: TripWorldState, plan: TripPlan) => any
  ): Promise<Array<{ plan: TripPlan; result: any }>> {
    this.logger.log(`Batch checking ${plans.length} plans`);

    const results = await Promise.all(
      plans.map(async ({ plan, state }) => {
        try {
          const result = checker(state, plan);
          return { plan, result };
        } catch (error) {
          this.logger.error(`Failed to check constraints:`, error);
          return { plan, result: null };
        }
      })
    );

    return results;
  }

  /**
   * 批量评估
   */
  async batchEvaluate(
    plans: Array<{ plan: TripPlan; state: TripWorldState; constraintResult: any }>,
    evaluator: (state: TripWorldState, plan: TripPlan, constraintResult: any) => any
  ): Promise<Array<{ plan: TripPlan; metrics: any }>> {
    this.logger.log(`Batch evaluating ${plans.length} plans`);

    const results = await Promise.all(
      plans.map(async ({ plan, state, constraintResult }) => {
        try {
          const metrics = evaluator(state, plan, constraintResult);
          return { plan, metrics };
        } catch (error) {
          this.logger.error(`Failed to evaluate plan:`, error);
          return { plan, metrics: null };
        }
      })
    );

    return results;
  }
}

