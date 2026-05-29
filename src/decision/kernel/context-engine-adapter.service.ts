/**
 * Context Engine Adapter
 *
 * Phase 2.2: Kernel 与 ContextEngineerService 的桥接
 * 将 DSO 映射为 ContextPackageOptions，调用 ContextEngineer.build()
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ContextEngineerService } from '../../agent/context-engine/services/context-engineer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTravelerNationality } from '../../countries/utils/resolve-traveler-nationality.util';
import { DecisionState } from './decision-state.types';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';

/** 调用 getContextPackage 时可选的覆盖参数（来自 Conductor） */
export interface ContextPackageOverrides {
  tripId?: string;
  userId?: string;
  userQuery?: string;
  phase?: string;
  agent?: string;
  tokenBudget?: number;
  /** 目的地国家代码（tripId 不可用时用于构建国家包块，如 from-natural-language 流程） */
  destinationCountryCode?: string;
  /** 编排超时 abort：避免 Tool RAG 在 deadline 后继续跑 */
  abortSignal?: AbortSignal;

  /** 旅客护照国籍（ISO 3166-1 alpha-2）；未传时由 Adapter 从 DSO / UserProfile / userQuery 解析 */
  travelerNationality?: string;
  /** 当前 DSO systemState.version */
  dsoVersion?: number;
  /** 当前 route_and_run request_id */
  requestId?: string;
}

@Injectable()
export class ContextEngineAdapterService {
  private readonly logger = new Logger(ContextEngineAdapterService.name);

