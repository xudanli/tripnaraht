import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export type DosGrayRouteDecisionV1 = {
  revision: 'v1';
  llm_compiler_path: boolean;
  reason:
    | 'option_force_on'
    | 'option_force_off'
    | 'trip_whitelist'
    | 'user_percentage'
    | 'global_off'
    | 'no_match';
  gray_percentage: number;
  user_bucket?: number;
};

/** 稳定哈希分桶（0–99），与 A/B 灰度对齐 */
export function computeDosGrayHashBucket(seed: string): number {
  const s = String(seed ?? '').trim();
  if (!s) return 99;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 100);
}

function readConfig(config: ConfigService, key: string): string {
  return String(config.get<string>(key) ?? process.env[key] ?? '').trim();
}

function isTruthy(v: string): boolean {
  return v === 'true' || v === '1';
}

/**
 * DOS Step 4：LLM Intent Compiler 灰度分流（显式开关 > 全局 > Trip 白名单 > 用户百分比）。
 */
@Injectable()
export class DecisionOsGrayRouterService {
  constructor(@Optional() private readonly configService?: ConfigService) {}

  shouldRouteToLlmCompiler(request: RouteAndRunRequestDto, userId?: string | null): boolean {
    return this.evaluate(request, userId).llm_compiler_path;
  }

  evaluate(request: RouteAndRunRequestDto, userId?: string | null): DosGrayRouteDecisionV1 {
    const config = this.configService ?? new ConfigService();

    if (request.options?.enable_llm_intent_compiler === true) {
      return {
        revision: 'v1',
        llm_compiler_path: true,
        reason: 'option_force_on',
        gray_percentage: this.readGrayPercentage(config),
      };
    }
    if (request.options?.enable_llm_intent_compiler === false) {
      return {
        revision: 'v1',
        llm_compiler_path: false,
        reason: 'option_force_off',
        gray_percentage: this.readGrayPercentage(config),
      };
    }

    const globalEnabled = isTruthy(readConfig(config, 'INTENT_COMPILER_LLM_ENABLED'));
    const grayPct = this.readGrayPercentage(config);
    if (!globalEnabled) {
      return {
        revision: 'v1',
        llm_compiler_path: false,
        reason: 'global_off',
        gray_percentage: grayPct,
      };
    }

    const tripId = request.trip_id?.trim();
    const whitelist = readConfig(config, 'DOS_GRAY_TRIP_WHITELIST')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (tripId && whitelist.includes(tripId)) {
      return {
        revision: 'v1',
        llm_compiler_path: true,
        reason: 'trip_whitelist',
        gray_percentage: grayPct,
      };
    }

    const uid = String(userId ?? request.user_id ?? '').trim();
    if (grayPct > 0 && uid && uid !== 'anonymous') {
      const bucket = computeDosGrayHashBucket(uid);
      return {
        revision: 'v1',
        llm_compiler_path: bucket < grayPct,
        reason: 'user_percentage',
        gray_percentage: grayPct,
        user_bucket: bucket,
      };
    }

    return {
      revision: 'v1',
      llm_compiler_path: false,
      reason: 'no_match',
      gray_percentage: grayPct,
    };
  }

  private readGrayPercentage(config: ConfigService): number {
    const raw = parseInt(readConfig(config, 'DOS_GRAY_PERCENTAGE') || '0', 10);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(100, raw));
  }
}
