// src/trips/decision/optimization/learning/weight-persistence.service.ts
/**
 * 权重持久化服务
 * 
 * 负责：
 * 1. 用户权重配置的存储和加载
 * 2. 反馈历史的存储
 * 3. 学习结果的归档
 * 
 * 存储策略：
 * - 开发环境：文件系统（JSON）
 * - 生产环境：数据库（TypeORM）
 * 
 * 专利实现：支持策略学习 π_θ(a|s) 的权重持久化
 * 参考：docs/DECISION_OS_EXPERT_TEAM_SPEC.md 2.5
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { UserWeightProfile, FeedbackRecord, WeightLearningResult } from './weight-learner.service';
import { ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import { UserDecisionWeightsEntity } from './entities/user-decision-weights.entity';
import { WeightLearningHistoryEntity } from './entities/weight-learning-history.entity';

/**
 * 存储配置
 */
export interface PersistenceConfig {
  /** 存储模式 */
  mode: 'file' | 'database';
  
  /** 文件存储路径（file 模式） */
  filePath?: string;
  
  /** 自动保存间隔（毫秒） */
  autoSaveInterval?: number;
  
  /** 最大反馈历史保留数 */
  maxFeedbackHistory?: number;
}

/**
 * 默认存储配置
 */
const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  mode: 'file',
  filePath: './data/weight-learning',
  autoSaveInterval: 60000, // 1 分钟
  maxFeedbackHistory: 1000,
};

/**
 * 用户权重存储结构
 */
interface StoredUserData {
  profile: UserWeightProfile;
  feedbackHistory: FeedbackRecord[];
  learningHistory: Array<{
    timestamp: string;
    result: WeightLearningResult;
  }>;
}

