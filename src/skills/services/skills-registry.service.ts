// src/skills/services/skills-registry.service.ts
/**
 * Skills Registry Service
 *
 * 统一注册和管理所有 Skills。
 * 部分 Skill（如 transport / itinerary / **safetravel.get_advisories** / **iceland.rentalGuidance**）在 {@link SkillsModule} 构造函数中
 * 通过 `registerSkill` 注入本注册表；本类构造函数中的 token 注入列表为另一子集。
 * 启动后 `onModuleInit` 会调用 `warmupExternalDataSources()` 异步预热 SafeTravel RSS（见 `SAFETRAVEL_RSS_WARMUP`）。
 */

import { Inject, Injectable, Optional, Logger, OnModuleInit } from '@nestjs/common';
import { SafetravelService } from '../../iceland-info/services/safetravel.service';
import { Skill, SkillInput } from '../interfaces/skill.interface';
import { wrapSkillExecution } from '../utils/skill-execution-wrap.util';
import {
  SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
  SKILL_COUNTRY_PACK_NEW_SKELETON,
  SKILL_COUNTRY_PACK_VALIDATE,
  SKILL_DECISION_ABU_CHECK,
  SKILL_DECISION_DRDRE_PACE,
  SKILL_DECISION_NEPTUNE_REPAIR,
  SKILL_DECISION_RUN_THREE_GUARDIANS,
  SKILL_DECISION_EXPLAIN_FOR_HUMAN,
  SKILL_DEM_GET_PROFILE,
  SKILL_READINESS_GENERATE_CHECKLIST,
  SKILL_READINESS_SUMMARIZE_RISKS,
  SKILL_READINESS_CHECK_VISA_WINDOW,
  SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT,
  SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY,
  SKILL_TRIP_QUICK_EVALUATE,
  SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS,
  SKILL_WORLD_BUILD_CONTEXT,
  SKILL_COUNTRY_PACK_GET_BLOCKS,
  SKILL_COUNTRY_PACK_RANK_BLOCKS,
  SKILL_CONTEXT_BUILD,
  SKILL_CONTEXT_COMPRESS,
  SKILL_CONTEXT_EVALUATE,
  SKILL_CONTEXT_REGRESSION_TESTS,
  SKILL_PLAN_SELECT_SLICES,
  SKILL_CONTEXT_LEARN,
  SKILL_TOOLS_SELECT,
  SKILL_DECISION_LOG_APPEND,
  SKILL_INTENT_RECOGNIZE,
} from '../skills.tokens';

@Injectable()
export class SkillsRegistryService implements OnModuleInit {
  private readonly skills = new Map<string, Skill>();
  private readonly logger = new Logger(SkillsRegistryService.name);

  /** 历史注册名 / 编排笔误 → 当前规范名（仅 Agentic getSkill 解析，不改变已存储的 key） */
  private static readonly SKILL_NAME_LEGACY_ALIASES: Record<string, string> = {
    'dem.get.profile': 'dem.get_profile',
    'dem.getProfile': 'dem.get_profile',
  };

