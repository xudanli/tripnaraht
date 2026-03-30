// src/trips/decision/tot/beam-search.service.ts

/**
 * ToT Beam Search 服务
 * 
 * 在复杂场景下，生成多个候选方案并使用 ToT 评分器选择最优
 */

import { Injectable, Logger } from '@nestjs/common';
import { ToTEvaluatorService } from './tot-evaluator.service';
import { ThoughtNode } from './tot-evaluator.interface';
import { ToTScoreResult } from './score-result';
import { TripPlan } from '../plan-model';

/**
 * Beam Search 配置
 */
export interface BeamSearchConfig {
  /** Beam 宽度（每层保留的候选数） */
  beamWidth?: number;
  /** 最大深度 */
  maxDepth?: number;
  /** 时间预算（毫秒） */
  timeBudgetMs?: number;
}

/**
 * Beam Search 结果
 */
export interface BeamSearchResult {
  /** 最优候选 */
  best: ThoughtNode | null;
  /** 最优得分 */
  bestScore: number;
  /** 所有候选及其得分 */
  candidates: Array<{ node: ThoughtNode; score: ToTScoreResult }>;
  /** 搜索统计 */
  stats: {
    totalEvaluated: number;
    totalRejected: number;
    depth: number;
  };
}

@Injectable()
export class BeamSearchService {
  private readonly logger = new Logger(BeamSearchService.name);

  constructor(private readonly evaluator: ToTEvaluatorService) {}

  /**
   * 执行 Beam Search
   * 
   * @param root 根节点
   * @param expand 扩展函数：生成子节点
   * @param config 配置
   */
  async search(
    root: ThoughtNode,
    expand: (nodes: ThoughtNode[]) => Promise<ThoughtNode[]>,
    config: BeamSearchConfig = {}
  ): Promise<BeamSearchResult> {
    const {
      beamWidth = 4,
      maxDepth = 3,
      timeBudgetMs = 1200,
    } = config;

    const startTime = Date.now();
    let frontier: ThoughtNode[] = [root];
    let totalEvaluated = 0;
    let totalRejected = 0;

    for (let depth = 0; depth < maxDepth; depth++) {
      // 检查时间预算
      if (Date.now() - startTime > timeBudgetMs) {
        this.logger.warn(`Beam Search 超时，在深度 ${depth} 停止`);
        break;
      }

      // 1) 评估本层候选
      const scored = await Promise.all(
        frontier.map(async (node) => {
          const score = await this.evaluator.evaluate(node);
          totalEvaluated++;
          if (!score.allowed) {
            totalRejected++;
          }
          return { node, score };
        })
      );

      // 2) 过滤 hard gate
      const allowed = scored.filter(x => x.score.allowed);

      if (allowed.length === 0) {
        this.logger.warn(`Beam Search 在深度 ${depth} 时所有候选被硬门控拒绝`);
        break;
      }

      // 3) 排序取 TopK
      allowed.sort((a, b) => b.score.score - a.score.score);
      const topK = allowed.slice(0, beamWidth).map(x => x.node);

      // 4) 扩展生成下一层
      frontier = await expand(topK);

      if (frontier.length === 0) {
        this.logger.debug(`Beam Search 在深度 ${depth} 时无法继续扩展`);
        break;
      }
    }

    // 评估最终层
    const finalScored = await Promise.all(
      frontier.map(async (node) => {
        const score = await this.evaluator.evaluate(node);
        totalEvaluated++;
        if (!score.allowed) {
          totalRejected++;
        }
        return { node, score };
      })
    );

    const finalAllowed = finalScored.filter(x => x.score.allowed);
    if (finalAllowed.length === 0) {
      return {
        best: null,
        bestScore: 0,
        candidates: finalScored,
        stats: {
          totalEvaluated,
          totalRejected,
          depth: maxDepth,
        },
      };
    }

    finalAllowed.sort((a, b) => b.score.score - a.score.score);
    const best = finalAllowed[0];

    return {
      best: best.node,
      bestScore: best.score.score,
      candidates: finalScored,
      stats: {
        totalEvaluated,
        totalRejected,
        depth: maxDepth,
      },
    };
  }

  /**
   * 简单扩展器：从 Neptune 的多个替换候选中选择
   * 
   * 示例：Neptune 发现一个问题，有 3 个替换候选，生成 3 个子节点
   */
  async expandFromNeptuneCandidates(
    parent: ThoughtNode,
    candidates: Array<{ plan: TripPlan; explanation: string }>
  ): Promise<ThoughtNode[]> {
    return candidates.map((candidate, index) => ({
      ...parent,
      id: `${parent.id}_${index}`,
      parentId: parent.id,
      depth: parent.depth + 1,
      plan: candidate.plan,
      operator: 'NEPTUNE_REPAIR',
      rationale: candidate.explanation,
    }));
  }
}

