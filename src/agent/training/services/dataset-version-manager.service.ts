// src/agent/training/services/dataset-version-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ETLExportResult } from '../interfaces/trajectory.interface';
import { DataQualityResult } from './data-quality-checker.service';

/**
 * 数据集版本元数据
 */
export interface DatasetVersionMetadata {
  version: string; // 语义化版本号（如v1.0.0）
  created_at: string; // ISO 8601
  data_source: {
    date_range?: {
      start: string;
      end: string;
    };
    filter_criteria: {
      min_validation_score?: number;
      min_total_reward?: number;
      model_version?: string;
      country_code?: string;
      trajectory_ids?: string[];
      request_ids?: string[];
    };
    total_trajectories: number;
  };
  quality_report: {
    score: number;
    stats: DataQualityResult['stats'];
    issues_count: number;
  };
  code_version: {
    git_commit_hash: string;
    git_branch?: string;
    etl_service_version?: string;
  };
  config_hash: string; // ETL配置的哈希值
  file_info: {
    format: string;
    file_path: string;
    file_size_bytes: number;
    record_count: number;
  };
  anonymization?: {
    enabled: boolean;
    config_hash?: string;
  };
}

/**
 * 数据集版本
 */
export interface DatasetVersion {
  version: string;
  metadata: DatasetVersionMetadata;
  created_at: string;
  updated_at: string;
}

/**
 * DatasetVersionManagerService
 * 
 * 职责：实现数据集版本管理（版本号、元数据、可复现性）
 * 
 * 功能：
 * 1. createDatasetVersion() - 创建数据集版本
 * 2. getDatasetVersion() - 获取指定版本
 * 3. listDatasetVersions() - 列出所有版本
 * 4. compareVersions() - 对比两个版本
 */
@Injectable()
export class DatasetVersionManagerService {
  private readonly logger = new Logger(DatasetVersionManagerService.name);
  private readonly versionsDir: string = './data/training/versions';
  private readonly metadataFile: string = './data/training/versions/metadata.json';

  constructor(private readonly prisma: PrismaService) {
    // 确保版本目录存在
    this.ensureVersionsDir();
  }

