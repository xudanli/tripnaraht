// src/skills/country-pack/country-pack-rank-blocks.skill.ts
/**
 * tripnara.countryPack.rankBlocks
 * 
 * P1: 国家包块排序
 * 
 * 输入：query, phase, intent
 * 输出：按相关性排序的块列表
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';

export interface CountryPackRankBlocksInput extends SkillInput {
  /** 查询文本 */
  query: string;
  
  /** 规划阶段 */
  phase: string;
  
  /** 用户意图 */
  intent?: string;
  
  /** 需要排序的块列表 */
  blocks: ContextBlock[];
}

export interface CountryPackRankBlocksOutput extends SkillOutput {
  /** 排序后的块列表 */
  rankedBlocks: ContextBlock[];
  
  /** 相关性分数（0-100） */
  scores: Array<{
    key: string;
    score: number;
    reasons: string[];
  }>;
}

@Injectable()
export class CountryPackRankBlocksSkill implements Skill<CountryPackRankBlocksInput, CountryPackRankBlocksOutput> {
  private readonly logger = new Logger(CountryPackRankBlocksSkill.name);

  metadata = {
    name: 'countryPack.rankBlocks',
    description: 'countryPack.rankBlocks：国家包块排序：根据 query、phase、intent 对块进行相关性排序',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  async execute(input: CountryPackRankBlocksInput): Promise<CountryPackRankBlocksOutput> {
    this.logger.debug(
      `执行 countryPack.rankBlocks: query=${input.query.substring(0, 50)}..., phase=${input.phase}, blocks=${input.blocks.length}`,
    );

    try {
      // 1. 为每个块计算相关性分数
      const scoredBlocks = input.blocks.map((block) => {
        const { score, reasons } = this.calculateRelevanceScore(block, input.query, input.phase, input.intent);
        return {
          block,
          score,
          reasons,
        };
      });

      // 2. 按分数排序
      scoredBlocks.sort((a, b) => b.score - a.score);

      // 3. 构建输出
      const rankedBlocks = scoredBlocks.map((item) => {
        // 更新优先级（基于相关性）
        return {
          ...item.block,
          priority: Math.max(item.block.priority, item.score),
        };
      });

      const scores = scoredBlocks.map((item) => ({
        key: item.block.key,
        score: item.score,
        reasons: item.reasons,
      }));

      return {
        rankedBlocks,
        scores,
      };
    } catch (error: any) {
      this.logger.error(`国家包块排序失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 计算相关性分数
   */
  private calculateRelevanceScore(
    block: ContextBlock,
    query: string,
    phase: string,
    intent?: string,
  ): { score: number; reasons: string[] } {
    let score = block.priority; // 基础分数
    const reasons: string[] = [];

    const queryLower = query.toLowerCase();
    const blockTextLower = block.text.toLowerCase();
    const blockKeyLower = block.key.toLowerCase();

    // 1. 关键词匹配（query 与 block 文本）
    const queryWords = queryLower.split(/\s+/);
    const matchedWords = queryWords.filter((word) => blockTextLower.includes(word) || blockKeyLower.includes(word));
    if (matchedWords.length > 0) {
      score += matchedWords.length * 10;
      reasons.push(`匹配关键词: ${matchedWords.join(', ')}`);
    }

    // 2. Phase 匹配（不同 phase 需要不同的块）
    const phaseBlockMap: Record<string, string[]> = {
      planning: ['COUNTRY_VISA', 'COUNTRY_SAFETY', 'COUNTRY_WEATHER'],
      decision: ['COUNTRY_ROAD_RULES', 'COUNTRY_SAFETY', 'ABU_RULES'],
      adjustment: ['COUNTRY_ROAD_RULES', 'COUNTRY_TRANSPORT'],
      repair: ['COUNTRY_ROAD_RULES', 'COUNTRY_BOOKING'],
      readiness: ['COUNTRY_VISA', 'COUNTRY_MONEY', 'COUNTRY_TRANSPORT'],
    };

    const phaseKey = phase.toLowerCase();
    const relevantTypes = phaseBlockMap[phaseKey] || [];
    if (relevantTypes.some((type) => block.type.includes(type))) {
      score += 20;
      reasons.push(`匹配规划阶段: ${phase}`);
    }

    // 3. Intent 匹配（如果有意图）
    if (intent) {
      const intentLower = intent.toLowerCase();
      const intentBlockMap: Record<string, string[]> = {
        visa: ['COUNTRY_VISA'],
        drone: ['COUNTRY_DRONE'],
        road: ['COUNTRY_ROAD_RULES'],
        money: ['COUNTRY_MONEY'],
        safety: ['COUNTRY_SAFETY'],
        weather: ['COUNTRY_WEATHER'],
        transport: ['COUNTRY_TRANSPORT'],
        booking: ['COUNTRY_BOOKING'],
      };

      for (const [intentKey, blockTypes] of Object.entries(intentBlockMap)) {
        if (intentLower.includes(intentKey)) {
          if (blockTypes.some((type) => block.type.includes(type))) {
            score += 25;
            reasons.push(`匹配用户意图: ${intentKey}`);
            break;
          }
        }
      }
    }

    // 4. 类型优先级（硬规则优先）
    const typePriority: Record<string, number> = {
      COUNTRY_SAFETY: 15,
      COUNTRY_ROAD_RULES: 15,
      ABU_RULES: 15,
      COUNTRY_VISA: 10,
      COUNTRY_WEATHER: 10,
      COUNTRY_DRONE: 5,
      COUNTRY_MONEY: 5,
      COUNTRY_TRANSPORT: 5,
      COUNTRY_BOOKING: 5,
    };

    if (typePriority[block.type]) {
      score += typePriority[block.type];
      reasons.push(`类型优先级: ${block.type}`);
    }

    // 限制在 0-100 范围内
    score = Math.min(100, Math.max(0, score));

    return { score, reasons };
  }
}