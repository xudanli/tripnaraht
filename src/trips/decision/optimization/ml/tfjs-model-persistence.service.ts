/**
 * Decision OS TensorFlow.js 模型持久化服务
 * 
 * 提供:
 * - 模型版本管理
 * - 检查点保存
 * - 自动备份
 * - 模型注册表
 */

import { Injectable, Logger } from '@nestjs/common';
import '@tensorflow/tfjs-node';
import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import * as path from 'path';

// ========== 类型定义 ==========

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  type: 'policy' | 'actor' | 'critic' | 'custom';
  path: string;
  metadata: ModelMetadataInfo;
  createdAt: string;
  updatedAt: string;
}

export interface ModelMetadataInfo {
  inputShape: number[];
  outputShape: number[];
  trainedEpochs: number;
  lastLoss: number;
  accuracy?: number;
  customData?: Record<string, unknown>;
}

export interface CheckpointInfo {
  id: string;
  modelId: string;
  epoch: number;
  loss: number;
  path: string;
  createdAt: string;
}

export interface ModelRegistry {
  models: Map<string, ModelInfo>;
  checkpoints: Map<string, CheckpointInfo[]>;
  activeVersions: Map<string, string>;
}

export interface SaveOptions {
  includeOptimizer?: boolean;
  createCheckpoint?: boolean;
  maxCheckpoints?: number;
  compress?: boolean;
}

export interface LoadOptions {
  version?: string;
  checkpoint?: string;
  strict?: boolean;
}

// ========== 模型持久化服务 ==========

@Injectable()
export class TFJSModelPersistenceService {
  private readonly logger = new Logger(TFJSModelPersistenceService.name);
  private registry: ModelRegistry;
  private basePath: string;

  constructor(basePath = './models') {
    this.basePath = basePath;
    this.registry = {
      models: new Map(),
      checkpoints: new Map(),
      activeVersions: new Map(),
    };
    this.ensureDirectoryExists(basePath);
  }

