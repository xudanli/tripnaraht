// src/agent/assistants/shared/services/preference-learning.service.ts

/**
 * PreferenceLearningService
 * 
 * 用户偏好学习服务：被动学习用户偏好，让系统更懂用户
 * 
 * 学习维度：
 * - 目的地类型偏好（自然/城市/海滩等）
 * - 预算范围
 * - 旅行节奏偏好
 * - 出行人数习惯
 * - 季节偏好
 * - 活动偏好
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UserPreferences } from '../../planning-assistant/interfaces/planning-assistant.interface';

export interface LearnedPreference {
  category: string;
  key: string;
  value: any;
  confidence: number; // 0-100
  sourceCount: number;
  lastUpdated: Date;
}

export interface UserPreferenceProfile {
  userId: string;
  preferences: LearnedPreference[];
  tripHistory: {
    totalTrips: number;
    destinations: string[];
    averageBudget: number;
    averageDays: number;
    preferredTravelersCount: number;
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PreferenceLearningInput {
  userId: string;
  action: 'destination_selected' | 'plan_generated' | 'plan_confirmed' | 'trip_completed' | 'preference_stated';
  data: {
    destination?: string;
    destinationType?: string[];
    budget?: number;
    days?: number;
    travelers?: { adults?: number; children?: number };
    activities?: string[];
    pace?: 'relaxed' | 'moderate' | 'intensive';
    season?: string;
    rating?: number; // 用户评分 1-5
  };
}

@Injectable()
export class PreferenceLearningService {
  private readonly logger = new Logger(PreferenceLearningService.name);

  // 内存缓存（生产环境应使用 Redis）
  private readonly profileCache = new Map<string, UserPreferenceProfile>();

  // 学习权重配置
  private readonly learningWeights = {
    destination_selected: 0.3,
    plan_generated: 0.2,
    plan_confirmed: 0.6,
    trip_completed: 1.0,
    preference_stated: 0.8,
  };

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('偏好学习服务已初始化');
  }

  /**
   * 学习用户偏好
   */
  async learnFromAction(input: PreferenceLearningInput): Promise<void> {
    const { userId, action, data } = input;
    const weight = this.learningWeights[action];

    this.logger.debug(`学习用户偏好: userId=${userId}, action=${action}`);

    // 获取或创建用户档案
    let profile = await this.getProfile(userId);
    if (!profile) {
      profile = this.createEmptyProfile(userId);
    }

    // 根据行为更新偏好
    if (data.destinationType) {
      this.updatePreference(profile, 'destination_type', data.destinationType, weight);
    }

    if (data.budget) {
      this.updatePreference(profile, 'budget_range', data.budget, weight);
    }

    if (data.days) {
      this.updatePreference(profile, 'trip_duration', data.days, weight);
    }

    if (data.travelers) {
      this.updatePreference(profile, 'travelers', data.travelers, weight);
    }

    if (data.activities) {
      this.updatePreference(profile, 'activities', data.activities, weight);
    }

    if (data.pace) {
      this.updatePreference(profile, 'pace', data.pace, weight);
    }

    if (data.season) {
      this.updatePreference(profile, 'season', data.season, weight);
    }

    // 更新行程历史
    if (action === 'trip_completed' && data.destination) {
      profile.tripHistory.totalTrips++;
      if (!profile.tripHistory.destinations.includes(data.destination)) {
        profile.tripHistory.destinations.push(data.destination);
      }
      if (data.budget) {
        profile.tripHistory.averageBudget = this.calculateRunningAverage(
          profile.tripHistory.averageBudget,
          data.budget,
          profile.tripHistory.totalTrips,
        );
      }
      if (data.days) {
        profile.tripHistory.averageDays = this.calculateRunningAverage(
          profile.tripHistory.averageDays,
          data.days,
          profile.tripHistory.totalTrips,
        );
      }
    }

    profile.updatedAt = new Date();

    // 保存档案
    await this.saveProfile(profile);
  }

  /**
   * 获取用户偏好档案
   */
  async getProfile(userId: string): Promise<UserPreferenceProfile | null> {
    // 先检查缓存
    if (this.profileCache.has(userId)) {
      return this.profileCache.get(userId)!;
    }

    // 从数据库加载（使用 UserProfile 的 preferences 字段）
    if (this.prisma) {
      try {
        const userProfile = await this.prisma.userProfile.findUnique({
          where: { userId },
          select: { preferences: true },
        });

        if (userProfile?.preferences) {
          const prefs = userProfile.preferences as any;
          if (prefs.learnedProfile) {
            const profile = prefs.learnedProfile as UserPreferenceProfile;
            this.profileCache.set(userId, profile);
            return profile;
          }
        }
      } catch (error: any) {
        this.logger.warn(`加载用户偏好失败: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * 保存用户偏好档案
   */
  private async saveProfile(profile: UserPreferenceProfile): Promise<void> {
    // 更新缓存
    this.profileCache.set(profile.userId, profile);

    // 保存到数据库（使用 UserProfile 的 preferences 字段）
    if (this.prisma) {
      try {
        // 获取现有 preferences
        const existing = await this.prisma.userProfile.findUnique({
          where: { userId: profile.userId },
          select: { preferences: true },
        });

        const prefs = (existing?.preferences as any) || {};
        prefs.learnedProfile = profile;

        await this.prisma.userProfile.upsert({
          where: { userId: profile.userId },
          update: { preferences: prefs, updatedAt: new Date() },
          create: {
            userId: profile.userId,
            preferences: prefs,
            updatedAt: new Date(),
          },
        });
      } catch (error: any) {
        this.logger.warn(`保存用户偏好失败: ${error.message}`);
      }
    }
  }

  /**
   * 创建空档案
   */
  private createEmptyProfile(userId: string): UserPreferenceProfile {
    return {
      userId,
      preferences: [],
      tripHistory: {
        totalTrips: 0,
        destinations: [],
        averageBudget: 0,
        averageDays: 0,
        preferredTravelersCount: 2,
      },
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * 更新单个偏好
   */
  private updatePreference(
    profile: UserPreferenceProfile,
    category: string,
    value: any,
    weight: number,
  ): void {
    // 寻找现有偏好
    const existing = profile.preferences.find(
      p => p.category === category && this.isSameKey(p.key, value),
    );

    if (existing) {
      // 更新现有偏好
      existing.confidence = Math.min(100, existing.confidence + weight * 10);
      existing.sourceCount++;
      existing.lastUpdated = new Date();
      
      // 如果是数值类型，计算移动平均
      if (typeof value === 'number') {
        existing.value = this.calculateRunningAverage(existing.value, value, existing.sourceCount);
      }
    } else {
      // 添加新偏好
      profile.preferences.push({
        category,
        key: this.extractKey(value),
        value,
        confidence: weight * 15,
        sourceCount: 1,
        lastUpdated: new Date(),
      });
    }

    // 维护偏好数量限制
    this.prunePreferences(profile, category);
  }

  /**
   * 提取偏好键
   */
  private extractKey(value: any): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return 'numeric';
    if (Array.isArray(value)) return value.sort().join(',');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * 判断是否相同键
   */
  private isSameKey(existingKey: string, newValue: any): boolean {
    const newKey = this.extractKey(newValue);
    return existingKey === newKey;
  }

  /**
   * 计算移动平均
   */
  private calculateRunningAverage(oldAvg: number, newValue: number, count: number): number {
    if (count <= 1) return newValue;
    return (oldAvg * (count - 1) + newValue) / count;
  }

  /**
   * 修剪低置信度偏好
   */
  private prunePreferences(profile: UserPreferenceProfile, category: string): void {
    const maxPerCategory = 5;
    const categoryPrefs = profile.preferences.filter(p => p.category === category);
    
    if (categoryPrefs.length > maxPerCategory) {
      // 按置信度排序，保留最高的
      categoryPrefs.sort((a, b) => b.confidence - a.confidence);
      const toRemove = categoryPrefs.slice(maxPerCategory);
      
      profile.preferences = profile.preferences.filter(
        p => p.category !== category || !toRemove.includes(p),
      );
    }
  }

  /**
   * 将学习到的偏好转换为 UserPreferences 格式
   */
  async getAsUserPreferences(userId: string): Promise<Partial<UserPreferences> & { days?: number; pace?: string }> {
    const profile = await this.getProfile(userId);
    if (!profile) return {};

    const prefs: Partial<UserPreferences> & { days?: number; pace?: string } = {};

    // 提取高置信度偏好
    const highConfidencePrefs = profile.preferences.filter(p => p.confidence >= 30);

    for (const pref of highConfidencePrefs) {
      switch (pref.category) {
        case 'budget_range':
          prefs.budget = prefs.budget || { total: pref.value };
          break;
        
        case 'trip_duration':
          prefs.days = pref.value;
          break;
        
        case 'destination_type':
          prefs.destination = prefs.destination || { type: [] };
          if (prefs.destination.type) {
            if (Array.isArray(pref.value)) {
              prefs.destination.type.push(...pref.value);
            } else {
              prefs.destination.type.push(pref.value);
            }
          }
          break;
        
        case 'activities':
          prefs.activities = prefs.activities || { preferred: [] };
          if (prefs.activities.preferred) {
            if (Array.isArray(pref.value)) {
              prefs.activities.preferred.push(...pref.value);
            } else {
              prefs.activities.preferred.push(pref.value);
            }
          }
          break;
        
        case 'pace':
          prefs.pace = pref.value;
          break;
        
        case 'travelers':
          prefs.travelers = pref.value;
          break;
      }
    }

    // 去重
    if (prefs.destination?.type) {
      prefs.destination.type = [...new Set(prefs.destination.type)];
    }
    if (prefs.activities?.preferred) {
      prefs.activities.preferred = [...new Set(prefs.activities.preferred)];
    }

    return prefs;
  }

  /**
   * 获取用户偏好摘要（用于展示）
   */
  async getPreferenceSummary(userId: string): Promise<{
    summary: string;
    summaryCN: string;
    topPreferences: { label: string; labelCN: string; value: string }[];
  }> {
    const profile = await this.getProfile(userId);
    if (!profile || profile.preferences.length === 0) {
      return {
        summary: 'No travel preferences learned yet. Start planning your first trip!',
        summaryCN: '还没有学习到旅行偏好。开始规划您的第一次旅行吧！',
        topPreferences: [],
      };
    }

    // 获取高置信度偏好
    const topPrefs = profile.preferences
      .filter(p => p.confidence >= 30)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    const topPreferences = topPrefs.map(pref => ({
      label: this.getCategoryLabel(pref.category, 'en'),
      labelCN: this.getCategoryLabel(pref.category, 'zh'),
      value: this.formatPreferenceValue(pref),
    }));

    // 生成摘要
    const summaryParts: string[] = [];
    const summaryCNParts: string[] = [];

    if (profile.tripHistory.totalTrips > 0) {
      summaryParts.push(`${profile.tripHistory.totalTrips} trips completed`);
      summaryCNParts.push(`已完成 ${profile.tripHistory.totalTrips} 次旅行`);
    }

    const budgetPref = topPrefs.find(p => p.category === 'budget_range');
    if (budgetPref) {
      summaryParts.push(`avg budget $${Math.round(budgetPref.value)}`);
      summaryCNParts.push(`平均预算 $${Math.round(budgetPref.value)}`);
    }

    const durationPref = topPrefs.find(p => p.category === 'trip_duration');
    if (durationPref) {
      summaryParts.push(`prefer ${Math.round(durationPref.value)}-day trips`);
      summaryCNParts.push(`偏好 ${Math.round(durationPref.value)} 天行程`);
    }

    return {
      summary: summaryParts.length > 0 ? summaryParts.join(', ') : 'Learning your preferences...',
      summaryCN: summaryCNParts.length > 0 ? summaryCNParts.join('，') : '正在学习您的偏好...',
      topPreferences,
    };
  }

  /**
   * 获取分类标签
   */
  private getCategoryLabel(category: string, lang: 'en' | 'zh'): string {
    const labels: Record<string, { en: string; zh: string }> = {
      budget_range: { en: 'Budget', zh: '预算' },
      trip_duration: { en: 'Duration', zh: '时长' },
      destination_type: { en: 'Destination Type', zh: '目的地类型' },
      activities: { en: 'Activities', zh: '活动' },
      pace: { en: 'Pace', zh: '节奏' },
      travelers: { en: 'Travelers', zh: '出行人数' },
      season: { en: 'Season', zh: '季节' },
    };

    return labels[category]?.[lang] || category;
  }

  /**
   * 格式化偏好值
   */
  private formatPreferenceValue(pref: LearnedPreference): string {
    if (typeof pref.value === 'number') {
      if (pref.category === 'budget_range') {
        return `$${Math.round(pref.value)}`;
      }
      if (pref.category === 'trip_duration') {
        return `${Math.round(pref.value)} days`;
      }
      return String(Math.round(pref.value));
    }

    if (Array.isArray(pref.value)) {
      return pref.value.slice(0, 3).join(', ');
    }

    if (typeof pref.value === 'object' && pref.value.adults !== undefined) {
      const t = pref.value as { adults?: number; children?: number };
      return `${t.adults || 0} adults${t.children ? `, ${t.children} children` : ''}`;
    }

    return String(pref.value);
  }

  /**
   * 合并学习到的偏好与用户显式提供的偏好
   */
  async mergeWithLearnedPreferences(
    userId: string,
    explicitPreferences: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    const learned = await this.getAsUserPreferences(userId);

    // 显式偏好优先
    const merged: UserPreferences = {
      destination: {
        ...learned.destination,
        ...explicitPreferences.destination,
      },
      budget: explicitPreferences.budget || learned.budget,
      travelers: explicitPreferences.travelers || learned.travelers || { adults: 2 },
      activities: {
        pacePreference: learned.pace as 'relaxed' | 'moderate' | 'intensive' | undefined,
        ...learned.activities,
        ...explicitPreferences.activities,
      },
      dateRange: explicitPreferences.dateRange,
    };

    return merged;
  }

  /**
   * 清除用户偏好
   */
  async clearProfile(userId: string): Promise<void> {
    this.profileCache.delete(userId);
    
    if (this.prisma) {
      try {
        // 获取现有 preferences
        const existing = await this.prisma.userProfile.findUnique({
          where: { userId },
          select: { preferences: true },
        });

        if (existing) {
          const prefs = (existing.preferences as any) || {};
          delete prefs.learnedProfile;

          await this.prisma.userProfile.update({
            where: { userId },
            data: { preferences: prefs, updatedAt: new Date() },
          });
        }
      } catch (error: any) {
        this.logger.warn(`清除用户偏好失败: ${error.message}`);
      }
    }
  }
}
