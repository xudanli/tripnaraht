/**
 * DSO 快照审计服务
 *
 * 专利实现：STATE_UPDATE 可追溯性
 * 
 * 功能：
 * - 记录每次 DSO 状态变更快照
 * - 支持状态回滚
 * - 提供审计查询 API
 * - Lyapunov 函数值追踪
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

// Conditional TypeORM imports - optional dependency
let InjectRepository: any;
let Repository: any;
let Between: any;
let MoreThanOrEqual: any;
let LessThanOrEqual: any;
try {
  const typeorm = require('@nestjs/typeorm');
  InjectRepository = typeorm.InjectRepository;
  const typeormCore = require('typeorm');
  Repository = typeormCore.Repository;
  Between = typeormCore.Between;
  MoreThanOrEqual = typeormCore.MoreThanOrEqual;
  LessThanOrEqual = typeormCore.LessThanOrEqual;
} catch {
  InjectRepository = () => () => {};
  Repository = class {};
  Between = (a: unknown, b: unknown) => ({ _type: 'between', a, b });
  MoreThanOrEqual = (a: unknown) => ({ _type: 'gte', a });
  LessThanOrEqual = (a: unknown) => ({ _type: 'lte', a });
}

// Entity type for type-safety
export interface DSOSnapshotEntity {
  id: string;
  requestId: string;
  version: number;
  phase: string;
  dsoData: Record<string, unknown>;
  confidence: number | null;
  lyapunovValue: number | null;
  createdAt: Date;
}

/**
 * 快照元数据
 */
export interface SnapshotMetadata {
  /** 触发原因 */
  trigger: 'STATE_UPDATE' | 'MANUAL' | 'ROLLBACK' | 'CHECKPOINT';
  /** 操作者 */
  operator?: string;
  /** 变更描述 */
  changeDescription?: string;
  /** 变更的字段列表 */
  changedFields?: string[];
}

/**
 * 快照查询过滤器
 */
export interface SnapshotQueryFilter {
  requestId?: string;
  phase?: string;
  startTime?: Date;
  endTime?: Date;
  minVersion?: number;
  maxVersion?: number;
  minConfidence?: number;
  maxConfidence?: number;
}

/**
 * 快照查询结果
 */
