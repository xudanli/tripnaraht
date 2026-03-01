/**
 * 决策系统统一学习方程服务
 *
 * 专利 3.13.15：θ_{k+1} = θ_k − η ∇_θ L
 * 通过 Weight Learning、Policy Learning、Feedback Learning 形成闭环
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.15
 */

import { Injectable } from '@nestjs/common';
import {
  IUnifiedLearningService,
  UnifiedLearningInput,
  UnifiedLearningOutput,
} from './unified-learning.interface';

@Injectable()
export class UnifiedLearningService implements IUnifiedLearningService {
  /**
   * 参数更新：θ_{k+1} = θ_k − η ∇_θ L
   */
  updateParameters(input: UnifiedLearningInput): UnifiedLearningOutput {
    const { theta = {}, learningRate = 0.01, gradient = {} } = input;
    if (Object.keys(gradient).length === 0) {
      return { theta: { ...theta }, updated: false };
    }
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(theta)) {
      const g = gradient[k] ?? 0;
      next[k] = Math.max(0, Math.min(1, v - learningRate * g));
    }
    for (const [k, g] of Object.entries(gradient)) {
      if (!(k in next)) {
        next[k] = Math.max(0, Math.min(1, 0.5 - learningRate * g));
      }
    }
    return { theta: next, updated: true };
  }
}
