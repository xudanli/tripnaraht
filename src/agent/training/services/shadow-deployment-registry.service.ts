import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  RegisterShadowAdapterRequest,
  ShadowAdapterRegistration,
  ShadowAdapterLifecycle,
  ShadowGraderAggregateMetrics,
  ShadowGraderSample,
} from '../interfaces/shadow-deployment.types';

/**
 * 阴影适配器注册表 + 评测样本聚合（内存 SSOT，可后续落库）。
 */
@Injectable()
export class ShadowDeploymentRegistryService {
  private readonly logger = new Logger(ShadowDeploymentRegistryService.name);

  private readonly registrations = new Map<string, ShadowAdapterRegistration>();
  private readonly samplesByVersion = new Map<string, ShadowGraderSample[]>();
  private activeShadowVersion: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  getActiveShadow(): ShadowAdapterRegistration | null {
    if (!this.activeShadowVersion) return null;
    return this.registrations.get(this.activeShadowVersion) ?? null;
  }

  getRegistration(shadowVersion: string): ShadowAdapterRegistration | undefined {
    return this.registrations.get(shadowVersion);
  }

  listRegistrations(): ShadowAdapterRegistration[] {
    return [...this.registrations.values()].sort(
      (a, b) => b.registeredAt.localeCompare(a.registeredAt),
    );
  }

  /**
   * 仍在阴影评测中的版本（不含已晋升 / 已退役）。
   */
  getActiveShadowVersions(): string[] {
    const eligible: ShadowAdapterLifecycle[] = ['ACTIVE', 'PROMOTION_READY', 'REGISTERING'];
    return [...this.registrations.values()]
      .filter((r) => eligible.includes(r.lifecycle))
      .map((r) => r.shadowVersion);
  }

  /** 与 aggregateMetrics 同义，供 Cron / Dashboard 调用 */
  getShadowMetrics(shadowVersion: string): ShadowGraderAggregateMetrics {
    return this.aggregateMetrics(shadowVersion);
  }

  /**
   * 晋升完成后移出活跃巡检列表，防并发重复晋升。
   */
  retireFromActiveInspection(shadowVersion: string): void {
    this.markLifecycle(shadowVersion, 'PROMOTED');
    if (this.activeShadowVersion === shadowVersion) {
      this.activeShadowVersion = null;
    }
    this.logger.log(`[ShadowRegistry] retired ${shadowVersion} from active inspection`);
  }

  isEligibleForInspection(shadowVersion: string): boolean {
    const reg = this.registrations.get(shadowVersion);
    if (!reg) return false;
    return reg.lifecycle === 'ACTIVE' || reg.lifecycle === 'PROMOTION_READY';
  }

