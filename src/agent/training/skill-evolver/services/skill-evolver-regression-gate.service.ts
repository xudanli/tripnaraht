import { Injectable, Logger } from '@nestjs/common';
import type { SkillEvolverRegressionGateResult } from '../interfaces/skill-evolver.types';

@Injectable()
export class SkillEvolverRegressionGateService {
  private readonly logger = new Logger(SkillEvolverRegressionGateService.name);

  /**
   * 轻量回归门禁（技能文本进化专用，非 RL policy gate）。
   */
  check(params: {
    baselineScore: number;
    candidateScore: number;
    minScoreDelta: number;
    auditPassed: boolean;
    minPassRate?: number;
  }): SkillEvolverRegressionGateResult {
    const reasons: string[] = [];
    const delta = params.candidateScore - params.baselineScore;

    if (!params.auditPassed) {
      reasons.push('独立审计未通过');
    }
    if (delta < params.minScoreDelta) {
      reasons.push(`分数提升不足: delta=${delta.toFixed(2)} < min=${params.minScoreDelta}`);
    }
    const minRate = params.minPassRate ?? 0;
    if (params.candidateScore < minRate * 100) {
      reasons.push(`候选分数 ${params.candidateScore} 低于最低通过率 ${minRate * 100}`);
    }

    const passed = reasons.length === 0;
    this.logger.log(
      `[RegressionGate] passed=${passed} baseline=${params.baselineScore} candidate=${params.candidateScore}`,
    );
    return { passed, reasons };
  }
}
