// src/chain-of-work/version/version.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { TripNARAWorkflowDraft, Version } from '../interfaces/chain-of-work.interface';

/**
 * 版本管理服务
 * 
 * TODO: 实现数据库持久化
 */
@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private readonly versions = new Map<string, Version[]>();

  /**
   * 保存版本
   */
  async saveVersion(
    workflowId: string,
    draft: TripNARAWorkflowDraft,
    metadata?: { creator: string; description?: string },
  ): Promise<Version> {
    this.logger.log(`[VersionService] 保存版本: workflow_id=${workflowId}, version=${draft.version}`);
    
    const version: Version = {
      id: this.generateUuid(),
      workflow_id: workflowId,
      version: draft.version,
      draft_data: draft,
      status: 'draft',
      is_current: false,
      creator: metadata?.creator || 'system',
      description: metadata?.description,
      created_at: new Date().toISOString(),
    };
    
    // 存储到内存（TODO: 迁移到数据库）
    const versions = this.versions.get(workflowId) || [];
    versions.push(version);
    this.versions.set(workflowId, versions);
    
    return version;
  }

  /**
   * 获取版本列表
   */
  async getVersionList(workflowId: string): Promise<Version[]> {
    return this.versions.get(workflowId) || [];
  }

  /**
   * 获取版本详情
   */
  async getVersion(workflowId: string, versionId: string): Promise<Version | null> {
    const versions = this.versions.get(workflowId) || [];
    return versions.find(v => v.id === versionId) || null;
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(workflowId: string, versionId: string): Promise<Version> {
    const version = await this.getVersion(workflowId, versionId);
    if (!version) {
      throw new Error(`版本不存在: ${versionId}`);
    }
    
    // 标记为当前版本
    const versions = this.versions.get(workflowId) || [];
    versions.forEach(v => {
      v.is_current = v.id === versionId;
    });
    
    return version;
  }

  /**
   * 生成 UUID
   */
  private generateUuid(): string {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}