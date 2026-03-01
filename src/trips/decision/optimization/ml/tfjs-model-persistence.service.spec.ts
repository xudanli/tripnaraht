/**
 * TensorFlow.js 模型持久化服务测试
 */

import '@tensorflow/tfjs-node';
import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import * as path from 'path';
import {
  TFJSModelPersistenceService,
  ModelVersionComparator,
  ModelAutoBackupService,
} from './tfjs-model-persistence.service';

describe('TFJSModelPersistenceService', () => {
  let service: TFJSModelPersistenceService;
  const testBasePath = './test_models_' + Date.now();

  beforeEach(() => {
    service = new TFJSModelPersistenceService(testBasePath);
  });

  afterEach(async () => {
    if (fs.existsSync(testBasePath)) {
      fs.rmSync(testBasePath, { recursive: true, force: true });
    }
  });

  const createTestModel = (): tf.LayersModel => {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [4], units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 2, activation: 'softmax' }));
    model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });
    return model;
  };

  describe('saveModel', () => {
    it('should save model to filesystem', async () => {
      const model = createTestModel();

      const modelInfo = await service.saveModel(model, 'test_policy', 'policy', {
        trainedEpochs: 10,
        lastLoss: 0.5,
      });

      expect(modelInfo.name).toBe('test_policy');
      expect(modelInfo.type).toBe('policy');
      expect(modelInfo.metadata.trainedEpochs).toBe(10);
      expect(fs.existsSync(modelInfo.path)).toBe(true);

      model.dispose();
    });

    it('should generate version automatically', async () => {
      const model = createTestModel();

      const modelInfo = await service.saveModel(model, 'versioned_model', 'policy');

      expect(modelInfo.version).toMatch(/^v\d{8}_\d{6}$/);

      model.dispose();
    });

    it('should update registry', async () => {
      const model = createTestModel();

      const modelInfo = await service.saveModel(model, 'registry_test', 'policy');

      const retrieved = service.getModelInfo('registry_test');
      expect(retrieved?.id).toBe(modelInfo.id);

      model.dispose();
    });
  });

  describe('loadModel', () => {
    it('should load model from filesystem', async () => {
      const model = createTestModel();
      await service.saveModel(model, 'load_test', 'policy');
      model.dispose();

      const loadedModel = await service.loadModel('load_test');

      expect(loadedModel).toBeDefined();
      expect(loadedModel.inputs[0].shape).toEqual([null, 4]);

      loadedModel.dispose();
    });

    it('should throw if model not found', async () => {
      await expect(service.loadModel('nonexistent')).rejects.toThrow('No active version found');
    });

    it('should load specific version', async () => {
      const model1 = createTestModel();
      const info1 = await service.saveModel(model1, 'multi_version', 'policy');
      model1.dispose();

      await new Promise(resolve => setTimeout(resolve, 1100));

      const model2 = createTestModel();
      const info2 = await service.saveModel(model2, 'multi_version', 'policy');
      model2.dispose();

      const loadedV1 = await service.loadModel('multi_version', { version: info1.version });
      expect(loadedV1).toBeDefined();
      loadedV1.dispose();
    });
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint', async () => {
      const model = createTestModel();
      const modelInfo = await service.saveModel(model, 'ckpt_test', 'policy');

      const checkpoint = await service.createCheckpoint(model, modelInfo.id, 5, 0.3);

      expect(checkpoint.epoch).toBe(5);
      expect(checkpoint.loss).toBe(0.3);
      expect(fs.existsSync(checkpoint.path)).toBe(true);

      model.dispose();
    });

    it('should list checkpoints', async () => {
      const model = createTestModel();
      const modelInfo = await service.saveModel(model, 'list_ckpt', 'policy');

      await service.createCheckpoint(model, modelInfo.id, 1, 0.5);
      await service.createCheckpoint(model, modelInfo.id, 2, 0.4);

      const checkpoints = service.listCheckpoints(modelInfo.id);
      expect(checkpoints.length).toBe(2);

      model.dispose();
    });
  });

  describe('loadFromCheckpoint', () => {
    it('should load from checkpoint', async () => {
      const model = createTestModel();
      const modelInfo = await service.saveModel(model, 'load_ckpt', 'policy');
      await service.createCheckpoint(model, modelInfo.id, 10, 0.2);
      model.dispose();

      const loadedModel = await service.loadFromCheckpoint(modelInfo.id, 10);

      expect(loadedModel).toBeDefined();
      loadedModel.dispose();
    });
  });

  describe('deleteModel', () => {
    it('should delete specific version', async () => {
      const model = createTestModel();
      const modelInfo = await service.saveModel(model, 'delete_test', 'policy');
      model.dispose();

      await service.deleteModel('delete_test', modelInfo.version);

      expect(service.getModelInfo('delete_test', modelInfo.version)).toBeUndefined();
    });

    it('should delete all versions', async () => {
      const model1 = createTestModel();
      await service.saveModel(model1, 'delete_all', 'policy');
      model1.dispose();

      const model2 = createTestModel();
      await service.saveModel(model2, 'delete_all', 'policy');
      model2.dispose();

      await service.deleteModel('delete_all');

      const models = service.listModels('delete_all');
      expect(models.length).toBe(0);
    });
  });

  describe('listModels', () => {
    it('should list all models', async () => {
      const model1 = createTestModel();
      await service.saveModel(model1, 'list_1', 'policy');
      model1.dispose();

      const model2 = createTestModel();
      await service.saveModel(model2, 'list_2', 'actor');
      model2.dispose();

      const models = service.listModels();
      expect(models.length).toBe(2);
    });

    it('should filter by name', async () => {
      const model1 = createTestModel();
      await service.saveModel(model1, 'filter_a', 'policy');
      model1.dispose();

      const model2 = createTestModel();
      await service.saveModel(model2, 'filter_b', 'policy');
      model2.dispose();

      const models = service.listModels('filter_a');
      expect(models.length).toBe(1);
      expect(models[0].name).toBe('filter_a');
    });
  });

  describe('version management', () => {
    it('should get active version', async () => {
      const model = createTestModel();
      const modelInfo = await service.saveModel(model, 'active_test', 'policy');
      model.dispose();

      const activeVersion = service.getActiveVersion('active_test');
      expect(activeVersion).toBe(modelInfo.version);
    });

    it('should set active version', async () => {
      const model1 = createTestModel();
      const info1 = await service.saveModel(model1, 'set_active', 'policy');
      model1.dispose();

      await new Promise(resolve => setTimeout(resolve, 1100));

      const model2 = createTestModel();
      await service.saveModel(model2, 'set_active', 'policy');
      model2.dispose();

      service.setActiveVersion('set_active', info1.version);
      expect(service.getActiveVersion('set_active')).toBe(info1.version);
    });
  });

  describe('exportModel', () => {
    it('should export model to path', async () => {
      const model = createTestModel();
      const modelInfo = await service.saveModel(model, 'export_test', 'policy');
      model.dispose();

      const exportPath = path.join(testBasePath, 'exported');
      await service.exportModel(modelInfo.id, exportPath);

      expect(fs.existsSync(path.join(exportPath, 'model.json'))).toBe(true);
      expect(fs.existsSync(path.join(exportPath, 'metadata.json'))).toBe(true);
    });
  });

  describe('importModel', () => {
    it('should import model from path', async () => {
      const model = createTestModel();
      const modelInfo = await service.saveModel(model, 'import_source', 'policy');
      model.dispose();

      const exportPath = path.join(testBasePath, 'to_import');
      await service.exportModel(modelInfo.id, exportPath);

      const newService = new TFJSModelPersistenceService(path.join(testBasePath, 'new_registry'));
      const importedInfo = await newService.importModel(exportPath, 'imported_model');

      expect(importedInfo.name).toBe('imported_model');
    });
  });

  describe('cleanupOldVersions', () => {
    it('should keep only specified number of versions', async () => {
      const model1 = createTestModel();
      await service.saveModel(model1, 'cleanup_test', 'policy');
      model1.dispose();

      await new Promise(resolve => setTimeout(resolve, 1100));

      const model2 = createTestModel();
      await service.saveModel(model2, 'cleanup_test', 'policy');
      model2.dispose();

      await new Promise(resolve => setTimeout(resolve, 1100));

      const model3 = createTestModel();
      await service.saveModel(model3, 'cleanup_test', 'policy');
      model3.dispose();

      const deleted = await service.cleanupOldVersions('cleanup_test', 2);

      expect(deleted).toBe(1);
      expect(service.listModels('cleanup_test').length).toBe(2);
    });
  });
});

