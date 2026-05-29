import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as path from 'path';
import { TrajectoryETLService } from './trajectory-etl.service';
import type { DecisionTrajectoryTrainingPackResult } from '../interfaces/decision-trajectory-etl.types';

export interface PythonDecisionPackRegistration {
  dpo_registered_path: string;
  sft_train_registered_path?: string;
  manifest_path: string;
  line_count: number;
  by_pair_type: Record<string, number>;
  by_rejected_source: Record<string, number>;
}

/**
 * PR-D：微调 / 训练流水线启动前，增量导出 decision_trajectories → DPO/SFT 数据集。
 */
@Injectable()
export class DecisionTrajectoryTrainingSyncService {
  private readonly logger = new Logger(DecisionTrajectoryTrainingSyncService.name);

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly trajectoryEtl?: TrajectoryETLService,
    @Optional() private readonly httpService?: HttpService,
  ) {}

  isSyncEnabled(): boolean {
    const v = this.configService?.get<string>('TRAINING_DECISION_TRAJECTORY_ETL_ENABLED')?.trim();
    return v === '1' || v === 'true';
  }

  /**
   * 在 LoRA / TrainingPipeline 启动前调用：拉取 FINALIZED 增量并写出训练包。
   */
  async syncIncrementalTrainingPackIfEnabled(overrides?: {
    updated_after?: string;
    limit?: number;
    output_dir?: string;
  }): Promise<DecisionTrajectoryTrainingPackResult | null> {
    if (!this.isSyncEnabled() || !this.trajectoryEtl) {
      return null;
    }

    const outputDir =
      overrides?.output_dir ??
      this.configService?.get<string>('TRAINING_DECISION_TRAJECTORY_OUTPUT_DIR') ??
      './data/training/decision-trajectories';

    const updatedAfter =
      overrides?.updated_after ??
      this.configService?.get<string>('TRAINING_DECISION_TRAJECTORY_UPDATED_AFTER');

    const limit = overrides?.limit ?? Number(
      this.configService?.get<string>('TRAINING_DECISION_TRAJECTORY_ETL_LIMIT') ?? '2000',
    );

    this.logger.log(
      `[DecisionTrajectoryTrainingSync] 增量导出 decision_trajectories → ${outputDir}`,
    );

    const result = await this.trajectoryEtl.exportDecisionTrajectoryTrainingPack(
      {
        updated_after: updatedAfter,
        limit: Number.isFinite(limit) ? limit : 2000,
        exclude_critical_fail: true,
      },
      outputDir,
    );

    this.logger.log(
      `[DecisionTrajectoryTrainingSync] 完成: dpo=${result.stats.dpo_planner_obedience + result.stats.dpo_debate_narrator} ` +
        `topology_dpo_file=${result.dpo_jsonl_path}`,
    );

    return result;
  }

  /** 供 Python LoRA 服务读取的 DPO JSONL 路径（同步后最新文件）。 */
  getLatestDpoJsonlPath(pack: DecisionTrajectoryTrainingPackResult | null): string | undefined {
    return pack?.dpo_jsonl_path;
  }

  isPythonRegisterEnabled(): boolean {
    const v = this.configService?.get<string>('TRAINING_PYTHON_DATASET_REGISTER_ENABLED')?.trim();
    return v === '1' || v === 'true';
  }

  /**
   * 将宿主机 ETL 路径映射为训练容器内可读路径（与 docker-compose volume 对齐）。
   */
  toPythonTrainContainerPath(localPath: string): string {
    const resolved = path.resolve(localPath);
    const mountFrom =
      this.configService?.get<string>('TRAINING_PYTHON_PATH_MOUNT_FROM')?.trim() ||
      path.resolve('./data/training/decision-trajectories');
    const mountTo =
      this.configService?.get<string>('TRAINING_PYTHON_PATH_MOUNT_TO')?.trim() ||
      '/app/data/host-training/decision-trajectories';

    const fromResolved = path.resolve(mountFrom);
    if (resolved === fromResolved || resolved.startsWith(`${fromResolved}${path.sep}`)) {
      return path.join(mountTo, path.relative(fromResolved, resolved));
    }
    return resolved;
  }

  buildFineTuneDatasetPaths(
    pack: DecisionTrajectoryTrainingPackResult,
    registration?: PythonDecisionPackRegistration | null,
  ): {
    dpo_dataset_path: string;
    sft_dataset_path?: string;
  } {
    if (registration?.dpo_registered_path) {
      return {
        dpo_dataset_path: registration.dpo_registered_path,
        sft_dataset_path: registration.sft_train_registered_path,
      };
    }
    return {
      dpo_dataset_path: this.toPythonTrainContainerPath(pack.dpo_jsonl_path),
      sft_dataset_path: pack.sft_sharegpt_jsonl_path
        ? this.toPythonTrainContainerPath(pack.sft_sharegpt_jsonl_path)
        : pack.sft_alpaca_jsonl_path
          ? this.toPythonTrainContainerPath(pack.sft_alpaca_jsonl_path)
          : undefined,
    };
  }

  /**
   * 调用 Python `/datasets/register-decision-pack`，复制为 tripnara_dpo_preferences.jsonl。
   */
  async registerPackWithPythonTrainService(
    pack: DecisionTrajectoryTrainingPackResult,
  ): Promise<PythonDecisionPackRegistration | null> {
    if (!this.isPythonRegisterEnabled() || !this.httpService) {
      return null;
    }

    const trainUrl =
      this.configService?.get<string>('TRAIN_SERVICE_URL')?.trim() || 'http://localhost:8000';

    const body = {
      dpo_jsonl_path: this.toPythonTrainContainerPath(pack.dpo_jsonl_path),
      sft_sharegpt_jsonl_path: pack.sft_sharegpt_jsonl_path
        ? this.toPythonTrainContainerPath(pack.sft_sharegpt_jsonl_path)
        : undefined,
      sft_alpaca_jsonl_path: pack.sft_alpaca_jsonl_path
        ? this.toPythonTrainContainerPath(pack.sft_alpaca_jsonl_path)
        : undefined,
      dataset_dir: this.configService?.get<string>('TRAINING_PYTHON_DATASET_DIR') || '/app/data',
    };

    this.logger.log(
      `[DecisionTrajectoryTrainingSync] 注册 Python 训练包: dpo=${body.dpo_jsonl_path}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<PythonDecisionPackRegistration>(
            `${trainUrl}/datasets/register-decision-pack`,
            body,
          )
          .pipe(timeout(60_000)),
      );
      const data = response.data;
      this.logger.log(
        `[DecisionTrajectoryTrainingSync] Python 注册完成: lines=${data.line_count} ` +
          `pair_types=${JSON.stringify(data.by_pair_type)} ` +
          `rejected_sources=${JSON.stringify(data.by_rejected_source)}`,
      );
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[DecisionTrajectoryTrainingSync] Python 注册失败（将回退透传路径）: ${msg}`,
      );
      return null;
    }
  }

  /**
   * ETL 导出 +（可选）Python 注册，供 FineTune / TrainingPipeline 启动前调用。
   */
  async syncAndPrepareForPythonTraining(): Promise<{
    pack: DecisionTrajectoryTrainingPackResult | null;
    registration: PythonDecisionPackRegistration | null;
    dataset_paths?: { dpo_dataset_path: string; sft_dataset_path?: string };
  }> {
    const pack = await this.syncIncrementalTrainingPackIfEnabled();
    if (!pack) {
      return { pack: null, registration: null };
    }

    const registration = await this.registerPackWithPythonTrainService(pack);
    const dataset_paths = this.buildFineTuneDatasetPaths(pack, registration);

    return { pack, registration, dataset_paths };
  }
}
