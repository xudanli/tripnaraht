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
 * - 生产环境：数据库（Prisma）
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { UserWeightProfile, FeedbackRecord, WeightLearningResult } from './weight-learner.service';
import { ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';

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

  async onModuleInit(): Promise<void> {
    // 确保存储目录存在
    if (this.config.mode === 'file' && this.config.filePath) {
      await this.ensureDirectoryExists(this.config.filePath);
    }
    
    // 启动自动保存
    if (this.config.autoSaveInterval && this.config.autoSaveInterval > 0) {
      this.startAutoSave();
    }
    
    this.logger.log('[WeightPersistence] 初始化完成');
  }

  /**
   * 配置存储
   */
  configure(config: Partial<PersistenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 保存用户权重配置
   */
  async saveUserProfile(userId: string, profile: UserWeightProfile): Promise<void> {
    const userData = this.getOrCreateUserData(userId);
    userData.profile = profile;
    this.isDirty = true;
    
    if (this.config.mode === 'file') {
      await this.saveUserToFile(userId, userData);
    }
    // TODO: 数据库模式
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
    
    // 从存储加载
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
   */
  async saveLearningResult(userId: string, result: WeightLearningResult): Promise<void> {
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
    
    if (this.config.mode === 'file') {
      await this.saveUserToFile(userId, userData);
    }
  }

  /**
   * 获取学习历史
   */
  async getLearningHistory(userId: string): Promise<Array<{ timestamp: string; result: WeightLearningResult }>> {
    const userData = await this.ensureUserDataLoaded(userId);
    return userData?.learningHistory || [];
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
    
    for (const [userId, userData] of this.userDataCache) {
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