describe('ModelVersionComparator', () => {
  it('should compare versions correctly', () => {
    const v1 = 'v20260227_100000';
    const v2 = 'v20260227_110000';

    expect(ModelVersionComparator.compareVersions(v1, v2)).toBeLessThan(0);
    expect(ModelVersionComparator.compareVersions(v2, v1)).toBeGreaterThan(0);
    expect(ModelVersionComparator.compareVersions(v1, v1)).toBe(0);
  });

  it('should detect newer version', () => {
    expect(ModelVersionComparator.isNewer('v20260228_100000', 'v20260227_100000')).toBe(true);
    expect(ModelVersionComparator.isNewer('v20260227_100000', 'v20260228_100000')).toBe(false);
  });

  it('should get latest version', () => {
    const versions = [
      'v20260225_100000',
      'v20260227_100000',
      'v20260226_100000',
    ];

    expect(ModelVersionComparator.getLatest(versions)).toBe('v20260227_100000');
  });

  it('should return undefined for empty array', () => {
    expect(ModelVersionComparator.getLatest([])).toBeUndefined();
  });
});

describe('ModelAutoBackupService', () => {
  let persistenceService: TFJSModelPersistenceService;
  let backupService: ModelAutoBackupService;
  const testBasePath = './test_backup_' + Date.now();
  const backupPath = './test_backup_dest_' + Date.now();

  beforeEach(() => {
    persistenceService = new TFJSModelPersistenceService(testBasePath);
    backupService = new ModelAutoBackupService(persistenceService, backupPath);
  });

  afterEach(async () => {
    backupService.stopAutoBackup();
    if (fs.existsSync(testBasePath)) {
      fs.rmSync(testBasePath, { recursive: true, force: true });
    }
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }
  });

  const createTestModel = (): tf.LayersModel => {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [4], units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 2, activation: 'softmax' }));
    model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });
    return model;
  };

  it('should perform backup', async () => {
    const model = createTestModel();
    await persistenceService.saveModel(model, 'backup_model', 'policy');
    model.dispose();

    const backedUp = await backupService.performBackup();

    expect(backedUp.length).toBe(1);
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  it('should start and stop auto backup', () => {
    backupService.startAutoBackup(60000);
    backupService.stopAutoBackup();
  });
});