  register(request: RegisterShadowAdapterRequest): ShadowAdapterRegistration {
    const shadowVersion = `shadow-${request.taskId}`;
    const vllmAdapterName =
      request.vllmAdapterName ??
      `shadow_${request.taskId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;

    const entry: ShadowAdapterRegistration = {
      shadowVersion,
      taskId: request.taskId,
      adapterPath: request.adapterPath,
      vllmAdapterName,
      routingStrategy: request.routingStrategy ?? 'SHADOW_GRADER_ONLY',
      minValidationScore: request.minValidationScore ?? 0.92,
      baselineProductionVersion:
        request.baselineProductionVersion ?? 'production-stable',
      lifecycle: 'REGISTERING',
      registeredAt: new Date().toISOString(),
      loraLoaded: false,
    };

    this.registrations.set(shadowVersion, entry);
    this.samplesByVersion.set(shadowVersion, []);
    this.activeShadowVersion = shadowVersion;

    this.logger.log(
      `[ShadowRegistry] registered ${shadowVersion} adapter=${request.adapterPath} strategy=${entry.routingStrategy}`,
    );
    return entry;
  }

  markLifecycle(shadowVersion: string, lifecycle: ShadowAdapterLifecycle): void {
    const reg = this.registrations.get(shadowVersion);
    if (!reg) return;
    reg.lifecycle = lifecycle;
    if (lifecycle === 'PROMOTED') {
      reg.promotedAt = new Date().toISOString();
    }
    this.registrations.set(shadowVersion, reg);
  }

  markLoraLoaded(shadowVersion: string, loaded: boolean): void {
    const reg = this.registrations.get(shadowVersion);
    if (!reg) return;
    reg.loraLoaded = loaded;
    if (loaded && reg.lifecycle === 'REGISTERING') {
      reg.lifecycle = 'ACTIVE';
    }
    this.registrations.set(shadowVersion, reg);
  }

  recordSample(sample: ShadowGraderSample): void {
    const list = this.samplesByVersion.get(sample.shadowVersion) ?? [];
    list.push(sample);
    const maxSamples = Number(
      this.configService.get<string>('SHADOW_GRADER_MAX_SAMPLES_PER_VERSION') ?? '5000',
    );
    if (list.length > maxSamples) {
      list.splice(0, list.length - maxSamples);
    }
    this.samplesByVersion.set(sample.shadowVersion, list);
  }

  aggregateMetrics(shadowVersion: string): ShadowGraderAggregateMetrics {
    const samples = this.samplesByVersion.get(shadowVersion) ?? [];
    const n = samples.length;
    const blockers: string[] = [];

    if (n === 0) {
      return {
        shadowVersion,
        sampleCount: 0,
        shadowWinCount: 0,
        shadowWinRate: 0,
        productionSafetyPassRate: 0,
        shadowSafetyPassRate: 0,
        productionAvgReward: 0,
        shadowAvgReward: 0,
        promotionReady: false,
        promotionBlockers: ['no_samples'],
      };
    }

    const shadowWinCount = samples.filter((s) => s.shadowWins).length;
    const prodSafety = samples.filter((s) => s.productionSafetyPass).length;
    const shadowSafety = samples.filter((s) => s.shadowSafetyPass).length;
    const prodReward = samples.reduce((a, s) => a + s.productionReward, 0) / n;
    const shadowReward = samples.reduce((a, s) => a + s.shadowReward, 0) / n;

    const minSamples = Number(
      this.configService.get<string>('SHADOW_PROMOTION_MIN_SAMPLES') ?? '1000',
    );
    const minWinRate = Number(
      this.configService.get<string>('SHADOW_PROMOTION_MIN_WIN_RATE') ?? '0.52',
    );

    if (n < minSamples) blockers.push(`samples_${n}_lt_${minSamples}`);
    const winRate = shadowWinCount / n;
    if (winRate < minWinRate) blockers.push(`win_rate_${winRate.toFixed(3)}_lt_${minWinRate}`);
    if (shadowSafety / n < prodSafety / n) {
      blockers.push('shadow_safety_pass_rate_below_production');
    }
    if (shadowReward <= prodReward) {
      blockers.push('shadow_avg_reward_not_above_production');
    }

    const promotionReady = blockers.length === 0;

    if (promotionReady) {
      this.markLifecycle(shadowVersion, 'PROMOTION_READY');
    }

    return {
      shadowVersion,
      sampleCount: n,
      shadowWinCount,
      shadowWinRate: winRate,
      productionSafetyPassRate: prodSafety / n,
      shadowSafetyPassRate: shadowSafety / n,
      productionAvgReward: prodReward,
      shadowAvgReward: shadowReward,
      promotionReady,
      promotionBlockers: blockers,
    };
  }

  /** Prometheus 文本契约（简易 exposition） */
  toPrometheusMetrics(shadowVersion?: string): string {
    const versions = shadowVersion
      ? [shadowVersion]
      : [...this.samplesByVersion.keys()];
    const lines: string[] = [];
    for (const v of versions) {
      const m = this.aggregateMetrics(v);
      const labels = `shadow_version="${v}"`;
      lines.push(`tripnara_shadow_grader_samples{${labels}} ${m.sampleCount}`);
      lines.push(`tripnara_shadow_grader_win_rate{${labels}} ${m.shadowWinRate.toFixed(6)}`);
      lines.push(
        `tripnara_shadow_grader_safety_pass_rate{${labels},lane="production"} ${m.productionSafetyPassRate.toFixed(6)}`,
      );
      lines.push(
        `tripnara_shadow_grader_safety_pass_rate{${labels},lane="shadow"} ${m.shadowSafetyPassRate.toFixed(6)}`,
      );
      lines.push(
        `tripnara_shadow_grader_promotion_ready{${labels}} ${m.promotionReady ? 1 : 0}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}
