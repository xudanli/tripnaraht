/**
 * ModelDeploymentService
 *
 * P5 6.2: 模型部署统一入口
 * 职责：模型版本管理、部署、回滚，部署流程可追溯
 *
 * 封装 ModelRegistryService + PolicyServiceManager，提供：
 * - getCurrentDeployedVersion() - 当前生产版本
 * - deployVersion(version) - 部署指定版本
 * - rollbackToVersion(version) - 回滚到指定版本
 * - listDeployableVersions() - 可部署版本列表
 *
 * 参考: docs/ITERATIVE_DEPLOYMENT_APPLICATION.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModelRegistryService } from './model-registry.service';
import { PolicyServiceManagerService } from './policy-service-manager.service';
import type { ModelRegistryEntry } from '../interfaces/training-platform.interface';

export interface DeploymentResult {
  version: string;
  success: boolean;
  deployedAt: string;
  error?: string;
}

/** 部署审计记录（P5：部署流程可追溯） */
export interface DeploymentAuditEntry {
  version: string;
  action: 'deploy' | 'rollback';
  success: boolean;
  deployedAt: string;
  error?: string;
}

@Injectable()
export class ModelDeploymentService {
  private readonly logger = new Logger(ModelDeploymentService.name);
  /** 部署审计日志（最近 100 条，可扩展为持久化） */
  private readonly deploymentAudit: DeploymentAuditEntry[] = [];
  private readonly maxAuditEntries = 100;

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    @Optional() private readonly policyService?: PolicyServiceManagerService,
  ) {}

  /**
   * 获取当前生产版本
   */
  async getCurrentDeployedVersion(): Promise<string | null> {
    try {
      const versions = await this.modelRegistry.listModelVersions();
      const production = versions.find((v) => v.is_production);
      return production?.version ?? null;
    } catch (e: unknown) {
      this.logger.warn(`[ModelDeployment] 获取当前版本失败: ${(e as Error)?.message}`);
      return null;
    }
  }

  /**
   * 部署指定版本到生产
   * 1. 在 Registry 中标记为生产版本
   * 2. 若 PolicyService 可用，调用 deployModel 加载到推理服务
   */
  async deployVersion(version: string): Promise<DeploymentResult> {
    const deployedAt = new Date().toISOString();
    try {
      await this.modelRegistry.setProductionVersion(version);
      if (this.policyService) {
        await this.policyService.deployModel(version);
      }
      this.appendAudit({ version, action: 'deploy', success: true, deployedAt });
      this.logger.log(`[ModelDeployment] 部署成功: version=${version}`);
      return { version, success: true, deployedAt };
    } catch (e: unknown) {
      const err = (e as Error)?.message ?? String(e);
      this.appendAudit({ version, action: 'deploy', success: false, deployedAt, error: err });
      this.logger.error(`[ModelDeployment] 部署失败: version=${version}, error=${err}`);
      return { version, success: false, deployedAt, error: err };
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(version: string): Promise<DeploymentResult> {
    const deployedAt = new Date().toISOString();
    try {
      await this.modelRegistry.rollbackToVersion(version);
      if (this.policyService) {
        await this.policyService.rollbackModel(version);
      }
      this.appendAudit({ version, action: 'rollback', success: true, deployedAt });
      this.logger.log(`[ModelDeployment] 回滚成功: version=${version}`);
      return { version, success: true, deployedAt };
    } catch (e: unknown) {
      const err = (e as Error)?.message ?? String(e);
      this.appendAudit({ version, action: 'rollback', success: false, deployedAt, error: err });
      this.logger.error(`[ModelDeployment] 回滚失败: version=${version}, error=${err}`);
      return { version, success: false, deployedAt, error: err };
    }
  }

  /** 获取部署审计日志（P5：部署流程可追溯） */
  getDeploymentAudit(): DeploymentAuditEntry[] {
    return [...this.deploymentAudit];
  }

  private appendAudit(entry: DeploymentAuditEntry): void {
    this.deploymentAudit.unshift(entry);
    if (this.deploymentAudit.length > this.maxAuditEntries) {
      this.deploymentAudit.pop();
    }
  }

  /**
   * 列出可部署的模型版本
   */
  async listDeployableVersions(): Promise<ModelRegistryEntry[]> {
    return this.modelRegistry.listModelVersions();
  }
}