@Injectable()
export class WeightPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(WeightPersistenceService.name);
  private config: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG;
  
  // 内存缓存
  private userDataCache: Map<string, StoredUserData> = new Map();
  private isDirty: boolean = false;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Optional()
    @InjectRepository(UserDecisionWeightsEntity)
    private readonly weightsRepo?: Repository<UserDecisionWeightsEntity>,
    @Optional()
    @InjectRepository(WeightLearningHistoryEntity)
    private readonly historyRepo?: Repository<WeightLearningHistoryEntity>,
  ) {
    // 如果数据库 Repository 可用，自动切换到数据库模式
    if (this.weightsRepo && this.historyRepo) {
      this.config.mode = 'database';
      this.logger.log('[WeightPersistence] 检测到数据库 Repository，使用数据库模式');
    }
  }

  async onModuleInit(): Promise<void> {
    // 确保存储目录存在（仅文件模式）
    if (this.config.mode === 'file' && this.config.filePath) {
      await this.ensureDirectoryExists(this.config.filePath);
    }
    
    // 启动自动保存（仅文件模式）
    if (this.config.mode === 'file' && this.config.autoSaveInterval && this.config.autoSaveInterval > 0) {
      this.startAutoSave();
    }
    
    this.logger.log(`[WeightPersistence] 初始化完成，模式: ${this.config.mode}`);
  }

  /**
   * 配置存储
   */
  configure(config: Partial<PersistenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 保存用户权重配置
   * 专利实现：支持 π_θ(a|s) 策略参数持久化
   */
  async saveUserProfile(userId: string, profile: UserWeightProfile): Promise<void> {
    const userData = this.getOrCreateUserData(userId);
    userData.profile = profile;
    this.isDirty = true;
    
    if (this.config.mode === 'database' && this.weightsRepo) {
      await this.saveUserToDatabase(userId, profile);
    } else if (this.config.mode === 'file') {
      await this.saveUserToFile(userId, userData);
    }
  }

  /**
   * 加载用户权重配置
   */
  async loadUserProfile(userId: string): Promise<UserWeightProfile | null> {
    // 检查缓存
    const cached = this.userDataCache.get(userId);
    if (cached) {
      return cached.profile;
    }
    
    // 从数据库加载
    if (this.config.mode === 'database' && this.weightsRepo) {
      const profile = await this.loadUserFromDatabase(userId);
      if (profile) {
        const userData = this.getOrCreateUserData(userId);
        userData.profile = profile;
        return profile;
      }
    }
    
    // 从文件加载
    if (this.config.mode === 'file') {
      const userData = await this.loadUserFromFile(userId);
      if (userData) {
        this.userDataCache.set(userId, userData);
        return userData.profile;
      }
    }
    
    return null;
  }

  /**
   * 保存用户权重到数据库
   */
  private async saveUserToDatabase(userId: string, profile: UserWeightProfile): Promise<void> {
    if (!this.weightsRepo) return;

    try {
      const existing = await this.weightsRepo.findOne({ where: { userId } });
      
      if (existing) {
        // 记录历史（如果有 historyRepo）
        if (this.historyRepo) {
          await this.historyRepo.save({
            userId,
            weightsBefore: existing.weights,
            weightsAfter: profile.currentWeights,
            learningMethod: 'profile_update',
          });
        }
        
        // 更新权重
        await this.weightsRepo.update(
          { userId },
          {
            weights: profile.currentWeights,
            version: existing.version + 1,
            learningConfidence: profile.learningConfidence,
            totalFeedback: profile.totalFeedback,
          },
        );
      } else {
        // 创建新记录
        await this.weightsRepo.save({
          userId,
          weights: profile.currentWeights,
          version: 1,
          learningConfidence: profile.learningConfidence,
          totalFeedback: profile.totalFeedback,
        });
      }
      
      this.logger.debug(`[WeightPersistence] 数据库保存用户权重: ${userId}`);
    } catch (error) {
      this.logger.error(`[WeightPersistence] 数据库保存失败: ${userId}`, error);
      throw error;
    }
  }

  /**
   * 从数据库加载用户权重
   */
  private async loadUserFromDatabase(userId: string): Promise<UserWeightProfile | null> {
    if (!this.weightsRepo) return null;

    try {
      const record = await this.weightsRepo.findOne({ where: { userId } });
      
      if (record) {
        return {
          userId: record.userId,
          currentWeights: record.weights,
          weightHistory: [], // 历史从 historyRepo 单独加载
          totalFeedback: record.totalFeedback,
          learningConfidence: record.learningConfidence,
          lastUpdated: record.updatedAt.toISOString(),
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error(`[WeightPersistence] 数据库加载失败: ${userId}`, error);
      return null;
    }
  }

  /**
   * 保存反馈记录
   */
  async saveFeedback(feedback: FeedbackRecord): Promise<void> {
    const userData = this.getOrCreateUserData(feedback.userId);
    userData.feedbackHistory.push(feedback);
    
    // 限制历史记录数量
    if (userData.feedbackHistory.length > (this.config.maxFeedbackHistory || 1000)) {
      userData.feedbackHistory = userData.feedbackHistory.slice(-this.config.maxFeedbackHistory!);
    }
    
    this.isDirty = true;
    
    if (this.config.mode === 'file') {
      await this.saveUserToFile(feedback.userId, userData);
    }
  }

  /**
   * 加载用户反馈历史
   */
  async loadFeedbackHistory(userId: string, limit?: number): Promise<FeedbackRecord[]> {
    const userData = await this.ensureUserDataLoaded(userId);
    const history = userData?.feedbackHistory || [];
    
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * 保存学习结果
   * 专利实现：记录 Regret 追踪所需的学习历史
   */
  async saveLearningResult(
    userId: string,
    result: WeightLearningResult,
    metadata?: {
      tripId?: string;
      method?: string;
      utilityBefore?: number;
      utilityAfter?: number;
      weightsBefore?: ObjectiveFunctionWeights;
      learningRate?: number;
    },
  ): Promise<void> {
    const userData = this.getOrCreateUserData(userId);
    userData.learningHistory.push({
      timestamp: new Date().toISOString(),
      result,
    });
    
    // 限制学习历史
    if (userData.learningHistory.length > 100) {
      userData.learningHistory = userData.learningHistory.slice(-100);
    }
    
    this.isDirty = true;
    
    if (this.config.mode === 'database' && this.historyRepo) {
      await this.saveLearningResultToDatabase(userId, result, metadata);
    } else if (this.config.mode === 'file') {
      await this.saveUserToFile(userId, userData);
    }
  }

  /**
   * 保存学习结果到数据库
   */
  private async saveLearningResultToDatabase(
    userId: string,
    result: WeightLearningResult,
    metadata?: {
      tripId?: string;
      method?: string;
      utilityBefore?: number;
      utilityAfter?: number;
      weightsBefore?: ObjectiveFunctionWeights;
      learningRate?: number;
    },
  ): Promise<void> {
    if (!this.historyRepo) return;

    try {
      await this.historyRepo.save({
        userId,
        tripId: metadata?.tripId ?? null,
        // `WeightLearningHistoryEntity.weightsBefore` is non-nullable; when caller didn't provide
        // the "before" snapshot, fall back to the current update target to keep persistence working.
        weightsBefore: metadata?.weightsBefore ?? result.updatedWeights ?? DEFAULT_OBJECTIVE_WEIGHTS,
        weightsAfter: result.updatedWeights,
        learningMethod: metadata?.method ?? 'gradient_descent',
        learningRate: metadata?.learningRate ?? 0.01,
        confidence: result.confidence,
        utilityBefore: metadata?.utilityBefore ?? null,
        utilityAfter: metadata?.utilityAfter ?? null,
      });
      
      this.logger.debug(`[WeightPersistence] 数据库保存学习结果: ${userId}`);
    } catch (error) {
      this.logger.error(`[WeightPersistence] 数据库保存学习结果失败: ${userId}`, error);
    }
  }

  /**
   * 获取学习历史
   */
  async getLearningHistory(
    userId: string,
    options?: { limit?: number; since?: Date },
  ): Promise<Array<{ timestamp: string; result: WeightLearningResult }>> {
    // 数据库模式
    if (this.config.mode === 'database' && this.historyRepo) {
      return this.getLearningHistoryFromDatabase(userId, options);
    }
    
    // 文件模式
    const userData = await this.ensureUserDataLoaded(userId);
    let history = userData?.learningHistory || [];
    
    if (options?.since) {
      const sinceStr = options.since.toISOString();
      history = history.filter(h => h.timestamp >= sinceStr);
    }
    
    if (options?.limit) {
      history = history.slice(-options.limit);
    }
    
    return history;
  }

  /**
   * 从数据库获取学习历史
   */
  private async getLearningHistoryFromDatabase(
    userId: string,
    options?: { limit?: number; since?: Date },
  ): Promise<Array<{ timestamp: string; result: WeightLearningResult }>> {
    if (!this.historyRepo) return [];

    try {
      const query: Record<string, unknown> = { userId };
      
      if (options?.since) {
        query.createdAt = MoreThanOrEqual(options.since);
      }
      
      const records = await this.historyRepo.find({
        where: query as any,
        order: { createdAt: 'DESC' },
        take: options?.limit,
      });
      
      return records.map(r => ({
        timestamp: r.createdAt.toISOString(),
        result: {
          updatedWeights: r.weightsAfter as unknown as ObjectiveFunctionWeights,
          weightChanges: {},
          signalStrength: 0.5,
          samplesUsed: 1,
          expectedImprovement: 0,
          confidence: r.confidence ?? 0.5,
          analysis: {
            gradients: {},
            mainFactors: [],
            recommendations: [],
          },
        } as WeightLearningResult,
      }));
    } catch (error) {
      this.logger.error(`[WeightPersistence] 数据库获取学习历史失败: ${userId}`, error);
      return [];
    }
  }

  /**
   * 获取所有用户 ID
   */
  async getAllUserIds(): Promise<string[]> {
    if (this.config.mode === 'file' && this.config.filePath) {
      try {
        const files = await fs.promises.readdir(this.config.filePath);
        return files
          .filter(f => f.endsWith('.json'))
          .map(f => f.replace('.json', ''));
      } catch {
        return [];
      }
    }
    return Array.from(this.userDataCache.keys());
  }

  /**
   * 导出用户数据（用于备份）
   */
  async exportUserData(userId: string): Promise<StoredUserData | null> {
    return this.ensureUserDataLoaded(userId);
  }

  /**
   * 导入用户数据（用于恢复）
   */
  async importUserData(userId: string, data: StoredUserData): Promise<void> {
    this.userDataCache.set(userId, data);
    this.isDirty = true;
    
    if (this.config.mode === 'file') {
      await this.saveUserToFile(userId, data);
    }
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    totalUsers: number;
    totalFeedback: number;
    totalLearningRuns: number;
    avgFeedbackPerUser: number;
  }> {
    const userIds = await this.getAllUserIds();
    let totalFeedback = 0;
    let totalLearningRuns = 0;
    
    for (const userId of userIds) {
      const userData = await this.ensureUserDataLoaded(userId);
      if (userData) {
        totalFeedback += userData.feedbackHistory.length;
        totalLearningRuns += userData.learningHistory.length;
      }
    }
    
    return {
      totalUsers: userIds.length,
      totalFeedback,
      totalLearningRuns,
      avgFeedbackPerUser: userIds.length > 0 ? totalFeedback / userIds.length : 0,
    };
  }

  /**
   * 清理旧数据
   */
  async cleanup(olderThanDays: number = 90): Promise<{ deletedFeedback: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffStr = cutoff.toISOString();
    
    let deletedFeedback = 0;
    
    for (const [, userData] of this.userDataCache) {
      const originalLength = userData.feedbackHistory.length;
      userData.feedbackHistory = userData.feedbackHistory.filter(
        f => f.timestamp > cutoffStr
      );
      deletedFeedback += originalLength - userData.feedbackHistory.length;
    }
    
    if (deletedFeedback > 0) {
      this.isDirty = true;
      await this.saveAll();
    }
    
    return { deletedFeedback };
  }

  // ========== 私有方法 ==========

  private getOrCreateUserData(userId: string): StoredUserData {
    let userData = this.userDataCache.get(userId);
    if (!userData) {
      userData = {
        profile: {
          userId,
          currentWeights: { ...DEFAULT_OBJECTIVE_WEIGHTS },
          weightHistory: [],
          totalFeedback: 0,
          learningConfidence: 0.5,
          lastUpdated: new Date().toISOString(),
        },
        feedbackHistory: [],
        learningHistory: [],
      };
      this.userDataCache.set(userId, userData);
    }
    return userData;
  }

  private async ensureUserDataLoaded(userId: string): Promise<StoredUserData | null> {
    let userData: StoredUserData | null | undefined = this.userDataCache.get(userId);
    if (!userData && this.config.mode === 'file') {
      userData = await this.loadUserFromFile(userId);
      if (userData) {
        this.userDataCache.set(userId, userData);
      }
    }
    return userData || null;
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch {
      await fs.promises.mkdir(dirPath, { recursive: true });
      this.logger.log(`[WeightPersistence] 创建目录: ${dirPath}`);
    }
  }

  private getUserFilePath(userId: string): string {
    // 清理用户 ID 中的特殊字符
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.config.filePath || './data/weight-learning', `${safeUserId}.json`);
  }

  private async saveUserToFile(userId: string, data: StoredUserData): Promise<void> {
    try {
      const filePath = this.getUserFilePath(userId);
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.debug(`[WeightPersistence] 保存用户数据: ${userId}`);
    } catch (error) {
      this.logger.error(`[WeightPersistence] 保存失败: ${userId}`, error);
    }
  }

  private async loadUserFromFile(userId: string): Promise<StoredUserData | null> {
    try {
      const filePath = this.getUserFilePath(userId);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as StoredUserData;
    } catch {
      return null;
    }
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(async () => {
      if (this.isDirty) {
        await this.saveAll();
        this.isDirty = false;
      }
    }, this.config.autoSaveInterval);
    
    this.logger.debug(`[WeightPersistence] 自动保存已启动 (间隔: ${this.config.autoSaveInterval}ms)`);
  }

  private async saveAll(): Promise<void> {
    if (this.config.mode === 'file') {
      for (const [userId, userData] of this.userDataCache) {
        await this.saveUserToFile(userId, userData);
      }
      this.logger.debug(`[WeightPersistence] 批量保存完成 (${this.userDataCache.size} 用户)`);
    }
  }

  /**
   * 关闭服务时保存数据
   */
  async onModuleDestroy(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    if (this.isDirty) {
      await this.saveAll();
    }
    
    this.logger.log('[WeightPersistence] 服务关闭，数据已保存');
  }
}