  constructor(
    @Optional() private readonly contextEngineer?: ContextEngineerService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * 构建 Context Package
   * 将 DSO 与 Conductor 提供的参数组合为 ContextPackageOptions
   */
  async buildContextPackage(
    state: DecisionState,
    overrides: ContextPackageOverrides = {},
  ): Promise<ContextPackage | undefined> {
    if (!this.contextEngineer) return undefined;

    const tripId =
      overrides.tripId?.trim() ||
      state.travelOntologyState?.tripId?.trim() ||
      undefined;
    const phase = overrides.phase ?? state.systemState?.currentPhase ?? 'PLANNING';
    const agent = overrides.agent ?? 'PLANNER';
    const userQuery = overrides.userQuery ?? this.inferUserQuery(state);
    const dsoVersion = overrides.dsoVersion ?? state.systemState?.version;
    const requestId =
      overrides.requestId ??
      state.systemState?.requestId ??
      state.requestId;
    if (!userQuery) {
      this.logger.warn('[ContextAdapter] 无法推断 userQuery，跳过 build');
      return undefined;
    }

    // 当 tripId 不可用时，尝试从 overrides / state 获取 destinationCountryCode，避免「无法获取国家代码」警告
    let destinationCountryCode = overrides.destinationCountryCode;
    if (!destinationCountryCode && !tripId) {
      const destFromState = this.extractCountryCodeFromState(state);
      const destFromQuery = this.extractCountryCodeFromQuery(userQuery);
      destinationCountryCode = destFromState || destFromQuery;
    }

    // GATE_EVAL 阶段：显式传入门控相关主题，确保 RoadRules/Safety/Weather 等块被包含
    const gateEvalTopics = ['ROAD_RULES', 'SAFETY', 'WEATHER_WINDOWS', 'VISA'];
    const requiredTopicsOverride =
      phase === 'GATE_EVAL'
        ? gateEvalTopics
        : !tripId && destinationCountryCode
          ? gateEvalTopics
          : undefined;

    const travelerNationality = await this.resolveTravelerNationality(state, overrides, userQuery);
    const tripStartDate = state.userIntent?.dateRange?.startDate;

    try {
      const package_ = await this.contextEngineer.build({
        tripId,
        userId: overrides.userId,
        phase,
        agent,
        userQuery,
        tokenBudget: overrides.tokenBudget,
        includePrivate: false,
        destinationCountryCode,
        requiredTopics: requiredTopicsOverride,
        abortSignal: overrides.abortSignal,
        travelerNationality,
        tripStartDate,
        dsoVersion,
        requestId,
      });
      this.logger.debug(
        `[ContextAdapter] Built: blocks=${package_.blocks?.length ?? 0}, tokens=${package_.totalTokens ?? 0}, nationality=${travelerNationality ?? 'n/a'}`,
      );
      return package_;
    } catch (err) {
      this.logger.warn(`[ContextAdapter] build 失败: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  private async resolveTravelerNationality(
    state: DecisionState,
    overrides: ContextPackageOverrides,
    userQuery: string,
  ): Promise<string | undefined> {
    let userProfilePreferences: unknown;
    const userId = overrides.userId ?? (state as { metadata?: { userId?: string } }).metadata?.userId;

    if (!overrides.travelerNationality && userId && this.prisma) {
      const dbUp = typeof this.prisma.isDbConnected === 'function' ? this.prisma.isDbConnected() : true;
      if (dbUp) {
        try {
          const row = await this.prisma.userProfile.findUnique({
            where: { userId },
            select: { preferences: true },
          });
          userProfilePreferences = row?.preferences;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.debug(`[ContextAdapter] userProfile nationality lookup skipped: ${msg}`);
        }
      }
    }

    return resolveTravelerNationality({
      explicit: overrides.travelerNationality,
      userIntentPreferences: state.userIntent?.preferences,
      userProfilePreferences,
      userQuery,
    });
  }

  private inferUserQuery(state: DecisionState): string {
    const u = state.userIntent;
    if (!u) return '';
    const parts: string[] = [];
    if (u.destination) parts.push(`目的地: ${typeof u.destination === 'string' ? u.destination : `(${u.destination.lat},${u.destination.lng})`}`);
    if (u.days) parts.push(`${u.days}天`);
    if (u.mode) parts.push(u.mode);
    if (u.dateRange) parts.push(`${u.dateRange.startDate}~${u.dateRange.endDate}`);
    return parts.length > 0 ? parts.join('，') : '行程规划';
  }

  /** 从 state 提取国家代码（environmentState.countryCode 或 userIntent.destination） */
  private extractCountryCodeFromState(state: DecisionState): string | undefined {
    const envCode = (state as any).environmentState?.countryCode;
    if (envCode && typeof envCode === 'string' && envCode.length >= 2) return envCode.toUpperCase().slice(0, 2);
    const dest = state.userIntent?.destination;
    if (typeof dest === 'string') return this.parseDestinationToCountryCode(dest);
    return undefined;
  }

  /** 从 userQuery 文本中提取国家代码（简单关键词匹配） */
  private extractCountryCodeFromQuery(query: string): string | undefined {
    return this.parseDestinationToCountryCode(query);
  }

  /** 将目的地字符串解析为 ISO 3166-1 alpha-2 国家代码 */
  private parseDestinationToCountryCode(text: string): string | undefined {
    if (!text || typeof text !== 'string') return undefined;
    const t = text.toLowerCase();
    const map: Array<[string, string]> = [
      ['冰岛', 'IS'], ['iceland', 'IS'],
      ['新西兰', 'NZ'], ['new zealand', 'NZ'], ['大溪地', 'PF'], ['tahiti', 'PF'], ['法属波利尼西亚', 'PF'],
      ['日本', 'JP'], ['japan', 'JP'], ['东京', 'JP'], ['tokyo', 'JP'],
      ['中国', 'CN'], ['china', 'CN'],
      ['泰国', 'TH'], ['thailand', 'TH'],
      ['格陵兰', 'GL'], ['greenland', 'GL'],
      ['斯瓦尔巴', 'SJ'], ['svalbard', 'SJ'],
      ['阿根廷', 'AR'], ['argentina', 'AR'],
      ['阿尔卑斯', 'AL'], ['alps', 'AL'],
    ];
    for (const [key, code] of map) {
      if (t.includes(key)) return code;
    }
    const m = text.match(/\b([A-Za-z]{2})\b/);
    if (m) return m[1].toUpperCase();
    return undefined;
  }
}