  /**
   * 创建数据集版本
   */
  async createDatasetVersion(
    exportResult: ETLExportResult,
    qualityResult: DataQualityResult,
    dataSource: {
      date_range?: { start: string; end: string };
      filter_criteria: Record<string, any>;
      total_trajectories: number;
    },
    anonymization?: {
      enabled: boolean;
      config_hash?: string;
    },
  ): Promise<DatasetVersion> {
    this.logger.log(`[DatasetVersionManager] 创建数据集版本`);

    // 1. 获取下一个版本号
    const version = await this.getNextVersion();

    // 2. 获取代码版本（git commit hash）
    const codeVersion = this.getCodeVersion();

    // 3. 计算配置哈希
    const configHash = this.calculateConfigHash(dataSource.filter_criteria);

    // 4. 构建版本元数据
    const metadata: DatasetVersionMetadata = {
      version,
      created_at: new Date().toISOString(),
      data_source: {
        date_range: dataSource.date_range,
        filter_criteria: dataSource.filter_criteria,
        total_trajectories: dataSource.total_trajectories,
      },
      quality_report: {
        score: qualityResult.score,
        stats: qualityResult.stats,
        issues_count: qualityResult.issues.length,
      },
      code_version: {
        git_commit_hash: codeVersion.commitHash,
        git_branch: codeVersion.branch,
        etl_service_version: '1.0.0', // 可以从package.json读取
      },
      config_hash: configHash,
      file_info: {
        format: exportResult.format,
        file_path: exportResult.file_path,
        file_size_bytes: exportResult.file_size_bytes,
        record_count: exportResult.record_count,
      },
      anonymization,
    };

    // 5. 创建版本目录
    const versionDir = path.join(this.versionsDir, version);
    await fs.mkdir(versionDir, { recursive: true });

    // 6. 复制数据集文件到版本目录
    const versionFilePath = path.join(versionDir, `dataset.${exportResult.format}`);
    await fs.copyFile(exportResult.file_path, versionFilePath);
    metadata.file_info.file_path = versionFilePath;

    // 7. 保存版本元数据
    const metadataPath = path.join(versionDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // 8. 更新版本索引
    await this.updateVersionIndex(version, metadata);

    const datasetVersion: DatasetVersion = {
      version,
      metadata,
      created_at: metadata.created_at,
      updated_at: metadata.created_at,
    };

    this.logger.log(
      `[DatasetVersionManager] 数据集版本创建成功: version=${version}, filePath=${versionFilePath}`,
    );

    return datasetVersion;
  }

  /**
   * 获取指定版本
   */
  async getDatasetVersion(version: string): Promise<DatasetVersion | null> {
    const metadataPath = path.join(this.versionsDir, version, 'metadata.json');

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: DatasetVersionMetadata = JSON.parse(metadataContent);

      return {
        version,
        metadata,
        created_at: metadata.created_at,
        updated_at: metadata.created_at,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.warn(`[DatasetVersionManager] 版本不存在: version=${version}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * 列出所有版本
   */
  async listDatasetVersions(): Promise<DatasetVersion[]> {
    try {
      const indexContent = await fs.readFile(this.metadataFile, 'utf-8');
      const index: Record<string, DatasetVersionMetadata> = JSON.parse(indexContent);

      const versions: DatasetVersion[] = [];
      for (const [version, metadata] of Object.entries(index)) {
        versions.push({
          version,
          metadata,
          created_at: metadata.created_at,
          updated_at: metadata.created_at,
        });
      }

      // 按版本号排序（降序）
      versions.sort((a, b) => this.compareVersionNumbers(b.version, a.version));

      return versions;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 索引文件不存在，返回空列表
        return [];
      }
      throw error;
    }
  }

  /**
   * 对比两个版本
   */
  async compareVersions(
    version1: string,
    version2: string,
  ): Promise<{
    version1: DatasetVersion;
    version2: DatasetVersion;
    differences: {
      data_source: {
        total_trajectories_diff: number;
        filter_criteria_diff: Record<string, any>;
      };
      quality: {
        score_diff: number;
        stats_diff: Record<string, any>;
      };
      code_version: {
        commit_hash_diff: boolean;
      };
      config_hash_diff: boolean;
    };
  }> {
    const v1 = await this.getDatasetVersion(version1);
    const v2 = await this.getDatasetVersion(version2);

    if (!v1 || !v2) {
      throw new Error(`版本不存在: ${!v1 ? version1 : version2}`);
    }

    const differences = {
      data_source: {
        total_trajectories_diff:
          v2.metadata.data_source.total_trajectories -
          v1.metadata.data_source.total_trajectories,
        filter_criteria_diff: this.diffObjects(
          v1.metadata.data_source.filter_criteria,
          v2.metadata.data_source.filter_criteria,
        ),
      },
      quality: {
        score_diff: v2.metadata.quality_report.score - v1.metadata.quality_report.score,
        stats_diff: this.diffObjects(
          v1.metadata.quality_report.stats,
          v2.metadata.quality_report.stats,
        ),
      },
      code_version: {
        commit_hash_diff:
          v1.metadata.code_version.git_commit_hash !==
          v2.metadata.code_version.git_commit_hash,
      },
      config_hash_diff: v1.metadata.config_hash !== v2.metadata.config_hash,
    };

    return {
      version1: v1,
      version2: v2,
      differences,
    };
  }

  /**
   * 获取下一个版本号
   */
  private async getNextVersion(): Promise<string> {
    const versions = await this.listDatasetVersions();

    if (versions.length === 0) {
      return 'v1.0.0';
    }

    // 获取最新版本
    const latestVersion = versions[0];
    const versionNumbers = latestVersion.version.replace('v', '').split('.').map(Number);

    // 递增补丁版本号
    versionNumbers[2] += 1;

    return `v${versionNumbers.join('.')}`;
  }

  /**
   * 获取代码版本（git commit hash）
   */
  private getCodeVersion(): { commitHash: string; branch?: string } {
    try {
      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      let branch: string | undefined;
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      } catch (error) {
        // 忽略分支获取失败
      }
      return { commitHash, branch };
    } catch (error: any) {
      this.logger.warn(`[DatasetVersionManager] 无法获取git信息: ${error?.message}`);
      return { commitHash: 'unknown', branch: undefined };
    }
  }

  /**
   * 计算配置哈希
   */
  private calculateConfigHash(config: Record<string, any>): string {
    const configStr = JSON.stringify(config, Object.keys(config).sort());
    return createHash('sha256').update(configStr).digest('hex').substring(0, 16);
  }

  /**
   * 更新版本索引
   */
  private async updateVersionIndex(
    version: string,
    metadata: DatasetVersionMetadata,
  ): Promise<void> {
    let index: Record<string, DatasetVersionMetadata> = {};

    try {
      const indexContent = await fs.readFile(this.metadataFile, 'utf-8');
      index = JSON.parse(indexContent);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // 索引文件不存在，创建新的
    }

    index[version] = metadata;

    await fs.writeFile(this.metadataFile, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * 对比版本号
   */
  private compareVersionNumbers(v1: string, v2: string): number {
    const v1Numbers = v1.replace('v', '').split('.').map(Number);
    const v2Numbers = v2.replace('v', '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (v1Numbers[i] > v2Numbers[i]) return 1;
      if (v1Numbers[i] < v2Numbers[i]) return -1;
    }

    return 0;
  }

  /**
   * 对比两个对象
   */
  private diffObjects(obj1: Record<string, any>, obj2: Record<string, any>): Record<string, any> {
    const diff: Record<string, any> = {};
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
      const val1 = obj1[key];
      const val2 = obj2[key];

      if (val1 !== val2) {
        diff[key] = {
          old: val1,
          new: val2,
        };
      }
    }

    return diff;
  }

  /**
   * 确保版本目录存在
   */
  private async ensureVersionsDir(): Promise<void> {
    try {
      await fs.mkdir(this.versionsDir, { recursive: true });
    } catch (error: any) {
      this.logger.error(
        `[DatasetVersionManager] 无法创建版本目录: ${error?.message}`,
      );
    }
  }
}
