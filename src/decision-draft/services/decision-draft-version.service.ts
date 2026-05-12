// src/decision-draft/services/decision-draft-version.service.ts

/**
 * Decision Draft Version Service
 * 
 * 决策草案版本管理服务
 * 复用 Chain-of-Work 的版本管理能力
 */

import { Injectable, Logger } from '@nestjs/common';
import { VersionService } from '../../chain-of-work/version/version.service';
import { DecisionDraftStorageService } from '../storage/decision-draft-storage.service';
import {
  DecisionDraft,
  DecisionDraftVersion,
} from '../interfaces/decision-draft.interface';
import { TripNARAWorkflowDraft } from '../../chain-of-work/interfaces/chain-of-work.interface';

/**
 * 版本创建选项
 */
export interface VersionCreateOptions {
  creator: string;
  description?: string;
  tags?: string[];
}

/**
 * Decision Draft Version Service
 */
@Injectable()
export class DecisionDraftVersionService {
  private readonly logger = new Logger(DecisionDraftVersionService.name);

  constructor(
    private readonly versionService: VersionService,
    private readonly storageService: DecisionDraftStorageService,
  ) {}

  /**
   * 保存决策草案版本
   */
  async saveVersion(
    decisionDraft: DecisionDraft,
    options: VersionCreateOptions,
  ): Promise<DecisionDraftVersion> {
    this.logger.log(
      `[DecisionDraftVersion] 保存决策草案版本: workflow_id=${decisionDraft.workflow_id}`,
    );

    // 1. 保存 Step Draft 版本（通过 Chain-of-Work Version Service）
    if (!decisionDraft.step_draft) {
      throw new Error('Step Draft 不存在，无法保存版本');
    }

    const workflowKey = decisionDraft.workflow_id ?? decisionDraft.plan_id;
    if (!workflowKey) {
      throw new Error('workflow_id / plan_id 缺失，无法保存版本');
    }

    const stepDraftVersion = await this.versionService.saveVersion(
      workflowKey,
      decisionDraft.step_draft,
      {
        creator: options.creator,
        description: options.description || '决策草案版本',
      },
    );

    // 2. 构建 Decision Draft Version
    const planVersion = decisionDraft.plan_version || parseInt(decisionDraft.version || '1', 10);
    const planId = decisionDraft.plan_id || decisionDraft.workflow_id || workflowKey;
    const versionString = planVersion.toString();
    
    const decisionDraftVersion: DecisionDraftVersion = {
      version_id: stepDraftVersion.id,
      plan_id: planId,
      plan_version: planVersion,
      workflow_id: planId, // 保留向后兼容
      version: versionString, // 保留向后兼容（字符串格式）
      decision_draft: decisionDraft,
      step_draft: decisionDraft.step_draft,
      execution_result: decisionDraft.execution_result,
      created_by: options.creator,
      description: options.description,
      created_at: stepDraftVersion.created_at,
    };

    // 保存到数据库
    await this.storageService.saveVersion(decisionDraftVersion);

    return decisionDraftVersion;
  }

  /**
   * 获取决策草案版本列表
   */
  async getVersions(workflowId: string): Promise<DecisionDraftVersion[]> {
    this.logger.log(`[DecisionDraftVersion] 获取版本列表: workflow_id=${workflowId}`);

    // 从数据库加载版本列表
    return this.storageService.loadVersions(workflowId);
  }

  /**
   * 获取特定版本
   */
  async getVersion(workflowId: string, versionId: string): Promise<DecisionDraftVersion | null> {
    this.logger.log(`[DecisionDraftVersion] 获取版本: workflow_id=${workflowId}, version_id=${versionId}`);

    const version = await this.versionService.getVersion(workflowId, versionId);
    if (!version) {
      return null;
    }

    // 从数据库加载版本
    return this.storageService.loadVersion(versionId);
  }

  /**
   * 对比两个版本
   */
  async compareVersions(
    workflowId: string,
    versionId1: string,
    versionId2: string,
  ): Promise<{
    version1: DecisionDraftVersion;
    version2: DecisionDraftVersion;
    diff: DecisionDraftVersion['diff'];
  }> {
    this.logger.log(
      `[DecisionDraftVersion] 对比版本: workflow_id=${workflowId}, version1=${versionId1}, version2=${versionId2}`,
    );

    const version1 = await this.getVersion(workflowId, versionId1);
    const version2 = await this.getVersion(workflowId, versionId2);

    if (!version1 || !version2) {
      throw new Error('版本不存在');
    }

    // 计算差异
    const diff = this.calculateDiff(version1, version2);

    return {
      version1,
      version2,
      diff,
    };
  }

