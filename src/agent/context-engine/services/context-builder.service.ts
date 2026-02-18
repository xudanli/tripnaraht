/**
 * Context Builder Service
 *
 * Phase 1: Context Engine 工业化 - 组装原始 blocks 的门面
 * 职责：对外暴露 buildBlocks，委托 ContextEngineerService.buildRawBlocks
 *
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { Injectable, Optional } from '@nestjs/common';
import { ContextPackageOptions } from '../types/context-package.types';
import {
  ContextBuilderOutput,
  IContextBuilder,
} from '../interfaces/context-builder.interface';
import { ContextEngineerService } from './context-engineer.service';

@Injectable()
export class ContextBuilderService implements IContextBuilder {
  constructor(
    @Optional() private readonly contextEngineer?: ContextEngineerService,
  ) {}

  /**
   * 组装原始 blocks（未排序、未裁剪）
   * 输出供 ContextRanker / ContextCompressor 消费
   */
  async buildBlocks(options: ContextPackageOptions): Promise<ContextBuilderOutput> {
    if (!this.contextEngineer) {
      return { blocks: [], skillsCalled: [], toolAllowlist: [] };
    }
    return this.contextEngineer.buildRawBlocks(options);
  }
}