  constructor(
    @Optional() @Inject(SKILL_DEM_GET_PROFILE) private readonly demGetProfile?: Skill,
    @Optional() @Inject(SKILL_WORLD_BUILD_CONTEXT) private readonly worldBuildContext?: Skill,
    @Optional() @Inject(SKILL_DECISION_ABU_CHECK) private readonly decisionAbuCheck?: Skill,
    @Optional() @Inject(SKILL_DECISION_DRDRE_PACE) private readonly decisionDrdrePace?: Skill,
    @Optional() @Inject(SKILL_DECISION_NEPTUNE_REPAIR) private readonly decisionNeptuneRepair?: Skill,
    @Optional() @Inject(SKILL_DECISION_RUN_THREE_GUARDIANS) private readonly decisionRunThreeGuardians?: Skill,
    @Optional() @Inject(SKILL_DECISION_EXPLAIN_FOR_HUMAN) private readonly decisionExplainForHuman?: Skill,
    @Optional()
    @Inject(SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT)
    private readonly routeDirectionPickForIntent?: Skill,
    @Optional()
    @Inject(SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY)
    private readonly routeDirectionListForCountry?: Skill,
    @Optional()
    @Inject(SKILL_READINESS_GENERATE_CHECKLIST)
    private readonly readinessGenerateChecklist?: Skill,
    @Optional() @Inject(SKILL_READINESS_SUMMARIZE_RISKS) private readonly readinessSummarizeRisks?: Skill,
    @Optional() @Inject(SKILL_READINESS_CHECK_VISA_WINDOW) private readonly readinessCheckVisaWindow?: Skill,
    @Optional() @Inject(SKILL_TRIP_QUICK_EVALUATE) private readonly tripQuickEvaluate?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_NEW_SKELETON) private readonly countryPackNewSkeleton?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_VALIDATE) private readonly countryPackValidate?: Skill,
    @Optional()
    @Inject(SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS)
    private readonly countryPackGenerateRegressionTests?: Skill,
    @Optional()
    @Inject(SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS)
    private readonly countryPackSuggestImprovements?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_GET_BLOCKS) private readonly countryPackGetBlocks?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_RANK_BLOCKS) private readonly countryPackRankBlocks?: Skill,
    @Optional() @Inject(SKILL_CONTEXT_BUILD) private readonly contextBuild?: Skill,
    @Optional() @Inject(SKILL_CONTEXT_COMPRESS) private readonly contextCompress?: Skill,
    @Optional() @Inject(SKILL_CONTEXT_EVALUATE) private readonly contextEvaluate?: Skill,
    @Optional() @Inject(SKILL_CONTEXT_REGRESSION_TESTS) private readonly contextRegressionTests?: Skill,
    @Optional() @Inject(SKILL_PLAN_SELECT_SLICES) private readonly planSelectSlices?: Skill,
    @Optional() @Inject(SKILL_CONTEXT_LEARN) private readonly contextLearn?: Skill,
    @Optional() @Inject(SKILL_TOOLS_SELECT) private readonly toolsSelect?: Skill,
    @Optional() @Inject(SKILL_DECISION_LOG_APPEND) private readonly decisionLogAppend?: Skill,
    @Optional() @Inject(SKILL_INTENT_RECOGNIZE) private readonly intentRecognize?: Skill,
    @Optional() private readonly safetravelService?: SafetravelService,
  ) {
    this.logger.log('[SkillsRegistryService] 构造函数开始执行...');
    // 注册所有 Skills（只注册成功注入的）
    this.logger.debug('[SkillsRegistryService] 开始注册 Skills...');
    if (this.demGetProfile) this.registerSkill(this.demGetProfile);
    if (this.worldBuildContext) this.registerSkill(this.worldBuildContext);
    if (this.decisionAbuCheck) this.registerSkill(this.decisionAbuCheck);
    if (this.decisionDrdrePace) this.registerSkill(this.decisionDrdrePace);
    if (this.decisionNeptuneRepair) this.registerSkill(this.decisionNeptuneRepair);
    if (this.decisionRunThreeGuardians) this.registerSkill(this.decisionRunThreeGuardians);
    if (this.decisionExplainForHuman) this.registerSkill(this.decisionExplainForHuman);
    if (this.routeDirectionPickForIntent) this.registerSkill(this.routeDirectionPickForIntent);
    if (this.routeDirectionListForCountry) this.registerSkill(this.routeDirectionListForCountry);
    if (this.readinessGenerateChecklist) this.registerSkill(this.readinessGenerateChecklist);
    if (this.readinessSummarizeRisks) this.registerSkill(this.readinessSummarizeRisks);
    if (this.readinessCheckVisaWindow) this.registerSkill(this.readinessCheckVisaWindow);
    if (this.tripQuickEvaluate) this.registerSkill(this.tripQuickEvaluate);
    if (this.countryPackNewSkeleton) this.registerSkill(this.countryPackNewSkeleton);
    if (this.countryPackValidate) this.registerSkill(this.countryPackValidate);
    if (this.countryPackGenerateRegressionTests) this.registerSkill(this.countryPackGenerateRegressionTests);
    if (this.countryPackSuggestImprovements) this.registerSkill(this.countryPackSuggestImprovements);
    if (this.countryPackGetBlocks) this.registerSkill(this.countryPackGetBlocks);
    if (this.countryPackRankBlocks) this.registerSkill(this.countryPackRankBlocks);
    if (this.contextBuild) this.registerSkill(this.contextBuild);
    if (this.contextCompress) this.registerSkill(this.contextCompress);
    if (this.contextEvaluate) this.registerSkill(this.contextEvaluate);
    if (this.contextRegressionTests) this.registerSkill(this.contextRegressionTests);
    if (this.planSelectSlices) this.registerSkill(this.planSelectSlices);
    if (this.contextLearn) this.registerSkill(this.contextLearn);
    if (this.toolsSelect) this.registerSkill(this.toolsSelect);
    if (this.decisionLogAppend) this.registerSkill(this.decisionLogAppend);
    if (this.intentRecognize) this.registerSkill(this.intentRecognize);
    this.logger.log(`[SkillsRegistryService] 构造函数完成，已注册 ${this.skills.size} 个 Skills`);
  }

  /**
   * 启动后异步预热依赖外部真源的读路径（如 SafeTravel RSS）。
   * 缓存 TTL 由 `SafetravelService` 内部控制（默认 5min）。设置 `SAFETRAVEL_RSS_WARMUP=0` 可跳过。
   */
  onModuleInit(): void {
    this.warmupExternalDataSources();
  }

  /**
   * 触发异步 warmup（可重复调用；不阻塞事件循环）。
   */
  warmupExternalDataSources(): void {
    if (process.env.SAFETRAVEL_RSS_WARMUP === '0') {
      this.logger.debug('[SkillsRegistryService] SAFETRAVEL_RSS_WARMUP=0 — skip RSS warmup');
      return;
    }
    setImmediate(() => {
      void this.runSafetravelRssWarmup();
    });
  }

  private async runSafetravelRssWarmup(): Promise<void> {
    if (!this.safetravelService) {
      this.logger.debug('[SkillsRegistryService] SafetravelService not injected — skip RSS warmup');
      return;
    }
    try {
      await this.safetravelService.fetchRssFeedAlerts();
      this.logger.log('[SkillsRegistryService] SafeTravel RSS warmup completed');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[SkillsRegistryService] SafeTravel RSS warmup failed (non-fatal): ${msg}`);
    }
  }

  /**
   * 注册 Skill
   *
   * Phase A（I5）：统一包装 `execute`，失败抛出 {@link SkillExecutionError}（含 `orchestratorRobustness`）。
   */
  registerSkill(skill: Skill): void {
    if (!skill || !skill.metadata) {
      return;
    }
    const name = skill.metadata.name;
    const wrapped: Skill = {
      metadata: skill.metadata,
      execute: async (input: SkillInput) =>
        wrapSkillExecution(name, () => skill.execute(input), {
          orchestrator_step: input.tokenContext?.state_machine_step,
        }),
    };
    this.skills.set(name, wrapped);
  }

  /**
   * 获取 Skill
   */
  getSkill(name: string): Skill | undefined {
    const direct = this.skills.get(name);
    if (direct) return direct;
    const canonical = SkillsRegistryService.SKILL_NAME_LEGACY_ALIASES[name];
    return canonical ? this.skills.get(canonical) : undefined;
  }

  /**
   * 检查 Skill 是否已注册
   */
  hasSkill(name: string): boolean {
    if (this.skills.has(name)) return true;
    const canonical = SkillsRegistryService.SKILL_NAME_LEGACY_ALIASES[name];
    return Boolean(canonical && this.skills.has(canonical));
  }

  /**
   * 获取所有 Skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Sentinel-aware skills listing ("memory wipe" for sub-agents).
   * When emergency constraints forbid a mode, remove related skills from the LLM-visible skill list.
   *
   * NOTE: This only affects *visibility* (prompt/tool schema). Execution may still call a specific
   * skill by name if the state machine requires it.
   */
  getAllSkillsForEmergencyConstraints(emergencyConstraints?: { forbidden_modes?: string[] }): Skill[] {
    const forbidden = (emergencyConstraints?.forbidden_modes ?? []).map((x) => String(x).toUpperCase());
    if (forbidden.length === 0) return this.getAllSkills();

    const forbidDrive = forbidden.includes('DRIVE') || forbidden.includes('MOTORCYCLE');
    const forbidTransit = forbidden.includes('TRANSIT');
    const forbidRail = forbidden.includes('RAIL');
    const forbidFerry = forbidden.includes('FERRY');

    const isDriveRelated = (name: string) =>
      /(^|\.)(drive|car|parking|navigation|road_trip|roadtrip)(_|\.|$)/i.test(name);
    const isTransitRelated = (name: string) => /(^|\.)transit(_|\.|$)/i.test(name);
    const isRailRelated = (name: string) => /(^|\.)rail(_|\.|$)/i.test(name);
    const isFerryRelated = (name: string) => /(^|\.)ferry(_|\.|$)/i.test(name);

    return this.getAllSkills().filter((s) => {
      const n = String(s?.metadata?.name ?? '');
      if (forbidDrive && isDriveRelated(n)) return false;
      if (forbidTransit && isTransitRelated(n)) return false;
      if (forbidRail && isRailRelated(n)) return false;
      if (forbidFerry && isFerryRelated(n)) return false;
      return true;
    });
  }

  /**
   * 获取所有 Skill 元数据
   */
  getAllSkillMetadata() {
    return Array.from(this.skills.values()).map(skill => skill.metadata);
  }
}

