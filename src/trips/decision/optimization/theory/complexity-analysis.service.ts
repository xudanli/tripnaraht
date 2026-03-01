/**
 * 决策复杂度分析服务
 *
 * 专利 4.14.2 定理 6：Time Complexity = O(N·ρ·H)
 *
 * 参考：docs/Decision_OS_技术交底书.md 4.14.2
 */

import { Injectable } from '@nestjs/common';
import {
  IComplexityAnalysisService,
  ComplexityReport,
} from './complexity-analysis.interface';

@Injectable()
export class ComplexityAnalysisService implements IComplexityAnalysisService {
  /**
   * 估计复杂度：O(N·ρ·H)
   * ops ≈ N * (1 + ρ * H) 表示：可行域投影 O(N) + 对可行候选的 H 步推演 O(ρ·N·H)
   */
  estimateComplexity(
    nCandidates: number,
    nFeasible: number,
    horizon = 3,
  ): ComplexityReport {
    const rho = nCandidates > 0 ? nFeasible / nCandidates : 0;
    const estimatedOps = Math.ceil(nCandidates * (1 + rho * horizon));
    return {
      nCandidates,
      nFeasible,
      rho,
      horizon,
      estimatedOps,
      complexityClass: 'O(N·ρ·H)',
    };
  }
}
