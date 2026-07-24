import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShadowDeploymentWorkflowService } from '../services/shadow-deployment-workflow.service';
import { ShadowDeploymentRegistryService } from '../services/shadow-deployment-registry.service';
import { evaluateShadowPromotionGates } from '../utils/shadow-promotion-gate.util';

/**
 * 无人值守阴影晋升巡检：每 30 分钟评估四大门控，可选自动切换生产 LoRA。
 *
 * - `TRAINING_SHADOW_DEPLOY_AUTO_MONITOR=1`：启用本 Cron（与 pipeline 后台监听同开关）
 * - `SHADOW_PROMOTION_AUTO=1`：门控通过后自动 `promote()`；否则仅打 NOTICE 日志
 */
@Injectable()
export class ShadowPromotionCronService {
  private readonly logger = new Logger(ShadowPromotionCronService.name);
  private cronLoopRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly shadowWorkflow: ShadowDeploymentWorkflowService,
    private readonly shadowRegistry: ShadowDeploymentRegistryService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async inspectAndAutoPromote(): Promise<void> {
    if (!this.isCronEnabled()) {
      this.logger.debug(
        '[ShadowPromotionCron] disabled (set TRAINING_SHADOW_DEPLOY_AUTO_MONITOR=1)',
      );
      return;
    }

    if (!this.shadowWorkflow.isShadowDeployEnabled()) {
      this.logger.debug(
        '[ShadowPromotionCron] TRAINING_SHADOW_DEPLOY_ENABLED=0, skip inspection',
      );
      return;
    }

    if (this.cronLoopRunning) {
      this.logger.warn('[ShadowPromotionCron] previous loop still running, skip tick');
      return;
    }

    this.cronLoopRunning = true;
    this.logger.log('[ShadowPromotionCron] starting automated shadow validation loop');

    const isAutoPromotionEnabled = this.isAutoPromotionEnabled();
    const minSamples = Number(
      this.configService.get<string>('SHADOW_PROMOTION_MIN_SAMPLES') ?? '1000',
    );
    const minWinRate = Number(
      this.configService.get<string>('SHADOW_PROMOTION_MIN_WIN_RATE') ?? '0.52',
    );

    try {
      const activeShadows = this.shadowRegistry.getActiveShadowVersions();

      if (activeShadows.length === 0) {
        this.logger.debug('[ShadowPromotionCron] no active shadow models under evaluation');
        return;
      }

      for (const shadowVersion of activeShadows) {
        if (!this.shadowRegistry.isEligibleForInspection(shadowVersion)) {
          continue;
        }

        const metrics = this.shadowRegistry.getShadowMetrics(shadowVersion);
        const gate = evaluateShadowPromotionGates(metrics, { minSamples, minWinRate });

        this.logger.log(
          `[ShadowPromotionCron] inspecting [${shadowVersion}]: ` +
            `samples=${metrics.sampleCount}/${minSamples} ` +
            `win_rate=${(metrics.shadowWinRate * 100).toFixed(2)}% ` +
            `promotion_ready=${metrics.promotionReady}`,
        );

        if (!gate.passed) {
          this.logger.debug(
            `[ShadowPromotionCron] [DEFER] [${shadowVersion}] ${gate.deferralSummary}`,
          );
          continue;
        }

        this.logger.log(
          `[ShadowPromotionCron] [PASS] [${shadowVersion}] met all production conditions`,
        );

        if (!isAutoPromotionEnabled) {
          this.logger.warn(
            `[ShadowPromotionCron] [NOTICE] [${shadowVersion}] eligible but SHADOW_PROMOTION_AUTO=0. ` +
              `Promote via POST /api/training/shadow/${shadowVersion}/promote`,
          );
          this.shadowRegistry.markLifecycle(shadowVersion, 'PROMOTION_READY');
          continue;
        }

        this.logger.log(
          `[ShadowPromotionCron] SHADOW_PROMOTION_AUTO=1 — unattended promotion [${shadowVersion}]`,
        );

        const result = await this.shadowWorkflow.promote(shadowVersion);

        if (result.promoted) {
          this.logger.log(
            `[ShadowPromotionCron] promoted [${shadowVersion}] → production [${result.productionVersion}]`,
          );
        } else {
          this.logger.warn(
            `[ShadowPromotionCron] promotion failed [${shadowVersion}]: ${result.reason}`,
          );
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[ShadowPromotionCron] fatal loop error: ${msg}`, stack);
    } finally {
      this.cronLoopRunning = false;
    }
  }

  private isCronEnabled(): boolean {
    const dedicated = this.configService.get<string>('SHADOW_PROMOTION_CRON_ENABLED')?.trim();
    if (dedicated === '0' || dedicated === 'false') return false;
    if (dedicated === '1' || dedicated === 'true') return true;

    const monitor = this.configService.get<string>('TRAINING_SHADOW_DEPLOY_AUTO_MONITOR')?.trim();
    return monitor === '1' || monitor === 'true';
  }

  private isAutoPromotionEnabled(): boolean {
    const v = this.configService.get<string>('SHADOW_PROMOTION_AUTO')?.trim();
    return v === '1' || v === 'true';
  }
}
