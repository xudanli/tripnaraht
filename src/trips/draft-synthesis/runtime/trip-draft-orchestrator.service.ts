import { Injectable } from '@nestjs/common';
import type { TripDraftContract } from '../contract/trip-draft-contract.types';
import type { DraftPipelineResult } from './draft-pipeline-result.types';
import { TripDraftService } from '../../services/trip-draft.service';

/**
 * 草案编排中枢：统一 contract → 管线；具体步骤委托 TripDraftService.runDraftPipeline。
 * 后续可把引擎选择 / repair loop 从此类展开，而不稀释 TripDraftService 的工具方法。
 */
@Injectable()
export class TripDraftOrchestratorService {
  constructor(private readonly tripDraftService: TripDraftService) {}

  async execute(
    contract: TripDraftContract,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
  ): Promise<DraftPipelineResult> {
    return this.tripDraftService.runDraftPipeline(contract, onProgress);
  }
}
