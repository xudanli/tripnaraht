import { Injectable } from '@nestjs/common';
import type { TripDraftContract } from '../contract/trip-draft-contract.types';
import type { DraftPipelineResult } from './draft-pipeline-result.types';
import { TripDraftOrchestratorService } from './trip-draft-orchestrator.service';

/**
 * 单内核入口：contract → stable pipeline result（决策运行时 façade）。
 */
@Injectable()
export class DraftRuntimeCore {
  constructor(private readonly orchestrator: TripDraftOrchestratorService) {}

  async generate(
    contract: TripDraftContract,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
  ): Promise<DraftPipelineResult> {
    return this.orchestrator.execute(contract, onProgress);
  }
}
