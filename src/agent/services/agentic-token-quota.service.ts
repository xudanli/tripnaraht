import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import {
  agenticTokenQuotaTtlSeconds,
  buildAgenticGlobalQuotaRedisKey,
  buildAgenticOrgQuotaRedisKey,
  buildAgenticSessionQuotaRedisKey,
  buildAgenticUserQuotaRedisKey,
  evaluateAgenticTokenQuota,
  parseAgenticTokenQuotaConfig,
  type AgenticTokenQuotaCheckResult,
  type AgenticTokenQuotaConfig,
} from '../runtime/agentic-token-quota.util';
import { buildCostGovernanceAdminSnapshot } from '../runtime/cost-governance-observability.util';

@Injectable()
export class AgenticTokenQuotaService {
  private readonly logger = new Logger(AgenticTokenQuotaService.name);
  private readonly memUsage = new Map<string, number>();

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  resolveConfig(): AgenticTokenQuotaConfig {
    const fromCfg = this.configService
      ? {
          AGENTIC_DAILY_TOKEN_QUOTA_PER_USER: this.configService.get<string>(
            'AGENTIC_DAILY_TOKEN_QUOTA_PER_USER',
          ),
          AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL: this.configService.get<string>(
            'AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL',
          ),
          AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG: this.configService.get<string>(
            'AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG',
          ),
          AGENTIC_SESSION_TOKEN_CAP: this.configService.get<string>('AGENTIC_SESSION_TOKEN_CAP'),
        }
      : {};
    return parseAgenticTokenQuotaConfig({ ...process.env, ...fromCfg });
  }

  getAdminDiagnosticsSnapshot(): ReturnType<typeof buildCostGovernanceAdminSnapshot> {
    return buildCostGovernanceAdminSnapshot({
      ...process.env,
      AGENTIC_DAILY_TOKEN_QUOTA_PER_USER:
        this.configService?.get<string>('AGENTIC_DAILY_TOKEN_QUOTA_PER_USER') ??
        process.env.AGENTIC_DAILY_TOKEN_QUOTA_PER_USER,
      AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL:
        this.configService?.get<string>('AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL') ??
        process.env.AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL,
      AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG:
        this.configService?.get<string>('AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG') ??
        process.env.AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG,
      AGENTIC_SESSION_TOKEN_CAP:
        this.configService?.get<string>('AGENTIC_SESSION_TOKEN_CAP') ??
        process.env.AGENTIC_SESSION_TOKEN_CAP,
    });
  }

  /** Harness Cost 历史：读取今日 global daily token 用量（Redis / 内存）。 */
  async readTodayGlobalTokenUsage(): Promise<number | null> {
    const config = this.resolveConfig();
    if (!config.globalDaily) return null;
    return this.readUsage(buildAgenticGlobalQuotaRedisKey());
  }

  async checkBeforeAgenticRun(
    userId: string | null | undefined,
    estimatedTokens: number,
    sessionId?: string | null,
    orgId?: string | null,
  ): Promise<AgenticTokenQuotaCheckResult> {
    const config = this.resolveConfig();
    if (!config.enabled) {
      return evaluateAgenticTokenQuota({
        config,
        userUsed: 0,
        orgUsed: 0,
        globalUsed: 0,
        sessionUsed: 0,
        estimatedTokens,
        hasUserId: !!userId?.trim(),
        sessionId,
        orgId,
      });
    }

    const sessionUsed =
      sessionId?.trim() && config.perSessionCap > 0
        ? await this.readUsage(buildAgenticSessionQuotaRedisKey(sessionId.trim()))
        : 0;
    const orgUsed =
      orgId?.trim() && config.perOrgDaily > 0
        ? await this.readUsage(buildAgenticOrgQuotaRedisKey(orgId.trim()))
        : 0;
    const userUsed = userId?.trim()
      ? await this.readUsage(buildAgenticUserQuotaRedisKey(userId.trim()))
      : 0;
    const globalUsed = config.globalDaily > 0
      ? await this.readUsage(buildAgenticGlobalQuotaRedisKey())
      : 0;

    const result = evaluateAgenticTokenQuota({
      config,
      userUsed,
      orgUsed,
      globalUsed,
      sessionUsed,
      estimatedTokens,
      hasUserId: !!userId?.trim(),
      sessionId,
      orgId,
    });

    if (!result.allowed) {
      this.logger.warn(
        `[AgenticTokenQuota] blocked scope=${result.scope} user=${userId ?? '-'} used=${result.used} limit=${result.limit} est=${estimatedTokens}`,
      );
    }

    return result;
  }

  async recordAgenticUsage(
    userId: string | null | undefined,
    tokens: number,
    sessionId?: string | null,
    orgId?: string | null,
  ): Promise<void> {
    const config = this.resolveConfig();
    const n = Math.max(0, Math.floor(tokens));
    if (!config.enabled || n <= 0) return;

    if (sessionId?.trim() && config.perSessionCap > 0) {
      await this.incrementUsage(buildAgenticSessionQuotaRedisKey(sessionId.trim()), n);
    }
    if (orgId?.trim() && config.perOrgDaily > 0) {
      await this.incrementUsage(buildAgenticOrgQuotaRedisKey(orgId.trim()), n);
    }
    if (userId?.trim() && config.perUserDaily > 0) {
      await this.incrementUsage(buildAgenticUserQuotaRedisKey(userId.trim()), n);
    }
    if (config.globalDaily > 0) {
      await this.incrementUsage(buildAgenticGlobalQuotaRedisKey(), n);
    }
  }

  private async readUsage(key: string): Promise<number> {
    if (this.redis) {
      const v = await this.redis.get<number>(key);
      return Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : 0;
    }
    return this.memUsage.get(key) ?? 0;
  }

  private async incrementUsage(key: string, delta: number): Promise<void> {
    const cur = await this.readUsage(key);
    const next = cur + delta;
    if (this.redis) {
      await this.redis.set(key, next, agenticTokenQuotaTtlSeconds());
      return;
    }
    this.memUsage.set(key, next);
  }
}
