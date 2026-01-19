// src/agent/assistants/shared/services/recommendation-engine.service.ts

/**
 * RecommendationEngineService
 * 
 * 推荐引擎服务：基于多因素的智能推荐算法
 * 
 * 评分维度：
 * - 预算匹配度 (0-25分)
 * - 季节适合度 (0-20分)
 * - 偏好匹配度 (0-25分)
 * - 人数适合度 (0-15分)
 * - 热门程度 (0-15分)
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UserPreferences, DestinationRecommendation } from '../../planning-assistant/interfaces/planning-assistant.interface';

export interface RecommendationInput {
  preferences: UserPreferences;
  limit?: number;
  excludeDestinations?: string[];
}

export interface ScoredDestination {
  destination: DestinationRecommendation;
  scores: {
    budget: number;
    season: number;
    preference: number;
    travelers: number;
    popularity: number;
    total: number;
  };
  matchReasons: string[];
  matchReasonsCN: string[];
}

@Injectable()
export class RecommendationEngineService {
  private readonly logger = new Logger(RecommendationEngineService.name);

  // 季节数据（月份 -> 最佳目的地类型）
  private readonly seasonalPreferences: Record<number, string[]> = {
    1: ['tropical', 'ski', 'city'],      // 一月：热带、滑雪、城市
    2: ['tropical', 'ski', 'city'],      // 二月
    3: ['cherry_blossom', 'city', 'nature'], // 三月：樱花、城市、自然
    4: ['cherry_blossom', 'nature', 'city'], // 四月
    5: ['nature', 'beach', 'city'],      // 五月
    6: ['beach', 'nature', 'adventure'], // 六月
    7: ['beach', 'nature', 'adventure'], // 七月
    8: ['beach', 'nature', 'adventure'], // 八月
    9: ['nature', 'aurora', 'city'],     // 九月：自然、极光
    10: ['autumn', 'city', 'nature'],    // 十月：秋色
    11: ['autumn', 'city', 'tropical'],  // 十一月
    12: ['tropical', 'ski', 'christmas'], // 十二月
  };

  // 目的地标签数据
  private readonly destinationTags: Record<string, {
    tags: string[];
    bestMonths: number[];
    budgetLevel: 'low' | 'medium' | 'high' | 'luxury';
    idealTravelers: string[];
    popularity: number;
  }> = {
    'iceland': {
      tags: ['nature', 'aurora', 'adventure', 'photography'],
      bestMonths: [9, 10, 11, 12, 1, 2, 3, 6, 7, 8],
      budgetLevel: 'high',
      idealTravelers: ['couple', 'friends', 'solo'],
      popularity: 85,
    },
    'japan': {
      tags: ['culture', 'food', 'city', 'cherry_blossom', 'autumn'],
      bestMonths: [3, 4, 5, 10, 11],
      budgetLevel: 'medium',
      idealTravelers: ['couple', 'family', 'solo', 'friends'],
      popularity: 95,
    },
    'newzealand': {
      tags: ['nature', 'adventure', 'hiking', 'beach'],
      bestMonths: [11, 12, 1, 2, 3],
      budgetLevel: 'high',
      idealTravelers: ['couple', 'friends', 'adventure'],
      popularity: 80,
    },
    'thailand': {
      tags: ['beach', 'tropical', 'food', 'budget', 'culture'],
      bestMonths: [11, 12, 1, 2, 3],
      budgetLevel: 'low',
      idealTravelers: ['solo', 'couple', 'friends', 'family'],
      popularity: 90,
    },
    'italy': {
      tags: ['culture', 'food', 'city', 'history', 'art'],
      bestMonths: [4, 5, 6, 9, 10],
      budgetLevel: 'medium',
      idealTravelers: ['couple', 'family', 'friends'],
      popularity: 92,
    },
    'switzerland': {
      tags: ['nature', 'ski', 'hiking', 'city', 'luxury'],
      bestMonths: [6, 7, 8, 9, 12, 1, 2],
      budgetLevel: 'luxury',
      idealTravelers: ['couple', 'family'],
      popularity: 88,
    },
    'maldives': {
      tags: ['beach', 'tropical', 'luxury', 'honeymoon', 'diving'],
      bestMonths: [1, 2, 3, 4, 11, 12],
      budgetLevel: 'luxury',
      idealTravelers: ['couple', 'honeymoon'],
      popularity: 87,
    },
    'spain': {
      tags: ['culture', 'food', 'city', 'beach', 'history'],
      bestMonths: [4, 5, 6, 9, 10],
      budgetLevel: 'medium',
      idealTravelers: ['couple', 'friends', 'solo', 'family'],
      popularity: 91,
    },
  };

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('推荐引擎服务已初始化');
  }

  /**
   * 获取智能推荐
   */
  async getRecommendations(input: RecommendationInput): Promise<ScoredDestination[]> {
    const { preferences, limit = 5, excludeDestinations = [] } = input;

    // 1. 获取候选目的地
    let candidates = await this.getCandidates(excludeDestinations);

    // 2. 为每个候选计算分数
    const scoredCandidates = candidates.map(candidate => 
      this.scoreDestination(candidate, preferences)
    );

    // 3. 排序并返回
    return scoredCandidates
      .sort((a, b) => b.scores.total - a.scores.total)
      .slice(0, limit);
  }

  /**
   * 获取候选目的地
   */
  private async getCandidates(excludeDestinations: string[]): Promise<DestinationRecommendation[]> {
    const candidates: DestinationRecommendation[] = [];

    // 从内置数据获取
    for (const [id, data] of Object.entries(this.destinationTags)) {
      if (excludeDestinations.includes(id)) continue;

      candidates.push(this.createDestinationFromTags(id, data));
    }

    // 尝试从数据库获取更多
    if (this.prisma) {
      try {
        const packs = await this.prisma.readinessPack.findMany({
          where: {
            isActive: true,
            packId: { notIn: excludeDestinations },
          },
          take: 20,
          select: {
            packId: true,
            destinationId: true,
            displayName: true,
            countryCode: true,
            region: true,
            city: true,
            packData: true,
          },
        });

        for (const pack of packs) {
          // 避免重复
          if (candidates.some(c => c.id === pack.packId)) continue;

          const packData = pack.packData as any;
          candidates.push({
            id: pack.packId,
            countryCode: pack.countryCode,
            name: packData?.displayName?.en || pack.displayName,
            nameCN: packData?.displayName?.zh || pack.displayName,
            description: packData?.overview?.en || `Explore ${pack.displayName}`,
            descriptionCN: packData?.overview?.zh || `探索${pack.displayName}`,
            highlights: packData?.highlights?.en || [],
            highlightsCN: packData?.highlights?.zh || [],
            matchScore: 0,
            matchReasons: [],
            matchReasonsCN: [],
            estimatedBudget: {
              min: packData?.budget?.min || 2000,
              max: packData?.budget?.max || 5000,
              currency: 'USD',
            },
            bestSeasons: packData?.bestSeasons || [],
            tags: packData?.tags || [],
          });
        }
      } catch (error: any) {
        this.logger.warn(`获取数据库候选失败: ${error.message}`);
      }
    }

    return candidates;
  }

  /**
   * 从标签数据创建目的地
   */
  private createDestinationFromTags(id: string, data: typeof this.destinationTags[string]): DestinationRecommendation {
    const names: Record<string, { en: string; cn: string; description: string; descriptionCN: string }> = {
      iceland: { en: 'Iceland', cn: '冰岛', description: 'Land of fire and ice with stunning natural landscapes', descriptionCN: '冰与火之国，拥有令人惊叹的自然景观' },
      japan: { en: 'Japan', cn: '日本', description: 'Perfect blend of ancient tradition and modern innovation', descriptionCN: '古老传统与现代创新的完美融合' },
      newzealand: { en: 'New Zealand', cn: '新西兰', description: 'Adventure paradise with breathtaking scenery', descriptionCN: '冒险天堂，壮丽风景' },
      thailand: { en: 'Thailand', cn: '泰国', description: 'Tropical paradise with rich culture and amazing food', descriptionCN: '热带天堂，丰富文化与美食' },
      italy: { en: 'Italy', cn: '意大利', description: 'Cradle of civilization with art, history, and cuisine', descriptionCN: '文明摇篮，艺术、历史与美食' },
      switzerland: { en: 'Switzerland', cn: '瑞士', description: 'Alpine wonderland with pristine nature', descriptionCN: '阿尔卑斯仙境，纯净自然' },
      maldives: { en: 'Maldives', cn: '马尔代夫', description: 'Tropical island paradise for ultimate relaxation', descriptionCN: '热带岛屿天堂，极致放松' },
      spain: { en: 'Spain', cn: '西班牙', description: 'Vibrant culture, beautiful beaches, and delicious tapas', descriptionCN: '活力文化、美丽海滩、美味 tapas' },
    };

    const info = names[id] || { en: id, cn: id, description: '', descriptionCN: '' };
    const budgetRanges: Record<string, { min: number; max: number }> = {
      low: { min: 1000, max: 2500 },
      medium: { min: 2500, max: 5000 },
      high: { min: 4000, max: 8000 },
      luxury: { min: 6000, max: 15000 },
    };

    return {
      id,
      countryCode: id.substring(0, 2).toUpperCase(),
      name: info.en,
      nameCN: info.cn,
      description: info.description,
      descriptionCN: info.descriptionCN,
      highlights: data.tags.slice(0, 4),
      highlightsCN: this.translateTags(data.tags.slice(0, 4)),
      matchScore: 0,
      matchReasons: [],
      matchReasonsCN: [],
      estimatedBudget: {
        ...budgetRanges[data.budgetLevel],
        currency: 'USD',
      },
      bestSeasons: this.formatBestSeasons(data.bestMonths),
      tags: data.tags,
    };
  }

  /**
   * 为目的地计算分数
   */
  private scoreDestination(
    destination: DestinationRecommendation,
    preferences: UserPreferences,
  ): ScoredDestination {
    const scores = {
      budget: this.calculateBudgetScore(destination, preferences),
      season: this.calculateSeasonScore(destination, preferences),
      preference: this.calculatePreferenceScore(destination, preferences),
      travelers: this.calculateTravelersScore(destination, preferences),
      popularity: this.calculatePopularityScore(destination),
      total: 0,
    };

    scores.total = scores.budget + scores.season + scores.preference + scores.travelers + scores.popularity;

    const { matchReasons, matchReasonsCN } = this.generateMatchReasons(destination, preferences, scores);

    return {
      destination: {
        ...destination,
        matchScore: Math.round(scores.total),
        matchReasons,
        matchReasonsCN,
      },
      scores,
      matchReasons,
      matchReasonsCN,
    };
  }

  /**
   * 计算预算匹配分 (0-25)
   */
  private calculateBudgetScore(destination: DestinationRecommendation, preferences: UserPreferences): number {
    if (!preferences.budget?.total) return 15; // 没有预算偏好，给中等分

    const userBudget = preferences.budget.total;
    const avgCost = (destination.estimatedBudget.min + destination.estimatedBudget.max) / 2;

    // 预算充足
    if (userBudget >= destination.estimatedBudget.max) return 25;
    // 预算适中
    if (userBudget >= avgCost) return 20;
    // 预算紧张但可行
    if (userBudget >= destination.estimatedBudget.min) return 15;
    // 预算不足
    if (userBudget >= destination.estimatedBudget.min * 0.8) return 8;
    // 预算严重不足
    return 3;
  }

  /**
   * 计算季节匹配分 (0-20)
   */
  private calculateSeasonScore(destination: DestinationRecommendation, preferences: UserPreferences): number {
    if (!preferences.dateRange?.preferredMonths && !preferences.dateRange?.startDate) {
      return 12; // 没有时间偏好，给中等分
    }

    let targetMonth: number;
    if (preferences.dateRange?.preferredMonths?.length) {
      targetMonth = preferences.dateRange.preferredMonths[0];
    } else if (preferences.dateRange?.startDate) {
      targetMonth = new Date(preferences.dateRange.startDate).getMonth() + 1;
    } else {
      return 12;
    }

    // 从标签数据获取最佳月份
    const destData = this.destinationTags[destination.id.toLowerCase()];
    if (destData) {
      if (destData.bestMonths.includes(targetMonth)) return 20;
      // 相邻月份
      if (destData.bestMonths.some(m => Math.abs(m - targetMonth) <= 1 || Math.abs(m - targetMonth) >= 11)) return 15;
      return 8;
    }

    // 从目的地的 bestSeasons 推断
    const seasonMonths: Record<string, number[]> = {
      'Spring': [3, 4, 5],
      'Summer': [6, 7, 8],
      'Autumn': [9, 10, 11],
      'Fall': [9, 10, 11],
      'Winter': [12, 1, 2],
    };

    for (const season of destination.bestSeasons) {
      const months = seasonMonths[season];
      if (months?.includes(targetMonth)) return 18;
    }

    return 10;
  }

  /**
   * 计算偏好匹配分 (0-25)
   */
  private calculatePreferenceScore(destination: DestinationRecommendation, preferences: UserPreferences): number {
    if (!preferences.destination?.type && !preferences.activities?.preferred) {
      return 15;
    }

    let score = 0;
    const destTags = destination.tags.map(t => t.toLowerCase());

    // 目的地类型匹配
    if (preferences.destination?.type) {
      const typeMatches = preferences.destination.type.filter(type => 
        destTags.includes(type.toLowerCase())
      );
      score += Math.min(typeMatches.length * 8, 15);
    }

    // 活动偏好匹配
    if (preferences.activities?.preferred) {
      const activityMatches = preferences.activities.preferred.filter(activity =>
        destTags.some(tag => tag.includes(activity.toLowerCase()) || activity.toLowerCase().includes(tag))
      );
      score += Math.min(activityMatches.length * 5, 10);
    }

    return Math.min(score, 25);
  }

  /**
   * 计算人数适合度分 (0-15)
   */
  private calculateTravelersScore(destination: DestinationRecommendation, preferences: UserPreferences): number {
    if (!preferences.travelers) return 10;

    const destData = this.destinationTags[destination.id.toLowerCase()];
    if (!destData) return 10;

    const travelers = preferences.travelers;
    let travelType = 'couple';

    if (travelers.adults === 1 && !travelers.children) {
      travelType = 'solo';
    } else if (travelers.children && travelers.children > 0) {
      travelType = 'family';
    } else if (travelers.adults && travelers.adults > 2) {
      travelType = 'friends';
    }

    if (destData.idealTravelers.includes(travelType)) return 15;
    if (destData.idealTravelers.length > 2) return 10; // 适合多种旅行者
    return 5;
  }

  /**
   * 计算热门度分 (0-15)
   */
  private calculatePopularityScore(destination: DestinationRecommendation): number {
    const destData = this.destinationTags[destination.id.toLowerCase()];
    if (!destData) return 8;

    return Math.round(destData.popularity * 0.15);
  }

  /**
   * 生成匹配原因
   */
  private generateMatchReasons(
    destination: DestinationRecommendation,
    preferences: UserPreferences,
    scores: ScoredDestination['scores'],
  ): { matchReasons: string[]; matchReasonsCN: string[] } {
    const matchReasons: string[] = [];
    const matchReasonsCN: string[] = [];

    if (scores.budget >= 20) {
      matchReasons.push('Within your budget');
      matchReasonsCN.push('预算友好');
    }

    if (scores.season >= 18) {
      matchReasons.push('Perfect season to visit');
      matchReasonsCN.push('最佳旅行季节');
    }

    if (scores.preference >= 15) {
      matchReasons.push('Matches your interests');
      matchReasonsCN.push('符合你的兴趣');
    }

    if (scores.travelers >= 12) {
      matchReasons.push('Great for your travel group');
      matchReasonsCN.push('适合你的出行组合');
    }

    if (scores.popularity >= 12) {
      matchReasons.push('Popular destination');
      matchReasonsCN.push('热门目的地');
    }

    // 确保至少有一个原因
    if (matchReasons.length === 0) {
      matchReasons.push('Interesting destination');
      matchReasonsCN.push('有趣的目的地');
    }

    return { matchReasons, matchReasonsCN };
  }

  /**
   * 翻译标签
   */
  private translateTags(tags: string[]): string[] {
    const translations: Record<string, string> = {
      nature: '自然风光',
      aurora: '极光',
      adventure: '冒险',
      photography: '摄影',
      culture: '文化',
      food: '美食',
      city: '城市',
      cherry_blossom: '樱花',
      autumn: '秋色',
      hiking: '徒步',
      beach: '海滩',
      tropical: '热带',
      budget: '经济实惠',
      history: '历史',
      art: '艺术',
      ski: '滑雪',
      luxury: '奢华',
      honeymoon: '蜜月',
      diving: '潜水',
    };

    return tags.map(tag => translations[tag] || tag);
  }

  /**
   * 格式化最佳季节
   */
  private formatBestSeasons(months: number[]): string[] {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    if (months.length === 0) return [];
    if (months.length <= 3) {
      return months.map(m => monthNames[m - 1]);
    }

    // 尝试合并连续月份
    const ranges: string[] = [];
    let start = months[0];
    let end = months[0];

    for (let i = 1; i < months.length; i++) {
      if (months[i] === end + 1 || (end === 12 && months[i] === 1)) {
        end = months[i];
      } else {
        ranges.push(start === end ? monthNames[start - 1] : `${monthNames[start - 1]}-${monthNames[end - 1]}`);
        start = months[i];
        end = months[i];
      }
    }
    ranges.push(start === end ? monthNames[start - 1] : `${monthNames[start - 1]}-${monthNames[end - 1]}`);

    return ranges;
  }
}
