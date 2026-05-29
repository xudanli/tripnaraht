import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import type {
  RegisterShadowAdapterRequest,
  ShadowPromotionResult,
} from '../interfaces/shadow-deployment.types';
import type { SftThenDpoPipelineStatus } from '../interfaces/fine-tune-pipeline.types';
import { ShadowDeploymentRegistryService } from './shadow-deployment-registry.service';
import { HarnessShadowGraderService } from './harness-shadow-grader.service';
import { ModelRegistryService } from './model-registry.service';
import { ModelDeploymentService } from './model-deployment.service';
import { VllmClientService } from './vllm-client.service';
import type {
  ModelVersion,
  TrainingMetrics,
} from '../interfaces/training-platform.interface';

function shadowRegistryTrainingMetrics(samplesProcessed: number): TrainingMetrics {
  return {
    loss: 0,
    learning_rate: 0,
    epoch: 0,
    step: 0,
    timestamp: new Date().toISOString(),
    final_loss: 0,
    training_time_seconds: 0,
    samples_processed: samplesProcessed,
  };
}

/**
 * 飞轮训练完成 → 阴影注册 → 异步评测 → 晋升门控。
 */
@Injectable()
export class ShadowDeploymentWorkflowService {
  private readonly logger = new Logger(ShadowDeploymentWorkflowService.name);