export interface SnapshotQueryResult {
  snapshots: DSOSnapshotEntity[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 状态差异
 */
export interface StateDiff {
  field: string;
  before: unknown;
  after: unknown;
  changeType: 'ADDED' | 'REMOVED' | 'MODIFIED';
}

/**
 * Lyapunov 追踪结果
 */
export interface LyapunovTrace {
  requestId: string;
  values: Array<{
    version: number;
    phase: string;
    lyapunovValue: number;
    timestamp: string;
  }>;
  isDecreasing: boolean;
  convergenceRate?: number;
}

// Token for optional repository injection
const DSO_SNAPSHOT_REPO_TOKEN = 'DSO_SNAPSHOT_REPOSITORY';

@Injectable()
export class DSOSnapshotAuditService {
  private readonly logger = new Logger(DSOSnapshotAuditService.name);
  
  // 内存存储（当数据库不可用时）
  private inMemorySnapshots: Map<string, DSOSnapshotEntity[]> = new Map();

  constructor(
    @Optional()
    @Inject(DSO_SNAPSHOT_REPO_TOKEN)
    private readonly snapshotRepo?: any,
  ) {
    if (!snapshotRepo) {
      this.logger.warn('[DSOSnapshotAudit] Repository 不可用，使用内存存储');
    }
  }

  /**
   * 记录 DSO 快照
   */
  async recordSnapshot(
    requestId: string,
    dso: DecisionState,
    metadata?: SnapshotMetadata,
  ): Promise<DSOSnapshotEntity> {
    // 获取当前版本号
    const currentVersion = await this.getLatestVersion(requestId);
    const newVersion = currentVersion + 1;
    
    // 计算 Lyapunov 值（如果可用）
    const lyapunovValue = this.computeLyapunovValue(dso);
    
    const snapshot: Partial<DSOSnapshotEntity> = {
      requestId,
      version: newVersion,
      phase: dso.systemState?.currentPhase ?? 'UNKNOWN',
      dsoData: dso as unknown as Record<string, unknown>,
      confidence: dso.systemState?.confidence ?? null,
      lyapunovValue,
    };

    if (this.snapshotRepo) {
      const entity = this.snapshotRepo.create(snapshot);
      const saved = await this.snapshotRepo.save(entity);
      
      this.logger.debug(
        `[DSOSnapshotAudit] 记录快照: requestId=${requestId}, version=${newVersion}, phase=${snapshot.phase}`,
      );
      
      return saved;
    }
    
    // 内存模式
    return this.recordSnapshotInMemory(requestId, snapshot);
  }

  /**
   * 获取最新快照
   */
  async getLatestSnapshot(requestId: string): Promise<DSOSnapshotEntity | null> {
    if (this.snapshotRepo) {
      return this.snapshotRepo.findOne({
        where: { requestId },
        order: { version: 'DESC' },
      });
    }
    
    // 内存模式
    const snapshots = this.inMemorySnapshots.get(requestId);
    if (!snapshots || snapshots.length === 0) return null;
    return snapshots[snapshots.length - 1];
  }

  /**
   * 获取指定版本快照
   */
  async getSnapshotByVersion(
    requestId: string,
    version: number,
  ): Promise<DSOSnapshotEntity | null> {
    if (this.snapshotRepo) {
      return this.snapshotRepo.findOne({
        where: { requestId, version },
      });
    }
    
    // 内存模式
    const snapshots = this.inMemorySnapshots.get(requestId);
    return snapshots?.find(s => s.version === version) ?? null;
  }

  /**
   * 查询快照（带分页）
   */
  async querySnapshots(
    filter: SnapshotQueryFilter,
    page = 1,
    pageSize = 20,
  ): Promise<SnapshotQueryResult> {
    if (this.snapshotRepo) {
      const where: any = {};
      
      if (filter.requestId) where.requestId = filter.requestId;
      if (filter.phase) where.phase = filter.phase;
      if (filter.minVersion && filter.maxVersion) {
        where.version = Between(filter.minVersion, filter.maxVersion);
      } else if (filter.minVersion) {
        where.version = MoreThanOrEqual(filter.minVersion);
      } else if (filter.maxVersion) {
        where.version = LessThanOrEqual(filter.maxVersion);
      }
      if (filter.startTime && filter.endTime) {
        where.createdAt = Between(filter.startTime, filter.endTime);
      }
      
      const [snapshots, total] = await this.snapshotRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      
      return { snapshots, total, page, pageSize };
    }
    
    // 内存模式简化实现
    let allSnapshots: DSOSnapshotEntity[] = [];
    for (const snapshots of this.inMemorySnapshots.values()) {
      allSnapshots = allSnapshots.concat(snapshots);
    }
    
    if (filter.requestId) {
      allSnapshots = allSnapshots.filter(s => s.requestId === filter.requestId);
    }
    if (filter.phase) {
      allSnapshots = allSnapshots.filter(s => s.phase === filter.phase);
    }
    
    allSnapshots.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    const start = (page - 1) * pageSize;
    const paged = allSnapshots.slice(start, start + pageSize);
    
    return { snapshots: paged, total: allSnapshots.length, page, pageSize };
  }

  /**
   * 获取状态变更历史
   */
  async getStateHistory(requestId: string): Promise<DSOSnapshotEntity[]> {
    if (this.snapshotRepo) {
      return this.snapshotRepo.find({
        where: { requestId },
        order: { version: 'ASC' },
      });
    }
    
    return this.inMemorySnapshots.get(requestId) ?? [];
  }

  /**
   * 计算两个版本之间的差异
   */
  async computeDiff(
    requestId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<StateDiff[]> {
    const fromSnapshot = await this.getSnapshotByVersion(requestId, fromVersion);
    const toSnapshot = await this.getSnapshotByVersion(requestId, toVersion);
    
    if (!fromSnapshot || !toSnapshot) {
      return [];
    }
    
    return this.diffObjects(
      fromSnapshot.dsoData,
      toSnapshot.dsoData,
    );
  }

  /**
   * 获取 Lyapunov 函数追踪
   * 
   * 用于验证系统稳定性（定理 4）
   */
  async getLyapunovTrace(requestId: string): Promise<LyapunovTrace> {
    const history = await this.getStateHistory(requestId);
    
    const values = history
      .filter(s => s.lyapunovValue !== null)
      .map(s => ({
        version: s.version,
        phase: s.phase,
        lyapunovValue: s.lyapunovValue!,
        timestamp: s.createdAt.toISOString(),
      }));
    
    // 检查是否单调递减
    let isDecreasing = true;
    for (let i = 1; i < values.length; i++) {
      if (values[i].lyapunovValue > values[i - 1].lyapunovValue) {
        isDecreasing = false;
        break;
      }
    }
    
    // 估算收敛速率
    let convergenceRate: number | undefined;
    if (values.length >= 3) {
      const first = values[0].lyapunovValue;
      const last = values[values.length - 1].lyapunovValue;
      const steps = values.length - 1;
      if (first > 0 && last > 0) {
        convergenceRate = Math.log(first / last) / steps;
      }
    }
    
    return { requestId, values, isDecreasing, convergenceRate };
  }

  /**
   * 回滚到指定版本
   */
  async rollback(
    requestId: string,
    targetVersion: number,
  ): Promise<DecisionState | null> {
    const snapshot = await this.getSnapshotByVersion(requestId, targetVersion);
    
    if (!snapshot) {
      this.logger.warn(`[DSOSnapshotAudit] 回滚失败：版本 ${targetVersion} 不存在`);
      return null;
    }
    
    // 记录回滚操作本身作为新快照
    await this.recordSnapshot(
      requestId,
      snapshot.dsoData as unknown as DecisionState,
      { trigger: 'ROLLBACK', changeDescription: `回滚到版本 ${targetVersion}` },
    );
    
    this.logger.log(`[DSOSnapshotAudit] 回滚成功: requestId=${requestId}, targetVersion=${targetVersion}`);
    
    return snapshot.dsoData as unknown as DecisionState;
  }

  /**
   * 清理旧快照（保留最近 N 个版本）
   */
  async cleanup(requestId: string, keepVersions = 50): Promise<number> {
    if (this.snapshotRepo) {
      const latest = await this.getLatestVersion(requestId);
      if (latest <= keepVersions) return 0;
      
      const result = await this.snapshotRepo
        .createQueryBuilder()
        .delete()
        .where('requestId = :requestId', { requestId })
        .andWhere('version < :minVersion', { minVersion: latest - keepVersions + 1 })
        .execute();
      
      return result.affected ?? 0;
    }
    
    // 内存模式
    const snapshots = this.inMemorySnapshots.get(requestId);
    if (!snapshots || snapshots.length <= keepVersions) return 0;
    
    const removed = snapshots.length - keepVersions;
    this.inMemorySnapshots.set(requestId, snapshots.slice(-keepVersions));
    return removed;
  }

  // ========== 私有方法 ==========

  private async getLatestVersion(requestId: string): Promise<number> {
    if (this.snapshotRepo) {
      const latest = await this.snapshotRepo.findOne({
        where: { requestId },
        order: { version: 'DESC' },
        select: ['version'],
      });
      return latest?.version ?? 0;
    }
    
    const snapshots = this.inMemorySnapshots.get(requestId);
    if (!snapshots || snapshots.length === 0) return 0;
    return snapshots[snapshots.length - 1].version;
  }

  private recordSnapshotInMemory(
    requestId: string,
    snapshot: Partial<DSOSnapshotEntity>,
  ): DSOSnapshotEntity {
    const entity: DSOSnapshotEntity = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requestId: snapshot.requestId!,
      version: snapshot.version!,
      phase: snapshot.phase!,
      dsoData: snapshot.dsoData!,
      confidence: snapshot.confidence ?? null,
      lyapunovValue: snapshot.lyapunovValue ?? null,
      createdAt: new Date(),
    };
    
    if (!this.inMemorySnapshots.has(requestId)) {
      this.inMemorySnapshots.set(requestId, []);
    }
    this.inMemorySnapshots.get(requestId)!.push(entity);
    
    return entity;
  }

  /**
   * 计算 Lyapunov 函数值
   * 
   * V(DSO) = α||violations|| + β||uncertainty|| + γ||remaining_work||
   */
  private computeLyapunovValue(dso: DecisionState): number | null {
    try {
      let V = 0;
      
      // 约束违反项
      const violations = dso.constraints?.violations?.length ?? 0;
      V += 0.3 * violations;
      
      // 不确定性项（1 - confidence）
      const uncertainty = 1 - (dso.systemState?.confidence ?? 0.5);
      V += 0.4 * uncertainty;
      
      // 剩余工作项（基于阶段）
      const phaseProgress = this.getPhaseProgress(dso.systemState?.currentPhase);
      const remainingWork = 1 - phaseProgress;
      V += 0.3 * remainingWork;
      
      return V;
    } catch {
      return null;
    }
  }

  private getPhaseProgress(phase?: string): number {
    const progressMap: Record<string, number> = {
      INTAKE: 0.1,
      RESEARCH: 0.2,
      GATE_EVAL: 0.3,
      CONTEXT_BUILD: 0.4,
      PLAN_GEN: 0.5,
      OPTIMIZE: 0.6,
      VERIFY: 0.7,
      NARRATE: 0.8,
      DONE: 1.0,
    };
    return progressMap[phase ?? ''] ?? 0.5;
  }

  private diffObjects(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    prefix = '',
  ): StateDiff[] {
    const diffs: StateDiff[] = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    
    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const beforeVal = before[key];
      const afterVal = after[key];
      
      if (!(key in before)) {
        diffs.push({ field: path, before: undefined, after: afterVal, changeType: 'ADDED' });
      } else if (!(key in after)) {
        diffs.push({ field: path, before: beforeVal, after: undefined, changeType: 'REMOVED' });
      } else if (typeof beforeVal === 'object' && typeof afterVal === 'object' &&
                 beforeVal !== null && afterVal !== null &&
                 !Array.isArray(beforeVal) && !Array.isArray(afterVal)) {
        diffs.push(...this.diffObjects(
          beforeVal as Record<string, unknown>,
          afterVal as Record<string, unknown>,
          path,
        ));
      } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        diffs.push({ field: path, before: beforeVal, after: afterVal, changeType: 'MODIFIED' });
      }
    }
    
    return diffs;
  }
}