  async saveModel(
    model: tf.LayersModel,
    name: string,
    type: 'policy' | 'actor' | 'critic' | 'custom',
    metadata: Partial<ModelMetadataInfo> = {},
    options: SaveOptions = {},
  ): Promise<ModelInfo> {
    const version = this.generateVersion();
    const modelId = `${name}_${version}`;
    const modelPath = path.join(this.basePath, name, version);

    this.ensureDirectoryExists(modelPath);

    await model.save(`file://${modelPath}`);

    const inputShape = model.inputs[0].shape.slice(1) as number[];
    const outputShape = model.outputs[0].shape.slice(1) as number[];

    const modelInfo: ModelInfo = {
      id: modelId,
      name,
      version,
      type,
      path: modelPath,
      metadata: {
        inputShape,
        outputShape,
        trainedEpochs: metadata.trainedEpochs ?? 0,
        lastLoss: metadata.lastLoss ?? 0,
        accuracy: metadata.accuracy,
        customData: metadata.customData,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.registry.models.set(modelId, modelInfo);
    this.registry.activeVersions.set(name, version);

    await this.saveRegistry();

    if (options.createCheckpoint) {
      await this.createCheckpoint(model, modelId, metadata.trainedEpochs ?? 0, metadata.lastLoss ?? 0);
    }

    this.logger.log(`[TFJS-Persist] Model saved: ${modelId}`);

    return modelInfo;
  }

  async loadModel(name: string, options: LoadOptions = {}): Promise<tf.LayersModel> {
    let version = options.version;

    if (!version) {
      version = this.registry.activeVersions.get(name);
      if (!version) {
        throw new Error(`No active version found for model: ${name}`);
      }
    }

    const modelId = `${name}_${version}`;
    const modelInfo = this.registry.models.get(modelId);

    if (!modelInfo) {
      throw new Error(`Model not found: ${modelId}`);
    }

    let loadPath = modelInfo.path;

    if (options.checkpoint) {
      const checkpoints = this.registry.checkpoints.get(modelId);
      const checkpoint = checkpoints?.find(c => c.id === options.checkpoint);
      if (checkpoint) {
        loadPath = checkpoint.path;
      }
    }

    const model = await tf.loadLayersModel(`file://${loadPath}/model.json`);
    this.logger.log(`[TFJS-Persist] Model loaded: ${modelId}`);

    return model;
  }

  async createCheckpoint(
    model: tf.LayersModel,
    modelId: string,
    epoch: number,
    loss: number,
  ): Promise<CheckpointInfo> {
    const checkpointId = `${modelId}_ckpt_${epoch}`;
    const modelInfo = this.registry.models.get(modelId);

    if (!modelInfo) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const checkpointPath = path.join(
      this.basePath,
      modelInfo.name,
      'checkpoints',
      `epoch_${epoch}`,
    );

    this.ensureDirectoryExists(checkpointPath);
    await model.save(`file://${checkpointPath}`);

    const checkpointInfo: CheckpointInfo = {
      id: checkpointId,
      modelId,
      epoch,
      loss,
      path: checkpointPath,
      createdAt: new Date().toISOString(),
    };

    let checkpoints = this.registry.checkpoints.get(modelId) ?? [];
    checkpoints.push(checkpointInfo);

    checkpoints.sort((a, b) => b.epoch - a.epoch);
    if (checkpoints.length > 10) {
      const toRemove = checkpoints.slice(10);
      for (const ckpt of toRemove) {
        await this.deleteCheckpoint(ckpt);
      }
      checkpoints = checkpoints.slice(0, 10);
    }

    this.registry.checkpoints.set(modelId, checkpoints);
    await this.saveRegistry();

    this.logger.log(`[TFJS-Persist] Checkpoint created: ${checkpointId}`);

    return checkpointInfo;
  }

  async loadFromCheckpoint(modelId: string, epoch: number): Promise<tf.LayersModel> {
    const checkpoints = this.registry.checkpoints.get(modelId);
    const checkpoint = checkpoints?.find(c => c.epoch === epoch);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found for model ${modelId} at epoch ${epoch}`);
    }

    const model = await tf.loadLayersModel(`file://${checkpoint.path}/model.json`);
    this.logger.log(`[TFJS-Persist] Model loaded from checkpoint: epoch ${epoch}`);

    return model;
  }

  async deleteModel(name: string, version?: string): Promise<void> {
    if (version) {
      const modelId = `${name}_${version}`;
      const modelInfo = this.registry.models.get(modelId);
      if (modelInfo) {
        await this.deleteDirectory(modelInfo.path);
        this.registry.models.delete(modelId);
        this.registry.checkpoints.delete(modelId);
      }
    } else {
      const modelsToDelete = Array.from(this.registry.models.entries())
        .filter(([_, info]) => info.name === name);

      for (const [modelId, modelInfo] of modelsToDelete) {
        await this.deleteDirectory(modelInfo.path);
        this.registry.models.delete(modelId);
        this.registry.checkpoints.delete(modelId);
      }

      this.registry.activeVersions.delete(name);
    }

    await this.saveRegistry();
    this.logger.log(`[TFJS-Persist] Model deleted: ${name}${version ? `_${version}` : ''}`);
  }

  getModelInfo(name: string, version?: string): ModelInfo | undefined {
    if (version) {
      return this.registry.models.get(`${name}_${version}`);
    }

    const activeVersion = this.registry.activeVersions.get(name);
    if (activeVersion) {
      return this.registry.models.get(`${name}_${activeVersion}`);
    }

    return undefined;
  }

  listModels(name?: string): ModelInfo[] {
    const models = Array.from(this.registry.models.values());
    if (name) {
      return models.filter(m => m.name === name);
    }
    return models;
  }

  listCheckpoints(modelId: string): CheckpointInfo[] {
    return this.registry.checkpoints.get(modelId) ?? [];
  }

  getActiveVersion(name: string): string | undefined {
    return this.registry.activeVersions.get(name);
  }

  setActiveVersion(name: string, version: string): void {
    const modelId = `${name}_${version}`;
    if (!this.registry.models.has(modelId)) {
      throw new Error(`Model not found: ${modelId}`);
    }
    this.registry.activeVersions.set(name, version);
    this.saveRegistry();
  }

  async exportModel(modelId: string, exportPath: string): Promise<void> {
    const modelInfo = this.registry.models.get(modelId);
    if (!modelInfo) {
      throw new Error(`Model not found: ${modelId}`);
    }

    this.ensureDirectoryExists(exportPath);

    const model = await tf.loadLayersModel(`file://${modelInfo.path}/model.json`);
    await model.save(`file://${exportPath}`);

    const metadataPath = path.join(exportPath, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(modelInfo, null, 2));

    model.dispose();

    this.logger.log(`[TFJS-Persist] Model exported to: ${exportPath}`);
  }

  async importModel(importPath: string, name?: string): Promise<ModelInfo> {
    const metadataPath = path.join(importPath, 'metadata.json');
    let existingMetadata: Partial<ModelInfo> = {};

    if (fs.existsSync(metadataPath)) {
      existingMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }

    const modelName = name ?? existingMetadata.name ?? 'imported_model';
    const model = await tf.loadLayersModel(`file://${importPath}/model.json`);

    const modelInfo = await this.saveModel(
      model,
      modelName,
      existingMetadata.type ?? 'custom',
      existingMetadata.metadata ?? {},
    );

    model.dispose();

    this.logger.log(`[TFJS-Persist] Model imported: ${modelInfo.id}`);

    return modelInfo;
  }

  async getModelSize(modelId: string): Promise<number> {
    const modelInfo = this.registry.models.get(modelId);
    if (!modelInfo) {
      throw new Error(`Model not found: ${modelId}`);
    }

    return this.getDirectorySize(modelInfo.path);
  }

  async cleanupOldVersions(name: string, keepCount = 3): Promise<number> {
    const models = this.listModels(name)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let deletedCount = 0;

    if (models.length > keepCount) {
      const toDelete = models.slice(keepCount);
      for (const model of toDelete) {
        await this.deleteModel(model.name, model.version);
        deletedCount++;
      }
    }

    this.logger.log(`[TFJS-Persist] Cleaned up ${deletedCount} old versions of ${name}`);

    return deletedCount;
  }

  private async saveRegistry(): Promise<void> {
    const registryPath = path.join(this.basePath, 'registry.json');

    const serializable = {
      models: Array.from(this.registry.models.entries()),
      checkpoints: Array.from(this.registry.checkpoints.entries()),
      activeVersions: Array.from(this.registry.activeVersions.entries()),
    };

    fs.writeFileSync(registryPath, JSON.stringify(serializable, null, 2));
  }

  async loadRegistry(): Promise<void> {
    const registryPath = path.join(this.basePath, 'registry.json');

    if (fs.existsSync(registryPath)) {
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      this.registry = {
        models: new Map(data.models),
        checkpoints: new Map(data.checkpoints),
        activeVersions: new Map(data.activeVersions),
      };
      this.logger.log(`[TFJS-Persist] Registry loaded with ${this.registry.models.size} models`);
    }
  }

  private generateVersion(): string {
    const now = new Date();
    return `v${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private async deleteDirectory(dirPath: string): Promise<void> {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  private async deleteCheckpoint(checkpoint: CheckpointInfo): Promise<void> {
    await this.deleteDirectory(checkpoint.path);
  }

  private getDirectorySize(dirPath: string): number {
    let totalSize = 0;

    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        totalSize += this.getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }

    return totalSize;
  }
}

// ========== 模型版本比较工具 ==========

export class ModelVersionComparator {
  static compareVersions(v1: string, v2: string): number {
    const n1 = this.versionToNumber(v1);
    const n2 = this.versionToNumber(v2);
    return n1 - n2;
  }

  private static versionToNumber(version: string): number {
    const match = version.match(/v(\d{8})_(\d{6})/);
    if (match) {
      return parseInt(match[1] + match[2], 10);
    }
    return 0;
  }

  static isNewer(v1: string, v2: string): boolean {
    return this.compareVersions(v1, v2) > 0;
  }

  static getLatest(versions: string[]): string | undefined {
    if (versions.length === 0) return undefined;
    return versions.sort((a, b) => this.compareVersions(b, a))[0];
  }
}

// ========== 自动备份服务 ==========

@Injectable()
export class ModelAutoBackupService {
  private readonly logger = new Logger(ModelAutoBackupService.name);
  private backupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly persistenceService: TFJSModelPersistenceService,
    private readonly backupPath = './model_backups',
  ) {}

  startAutoBackup(intervalMs = 3600000): void {
    if (this.backupInterval) {
      this.stopAutoBackup();
    }

    this.backupInterval = setInterval(async () => {
      await this.performBackup();
    }, intervalMs);

    this.logger.log(`[TFJS-Backup] Auto backup started with interval ${intervalMs}ms`);
  }

  stopAutoBackup(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      this.logger.log('[TFJS-Backup] Auto backup stopped');
    }
  }

  async performBackup(): Promise<string[]> {
    const models = this.persistenceService.listModels();
    const backedUp: string[] = [];

    for (const model of models) {
      const activeVersion = this.persistenceService.getActiveVersion(model.name);
      if (activeVersion === model.version) {
        const backupDir = path.join(
          this.backupPath,
          model.name,
          new Date().toISOString().split('T')[0],
        );

        try {
          await this.persistenceService.exportModel(model.id, backupDir);
          backedUp.push(model.id);
        } catch (error) {
          this.logger.error(`[TFJS-Backup] Failed to backup ${model.id}: ${(error as Error).message}`);
        }
      }
    }

    this.logger.log(`[TFJS-Backup] Backed up ${backedUp.length} models`);

    return backedUp;
  }

  async cleanupOldBackups(maxAgeDays = 7): Promise<number> {
    if (!fs.existsSync(this.backupPath)) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    let deletedCount = 0;
    const modelDirs = fs.readdirSync(this.backupPath);

    for (const modelDir of modelDirs) {
      const modelPath = path.join(this.backupPath, modelDir);
      if (!fs.statSync(modelPath).isDirectory()) continue;

      const dateDirs = fs.readdirSync(modelPath);
      for (const dateDir of dateDirs) {
        const backupDate = new Date(dateDir);
        if (backupDate < cutoffDate) {
          fs.rmSync(path.join(modelPath, dateDir), { recursive: true, force: true });
          deletedCount++;
        }
      }
    }

    this.logger.log(`[TFJS-Backup] Cleaned up ${deletedCount} old backups`);

    return deletedCount;
  }
}
