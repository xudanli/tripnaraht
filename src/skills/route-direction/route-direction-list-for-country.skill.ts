// src/skills/route-direction/route-direction-list-for-country.skill.ts
/**
 * skill.routeDirection.listForCountry
 * 
 * 用途：让 Agent 可以在「选线」之前，先知道有哪些候选 RouteDirection 可以玩。
 * 
 * 输入：countryCode + 可选：season, intentTags[], difficultyLevel
 * 输出：routeDirections[]（id、名字、长度、天数、核心体验标签、适合人群）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';

export interface RouteDirectionListForCountryInput extends SkillInput {
  /** 国家代码（ISO 3166-1 alpha-2） */
  countryCode: string;
  /** 季节（月份 1-12，可选） */
  season?: number;
  /** 用户意图标签（可选） */
  intentTags?: string[];
  /** 难度等级（可选） */
  difficultyLevel?: 'easy' | 'medium' | 'hard';
}

export interface RouteDirectionListForCountryOutput extends SkillOutput {
  /** 路线方向列表 */
  routeDirections: Array<{
    id: string;
    uuid: string;
    name: string;
    nameCN: string;
    nameEN?: string;
    /** 长度（公里） */
    distanceKm?: number;
    /** 推荐天数 */
    durationDays?: number;
    /** 核心体验标签 */
    tags: string[];
    /** 适合人群 */
    suitableFor: string[];
    /** 描述 */
    description?: string;
    /** 难度等级 */
    difficulty?: string;
  }>;
}

@Injectable()
export class RouteDirectionListForCountrySkill implements Skill<RouteDirectionListForCountryInput, RouteDirectionListForCountryOutput> {
  private readonly logger = new Logger(RouteDirectionListForCountrySkill.name);

  metadata = {
    name: 'routeDirection.listForCountry',
    description: 'routeDirection.listForCountry：列出指定国家可用的路线方向，包括基本信息、标签和适合人群',
    version: '1.0.0',
    category: 'routeDirection' as const,
  };

  constructor(
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
  ) {}

  async execute(input: RouteDirectionListForCountryInput): Promise<RouteDirectionListForCountryOutput> {
    this.logger.debug(`执行 routeDirection.listForCountry: countryCode=${input.countryCode}, season=${input.season || 'all'}`);

    try {
      if (!this.routeDirectionsService) {
        this.logger.warn('RouteDirectionsService 不可用，返回空列表');
        return {
          routeDirections: [],
        };
      }

      // 1. 查询路线方向
      const results = await this.routeDirectionsService.findRouteDirectionsByCountry(
        input.countryCode,
        {
          tags: input.intentTags,
          month: input.season,
          limit: 50, // 返回更多结果
        }
      );

      // 2. 转换为输出格式
      const routeDirections = results.active.map(rd => {
        // 提取推荐天数（从 RouteTemplate 或 metadata）
        const durationDays = this.extractDurationDays(rd);
        
        // 提取距离
        const distanceKm = this.extractDistanceKm(rd);

        // 提取适合人群
        const suitableFor = this.extractSuitableFor(rd, input.difficultyLevel);

        // 提取难度
        const difficulty = this.extractDifficulty(rd);

        return {
          id: String(rd.id),
          uuid: rd.uuid,
          name: rd.name,
          nameCN: rd.nameCN,
          nameEN: rd.nameEN || undefined,
          distanceKm: distanceKm || undefined,
          durationDays: durationDays || undefined,
          tags: rd.tags || [],
          suitableFor,
          description: rd.description || undefined,
          difficulty,
        };
      });

      return {
        routeDirections,
      };
    } catch (error: any) {
      this.logger.error(`列出路线方向失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private extractDurationDays(rd: any): number | null {
    // 从 RouteTemplate 中提取（如果有）
    if (rd.RouteTemplate && rd.RouteTemplate.length > 0) {
      const durations = rd.RouteTemplate.map((t: any) => t.durationDays).filter((d: any) => d);
      if (durations.length > 0) {
        return Math.min(...durations); // 返回最短天数
      }
    }

    // 从 metadata 中提取
    const metadata = rd.metadata as any;
    if (metadata?.durationDays) {
      return metadata.durationDays;
    }

    return null;
  }

  private extractDistanceKm(rd: any): number | null {
    // 从 metadata 中提取
    const metadata = rd.metadata as any;
    if (metadata?.distanceKm) {
      return metadata.distanceKm;
    }

    // 从 corridorGeom 计算（如果可用）
    // TODO: 如果 corridorGeom 可用，可以计算长度
    // 这里简化处理

    return null;
  }

  private extractSuitableFor(rd: any, requestedDifficulty?: string): string[] {
    const suitableFor: string[] = [];
    const tags = rd.tags || [];

    // 基于标签判断
    if (tags.includes('family-friendly') || tags.includes('easy')) {
      suitableFor.push('家庭游');
    }
    if (tags.includes('adventure') || tags.includes('hiking')) {
      suitableFor.push('探险爱好者');
    }
    if (tags.includes('photography') || tags.includes('scenic')) {
      suitableFor.push('摄影爱好者');
    }
    if (tags.includes('culture') || tags.includes('history')) {
      suitableFor.push('文化探索者');
    }

    // 基于难度
    const difficulty = this.extractDifficulty(rd);
    if (difficulty === 'easy') {
      suitableFor.push('新手');
    } else if (difficulty === 'hard') {
      suitableFor.push('经验丰富者');
    }

    // 如果指定了难度要求，进行过滤
    if (requestedDifficulty) {
      if (requestedDifficulty === 'easy' && difficulty !== 'easy') {
        return [];
      }
      if (requestedDifficulty === 'hard' && difficulty !== 'hard') {
        return [];
      }
    }

    // 如果没有匹配的，返回通用描述
    if (suitableFor.length === 0) {
      suitableFor.push('一般旅行者');
    }

    return suitableFor;
  }

  private extractDifficulty(rd: any): string {
    const tags = rd.tags || [];
    const metadata = rd.metadata as any;

    // 从标签判断
    if (tags.includes('easy') || tags.includes('family-friendly')) {
      return 'easy';
    }
    if (tags.includes('hard') || tags.includes('expert') || tags.includes('challenging')) {
      return 'hard';
    }

    // 从 metadata 判断
    if (metadata?.difficulty) {
      return metadata.difficulty.toLowerCase();
    }

    // 从 riskProfile 判断
    const riskProfile = rd.riskProfile as any;
    if (riskProfile?.level === 'high' || riskProfile?.level === 'very-high') {
      return 'hard';
    }
    if (riskProfile?.level === 'low') {
      return 'easy';
    }

    return 'medium';
  }
}