  /** 防并发震荡：同一 shadow 版本同时只允许一次晋升 */
  private readonly promotionInFlight = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: ShadowDeploymentRegistryService,
    @Optional() private readonly shadowGrader?: HarnessShadowGraderService,
    @Optional() private readonly modelRegistry?: ModelRegistryService,
    @Optional() private readonly modelDeployment?: ModelDeploymentService,
    @Optional() private readonly vllm?: VllmClientService,
  ) {}

  isShadowDeployEnabled(): boolean {
    const v = this.configService.get<string>('TRAINING_SHADOW_DEPLOY_ENABLED')?.trim();
    return v === '1' || v === 'true';
  }

  /**
   * sft_then_dpo 完成且拿到 production_adapter_path 后调用。
   */
  async onFlywheelPipelineCompleted(
    pipeline: SftThenDpoPipelineStatus,
  ): Promise<{ shadowVersion?: string; registered: boolean; reason?: string }> {
    if (!this.isShadowDeployEnabled()) {
      return { registered: false, reason: 'TRAINING_SHADOW_DEPLOY_ENABLED=0' };
    }

    if (pipeline.stage !== 'completed' || !pipeline.production_adapter_path) {
      return {
        registered: false,
        reason: `pipeline_not_ready stage=${pipeline.stage}`,
      };
    }

    const minValidation = Number(
      this.configService.get<string>('SHADOW_MIN_VALIDATION_SCORE') ?? '0.92',
    );

    const baseline =
      (await this.modelDeployment?.getCurrentDeployedVersion()) ??
      this.configService.get<string>('SHADOW_BASELINE_VERSION') ??
      'production-stable';

    const vllmPath = this.toVllmContainerAdapterPath(pipeline.production_adapter_path);

    const registration = await this.registerShadowAdapter({
      taskId: pipeline.task_id,
      adapterPath: vllmPath,
      routingStrategy: 'SHADOW_GRADER_ONLY',
      minValidationScore: minValidation,
      baselineProductionVersion: baseline,
    });

    return {
      registered: true,
      shadowVersion: registration.shadowVersion,
    };
  }

  async registerShadowAdapter(
    request: RegisterShadowAdapterRequest,
  ): Promise<{ shadowVersion: string; loraLoaded: boolean }> {
    const reg = this.registry.register(request);

    await this.registerShadowModelVersion(reg.shadowVersion, request.adapterPath, request.taskId);

    let loraLoaded = false;
    if (this.vllm?.isServiceAvailable()) {
      loraLoaded = await this.vllm.loadLoraAdapter(reg.vllmAdapterName, request.adapterPath);
      this.registry.markLoraLoaded(reg.shadowVersion, loraLoaded);
      if (!loraLoaded) {
        this.logger.warn(
          `[ShadowDeploy] vLLM LoRA load failed for ${reg.vllmAdapterName}; grader uses heuristic fallback`,
        );
        this.registry.markLifecycle(reg.shadowVersion, 'ACTIVE');
      }
    } else {
      this.registry.markLifecycle(reg.shadowVersion, 'ACTIVE');
      this.logger.warn('[ShadowDeploy] vLLM unavailable; shadow grader heuristic-only');
    }

    if (this.shadowGrader && !this.shadowGrader.isEnabled()) {
      this.logger.log(
        '[ShadowDeploy] enable SHADOW_GRADER_ENABLED=1 to collect online shadow samples',
      );
    }

    return { shadowVersion: reg.shadowVersion, loraLoaded };
  }

  /**
   * Cron / API 统一晋升入口（含互斥锁与晋升后退役）。
   */
  async promote(
    shadowVersion: string,
    options?: { force?: boolean },
  ): Promise<ShadowPromotionResult> {
    if (this.promotionInFlight.has(shadowVersion)) {
      return { shadowVersion, promoted: false, reason: 'promotion_in_progress' };
    }

    const reg = this.registry.getRegistration(shadowVersion);
    if (reg?.lifecycle === 'PROMOTED') {
      return { shadowVersion, promoted: false, reason: 'already_promoted' };
    }

    if (!this.registry.isEligibleForInspection(shadowVersion) && !options?.force) {
      return { shadowVersion, promoted: false, reason: 'not_eligible_for_inspection' };
    }

    this.promotionInFlight.add(shadowVersion);
    try {
      const result = await this.tryPromoteShadowToProduction(shadowVersion, options);
      if (result.promoted) {
        this.registry.retireFromActiveInspection(shadowVersion);
        if (reg?.vllmAdapterName && this.vllm?.isServiceAvailable()) {
          void this.vllm.unloadLoraAdapter(reg.vllmAdapterName).catch(() => undefined);
        }
      }
      return result;
    } finally {
      this.promotionInFlight.delete(shadowVersion);
    }
  }

  async tryPromoteShadowToProduction(
    shadowVersion: string,
    options?: { force?: boolean },
  ): Promise<ShadowPromotionResult> {
    const metrics = this.registry.aggregateMetrics(shadowVersion);
    const reg = this.registry.getRegistration(shadowVersion);

    if (!reg) {
      return { shadowVersion, promoted: false, reason: 'shadow_version_not_found' };
    }

    if (reg.lifecycle === 'PROMOTED') {
      return { shadowVersion, promoted: false, reason: 'already_promoted' };
    }

    const autoPromote =
      options?.force === true ||
      this.configService.get<string>('SHADOW_PROMOTION_AUTO')?.trim() === '1';

    if (!metrics.promotionReady && !options?.force) {
      return {
        shadowVersion,
        promoted: false,
        reason: `gate_blocked: ${metrics.promotionBlockers.join(',')}`,
      };
    }

    if (!autoPromote && !options?.force) {
      return {
        shadowVersion,
        promoted: false,
        reason: 'promotion_ready_manual_approval_required',
      };
    }

    const productionVersion = reg.shadowVersion.replace(/^shadow-/, 'planner-');

    if (this.modelRegistry) {
      const existing = await this.modelRegistry.getModelVersion(productionVersion);
      if (!existing) {
        const mv: ModelVersion = {
          version: productionVersion,
          model_path: reg.adapterPath,
          created_at: new Date().toISOString(),
          status: 'COMPLETED',
          training_metrics: shadowRegistryTrainingMetrics(metrics.sampleCount),
          eval_metrics: {
            shadow_win_rate: metrics.shadowWinRate,
            shadow_samples: metrics.sampleCount,
          },
          training_config: {
            batch_size: 1,
            learning_rate: 0,
            num_epochs: 0,
          },
          model_config: {
            model_type: 'DPO',
            custom_model_path: reg.adapterPath,
          },
          dataset_version: reg.taskId,
        };
        await this.modelRegistry.registerModel(mv, mv.eval_metrics);
      }
    }

    if (this.modelDeployment) {
      const deploy = await this.modelDeployment.deployVersion(productionVersion);
      if (!deploy.success) {
        return {
          shadowVersion,
          promoted: false,
          reason: deploy.error ?? 'deploy_failed',
        };
      }
    }

    this.logger.log(
      `[ShadowDeploy] PROMOTED ${shadowVersion} → production ${productionVersion} ` +
        `(samples=${metrics.sampleCount} win_rate=${metrics.shadowWinRate.toFixed(3)})`,
    );

    return {
      shadowVersion,
      promoted: true,
      productionVersion,
      reason: 'shadow_metrics_passed_promotion_gate',
    };
  }

  getShadowMetricsPrometheus(shadowVersion?: string): string {
    return this.registry.toPrometheusMetrics(shadowVersion);
  }

  getShadowMetrics(shadowVersion: string) {
    return this.registry.aggregateMetrics(shadowVersion);
  }

  listShadowRegistrations() {
    return this.registry.listRegistrations();
  }

  getActiveShadow() {
    return this.registry.getActiveShadow();
  }

  private async registerShadowModelVersion(
    shadowVersion: string,
    adapterPath: string,
    taskId: string,
  ): Promise<void> {
    if (!this.modelRegistry) return;

    const mv: ModelVersion = {
      version: shadowVersion,
      model_path: adapterPath,
      created_at: new Date().toISOString(),
      status: 'COMPLETED',
      training_metrics: shadowRegistryTrainingMetrics(0),
      training_config: {
        batch_size: 1,
        learning_rate: 0,
        num_epochs: 0,
      },
      model_config: {
        model_type: 'DPO',
        custom_model_path: adapterPath,
      },
      dataset_version: taskId,
      eval_metrics: { shadow_role: 1 },
    };

    try {
      await this.modelRegistry.registerModel(mv);
      await this.modelRegistry.setStagingVersion(shadowVersion);
    } catch (err) {
      this.logger.warn(
        `[ShadowDeploy] model registry shadow register skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** 训练容器路径 → vLLM 可读路径 */
  toVllmContainerAdapterPath(adapterPath: string): string {
    const resolved = path.resolve(adapterPath);
    const mountFrom =
      this.configService.get<string>('TRAINING_SHADOW_ADAPTER_MOUNT_FROM')?.trim() ||
      path.resolve('./outputs');
    const mountTo =
      this.configService.get<string>('TRAINING_SHADOW_ADAPTER_MOUNT_TO')?.trim() ||
      '/app/outputs';

    const fromResolved = path.resolve(mountFrom);
    if (
      resolved === fromResolved ||
      resolved.startsWith(`${fromResolved}${path.sep}`)
    ) {
      return path.join(mountTo, path.relative(fromResolved, resolved));
    }
    return adapterPath;
  }
}