  /**
   * 计算版本差异
   */
  private calculateDiff(
    version1: DecisionDraftVersion,
    version2: DecisionDraftVersion,
  ): DecisionDraftVersion['diff'] {
    const decisionSteps1 = version1.decision_draft.decision_steps;
    const decisionSteps2 = version2.decision_draft.decision_steps;

    // 找出新增、删除、修改的决策步骤
    const stepIds1 = new Set(decisionSteps1.map((s) => s.id));
    const stepIds2 = new Set(decisionSteps2.map((s) => s.id));

    const added = decisionSteps2.filter((s) => !stepIds1.has(s.id));
    const removed = decisionSteps1.filter((s) => !stepIds2.has(s.id));
    const modified = decisionSteps2.filter((s) => {
      if (!stepIds1.has(s.id)) {
        return false; // 已在 added 中
      }
      const step1 = decisionSteps1.find((s1) => s1.id === s.id)!;
      return JSON.stringify(step1) !== JSON.stringify(s);
    });

    // Step Drafts 差异（简化版）
    const stepDrafts1 = version1.step_draft.steps;
    const stepDrafts2 = version2.step_draft.steps;

    const stepDraftIds1 = new Set(stepDrafts1.map((s) => s.id));
    const stepDraftIds2 = new Set(stepDrafts2.map((s) => s.id));

    const stepDraftsAdded = stepDrafts2.filter((s) => !stepDraftIds1.has(s.id));
    const stepDraftsRemoved = stepDrafts1.filter((s) => !stepDraftIds2.has(s.id));
    const stepDraftsModified = stepDrafts2.filter((s) => {
      if (!stepDraftIds1.has(s.id)) {
        return false;
      }
      const step1 = stepDrafts1.find((s1) => s1.id === s.id)!;
      return JSON.stringify(step1) !== JSON.stringify(s);
    });

    return {
      decision_steps_added: added,
      decision_steps_removed: removed,
      decision_steps_modified: modified,
      step_drafts_added: stepDraftsAdded,
      step_drafts_removed: stepDraftsRemoved,
      step_drafts_modified: stepDraftsModified,
    };
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(
    workflowId: string,
    versionId: string,
  ): Promise<DecisionDraftVersion> {
    this.logger.log(
      `[DecisionDraftVersion] 回滚到版本: workflow_id=${workflowId}, version_id=${versionId}`,
    );

    const targetVersion = await this.getVersion(workflowId, versionId);
    if (!targetVersion) {
      throw new Error(`版本不存在: ${versionId}`);
    }

    // 回滚 Step Draft（通过 Chain-of-Work Version Service）
    await this.versionService.rollbackToVersion(workflowId, versionId);

    // 创建新版本（回滚后的版本）
    const rolledBackVersion = await this.saveVersion(targetVersion.decision_draft, {
      creator: 'system',
      description: `回滚到版本 ${targetVersion.version}`,
    });

    return rolledBackVersion;
  }

  /**
   * Fork（创建新分支）
   */
  async forkVersion(
    workflowId: string,
    versionId: string,
    newWorkflowId: string,
    options: VersionCreateOptions,
  ): Promise<DecisionDraftVersion> {
    this.logger.log(
      `[DecisionDraftVersion] Fork 版本: workflow_id=${workflowId}, version_id=${versionId}, new_workflow_id=${newWorkflowId}`,
    );

    const sourceVersion = await this.getVersion(workflowId, versionId);
    if (!sourceVersion) {
      throw new Error(`版本不存在: ${versionId}`);
    }

    // 创建新的 Decision Draft（基于源版本）
    const forkedDecisionDraft: DecisionDraft = {
      ...sourceVersion.decision_draft,
      draft_id: `decision-${newWorkflowId}`,
      workflow_id: newWorkflowId,
      version: 'v1.0', // 新分支从 v1.0 开始
      metadata: {
        ...sourceVersion.decision_draft.metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    // 创建新的 Step Draft（基于源版本）
    const forkedStepDraft: TripNARAWorkflowDraft = {
      ...sourceVersion.step_draft,
      draft_id: `step-${newWorkflowId}`,
      workflow_id: newWorkflowId,
      version: 'v1.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    forkedDecisionDraft.step_draft = forkedStepDraft;

    // 保存新分支版本
    const forkedVersion = await this.saveVersion(forkedDecisionDraft, options);

    return forkedVersion;
  }
}