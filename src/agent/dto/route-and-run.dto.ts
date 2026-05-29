// src/agent/dto/route-and-run.dto.ts
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  ValidateNested,
  IsEnum,
  IsNotEmpty,
  MinLength,
  IsIn,
  IsArray,
  Matches,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiExtraModels, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouterOutputDto } from './router-output.dto';
import { ItineraryDay, DecisionLogEntry, OrchestratorState, Itinerary, GateResult, ItineraryItem, EvidenceRef, SimplifiedExplanation, AICapabilityDisplay, OrchestrationStep, JepaPayload } from '../interfaces/trip-plan.interface';
import { ErrorType } from '../interfaces/error-types.interface';
import { ClarificationAnswer, ClarificationQuestion } from '../interfaces/clarification.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { TravelActionType } from '../constants/action-execution.constants';
import { EvidenceLineageDto } from './evidence-lineage.dto';
import {
  LedgerHealingMetricsDto,
  LedgerHealingObservabilityDto,
  LedgerHealingStepDto,
  LEDGER_HEALING_ICELAND_SUCCESS_EXAMPLE,
} from './ledger-healing-observability.dto';
import type { IntentMode } from '../constants/intent-mode.constants';
import { INTENT_MODE_VALUES } from '../constants/intent-mode.constants';
import { RESEARCH_ASSET_SCOPE_VALUES, type ResearchAssetScope } from '../utils/research-asset-scope.util';
import type { RuntimeExecutionProfile } from '../contracts/runtime-execution-profile.types';
import type { RuntimeExecutionAnomaly } from '../contracts/runtime-execution-profile.validation.types';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { ReplayArtifactDescriptor } from '../contracts/replay-artifact-descriptor.types';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import type { ConsultationDashboardV1 } from '../types/consultation-dashboard.types';
import type { RuntimeObservabilitySlice } from '../runtime/runtime-observability-slice.types';
import {
  RUNTIME_PERSISTENCE_SCHEMA,
  type RuntimeReplayAdmissionPath,
} from '../runtime/runtime-persistence.types';
import type { InventorySnapshotsMetaPayload } from '../inventory/lightweight-live-inventory.registry';
import type { NarrativeSafetyPayload } from '../inventory/narrative-safety-evaluator.util';
import type { SafetySurfacePayload } from '../utils/safety-surface-payload.util';
import type {
  NarrativeIntegrityObservabilitySlice,
  NarrativeIntegrityReport,
} from '../inventory/narrative-integrity-validator.util';

export type { IntentMode } from '../constants/intent-mode.constants';
export { INTENT_MODE_VALUES } from '../constants/intent-mode.constants';

export class ConversationContextDto {
  @ApiPropertyOptional({ 
    description: '最近的对话消息历史',
    type: [String],
    example: ['用户: 推荐新宿拉面', '助手: 我为您推荐...'],
  })
  @IsOptional()
  recent_messages?: string[];

  @ApiPropertyOptional({
    description:
      '用户语言环境（BCP-47）。影响 NEED_MORE_INFO 澄清问卷与引导语的 Fallback 文案矩阵（见 src/common/constants/agent-prompts.ts）；缺省 zh。',
    example: 'zh-CN',
  })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ 
    description: '用户时区',
    example: 'Asia/Tokyo',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description:
      '可选上下文类型（如 active_trip_summary）。后端识别则注入摘要；未知类型忽略。与 trip_id 配合使用。',
    example: 'active_trip_summary',
  })
  @IsOptional()
  @IsString()
  context_type?: string;
}

/** route_and_run.options.intent_flags：与 TaskType 并行，用于微分流（不新增顶层 TaskType） */
export class IntentFlagsDto {
  @ApiPropertyOptional({
    description:
      '启用「实时事实」类传感器分流（与 enable_live_tools 配合；例如命中天气类问题时允许拉取天气 MCP）',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  live_facts?: boolean;

  @ApiPropertyOptional({
    description:
      'INTAKE/NLU：本轮修改目标标签（如 hotel、flight）；与 `itinerary_context.is_replan` / `refinement_signal` 联用时驱动 research 局部失效（见 `extractNluResearchInvalidateScopes`）。',
    example: ['hotel', 'flight'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modification_targets?: string[];
}

/** 行程上下文信号（与 NLU INTAKE 对齐） */
export class ItineraryContextSignalsDto {
  @ApiPropertyOptional({
    description: '是否在已有行程上做二次修改（replan）；为 true 时才消费 modification_targets 做研究域局部失效。',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_replan?: boolean;
}

/** 细化/编辑类信号（与 NLU INTAKE 对齐） */
export class RefinementSignalDto {
  @ApiPropertyOptional({
    description: '编辑类型：与 is_replan 一起门控 NLU 驱动的 research invalidate',
    enum: ['REPLACEMENT', 'REMOVAL', 'ADDITION'],
    example: 'REPLACEMENT',
  })
  @IsOptional()
  @IsIn(['REPLACEMENT', 'REMOVAL', 'ADDITION'])
  type?: 'REPLACEMENT' | 'REMOVAL' | 'ADDITION';
}

/** System 1 侧人格倾向：不在快路径运行三人格；透传至 TripPlanRequest.persona_hint 供 System 2 参考 */
export class PersonaHintDto {
  @ApiPropertyOptional({ enum: ['NORMAL', 'CRITICAL'], example: 'CRITICAL' })
  @IsOptional()
  @IsEnum(['NORMAL', 'CRITICAL'])
  abu_strictness?: 'NORMAL' | 'CRITICAL';

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' })
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  drdre_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({
    enum: ['CONSERVATIVE', 'BALANCED', 'EXPLORATORY'],
    example: 'BALANCED',
  })
  @IsOptional()
  @IsEnum(['CONSERVATIVE', 'BALANCED', 'EXPLORATORY'])
  neptune_creativity?: 'CONSERVATIVE' | 'BALANCED' | 'EXPLORATORY';
}

export class AgentOptionsDto {
  @ApiPropertyOptional({ 
    description: '是否仅执行 dry-run（不实际执行操作）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @ApiPropertyOptional({ 
    description: '是否允许使用浏览器（需要用户授权）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allow_webbrowse?: boolean;

  @ApiPropertyOptional({ 
    description: 'System 2 最大执行时间（秒）',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsNumber()
  max_seconds?: number;

  @ApiPropertyOptional({ 
    description: 'System 2 最大执行步数',
    example: 8,
    default: 8,
  })
  @IsOptional()
  @IsNumber()
  max_steps?: number;

  @ApiPropertyOptional({ 
    description: '浏览器操作最大步数',
    example: 12,
    default: 12,
  })
  @IsOptional()
  @IsNumber()
  max_browser_steps?: number;

  @ApiPropertyOptional({ 
    description: '成本预算（美元）',
    example: 0.1,
  })
  @IsOptional()
  @IsNumber()
  cost_budget_usd?: number;

  @ApiPropertyOptional({ 
    description: 'LLM 提供商（auto/openai/deepseek/gemini/anthropic），auto 表示使用系统推荐的模型',
    example: 'auto',
    enum: ['auto', 'openai', 'deepseek', 'gemini', 'anthropic', 'vllm'],
    default: 'auto',
  })
  @IsOptional()
  @IsEnum(['auto', 'openai', 'deepseek', 'gemini', 'anthropic', 'vllm'])
  llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic' | 'vllm';

  @ApiPropertyOptional({ 
    description: '是否使用 Claude 编排（Feature Flag）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  use_claude_orchestration?: boolean;

  @ApiPropertyOptional({
    description:
      '是否启用 intent.recognize 技能覆盖规则层 taskType（默认 true；设为 false 时仅使用 keywords 规则，不发起额外 LLM 调用）',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enable_intent_recognition_skill?: boolean;

  @ApiPropertyOptional({ 
    description: '是否使用状态机编排（默认 true，仅在 use_claude_orchestration=true 时生效）',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  use_state_machine_orchestration?: boolean;

  @ApiPropertyOptional({
    description: 'Fallback 策略提示（POI 缺失时优先使用）',
    example: 'CLASSIC',
    enum: ['CITY_WALK', 'CLASSIC', 'HOT_SPOTS', 'BALANCED'],
  })
  @IsOptional()
  @IsEnum(['CITY_WALK', 'CLASSIC', 'HOT_SPOTS', 'BALANCED'])
  fallback_strategy?: 'CITY_WALK' | 'CLASSIC' | 'HOT_SPOTS' | 'BALANCED' | 'ROAD_TRIP';

  @ApiPropertyOptional({
    description:
      '调试模式：返回 fallback 候选打分明细，并在 explain.simplified_explanation 中附带「结构化说明」（解释摘要/关键决策）；默认不向终端用户暴露',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  show_debug_scores?: boolean;

  @ApiPropertyOptional({
    description: '是否返回 fallback 通勤矩阵（调试用途）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  show_commute_matrix?: boolean;

  @ApiPropertyOptional({
    description: '是否强制要求命中 POI 数据（true 时 POI 为空直接澄清，不走 fallback）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  require_poi_data?: boolean;

  @ApiPropertyOptional({
    description: '允许带缺口继续执行（先出草案，再补澄清）',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allow_partial?: boolean;

  @ApiPropertyOptional({
    description: 'POI 策略：strict=必须命中，fallback=可降级，explore=自动探索',
    example: 'fallback',
    enum: ['strict', 'fallback', 'explore'],
    default: 'fallback',
  })
  @IsOptional()
  @IsEnum(['strict', 'fallback', 'explore'])
  poi_policy?: 'strict' | 'fallback' | 'explore';

  @ApiPropertyOptional({
    description: 'POI 数据来源偏好',
    example: 'vector',
    enum: ['vector', 'google', 'foursquare', 'auto'],
    default: 'auto',
  })
  @IsOptional()
  @IsEnum(['vector', 'google', 'foursquare', 'auto'])
  poi_source?: 'vector' | 'google' | 'foursquare' | 'auto';

  @ApiPropertyOptional({
    description: '是否在结果中返回 POI trace 调试信息',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  show_poi_trace?: boolean;

  @ApiPropertyOptional({
    description:
      '人格倾向预设：由 System 1 / NL 侧传入，不在 System 1 执行三人格；写入 TripPlanRequest.persona_hint 供门控与编排参考。',
    type: PersonaHintDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PersonaHintDto)
  persona_hint?: PersonaHintDto;

  @ApiPropertyOptional({
    description:
      '启用三人格影子辩论 LLM（`prompts/agents/guardians-debate.md`）：在硬门未致命时对 `guardian_results` 做结构化合议；BLOCK/HARD 时跳过 LLM 并保留确定性投影。行程规划状态机路径下未传时默认为 `true`；传 `false` 可显式关闭。',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enable_guardians_debate_llm?: boolean;

  @ApiPropertyOptional({ 
    description: '入口来源标识（用于权限控制和操作限制）',
    example: 'trip_detail_page',
    enum: ['trip_detail_page', 'trip_list_page', 'dashboard', 'planning_workbench'],
  })
  @IsOptional()
  @IsEnum(['trip_detail_page', 'trip_list_page', 'dashboard', 'planning_workbench'])
  entry_point?: 'trip_detail_page' | 'trip_list_page' | 'dashboard' | 'planning_workbench';

  @ApiPropertyOptional({ 
    description: '只读模式标志（true 时限制为查询类操作）',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly_mode?: boolean;

  @ApiPropertyOptional({
    description: 'Action 执行模式（建议/半自动/自动）',
    example: 'SEMI_AUTO',
    enum: ['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO'],
    default: 'ADVICE_ONLY',
  })
  @IsOptional()
  @IsEnum(['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO'])
  execution_mode?: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO';

  @ApiPropertyOptional({
    description:
      'MAPE：固定使用指定 Policy Agent（`PolicyAgent.policyId`）；优先级高于 `execution_policy_version_id`。',
    example: 'pa_lx123_abc',
  })
  @IsOptional()
  @IsString()
  policy_agent_id?: string;

  @ApiPropertyOptional({
    description:
      'PV-ER：固定使用指定策略版本（`ExecutionPolicyVersion.versionId`）；不设则由 Policy Selection Layer 自动选取。',
    example: 'pv_lx123_abc',
  })
  @IsOptional()
  @IsString()
  execution_policy_version_id?: string;

  @ApiPropertyOptional({
    description:
      'v1.0 Durable：已有 `trip_runs.id`（UUID）时传入，用于加载 `metadata.dso_checkpoint`；与评测用 `meta.run_id` 不同。',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  durable_trip_run_id?: string;

  @ApiPropertyOptional({
    description:
      '语义执行模型声明版本（`route_and_run` 入口路由；缺省跟随宿主）。与 `semantic-validation-contract.md` §14/§15 对齐。',
    example: 'v1',
  })
  @IsOptional()
  @IsString()
  execution_model_version?: string;

  @ApiPropertyOptional({
    description: '是否允许受控升级路径（与 ledger import allowlist 语义组合；默认 false）。',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  execution_model_allow_upgrade?: boolean;

  @ApiPropertyOptional({
    description: '执行模型路由器可选 hint（观测/预留；不参与 v1 路由判定）。',
    example: 'replay_session_a',
  })
  @IsOptional()
  @IsString()
  execution_model_runtime_hint?: string;

  @ApiPropertyOptional({
    description:
      '内部：从 P3 Redis 装载冻结 AgentMemoryContext（仅 replay_from_trace 等受控入口；须与 trace.snapshot_id 对齐）。',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  orchestration_replay_anchor_snapshot_id?: string;

  @ApiPropertyOptional({
    description:
      '内部：replay 确定性封印（禁止编排 mode fallback、禁止 routeContext enricher、须配合 replay anchor；由 replay_from_trace 设置）。',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  orchestration_replay_strict_seal?: boolean;

  @ApiPropertyOptional({
    description:
      '可选：CID v1 载荷（`agent.execution_os.change_impact_descriptor@v1`）；若提供则写入 `observability.trace.change_impact_descriptor_v1` 并与请求对齐校验。router/fallback 仅作语义提示，不强制分支。',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  change_impact_descriptor_v1?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Trace 契约兼容：`cid-aware`（默认）强制 `execution_semantic_fingerprint_v1` 与 CID trace 物化；`legacy` 允许旧 dedup 缓存形态并在 `observability.execution_trace_compatibility_v1` 记录 suppressed 项。仅工程收口，不改变执行核。',
    enum: ['legacy', 'cid-aware'],
    example: 'cid-aware',
    default: 'cid-aware',
  })
  @IsOptional()
  @IsIn(['legacy', 'cid-aware'])
  trace_compatibility_mode?: 'legacy' | 'cid-aware';

  @ApiPropertyOptional({
    description:
      'v1.0：状态机成功结束后将 DSO 快照写入 `TripRun.metadata.dso_checkpoint`（需先有 tripRunId，通常与新建 TripRun 同请求链）。',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  persist_dso_checkpoint?: boolean;

  @ApiPropertyOptional({
    description:
      '内部：Fitness Hydrator 写入的 travelPreference 快照，仅供 INTAKE 漏斗消费（`intake_travel_preference_snapshot`）；INTAKE 后须剥离。',
  })
  @IsOptional()
  intake_travel_preference_snapshot?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      '2.0 局部回溯：进入 RESEARCH 前按作用域就地删除 `OrchestratorState.research_data` 中对应键（如仅 `hotel` 时保留航班/POI/交通等），Kernel 以 `scoped_partial` 仅重算所列域，降低 Token 与延迟。',
    example: ['hotel'],
    isArray: true,
    enum: RESEARCH_ASSET_SCOPE_VALUES,
  })
  @IsOptional()
  @IsArray()
  @IsIn([...RESEARCH_ASSET_SCOPE_VALUES], { each: true })
  research_invalidate_scopes?: ResearchAssetScope[];

  @ApiPropertyOptional({
    description:
      'INTAKE/NLU：行程上下文（与 `intent_flags.modification_targets` 联用，驱动 2.0 research 局部失效「自动挡」）。',
    type: ItineraryContextSignalsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ItineraryContextSignalsDto)
  itinerary_context?: ItineraryContextSignalsDto;

  @ApiPropertyOptional({
    description: 'INTAKE/NLU：细化信号类型，与 `itinerary_context.is_replan` 共同门控 modification_targets。',
    type: RefinementSignalDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RefinementSignalDto)
  refinement_signal?: RefinementSignalDto;

  @ApiPropertyOptional({
    description:
      'DOS Phase 5：启用 LLM Intent Compiler 将自然语言编译为 PlanDeltaIR（默认关；可用 INTENT_COMPILER_LLM_ENABLED=true 全局开启）。',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enable_llm_intent_compiler?: boolean;

  @ApiPropertyOptional({
    description:
      'DOS 实验：前端直传结构化 Plan Delta AST，跳过 LLM/legacy 编译（免检注入 INTENT_COMPILE）。',
    isArray: true,
    example: [
      {
        op: 'REPLACE',
        target: { type: 'POI', dayIndex: 1, id: 'poi_tokyo_tower' },
        payload: { query: '涩谷' },
      },
    ],
  })
  @IsOptional()
  @IsArray()
  experimental_plan_delta?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({
    description:
      'Replan（PRD I3）：上一版编排 `plan_version`；与 `previous_world_snapshot_hash` 一并写入新建 TripRun.metadata.replan_context，支撑继承审计。',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  previous_plan_version?: number;

  @ApiPropertyOptional({
    description:
      'Phase 2 因果防御：客户端持有的最新 DSO `systemState.version`。若落后于服务端最新版本，返回 409 `STALE_PLAN_VERSION`（在写锁内/抢锁前校验，避免空转 LLM）。',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  client_dso_version?: number;

  @ApiPropertyOptional({
    description:
      'Replan（PRD I3）：上一版世界快照哈希或摘要 id（客户端/编排投影）；trim 后写入 TripRun.metadata.replan_context。',
    example: 'sha256:abcdef…',
  })
  @IsOptional()
  @IsString()
  previous_world_snapshot_hash?: string;

  @ApiPropertyOptional({
    description:
      '意图档位：AUTO=服务端推断；TRIP_PLANNING / DATA_LOOKUP / GENERIC_QA=显式覆盖 task_type（与 observability.trace.route_decision 对齐）',
    enum: INTENT_MODE_VALUES,
    example: 'AUTO',
    default: 'AUTO',
  })
  @IsOptional()
  @IsIn([...INTENT_MODE_VALUES])
  intent_mode?: IntentMode;

  @ApiPropertyOptional({
    description:
      'Durable Task 委托：`OFF` 默认同步；`AUTO` 在 INTENT_COMPILE 后若判定为重规划则 HTTP 202 秒回 task_id；`FORCE` 立即后台执行（等同 `/route_and_run/async`）。',
    enum: ['OFF', 'AUTO', 'FORCE'],
    example: 'AUTO',
    default: 'OFF',
  })
  @IsOptional()
  @IsIn(['OFF', 'AUTO', 'FORCE'])
  async_mode?: 'OFF' | 'AUTO' | 'FORCE';

  @ApiPropertyOptional({
    description:
      '只读实时工具开关（Phase1 传感器）：weather=天气；flight=Amadeus 航班报价；hotel=住宿检索；car_rental=Booking.com 租车（需 Trip 或 structured 起止日）。轻量路径 DATA_LOOKUP/GENERIC_QA/RAG_QA 下注入事实块；航班亦可在开放程/实时组合话术下自动触发（需 AMADEUS 凭证）。',
    example: ['weather', 'flight', 'hotel', 'car_rental'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enable_live_tools?: string[];

  @ApiPropertyOptional({
    description:
      'Agentic MCP Runtime Cap（FEATURE_AGENTIC_RUNTIME_MCP_CAP）：与 tools.select / context 对齐的规划相位（小写），用于将 LLM 可见 MCP 限制为相位子集；缺省 planning。',
    example: 'decision',
  })
  @IsOptional()
  @IsString()
  agentic_runtime_planning_phase?: string;

  @ApiPropertyOptional({
    description:
      'Agentic MCP Runtime Cap：与 ContextPackage.metadata.toolAllowlist[].name 对齐的 skill / MCP 标识列表（网关或 BFF 从上一轮 context 轻量透传）；与相位默认集求交以收窄 MCP 暴露面。',
    type: [String],
    example: ['weather.search', 'readiness.assess'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agentic_runtime_tool_allowlist?: string[];

  @ApiPropertyOptional({
    description:
      'Agentic HITL 续跑：用户已确认的工具调用 id（OpenAI `tool_calls[].id`），与挂起 envelope `data.tool_call_id` 对齐。可与 TripTask.constraints.approved_tool_invocations 合并（后者先、本字段覆盖同 id）。元素可为 `string` 或 `{ tool_call_id, mcp_tool_name? }`（填 mcp_tool_name 时须与待执行 MCP 名一致才放行）。',
    example: ['call_abc', { tool_call_id: 'call_xyz', mcp_tool_name: 'exa.deepSearch' }],
    type: 'array',
    items: {
      oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
    },
  })
  @IsOptional()
  @IsArray()
  agentic_approved_tool_invocations?: Array<string | Record<string, unknown>>;

  @ApiPropertyOptional({
    description: '意图微标志（与 intent_mode / task_type 并行）；用于 live_facts 等细粒度开关',
    type: IntentFlagsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntentFlagsDto)
  intent_flags?: IntentFlagsDto;

  @ApiPropertyOptional({
    description:
      'Replay correctness：本轮 WorldFreshnessVector；dedup 命中时与缓存条目的 `replay_cache_provenance.freshness` 比对。',
    example: { weatherVersion: 'wx-2026-05-07T12Z', mapVersion: 'm-42' },
  })
  @IsOptional()
  @IsObject()
  replay_current_freshness?: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Replay correctness：聚合 world/plan 版本（与缓存 `replay_cache_provenance.aggregateWorldStateVersion` 比对）。',
  })
  @IsOptional()
  @IsString()
  replay_current_world_state_version?: string;
}

/** 与 NL 并行提交：同行规模、体能档位、风险承受（写入 Memory snapshot + TripPlanRequest.party*） */
export class RouteAndRunPartyProfileDto {
  @ApiPropertyOptional({
    description: '体能档位：影响 VERIFY/体验评估与行程强度假设（与 TripPlanRequest.party.fitness_level 对齐）',
    enum: ['low', 'medium', 'high'],
    example: 'medium',
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  fitness_level?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({
    description: '风险承受（大写枚举，与 TripPlanRequest.party_profile.risk_tolerance 对齐）',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({ description: '同行总人数（可选覆盖 NL 抽取的 party.count）', example: 4 })
  @IsOptional()
  @IsNumber()
  party_total?: number;

  @ApiPropertyOptional({ description: '是否有儿童同行' })
  @IsOptional()
  @IsBoolean()
  has_children?: boolean;

  @ApiPropertyOptional({ description: '是否有长者同行' })
  @IsOptional()
  @IsBoolean()
  has_elderly?: boolean;

  @ApiPropertyOptional({
    description: '行动能力 / 体能补充说明（中文短句，写入 travelPreference.route_mobility_note_zh）',
    example: '膝关节不好，避免长距离徒步',
  })
  @IsOptional()
  @IsString()
  mobility_note_zh?: string;
}

/** 与 NL message 并行：澄清/前端显式提交，避免仅靠关键词表丢失 Reykjavik 等城市 */
export class StructuredTravelInputDto {
  @ApiPropertyOptional({
    description: '结构化目的地（写入 trip_plan_request / DSO userIntent.destination）',
    example: 'Reykjavik',
  })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({
    description: '结构化起点（可选）',
    example: 'Keflavík Airport',
  })
  @IsOptional()
  @IsString()
  origin?: string;

  @ApiPropertyOptional({
    description:
      '结构化出发/开始日期（ISO 日期，YYYY-MM-DD）。与 message 中 NL 日期并行，澄清/日期选择器提交时写入，供 INTAKE 与门控 `start_date` 使用。',
    example: '2026-05-08',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'start_date 须为 YYYY-MM-DD' })
  start_date?: string;

  @ApiPropertyOptional({
    description: '结构化结束日（与 start_date 组成 date_range 覆盖区间）',
    example: '2026-05-12',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'end_date 须为 YYYY-MM-DD' })
  end_date?: string;

  @ApiPropertyOptional({
    description:
      '结构化同行/体能（与顶层 `party_profile` / `fitness_level` 语义一致；顶层字段优先覆盖本块同名字段）',
    type: RouteAndRunPartyProfileDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RouteAndRunPartyProfileDto)
  party_profile?: RouteAndRunPartyProfileDto;
}

/**
 * 客户端 / Evaluation Harness 元数据（不参与业务语义；用于与 Kernel Harness trace 关联）。
 */
export class RouteAndRunRequestMetaDto {
  @ApiPropertyOptional({
    description:
      'Evaluation Harness 单次运行 id（与 replay 报告 `runFingerprint.runId` 一致）；写入 DSO `harnessRuntime.evaluationRunId` 与 `HarnessTrace.meta.evaluationRunId`',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  run_id?: string;

  @ApiPropertyOptional({
    description:
      '稳定对话 id（同一会话多轮 route_and_run 保持一致）。用于服务端恢复上一轮 research_data 快照，支撑澄清后的 transport_only 合并。',
    example: 'conv-7c2a9f1b',
  })
  @IsOptional()
  @IsString()
  conversation_id?: string;

  @ApiPropertyOptional({
    description:
      '客户端环境画像（可与 HTTP `x-client-profile` 合并；具体策略由 ExecutionGateway 配置表消费，Controller 仅透传）。',
    example: 'factory_deterministic',
  })
  @IsOptional()
  @IsString()
  client_profile?: string;

  @ApiPropertyOptional({
    description: '规划助手等非标准入口可选：目的地提示（不参与契约校验语义，仅观测/提示）。',
    example: '冰岛',
  })
  @IsOptional()
  @IsString()
  planning_destination_hint?: string;
}

/**
 * 客户端点击 `suggested_operations` 按钮时随 POST 传入的嵌套负载。
 * 须声明在 DTO 上：全局 ValidationPipe `whitelist` 会剥离未注册字段，裸 `payload: { trip_id }` 无法进入业务层。
 */
export class SuggestedOperationInvokePayloadDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional({ description: '可选；通常仍使用顶层 message' })
  @IsOptional()
  @IsString()
  message?: string;
}

export class PreferenceProfileDto {
  @ApiPropertyOptional({ example: 20, description: 'Max extra cost user is willing to pay (USD)' })
  @IsOptional()
  @IsNumber()
  max_extra_cost_usd?: number;

  @ApiPropertyOptional({ example: 30, description: 'Max delay user is willing to accept (minutes)' })
  @IsOptional()
  @IsNumber()
  max_delay_minutes?: number;

  @ApiPropertyOptional({ example: 0.7, description: 'Cost sensitivity (0-1)' })
  @IsOptional()
  @IsNumber()
  cost_sensitivity?: number;

  @ApiPropertyOptional({ example: 0.6, description: 'Time sensitivity (0-1)' })
  @IsOptional()
  @IsNumber()
  time_sensitivity?: number;

  @ApiPropertyOptional({ example: 0.4, description: 'Effort/comfort sensitivity (0-1)' })
  @IsOptional()
  @IsNumber()
  effort_sensitivity?: number;

  @ApiPropertyOptional({ enum: ['STRICT', 'FLEX'] as const, example: 'STRICT' })
  @IsOptional()
  @IsEnum(['STRICT', 'FLEX'])
  respect_reservations?: 'STRICT' | 'FLEX';
}

export class RouteAndRunRequestDto {
  @ApiProperty({ 
    description: '请求唯一标识符',
    example: 'req-001',
  })
  @IsString()
  request_id!: string;

  @ApiProperty({ 
    description: '用户 ID（战略收敛：全局强制字段，不允许空；匿名用户请传 "anonymous"）',
    example: 'user-123',
  })
  @IsNotEmpty({ message: 'user_id 是必需字段，缺失将导致个性化能力不可用。匿名用户请传 "anonymous"' })
  @IsString()
  @MinLength(1, { message: 'user_id 不能为空字符串' })
  user_id!: string;

  @ApiPropertyOptional({ 
    description: '关联的行程 ID（可选）',
    example: 'trip-456',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  trip_id?: string | null;

  @ApiPropertyOptional({
    description: 'camelCase 别名，与 trip_id 等价（部分前端序列化默认驼峰）。',
    example: 'trip-456',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  tripId?: string | null;

  @ApiPropertyOptional({
    description:
      '一键操作回调：将 suggested_operations[].payload 放在此字段 POST 时，其中的 trip_id 会合并到顶层（解决仅展开 message 导致丢 trip_id）。',
    type: SuggestedOperationInvokePayloadDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestedOperationInvokePayloadDto)
  suggested_operation_payload?: SuggestedOperationInvokePayloadDto;

  @ApiPropertyOptional({
    description:
      '兼容字段名：与 suggested_operation_payload 相同（部分客户端把按钮 payload 直接命名为 payload）。',
    type: SuggestedOperationInvokePayloadDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestedOperationInvokePayloadDto)
  payload?: SuggestedOperationInvokePayloadDto;

  @ApiPropertyOptional({ 
    description: '关联的路线方向 ID（可选，用于护城河扩展的失败风险预测）',
    example: 'route-dir-789',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  route_direction_id?: string | null;

  @ApiProperty({ 
    description: '用户输入消息',
    example: '推荐新宿拉面',
  })
  @IsString()
  message!: string;

  @ApiPropertyOptional({
    description: '结构化旅行字段（澄清回合与 message 一并提交，保证 STATE_UPDATE 可收敛 destination）',
    type: StructuredTravelInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StructuredTravelInputDto)
  structured_travel_input?: StructuredTravelInputDto;

  @ApiPropertyOptional({
    description:
      '快捷体能档位（与 `party_profile.fitness_level` 等价；若同时提供，以本字段为准写入 `party_profile.fitness_level`）',
    enum: ['low', 'medium', 'high'],
    example: 'low',
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  fitness_level?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({
    description:
      '同行与体能/风险结构化字段（写入本轮 Memory snapshot 与 TripPlanRequest.party*；可与 `structured_travel_input.party_profile` 并存，顶层优先）',
    type: RouteAndRunPartyProfileDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RouteAndRunPartyProfileDto)
  party_profile?: RouteAndRunPartyProfileDto;

  @ApiPropertyOptional({ 
    description: '对话上下文',
    type: ConversationContextDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConversationContextDto)
  conversation_context?: ConversationContextDto;

  @ApiPropertyOptional({
    description: '请求级元数据（评测 / 回放关联；可选）',
    type: RouteAndRunRequestMetaDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RouteAndRunRequestMetaDto)
  meta?: RouteAndRunRequestMetaDto;

  @ApiPropertyOptional({ 
    description: '智能体执行选项',
    type: AgentOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentOptionsDto)
  options?: AgentOptionsDto;

  @ApiPropertyOptional({
    description:
      '澄清回合的结构化回答（用于闭环：将用户选择映射为 DecisionStatePatch 并触发组合放宽推演）',
    type: 'array',
    example: [{ questionId: 'plan_gen_empty_draft_relax_constraints', value: ['upgrade_vehicle_to_4wd', 'increase_days_by_1'] }],
  })
  @IsOptional()
  clarification_answers?: ClarificationAnswer[];

  @ApiPropertyOptional({
    description:
      'Emergency constraint injection for resilient execution (hard-forbidden segments, forced road states). Used by auto-heal replan.',
    type: 'object',
    additionalProperties: true,
    example: {
      forbidden_segments: ['seg-1'],
      forced_road_states: { 'seg-1': 'CLOSED' },
      reason_code: 'HEALING_PHYSICAL_DRIFT',
    },
  })
  @IsOptional()
  emergency_constraints?: {
    forbidden_segments?: string[];
    forced_road_states?: Record<string, 'CLOSED'>;
    /** Temporal hard deadlines (latest allowable end time), keyed by poi_id or segment_id. ISO-8601 preferred. */
    hard_deadlines?: Record<string, string>;
    /**
     * Mode guardrails for Sentinel (engine-level constraints).
     * These are evaluated by candidate filtering + strict evidence bundle enforcement.
     */
    forbidden_modes?: Array<'DRIVE' | 'MOTORCYCLE' | 'TRANSIT' | 'RAIL' | 'FERRY' | string>;
    preferred_modes?: Array<'RAIL' | 'FERRY' | 'TRANSIT' | 'DRIVE' | string>;
    /** Optional override for wind tolerance used in guards/filters (m/s). */
    max_wind_speed_tolerance_mps?: number;
    reason_code?: string;
  };

  @ApiPropertyOptional({
    description:
      'Human-centric preference profile used for trade-off arbitration and negotiation triggering. Never overrides hard facts.',
    example: {
      max_extra_cost_usd: 20,
      max_delay_minutes: 30,
      cost_sensitivity: 0.7,
      time_sensitivity: 0.6,
      respect_reservations: 'STRICT',
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferenceProfileDto)
  preference_profile?: PreferenceProfileDto;
}

/** Flags on assembled evidence cards (payload.decision_metadata.evidence_cards) */
export class DecisionEvidenceCardFlagsDto {
  @ApiPropertyOptional({
    description: '原始数值疑似异常（如风速 >50m/s），建议二次校验数据源或降级展示',
    example: false,
  })
  data_anomaly?: boolean;
}

/** Single physical-evidence card (Iron Shield) for frontend “证据视图” */
export class DecisionEvidenceCardDto {
  @ApiProperty({ enum: ['iron_shield_evidence'], example: 'iron_shield_evidence' })
  kind!: 'iron_shield_evidence';

  @ApiProperty({ example: 'temp_wind_speed_drive_limit_v1' })
  rule_id!: string;

  @ApiPropertyOptional({ example: 'High wind warning for driving segments' })
  rule_name?: string;

  @ApiProperty({ enum: ['HARD', 'SOFT'], example: 'HARD' })
  severity!: 'HARD' | 'SOFT';

  @ApiPropertyOptional({ enum: [1, 2, 3], description: '说服阶梯：1 事实 / 2 后果 / 3 权威' })
  persuasion_tier?: 1 | 2 | 3;

  @ApiProperty({ description: '用户可读一行（可与 narrator_hint_rendered 对齐）' })
  message!: string;

  @ApiPropertyOptional({ description: '规则引擎渲染后的叙事（含物理锚点）' })
  narrator_hint_rendered?: string;

  @ApiProperty({
    description: '结构化证据包（如 type=solar_physics / weather_physics、source、baseline、阈值等）',
    type: 'object',
    additionalProperties: true,
    example: { type: 'weather_physics', source: 'segment_prediction', value_mps: 25, threshold_mps: 15 },
  })
  evidence!: Record<string, unknown>;

  @ApiPropertyOptional({ type: DecisionEvidenceCardFlagsDto })
  flags?: DecisionEvidenceCardFlagsDto;
}

/** 决策元数据：前端优先读取的稳定装配区（与 orchestrationResult.state.narration 对齐） */
export class DecisionMetadataDto {
  @ApiPropertyOptional({
    type: [DecisionEvidenceCardDto],
    description: 'Iron Shield 物理证据卡片列表（由 narration.warnings 中的 iron_shield_evidence 装配）',
  })
  evidence_cards?: DecisionEvidenceCardDto[];
}

/** Tier 2+：损失时间块（与 EvidenceCardUIProps.impact 对齐） */
export class EvidenceCardImpactUiDto {
  @ApiProperty({ description: '延误估值（小时）', example: 2.5 })
  @IsNumber()
  hours!: number;

  @ApiProperty({ description: '展示标签', example: 'Estimated delay' })
  @IsString()
  label!: string;
}

/** Tier 3：判例 / 社会证明 */
export class EvidenceCardSocialProofUiDto {
  @ApiProperty({ example: 8 })
  @IsNumber()
  count!: number;

  @ApiProperty({ example: 91, description: '接受推荐或同类决策的占比（百分比整数）' })
  @IsNumber()
  percentage!: number;
}

/** Tier 3：策略锚点（可审计） */
export class EvidenceCardPolicyReferenceUiDto {
  @ApiProperty({ example: 'temp_wind_speed_drive_limit_v1' })
  @IsString()
  ruleId!: string;

  @ApiPropertyOptional({ example: 'High wind warning for driving segments' })
  @IsOptional()
  @IsString()
  ruleName?: string;
}

export class EvidenceCardUiFlagsDto {
  @ApiPropertyOptional({ description: '原始量疑似异常，建议降级展示', example: false })
  @IsOptional()
  @IsBoolean()
  data_anomaly?: boolean;
}

/**
 * Iron Shield 证据卡片 — 视觉契约（与 `src/shared/interfaces/evidence-ui.interface.ts` 对齐）。
 * 由服务端装配，客户端可直接 map 渲染，无需再跑 Assembler。
 */
export class EvidenceCardUiPropsDto {
  @ApiProperty({ enum: ['iron_shield_evidence'] })
  @IsIn(['iron_shield_evidence'])
  kind!: 'iron_shield_evidence';

  @ApiProperty({ enum: [1, 2, 3], description: '说服阶梯' })
  @IsIn([1, 2, 3])
  tier!: 1 | 2 | 3;

  @ApiProperty({ enum: ['minimalist', 'analytical', 'authoritative'], description: '与 tier 硬映射的布局密度' })
  @IsIn(['minimalist', 'analytical', 'authoritative'])
  layout!: 'minimalist' | 'analytical' | 'authoritative';

  @ApiProperty({ enum: ['solar', 'weather', 'road'], description: '主题色 / 图标族' })
  @IsIn(['solar', 'weather', 'road'])
  theme!: 'solar' | 'weather' | 'road';

  @ApiProperty({ description: '主标题（多为 narrator_hint_rendered）' })
  @IsString()
  title!: string;

  @ApiProperty({ description: '主指标展示', example: '25.0 m/s' })
  @IsString()
  valueDisplay!: string;

  @ApiPropertyOptional({ description: '数据来源标签', example: 'segment_prediction' })
  @IsOptional()
  @IsString()
  sourceLabel?: string;

  @ApiPropertyOptional({ example: 'Threshold: 15.0 m/s' })
  @IsOptional()
  @IsString()
  benchmark?: string;

  @ApiPropertyOptional({ type: EvidenceCardImpactUiDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceCardImpactUiDto)
  impact?: EvidenceCardImpactUiDto;

  @ApiPropertyOptional({ type: EvidenceCardSocialProofUiDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceCardSocialProofUiDto)
  socialProof?: EvidenceCardSocialProofUiDto;

  @ApiPropertyOptional({ type: EvidenceCardPolicyReferenceUiDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceCardPolicyReferenceUiDto)
  policyReference?: EvidenceCardPolicyReferenceUiDto;

  @ApiPropertyOptional({ type: EvidenceCardUiFlagsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceCardUiFlagsDto)
  flags?: EvidenceCardUiFlagsDto;
}

/** 纯展示层：与 decision_metadata（逻辑/审计）分离 */
export class DecisionUiDisplayDto {
  @ApiPropertyOptional({
    type: [EvidenceCardUiPropsDto],
    description: 'Iron Shield 证据卡片 UI 列表（EvidenceCardUIProps）',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EvidenceCardUiPropsDto)
  evidence_cards_ui?: EvidenceCardUiPropsDto[];
}

export class DecisionCandidateScoreDimensionsDto {
  @ApiPropertyOptional({ description: '安全得分 (0-1)' })
  @IsOptional()
  @IsNumber()
  safety?: number;

  @ApiPropertyOptional({ description: '体验得分 (0-1)' })
  @IsOptional()
  @IsNumber()
  experience?: number;

  @ApiPropertyOptional({ description: '成本效用 (0-1)' })
  @IsOptional()
  @IsNumber()
  cost_efficiency?: number;
}

export class DecisionCandidateScoreBreakdownDto {
  @ApiPropertyOptional({ description: '总效用 (0-1)' })
  @IsOptional()
  @IsNumber()
  total_utility?: number;

  @ApiPropertyOptional({ type: DecisionCandidateScoreDimensionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DecisionCandidateScoreDimensionsDto)
  dimensions?: DecisionCandidateScoreDimensionsDto;
}

export class DecisionCandidateRiskProfileDto {
  @ApiPropertyOptional({ description: '漂移概率 (0-1)' })
  @IsOptional()
  @IsNumber()
  probability_of_drift?: number;

  @ApiPropertyOptional({ description: '触碰到的关键约束（通常为软约束/风险点）', type: [String] })
  @IsOptional()
  critical_constraints?: string[];
}

export class EvidenceSourceDto {
  @ApiPropertyOptional({ description: 'Source type (e.g., KERNEL_FEASIBILITY_ENGINE, GOOGLE_PLACES, OPENING_HOURS)' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Human-readable source label' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Optional stable id (e.g., evidence_id / log id)' })
  @IsOptional()
  @IsString()
  ref_id?: string;
}

export class HardRuleFactRefDto {
  @ApiProperty({ description: 'Hard rule id (e.g., solar_safety_v1, temporal_opening_v1)' })
  @IsString()
  rule_id!: string;

  @ApiPropertyOptional({ description: 'Violated flag as captured in snapshot' })
  @IsOptional()
  @IsBoolean()
  is_violated?: boolean;

  @ApiPropertyOptional({ description: 'Severity (HARD/SOFT)' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ description: 'Optional reference id (e.g., decision_log_id)' })
  @IsOptional()
  @IsString()
  ref_id?: string;
}

export class EvidenceCardRefDto {
  @ApiProperty({ description: 'Evidence card kind (e.g., iron_shield_evidence)' })
  @IsString()
  kind!: string;

  @ApiPropertyOptional({ description: 'Rule id this card supports' })
  @IsOptional()
  @IsString()
  rule_id?: string;
}

export class EvidenceBundleDto {
  @ApiProperty({ description: 'Bundle id (stable hash)' })
  @IsString()
  bundle_id!: string;

  @ApiProperty({ description: 'Snapshot id (stable hash for time-bounded world snapshot)' })
  @IsString()
  snapshot_id!: string;

  @ApiProperty({ type: [EvidenceSourceDto] })
  @ValidateNested({ each: true })
  @Type(() => EvidenceSourceDto)
  sources!: EvidenceSourceDto[];

  @ApiProperty({ type: [HardRuleFactRefDto] })
  @ValidateNested({ each: true })
  @Type(() => HardRuleFactRefDto)
  hard_facts!: HardRuleFactRefDto[];

  @ApiProperty({ type: [EvidenceCardRefDto] })
  @ValidateNested({ each: true })
  @Type(() => EvidenceCardRefDto)
  evidence_cards!: EvidenceCardRefDto[];

  @ApiProperty({ description: 'Confidence (0-1)' })
  @IsNumber()
  confidence!: number;

  @ApiProperty({ description: 'Generated at (ISO)' })
  @IsString()
  generated_at!: string;

  @ApiPropertyOptional({ description: 'Expires at (ISO)' })
  @IsOptional()
  @IsString()
  expires_at?: string;

  @ApiProperty({ enum: ['VERIFIED', 'PARTIAL', 'STALE', 'FAILED'] as const })
  @IsString()
  verification_status!: 'VERIFIED' | 'PARTIAL' | 'STALE' | 'FAILED';

  @ApiPropertyOptional({
    description:
      'Machine-readable failure codes (Iron Shield / ops). Prefer stable enums documented in docs/api/failure-reason-codes.md; merge/dedupe with explain.failure_reason_codes on the client.',
    type: [String],
    example: ['PT_TRANSFER_GAP_VIOLATION', 'MISSING_DESTINATION'],
  })
  @IsOptional()
  failure_reason_codes?: string[];

  @ApiPropertyOptional({
    description: '与 failure_reason_codes 同序中文说明（调试/中文 UI）；未知码与码一致',
    type: [String],
  })
  @IsOptional()
  failure_reason_labels_zh?: string[];
}

export class NegotiationAlternativeDto {
  @ApiProperty({ description: 'Stable id for selection', example: 'UPGRADE_TO_DRIVE' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ description: 'Extra cost delta (USD)', example: 50 })
  @IsOptional()
  @IsNumber()
  cost_delta_usd?: number;

  @ApiPropertyOptional({ description: 'Extra time delta (minutes)', example: 0 })
  @IsOptional()
  @IsNumber()
  time_delta_minutes?: number;

  @ApiPropertyOptional({ description: 'Effort/comfort delta (0-1, higher=worse)', example: 0.2 })
  @IsOptional()
  @IsNumber()
  effort_delta?: number;

  @ApiPropertyOptional({ description: 'Optional candidate id link', example: 'cand_heal_drive' })
  @IsOptional()
  @IsString()
  candidate_id?: string;

  @ApiPropertyOptional({ description: 'User-facing one-liner', example: '多花 $50，但能保住 14:00 的博物馆预约。' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Explicit consequence text', example: '如果不升级，预约可能失效。' })
  @IsOptional()
  @IsString()
  consequence?: string;

  @ApiPropertyOptional({
    description: 'True if user recently rolled back from this alternative (soft penalty / UI badge).',
  })
  @IsOptional()
  @IsBoolean()
  prior_rollback_of_same_alternative?: boolean;

  @ApiPropertyOptional({
    description: 'Same intent as prior_rollback; explicit “曾被拒绝” for product copy.',
  })
  @IsOptional()
  @IsBoolean()
  previously_rejected?: boolean;

  @ApiPropertyOptional({
    description: 'Timeline fragility: hard-booking slack after this option would be very tight.',
  })
  @IsOptional()
  @IsBoolean()
  is_fragile?: boolean;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Pre-emptive rollback / punctuality risk tier.' })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({
    type: [String],
    description:
      'Causal disclosure tags (e.g. TAILORED_TO_YOUR_PREFERENCE, REAL_TIME_RISK_WARNING, ROLLBACK_MEMORY).',
    example: ['REAL_TIME_RISK_WARNING', 'ROLLBACK_MEMORY'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reasoning_tags?: string[];

  @ApiPropertyOptional({
    description:
      '0–1 reliability from hard-booking buffer slack: clamp((min_buffer_min − 5) / 15, 0, 1). Higher = safer.',
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  reliability_score?: number;

  @ApiPropertyOptional({
    description: 'User-facing line when this option was previously undone via physical rollback.',
  })
  @IsOptional()
  @IsString()
  regret_notice?: string;
}

export class NegotiationPayloadDto {
  @ApiProperty({ enum: ['PENDING_USER_DECISION'] as const, example: 'PENDING_USER_DECISION' })
  @IsString()
  status!: 'PENDING_USER_DECISION';

  @ApiProperty({ description: 'Machine reason code', example: 'PT_DELAY_IMPACTING_BOOKING' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ description: 'User-facing impact text', example: '换乘时间不足，极大概率错过班次。' })
  @IsOptional()
  @IsString()
  impact?: string;

  @ApiPropertyOptional({
    description: 'One-line counselor-style recommendation summarizing why option A is preferred over B.',
    example:
      '我们更推荐[打车升级]。虽然[推迟 30 分钟]也能解决冲突，但该方案准点风险更高，且你近期曾回滚过类似选择，系统不建议再次冒险。',
  })
  @IsOptional()
  @IsString()
  recommendation_summary?: string;

  @ApiPropertyOptional({
    description:
      'Strategy impact map: baseline vs each alternative — critical-path segment time shifts, cost deltas, and on-time index interval (buffer-derived; see on_time_model).',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  strategy_impact_map?: Record<string, unknown>;

  @ApiProperty({ type: [NegotiationAlternativeDto] })
  @ValidateNested({ each: true })
  @Type(() => NegotiationAlternativeDto)
  alternatives!: NegotiationAlternativeDto[];

  @ApiPropertyOptional({ description: 'Suggested default option id', example: 'POSTPONE_SCHEDULE' })
  @IsOptional()
  @IsString()
  default_option_id?: string;

  @ApiPropertyOptional({ description: 'Negotiation session id for confirm flow', example: 'neg:req-003' })
  @IsOptional()
  @IsString()
  negotiation_session_id?: string;

  @ApiPropertyOptional({
    description: 'Optimistic lock hash (client must echo back when confirming)',
    example: 'sha256:7e3c4b...'
  })
  @IsOptional()
  @IsString()
  expected_negotiation_hash?: string;

  @ApiPropertyOptional({
    description: 'Impact assessment for downstream itinerary (e.g., hard bookings that will be missed)',
    type: 'object',
    additionalProperties: true,
    example: { warnings: [{ item_id: 'museum_1', message: '将导致预约失效' }] },
  })
  @IsOptional()
  impact_assessment?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Evidence lineage / reliability for trade-off numbers (audit + UX)',
    example: {
      travel_time_v1: {
        reliability: 'VOLATILE',
        captured_context: { is_peak: true, mode: 'DRIVE', bucket: '2026-06-01T17:00:00.000Z' },
        invalidation_reason: 'EXPIRED_TRUST_NEIGHBORHOOD',
        source_type: 'L2_REALTIME_COMPUTED',
      },
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceLineageDto)
  evidence_lineage?: EvidenceLineageDto;

  @ApiPropertyOptional({
    description: 'One-line summary explaining why evidence was re-measured / downgraded',
    example: '高峰时段：已主动降权邻域缓存并触发实时重测（DRIVE 路况波动）',
  })
  @IsOptional()
  @IsString()
  lineage_summary?: string;
}

export class DecisionCandidateDto {
  @ApiProperty({ description: '候选方案 ID (e.g., plan_b_optimized)' })
  @IsString()
  candidate_id!: string;

  @ApiPropertyOptional({ type: () => Object, description: '完整行程实态' })
  @IsOptional()
  itinerary?: Itinerary;

  @ApiPropertyOptional({ type: DecisionCandidateScoreBreakdownDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DecisionCandidateScoreBreakdownDto)
  score_breakdown?: DecisionCandidateScoreBreakdownDto;

  @ApiPropertyOptional({ type: DecisionCandidateRiskProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DecisionCandidateRiskProfileDto)
  risk_profile?: DecisionCandidateRiskProfileDto;

  @ApiPropertyOptional({ description: '针对该候选方案的简评' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ description: 'C1 Strict: auditable evidence bundle', type: EvidenceBundleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceBundleDto)
  evidence_bundle?: EvidenceBundleDto;
}

/**
 * RAG / 知识库引用（与观测层统一：优先使用 `reference_sources`；`rag_sources` / `sources` 为同义别名）
 */
export class ReferenceSourceDto {
  @ApiPropertyOptional({ example: 'chunk-uuid-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'Iceland travel budget' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 's3://kb/iceland-budget.md' })
  @IsOptional()
  @IsString()
  uri?: string;

  @ApiPropertyOptional({ example: '人均餐饮约 2000–4000 ISK...' })
  @IsOptional()
  @IsString()
  snippet?: string;

  @ApiPropertyOptional({ example: 0.82 })
  @IsOptional()
  @IsNumber()
  score?: number;
}

@ApiExtraModels(
  RouteAndRunPartyProfileDto,
  PersonaHintDto,
  DecisionMetadataDto,
  DecisionEvidenceCardDto,
  DecisionEvidenceCardFlagsDto,
  DecisionUiDisplayDto,
  EvidenceCardUiPropsDto,
  EvidenceCardImpactUiDto,
  EvidenceCardSocialProofUiDto,
  EvidenceCardPolicyReferenceUiDto,
  EvidenceCardUiFlagsDto,
  DecisionCandidateDto,
  NegotiationPayloadDto,
  NegotiationAlternativeDto,
  EvidenceLineageDto,
  ReferenceSourceDto,
)
export class RouteAndRunResponseDto {
  @ApiProperty({ 
    description: '请求 ID（与请求中的 request_id 相同）',
    example: 'req-001',
  })
  request_id!: string;

  @ApiProperty({ 
    description: '路由决策信息',
    type: RouterOutputDto,
  })
  route!: RouterOutputDto;

  @ApiPropertyOptional({
    description:
      '异步委托元数据：`async_mode=AUTO|FORCE` 且已切入后台任务时出现；前端轮询 `poll_path` 直至 SUCCESS。',
    example: {
      task_id: 'task_trip_xxx_1716000000000',
      status: 'PROCESSING',
      is_async_delegated: true,
      current_phase: 'INTENT_COMPILE',
      progress_percentage: 5,
      message: '已拦截高耗时规划请求，正在切入异步流水线…',
      poll_path: '/api/agent/task/status/task_trip_xxx_1716000000000',
    },
  })
  async_task?: {
    task_id: string;
    status: 'PENDING' | 'PROCESSING';
    is_async_delegated: true;
    current_phase: string;
    progress_percentage: number;
    message: string;
    poll_path: string;
    delegation_reason?: string;
  };

  @ApiPropertyOptional({ 
    description: 'UI 状态（P1 改进：状态机步骤到 UI 状态的映射，用于前端加载状态显示）',
    example: {
      phase: 'GATE_EVAL',
      ui_status: 'verifying',
      progress_percent: 37.5,
      message: '正在评估行程可行性...',
      requires_user_action: false,
      estimated_time_remaining_ms: 15000,
      current_step_detail: '评估路线安全性、可达性和可行性（三人格评审）',
    },
  })
  ui_state?: {
    /** 当前状态机步骤（10步完整流程） */
    phase: OrchestrationStep;
    /** UI 状态（映射自状态机步骤） */
    ui_status: 'thinking' | 'browsing' | 'verifying' | 'repairing' | 'awaiting_consent' | 'awaiting_confirmation' | 'done' | 'failed';
    /** 进度百分比（0-100） */
    progress_percent?: number;
    /** 用户友好的消息 */
    message?: string;
    /** 是否需要用户操作 */
    requires_user_action?: boolean;
    /** 🆕 预计剩余时间（毫秒） */
    estimated_time_remaining_ms?: number;
    /** 🆕 当前步骤详细说明 */
    current_step_detail?: string;
    /** 与 `observability.trace.steps` 对齐：由 `stepsExecuted` 镜像，供 OrchestrationProgressCard 无需再读 payload */
    steps?: Array<{
      step_id: string;
      step_name: string;
      /** 编排步骤中文名（与 step_id 对应）；未知 ID 时等于 step_id */
      step_display_zh?: string;
      skill_name?: string;
      action_name?: string;
      success: boolean;
      duration_ms: number;
    }>;
  };

  @ApiProperty({ 
    description: '执行结果',
    example: {
      status: 'OK',
      answer_text: '我为您推荐以下新宿拉面店...',
      payload: {
        timeline: [],
        dropped_items: [],
        candidates: [],
        evidence: [],
        robustness: null,
        jepa: {
          version: '1.0',
          latent_contract: {
            z_env: {
              terrain_risk: [null, null, null],
              weather_state: [null, null, null],
              accessibility: [null, null],
              temporal_factor: [null, null],
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            z_user: {
              risk_tolerance: 0.5,
              delay_sensitivity: null,
              fatigue_limit: 0.6,
              experience_level: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            z_state: {
              continuity: 0.9,
              risk_score: 0.5,
              cost: 0.2,
              fatigue: 0.3,
              satisfaction_estimate: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
          },
          predictor_outputs: {
            risk_head: { risk_increase_prob: 0.65 },
            continuity_head: { continuity_break_prob: 0.1 },
            fatigue_head: { fatigue_increase_prob: 0.3 },
            cost_head: { cost_overrun_prob: 0.2 },
          },
          decision_trace: {
            z_pred: {
              continuity: 0.88,
              risk_score: 0.65,
              cost: 0.23,
              fatigue: 0.33,
              satisfaction_estimate: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            z_real: {
              continuity: 0.9,
              risk_score: 0.5,
              cost: 0.2,
              fatigue: 0.3,
              satisfaction_estimate: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            delta: {
              continuity: 0.02,
              risk_score: -0.15,
              cost: -0.03,
              fatigue: -0.03,
              satisfaction_estimate: null,
            },
            at: '2026-01-13T10:00:00.000Z',
          },
          prediction_errors: {
            world_error: {
              magnitude: 0.15,
              details: ['pred_avg_risk=0.65', 'real_risk=0.50'],
            },
          },
          trigger_reasons: ['WEATHER_SPIKE', 'CONSTRAINT_CONFLICT'],
          arbitration: {
            selected_candidate_id: 'cand_2',
            rejected_count: 2,
            conflict_detected: true,
            fallback_used: false,
          },
          risk_trajectory: [
            { at: '2026-01-13T10:00:00.000Z', risk_score: 0.5, reason: 'route_difficulty' },
            { at: '2026-01-14T10:00:00.000Z', risk_score: 0.8, reason: 'weather' },
          ],
        },
        orchestrationResult: {
          state: {
            request_id: 'req-001',
            current_step: 'DONE',
            itinerary: {
              request_id: 'req-001',
              days: [],
            },
            gate_result: {
              gate_result: 'ALLOW',
              violations: [],
              required_adjustments: [],
              confidence: 0.8,
              evidence_refs: [],
            },
            narration: {
              user_friendly_summary: '已为您生成行程安排',
              day_by_day_narrative: [],
              highlights: [],
              tips: [],
            },
            decision_log: [],
          },
        },
      },
    },
  })
  result!: {
    status:
      | 'OK'
      | 'PROCESSING'
      | 'NEED_MORE_INFO'
      | 'NEED_CONSENT'
      | 'NEED_CONFIRMATION'
      | 'FAILED'
      | 'TIMEOUT'
      | 'REDIRECT_REQUIRED';
    answer_text: string;
    payload: {
      timeline: ItineraryDay[];
      dropped_items: ItineraryItem[];
      candidates: DecisionCandidateDto[];
      alternatives?: DecisionCandidateDto[];
      evidence: EvidenceRef[];
      robustness: number | null;
      /**
       * 轻量 DATA_LOOKUP：住宿 MCP 结构化列表（与 `routing.target === 'hotel'` 联用）。
       * 常见字段含：`distance_to_anchor_km`、`distance_label_zh`、`anchor_poi_name_zh`、`listing_lat`/`listing_lng`（锚点为入住当日最后一站行程 POI）、`decision_support_zh`（住宿决策辅助文案：规则信号 + 可选 LLM 管家一句话；与请求里 `preference_profile`、行程 `budgetConfig.travelers` 等相关）。
       */
      accommodations?: Array<Record<string, unknown>>;
      airbnbListings?: unknown[];
      routing?: { target?: string };
      /** 按晚聚合的住宿块（与正文分工：前端可「每晚」标题下直接挂卡片，避免与 answer_text 清单重复） */
      accommodation_night_groups?: Array<{
        night_index: number;
        check_in: string;
        check_out: string;
        anchor_label_zh: string;
        stay_label_zh: string;
        has_mcp_sample: boolean;
        placeholder_zh?: string;
        cards: Array<Record<string, unknown>>;
      }>;
      /**
       * 行程中的 POI 经 Place 表补办后的卡片数据（与 `timeline` / `orchestrationResult.itinerary` 对齐）。
       * 名称、坐标、ontology 等展示字段以 **`Place` 登记为准**；`location_ref.place_id` 支持数字 id / UUID / Google Place Id；
       * 否则按 `location_ref.name` 精确匹配 nameCN/nameEN。
       */
      poi_cards?: Array<{
        place_id: number | null;
        uuid: string | null;
        itinerary_item_id: string;
        day_index: number;
        date: string;
        item_type: string;
        start_window: string;
        end_window: string;
        itinerary_name: string;
        name_cn: string | null;
        name_en: string | null;
        display_name: string;
        category: string | null;
        rating: number | null;
        description: string | null;
        address: string | null;
        lat: number | null;
        lng: number | null;
        tags: string[];
        matched_from:
          | 'place_id'
          | 'place_uuid'
          | 'place_google_id'
          | 'name_exact'
          | 'itinerary_only';
        /** 与 `/places/:id` 一致：来自 `Place.ontologyRules` */
        ontologyRules?: unknown | null;
        /** true：已命中 Place 表（含 id/uuid/googlePlaceId/名称精确匹配） */
        resolved_from_place_registry?: boolean;
      }>;
      /** 按天聚合的 POI 卡片（便于 UI：每日一块下方挂卡片） */
      poi_cards_by_day?: Array<{
        day_index: number;
        date: string;
        cards: Array<Record<string, unknown>>;
      }>;
      /**
       * `suppress_answer_prose`: 不要用长篇逐日叙述抢占版面；`answer_text` 仍为一句简短说明，
       * 前端可据此收起 Markdown 长文组件，仅保留气泡摘要 + 卡片（与住宿 night_groups 分工一致）。
       */
      poi_cards_meta?: {
        suppress_answer_prose?: boolean;
      };
      /** 多日行程「每晚上一间」采样策略说明（中文免责 + 采样晚序号） */
      hotel_search_meta?: {
        strategy?: 'single_stay' | 'per_night_sample';
        /** 本次 MCP 检索入住窗（解析后的 checkIn→checkOut）间夜数；用户收窄日期检索时为该窗，非整段 Trip */
        total_nights?: number;
        /** 可选：绑定行程时整段 Trip 间夜数；与卡片「第 M/N 晚」分母 N 对齐 */
        itinerary_total_nights?: number;
        /** 本次采样的晚序号（1-based，相对本次检索入住窗；与 `total_nights` 同一坐标系） */
        sampled_nights?: number[];
        disclaimer_zh?: string;
        ui_layout_hint_zh?: string;
        /** 本次住宿 MCP 快照组装完成时间（ISO8601）；与 `inventory_snapshots_meta` 对齐 */
        captured_at_iso?: string;
        /** 用户话术限定仅某一晚/部分晚检索时为 true */
        user_limited_night_intent?: boolean;
      };
      /** 轻量路径 MCP 传感器审计（天气/酒店等） */
      live_sensor_audit?: Array<{ tool_id: string; ok: boolean; latency_ms: number; error?: string }>;
      /** 轻量 DATA_LOOKUP RAG 命中的知识片段：文档名与 chunk/file 引用（与摘录括号《》一致） */
      data_lookup_rag_citations?: Array<{
        chunk_id: string;
        file_id: string;
        document_title: string;
        source_file?: string;
        category: 'practical' | 'risks' | 'pois' | 'decision_support';
        credibility_score?: number;
      }>;
      /**
       * 知识库摘录条数（与 `data_lookup_rag_citations.length` 对齐）。
       * 轻量路径 `lightweightKnowledgeQa` 时：`consultation_dashboard` 若有模型输出则下发；
       * **兜底**（由 `suggested_operations`/RAG/MCP 拼装）仅在 `routingTaskType === TRIP_PLANNING` 或请求带 `trip_id` 时下发，纯 DATA_LOOKUP/RAG_QA 且无行程绑定时不下发兜底块。
       */
      kb_rag_citation_count?: number;
      /**
       * 轻量问答无 `orchestrationResult.state` 时仍下发的统一执行轨迹：决策日志、RAG 命中、`routing_task_type`、
       * `steps_executed`，与 `explain.decision_log` 对账；供调试面板 / Decision Cockpit / Replay 展示。
       *
       * **依据说明（本体/路况）**：优先读 `decision_log[].ontology_evidence_display_zh`（与根级同名字段冗余）；
       * `evidence_refs` 中的 `ontology_*` 机器串仅作技术核对，勿作为主文案。
       */
      unified_execution_trace?: {
        lightweight_knowledge_qa?: boolean;
        routing_task_type?: string;
        intent_mode_resolved?: string;
        decision_log?: DecisionLogEntry[];
        steps_executed?: Array<Record<string, unknown>>;
        kb_rag_hit?: boolean;
        kb_rag_citation_count?: number;
        live_sensor_audit?: Array<{ tool_id: string; ok: boolean; latency_ms: number; error?: string }>;
      };
      /**
       * 轻量路径：Booking.com 租车 MCP 返回列表（与 `live_sensor_audit` 中 car_rental 成功项对应；用于前端卡片）。
       */
      car_rentals?: Array<Record<string, unknown>>;
      /** 租车检索元信息：是否使用系统默认日期窗口（行程未带起止日时） */
      car_rental_search_meta?: {
        fallback_dates_used?: boolean;
        pick_up_date?: string;
        drop_off_date?: string;
        pickup_query?: string;
        captured_at_iso?: string;
      };
      /** 轻量路径：`iceland.rentalGuidance` 结构化输出（与 Booking MCP 双路合并） */
      iceland_rental_guidance?: Record<string, unknown>;
      /** 附在租车 MCP 结果下的中文脚注（保险/信任标签/官方风险源），前端可渲染在 `car_rentals` 卡片下方 */
      car_rental_guidance_footnotes_zh?: string[];
      /**
       * 航班库存摘要（轻量路径 Amadeus / Flight MCP）。
       * 每条 leg 建议包含：`provider`、`label_zh`、`departure_date`、`origin_iata`、`destination_iata`、
       * `sample_lines`（文本）、**`sample_offers`**（结构化报价卡片：`rank`、`price_total`、`currency`、`duration`、`segments[]` 时刻/机场/航班号等）。
       */
      flight_inventory_snapshot?: {
        legs?: Array<Record<string, unknown>>;
        disclaimer_zh?: string;
        captured_at_iso?: string;
      };
      /**
       * 轻量路径本次请求实际产出的 live inventory 快照 freshness（注册表版本 + 各 sensor 的 captured / stale_after）。
       * 仅包含本轮成功的传感器；与分项 `hotel_search_meta.captured_at_iso` 等可对账。
       */
      inventory_snapshots_meta?: InventorySnapshotsMetaPayload;
      /**
       * Narrative Gate：由 `inventory_snapshots_meta` 推导的叙事强度（safe / tentative / refresh_required）。
       * 轻量咨询路径由编排器写入；供 UI / Replay / Audit 与 LLM 门控提示对齐。
       */
      narrative_safety?: NarrativeSafetyPayload;
      /**
       * Gen2 Runtime Integrity：确定性叙事校验与执行动作（pass / regenerated / downgraded），供 audit / replay / telemetry。
       */
      narrative_integrity_report?: NarrativeIntegrityReport;
      /**
       * 冰岛线「痛觉」结构化面板：SafeTravel 路段预警、`itinerary.verify` issues、`itinerary.smart_update` 摘要、
       * 已打 `route_segment_ref` 的 DRIVE/TRANSIT legs。与 `answer_text` 解耦，供前端徽章 / 折叠证据链。
       */
      safety_surface?: SafetySurfacePayload;
      /**
       * 轻量咨询且携带 trip_id：结构化「一键操作」（前端渲染按钮）。
       * - `route_and_run_message`：点击后用 `payload.message` 作为用户话术再次 POST `/api/agent/route_and_run`。
       *   **须携带行程**：顶层 `trip_id`（或与 `trip_id` 等价的 `tripId`），或将整个 `payload` 置于请求体的 `suggested_operation_payload` / `payload` 字段（全局 whitelist 会丢弃未声明的裸嵌套字段）。
       * - `client_navigation`：仅前端路由，使用 `payload.route`（如 timeline）与 `payload.trip_id`。
       */
      suggested_operations?: Array<{
        id: string;
        label: string;
        kind: 'route_and_run_message' | 'client_navigation';
        payload?: Record<string, unknown>;
      }>;
      /**
       * 咨询类可视化 Dashboard（与 `ui_surface === consultation` 联用）：Hero、评分条、摘要卡、风险、简版每日时间轴、预算、预订提醒、地图线索。
       * 来源：轻量咨询 LLM 的 <<<CONSULTATION_UI_JSON>>>；若模型未输出，可能由后端根据 `suggested_operations`、`live_sensor_audit`、`data_lookup_rag_citations`、`hotel_search_meta` 拼装兜底（见 `dashboard_origin`）。
       */
      consultation_dashboard?: ConsultationDashboardV1;
      jepa?: JepaPayload;
      /**
       * Claude 状态机编排结果。`gate_result.guardian_results` 含 `source` / `is_simulated`（审计）、
       * `evidence_atoms`（结构化证据）；与 `explain.guardian_personas` 同源只读。
       */
      orchestrationResult?: {
        state?: OrchestratorState;
        itinerary?: Itinerary;
        gate_result?: GateResult;
        decision_log?: DecisionLogEntry[];
      };
      actionExecution?: {
        mode: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO';
        status: 'NOT_STARTED' | 'PENDING_CONFIRM' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'ROLLED_BACK';
        requires_confirmation_count?: number;
        pendingActions?: Array<{
          action_id: string;
          action_type: TravelActionType;
          target_type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
          requires_confirmation: boolean;
          risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
        }>;
      };
      /**
       * Decision OS：与 orchestration 同一 `itinerary.action_plan` 跑 Action PREVIEW（PhysicalValidator + INTERRUPT_WITH_SUGGESTION）。
       * 含 `action_previews[].suggested_healing_options` / `healed_action_input`，供决策链 UI 直接渲染「拦截 + 一键修复」。
       */
      actionExecutionPreview?: {
        status: 'OK' | 'FAILED' | 'PARTIAL';
        message?: string;
        action_previews?: Array<Record<string, unknown>>;
        accepted_actions?: Array<Record<string, unknown>>;
        requires_confirmation_count?: number;
        high_risk_count?: number;
      };
      /** DSO 旅行本体子状态投影（与 Kernel STATE_UPDATE 对齐；无 Kernel 时由编排 state 推导） */
      travelOntologyState?: DecisionState['travelOntologyState'];
      // 重定向信息（仅在 REDIRECT_REQUIRED 时存在）
      redirectInfo?: {
        redirect_to: string;
        redirect_reason: 'READONLY_MODE_RESTRICTION' | 'PLANNING_REQUEST_DETECTED' | 'INSUFFICIENT_PERMISSIONS' | 'FEATURE_MIGRATED' | 'MISSING_TRIP_ID';
        original_request: {
          message: string; // 已脱敏，最多 200 字符
          user_id: string;
          trip_id?: string;
        };
      };
      // 澄清消息相关字段（仅在 NEED_MORE_INFO 且需要澄清时存在）
      needsUserConfirmation?: boolean;
      clarificationMessage?: string; // 向后兼容：简单字符串格式
      clarificationQuestions?: ClarificationQuestion[]; // 新增：结构化问题数组
      missingServices?: string[];
      solutions?: string[];
      errorType?: ErrorType;
      fallbackPlan?: {
        type?: string;
        strategy?: string;
        name?: string;
        timeline?: Array<{
          time?: string;
          action?: string;
          type?: string;
        }>;
        confidence?: number;
        selected_pois?: string[];
        plan_score?: number;
        source_confidence?: number;
        pacing_mode?: 'normal' | 'conservative';
        buffer_minutes?: number;
        debug_scores?: Array<{
          slot: string;
          desiredType: string;
          poiName: string;
          typeScore: number;
          timeScore: number;
          ratingScore: number;
          affordabilityScore: number;
          nameHintScore: number;
          commuteDistanceKm?: number;
          commuteMinutes?: number;
          commutePenalty?: number;
          timeWindowPenalty?: number;
          totalScore: number;
        }>;
        commute_matrix?: {
          mode?: 'walk' | 'drive' | 'transit' | 'mixed';
          from_start?: boolean;
          nodes?: string[];
          minutes?: number[][];
        };
      };
      fallbackExplain?: {
        summary?: string;
        reasoning?: string[];
        objective?: string;
        planScore?: number;
        dataSource?: string;
        sourceConfidence?: number;
        pacingMode?: 'normal' | 'conservative';
      };
      fallbackPlans?: Array<{
        type?: string;
        strategy?: string;
        name?: string;
        timeline?: Array<{
          time?: string;
          action?: string;
          type?: string;
        }>;
        confidence?: number;
      }>;
      fallbackSelectedStrategy?: string;
      fallbackTemplateVersion?: string;
      fallbackPacingMode?: 'normal' | 'conservative';
      poiTrace?: {
        policy?: 'strict' | 'fallback' | 'explore';
        sourceHint?: string;
        provider?: string;
        inputCount?: number;
        selectedCount?: number;
        /** 与 observability 对齐（CLI --show-poi-trace） */
        orchestration_mode_final?: string;
        received_route_direction_id?: string;
        requestRouteDirectionId?: string;
        selected_region?: string;
        destination_country?: string | null;
        recall_raw_research?: number;
        recall_after_route_augment?: number;
        after_dedupe?: number;
        after_hard_guards?: number;
        selected_after_rank?: number;
        country_filter_applied?: boolean;
        route_direction_id?: string;
        route_signature_pois_added?: number;
        route_corridor_pois_added?: number;
        commute_budget_minutes?: number;
        estimated_commute_minutes?: number;
        over_budget?: boolean;
        debug_scores?: Array<{
          slot?: string;
          desiredType?: string;
          poiName?: string;
          typeScore?: number;
          timeScore?: number;
          ratingScore?: number;
          affordabilityScore?: number;
          nameHintScore?: number;
          commuteDistanceKm?: number;
          commuteMinutes?: number;
          commutePenalty?: number;
          timeWindowPenalty?: number;
          totalScore?: number;
        }>;
        commute_matrix?: {
          mode?: 'walk' | 'drive' | 'transit' | 'mixed';
          from_start?: boolean;
          nodes?: string[];
          minutes?: number[][];
        };
      };
      /**
       * DOS v1：语义缺口 → 当次 POI_SELECTION 行为观测（只读；与 `state.metadata.gap_behavior_observation` 对齐）。
       */
      gap_behavior_observation?: {
        ts?: string;
        primaryGap?: string;
        allGapTypes?: string[];
        selectedCount?: number;
        indoorishSelectedCount?: number;
        categoryHistogram?: Array<{ category: string; count: number }>;
      };
      /** 结构化决策元数据（证据卡片等），与编排 state 对齐装配 */
      decision_metadata?: DecisionMetadataDto;
      /** 展示层：开箱即用的 UI 块（与 decision_metadata 并行，不参与 DPO 逻辑链） */
      ui_display?: DecisionUiDisplayDto;
      /** Human-centric negotiation payload when trade-offs exceed thresholds */
      negotiation_payload?: NegotiationPayloadDto;
    };
  };

  @ApiProperty({
    description:
      '决策解释（决策日志）。`failure_reason_codes` 与证据包合并去重后输出，详见 docs/api/failure-reason-codes.md。',
    example: {
      decision_log: [
        {
          step: 0,
          chosen_action: 'places.resolve_entities',
          reason_code: 'MISSING_POI_FACTS',
          facts: {},
          policy_id: 'FACTS_FIRST',
        },
      ],
      failure_reason_codes: ['MISSING_DESTINATION', 'TIME_GAP'],
      failure_reason_labels_zh: ['目的地未确定', '时间窗或日程空隙不足'],
      simplified_explanation: {
        summary: '行程已通过，进行了3项关键检查',
        key_decisions: [
          { step: 'GATE_EVAL', decision: '已通过', impact: 'HIGH' },
        ],
        evidence_count: 5,
        has_details: true,
      },
    },
  })
  explain!: {
    decision_log: DecisionLogEntry[];
    /** 与 `result.payload.evidence_bundle.failure_reason_codes` 对齐（并含 intake HARD gaps 推导码）；详见 docs/api/failure-reason-codes.md */
    failure_reason_codes?: string[];
    /** 与 `failure_reason_codes` 同序中文标签（调试 UI 可直接展示） */
    failure_reason_labels_zh?: string[];
    simplified_explanation?: SimplifiedExplanation; // 🆕 简化版解释（减少认知负荷）
    ai_capability_display?: AICapabilityDisplay; // 🆕 AI能力展示（信任建立机制）
    /**
     * 三人格只读投影：与 `result.payload.orchestrationResult.gate_result.guardian_results` 同源；
     * 装配时为同一引用，客户端应只读、勿作为独立可写状态；展示与审计以 payload 门控结果为准。
     */
    guardian_personas?: GateResult['guardian_results'];
    /** OPTIMIZE/CGUS 输出（用于直接展示备选方案与推荐理由） */
    optimization?: {
      method?: 'CGUS' | 'MONTE_CARLO' | 'HEURISTIC';
      recommended_alternative_id?: string;
      alternatives?: Array<{
        id: string;
        score: number;
        expected_utility?: number;
        feasibility_probability?: number;
        confidence_interval?: {
          lower: number;
          upper: number;
          level: number;
        };
        violations?: Array<{ type: string; severity: string; degree?: number; detail?: string }>;
      }>;
      /** 决策判决书：为何选中 / 为何弃选 / MC 采样 / 降级链 */
      decision_verdict?: {
        chosen_plan_id: string;
        rejected_plans: Array<{
          id: string;
          status: 'chosen' | 'rejected' | 'infeasible';
          rejection_reasons?: string[];
          hard_violation_count?: number;
          soft_penalty_degree?: number;
          expected_utility?: number;
          feasibility_probability?: number;
          utility_delta_vs_chosen?: number;
        }>;
        monte_carlo_summary?: {
          used: boolean;
          total_samples?: number;
          samples_per_candidate?: Record<string, number>;
        };
        fallback_chain?: Array<{ step: string; reason: string }>;
      };
      meta_decision_audit?: string;
      decision_verdict_narration_zh?: string;
      world_constraint_materialization?: {
        /** RAG → WorldConstraintStore 写入条数 */
        applied_events: number;
        road_ids: string[];
        weather_dates: string[];
        store_version: number;
        unified_graph_node_count?: number;
        unified_graph_edge_count?: number;
      };
      emergency_mask_audit?: {
        forbidden_modes: string[];
        candidates_before: number;
        candidates_after: number;
        pruned_candidates: number;
        pruned_segments_by_type: Record<string, number>;
      };
    };
    /** v1.0：内核可解释性（约束拒绝、DSO 版本、与 optimization 对齐的效用参数摘要） */
    kernel_explainability?: {
      dso_version?: string;
      last_step?: string;
      current_phase?: string;
      cursor_step?: string;
      constraint_violations?: Array<{ type: string; severity: string; detail: string; constraint?: string }>;
      optimization_method?: string;
      recommended_alternative_id?: string;
      /** 影子 Harness（HARNESS_SHADOW_AFTER_PHASE=1）各阶段复验结果 */
      harness_shadow_events?: Array<{
        kernel_phase: string;
        harness_step: string;
        run_status: string;
        harness_warning?: string;
        validation_results: Array<{ passed: boolean; code?: string; message: string; severity?: string }>;
        recorded_at: string;
      }>;
      harness_shadow_summary?: string;
      /** Durable 恢复：准入通过的 Harness 步骤 */
      resume_admission?: { step: string; passed?: boolean };
      /** PRD I3：DSO `harnessRuntime.replan_*`（与 observability / worldStateSummary 对齐） */
      replan_previous_plan_version?: number;
      replan_previous_world_snapshot_hash?: string;
    };
    /**
     * 世界模型投产门控（物理不完整 / 路由拓扑锁）。
     * 从 DSO 投影；与 `persist_dso_checkpoint` 快照字段同源，单次响应即可驱动前端段编辑器与 Banner。
     */
    world_model_guards?: {
      physical_reality_incomplete?: boolean;
      physical_data_region?: string;
      is_route_topology_locked?: boolean;
      route_skeleton_locked?: boolean;
      locked_segment_ids?: string[];
      route_skeleton_signature?: string;
      freeze_route_selection?: boolean;
      topology_match?: boolean;
      recommended_plan_rejected?: boolean;
      /** 建议的段编辑器模式：full | slot_timing_only | readonly */
      segment_editor_mode?: 'full' | 'slot_timing_only' | 'readonly';
      banner_message_zh?: string;
    };
  };

  @ApiProperty({ 
    description: '可观测性指标',
    example: {
      latency_ms: 190,
      router_ms: 2,
      system_mode: 'SYSTEM1',
      tool_calls: 1,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0.0,
      fallback_used: false,
      layers: ['ledger_reconcile_blocking_start', 'ledger_reconcile_converged'],
      ledger_healing: LEDGER_HEALING_ICELAND_SUCCESS_EXAMPLE,
      trace: {
        orchestration: {
          mode: 'LEGACY',
          reason: 'Claude orchestration disabled',
          flags: {},
        },
        timestamp: '2024-01-13T10:00:00.000Z',
      },
    },
  })
  observability!: {
    latency_ms: number;
    router_ms: number;
    system_mode: 'SYSTEM1' | 'SYSTEM2' | 'REDIRECT';
    tool_calls: number;
    /**
     * Agentic Tool Loop：本轮 MCP 工具真实调用次数（与 SYSTEM1 固定 1 步对照实验）。
     * 非 agentic 路径通常省略。
     */
    tool_call_count?: number;
    /** Agentic：chat/completions 轮数（含最终无 tool 的一轮） */
    agentic_llm_rounds?: number;
    agentic_tokens_prompt?: number;
    agentic_tokens_completion?: number;
    /** Agentic 快路径（FEATURE_AGENTIC_TOOL_LOOP） */
    agentic_tool_loop?: boolean;
    browser_steps: number;
    tokens_est: number;
    cost_est_usd: number;
    fallback_used: boolean;
    fallback_template_version?: string;
    fallback_data_source?: string;
    fallback_source_confidence?: number;
    fallback_pacing_mode?: 'normal' | 'conservative';
    /** P4: 每步骤耗时（step → ms），便于聚合分析 */
    step_latency_ms?: Record<string, number>;
    /** P4: 本请求 Gate 是否 BLOCK（0=未阻止，1=阻止），可聚合为 gate_block_rate */
    gate_block_rate?: number;
    /** P4: 本请求 Skills 成功率（0–1），可聚合为 skill_success_rate */
    skill_success_rate?: number;
    /** AO-05：与编排 state 对齐，便于日志/网关按 request 关联 */
    orchestration_request_id?: string;
    /** AO-05：状态机当前步骤（OrchestratorState.current_step） */
    current_step?: string;
    /** Kernel Harness：DSO `harnessRuntime.activeTraceId`（`HARNESS_RECORD_TRACE=1` 且产生 trace 时） */
    harness_active_trace_id?: string | null;
    /** 若设置 `HARNESS_TRACE_EXPORT_DIR` 且落盘成功：相对 cwd 的 trace JSON 路径 */
    harness_trace_export_path?: string | null;
    /** 回显 Evaluation Harness `meta.run_id` / DSO `evaluationRunId` */
    evaluation_run_id?: string | null;
    /** Phase 2.0：区域 POI 规划 slice + 真实 outcome（metadata.poiPlanningOutcome） */
    poi_planning?: {
      regionId?: string;
      feasibility?: 'ok' | 'tight' | 'failed';
      resolution?: unknown;
      appliedBackoffSteps?: string[];
      budgetGateApplied?: boolean;
      outcome?: unknown;
    };
    /**
     * DOS v1：`gap_behavior_observation` 与 `result.payload` 对齐，便于网关/聚合层按 request 消费。
     */
    gap_behavior_observation?: {
      ts?: string;
      primaryGap?: string;
      allGapTypes?: string[];
      selectedCount?: number;
      indoorishSelectedCount?: number;
      categoryHistogram?: Array<{ category: string; count: number }>;
    };
    /** v1.0 Durable：本次请求是否命中 TripRun 上已存的 DSO checkpoint */
    durable_checkpoint_loaded?: boolean;
    /** v1.0：断点关联的 `trip_runs.id`（新建或续跑） */
    durable_trip_run_id?: string | null;
    /** PRD I3：请求声明的上一版 `plan_version`（replan 继承；与 `options.previous_plan_version` / 编排 metadata 对齐） */
    replan_previous_plan_version?: number;
    /** PRD I3：上一版世界快照哈希前缀（最多 64 字符，便于日志/网关聚合） */
    replan_previous_world_snapshot_hash_preview?: string;
    /** PRD I3：本轮编排 `OrchestratorState.plan_version` */
    replan_new_plan_version?: number;
    /** PRD I5：编排失败结构化分类（与 `OrchestrationResult.result.orchestrator_robustness` 对齐） */
    orchestration_failure?: {
      domain: string;
      code: string;
      source_layer: string;
      retryable_hint?: boolean;
      orchestrator_step?: string;
      message_preview?: string;
    };
    /** Option B+：`routeAndRun` 稳定层指数退避（每次 sleep 前写入一条，便于 API / 刷新后会话回放） */
    recovery_trace?: Array<{
      attempt: number;
      backoff_ms: number;
      failure_code?: string;
      /** 相对本次 route_and_run 起点的 wall-clock 耗时（便于区分「退避慢」vs「推理慢」） */
      elapsed_ms?: number;
      recorded_at?: string;
    }>;
    /** Memory OS：route_and_run 前置装载契约（与 SharedMemoryModule / MemoryContextAssembler 对齐） */
    memory_contract?: {
      revision: string;
      loaded: boolean;
      layers: string[];
      user_id_present: boolean;
      snapshot_id?: string;
      snapshot_version?: number;
      loaded_at_iso?: string;
    };
    /**
     * 决策账本自愈（增量 reconcile）：供前端进度条 / 信任动画消费（与 GATE_EVAL/EXECUTION 阻塞式调解对齐）。
     * OpenAPI 独立模型见 `LedgerHealingObservabilityDto`（`ledger-healing-observability.dto.ts`）。
     */
    ledger_healing?: {
      status: 'CONVERGED' | 'ESCALATED' | 'NO_OP';
      reconcile_status?: string;
      /** 进入 reconcile 前 INVALIDATED 的节点 id，与 UI 行程卡片对齐 */
      affected_node_ids?: string[];
      metrics: {
        initial_invalidated: number;
        secondary_invalidated: number;
        loops: number;
      };
      steps: Array<{
        phase: string;
        action: string;
        target_nodes: string[];
      }>;
    };
    /** INTAKE 删除 POI 短路：轻量 CRUD，不要求完整 planning 日程块 */
    itinerary_item_delete?: boolean;
    /** DSO `systemState.version`（字符串，兼容前端 `.trim()` 消费） */
    dso_version?: string;
    /** P1：执行链与 memory snapshot 绑定（planner / recovery / skill 应对齐同一锚点） */
    execution_memory_binding?: {
      snapshot_id: string;
      snapshot_version: number;
      request_id: string;
    };
    /** P6：黄金链路 timeline 摘要（仅存最近若干 span 元数据，不含 payload） */
    execution_timeline_preview?: Array<{
      phase: string;
      eventType: string;
      operation: string;
      spanId: string;
      nodeId: string;
      status: string;
    }>;
    /** 本轮请求内实际完成的退避尝试次数（成功路径为最后一次成功的 attempt；失败见 recovery_trace.length） */
    recovery_retry_attempts?: number;
    orchestration_mode_final?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM' | 'DEDUP';
    /**
     * `true`：本轮命中请求级去重回放（结果复用；与 `orchestration_mode_final === 'DEDUP'` 一致）。
     * `false`：新鲜执行或门禁/失败短路（非 dedup 缓存答复）。
     */
    is_replayed?: boolean;
    /**
     * Phase 1「Execution Truth」：单次执行的运行时画像（与 legacy route / system_mode 分层）。
     * DEDUP 时 runtime.reusePolicy=DEDUP_REPLAY、cognition.depth=NONE；不得与 cognition 混为一谈。
     */
    runtime_execution_profile?: RuntimeExecutionProfile;
    /** Runtime semantic invariants：anomaly≠failure；含 severity/category/suggestedAction，供 Policy / 聚合层消费 */
    runtime_execution_anomalies?: RuntimeExecutionAnomaly[];
    /** Dedup 缓存写入时盖章：供命中重放时做 freshness / policy provenance 校验 */
    replay_cache_provenance?: ReplayProvenance;
    /** Response-centric → artifact-centric 过渡：本轮写入缓存的 replay 语义摘要（非 registry 全量） */
    replay_artifact_descriptor?: ReplayArtifactDescriptor;
    /** Success finalization：局部/全量重算语义（与 cache correctness 正交；与 InvalidationDecision 对齐） */
    replay_invalidation_decision?: {
      scope: 'FULL_RESPONSE' | 'PARTIAL_COGNITIVE_BRANCH' | 'NONE';
      domains?: string[];
      reasonCodes?: string[];
    };
    /** P0–P2：物化 runtime（dedup 网关可附 UnifiedRuntimeState + 调度计划；见 RUNTIME_MATERIALIZATION_OBS）；P3 锚点写入见 RUNTIME_REPLAY_PERSISTENCE */
    runtime_materialization?: RuntimeObservabilitySlice;
    /** P3：锚点行回显（与 DB `agent_runtime_replay_anchors` 对齐；INSERT 失败时会撤回） */
    runtime_replay_persistence?: {
      schema: typeof RUNTIME_PERSISTENCE_SCHEMA;
      snapshot_id: string;
      admission_path: RuntimeReplayAdmissionPath;
      phi_digest: string;
      dedup_request_hash: string;
      certificate_digest?: string;
      /** INSERT 成功后尽力回填（异步 persist 完成时响应可能已发出） */
      anchor_row_id?: string;
    };
    /** ETK：可重建执行过程（ECPS + engine steps）；非日志，用于验证 / trace replay */
    execution_trace?: ExecutionTrace;
    /** Gen2.1：叙事完整性可观测切片（与 `result.payload.narrative_integrity_report` / `narrative_safety` 对账；tracing / replay / eval） */
    narrative_integrity?: NarrativeIntegrityObservabilitySlice;
    /** PV-ER：本请求实际选用的编译策略版本 id */
    active_execution_policy_version_id?: string;
    /** MAPE：本请求选用的 Policy Agent id（与 PV 回显可并存；常等于选用实体的主键） */
    active_policy_agent_id?: string;
    /** PV-ER / MAPE：选择层的标量得分（越高越优；便于对照实验） */
    policy_selection_score?: number;
    /** CEL：认知经济层摘要（资产引用 / broker 版本） */
    cognitive_economy?: {
      referenced_assets?: string[];
      broker_revision?: string;
    };
    /** CTL：认知热力学快照（ΔE / W / S / loss — 归一化能量会计） */
    cognitive_thermodynamics?: {
      delta_e: number;
      work: number;
      entropy: number;
      loss: number;
      conservation_residual: number;
    };
    /** IGL：信息几何 — 流形上的轨迹能量 / ECPS 流对齐（可微分图表坐标） */
    information_geometry?: {
      schema_version: string;
      path_energy: number;
      trajectory_points: number;
      flow_alignment: number | null;
    };
    /** VCPO：变分认知物理 — 离散作用量 𝒮≈ΣL、平均 Lagrangian、Euler–Lagrange 残差代理 */
    variational_cognitive_physics?: {
      schema_version: string;
      lambda_entropy: number;
      discrete_action: number;
      mean_lagrangian_density: number;
      euler_lagrange_residual_proxy: number;
      segment_count: number;
    };
    received_route_direction_id?: string;
    mode_final?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM' | 'DEDUP';
    /** 推荐：RAG 引用列表（与 `rag_sources` / `sources` 三选一或并列回填同内容） */
    reference_sources?: ReferenceSourceDto[];
    /** 与 `reference_sources` 同义 */
    rag_sources?: ReferenceSourceDto[];
    /** 与 `reference_sources` 同义 */
    sources?: ReferenceSourceDto[];
    trace?: {
      /** 与 options.intent_mode、最终 taskType 对齐的决策摘要 */
      route_decision?: {
        task_type: string;
        route_policy: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM' | 'DEDUP';
        intent_mode_requested: string;
        intent_mode_resolved: 'TRIP_PLANNING' | 'DATA_LOOKUP' | 'GENERIC_QA';
      };
      orchestration: {
        // 实际执行的路径（强制，不可变）
        resolved: {
          mode: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
          reason: string;
          matchedRules: string[];
        };
        // 建议（不影响执行，可选）
        recommended?: {
          useStateMachine?: boolean;
          enableAudit?: boolean;
          requireConsent?: boolean;
          reason?: string;
        };
        // 路由信号
        signals?: {
          taskType: string;
          risk: string;
          complexity: string;
          needsAudit: boolean;
          requiresStructuredOutput: boolean;
          expectsToolCalls: boolean;
          legacyWellSupported: boolean;
          latencyBudgetMs: number;
        };
        // 标志位
        flags?: {
          env?: Record<string, any>;
          options?: Record<string, any>;
          derived?: Record<string, any>;
        };
      };
      timestamp: string;
      // 结构化日志字段（固定化，用于打点/聚合）
      orchestration_mode?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
      orchestration_recommended_sm?: boolean;
      risk?: string;
      task_type?: string;
      requires_consent?: boolean;
      max_seconds?: number;
      latency_budget_ms?: number;
      /**
       * Decision OS：执行前契约固化（与 `AgentTurnContractV1` 同源；`contract_snapshot.input` 不含原文 message，仅长度）。
       * 与 `execution_trace_v1` 并列，供审计 / 回放对齐 scope、budget、memory 锚点。
       */
      agent_turn_contract_seal_v1?: {
        schema_id: string;
        version: number;
        step: string;
        policy_applied: string;
        task_type_route_signal: string;
        contract_snapshot?: Record<string, unknown>;
      };
      // 执行步骤（可选）
      steps?: Array<{
        step_id: string;
        step_name: string;
        step_display_zh?: string;
        skill_name?: string;
        action_name?: string;
        success: boolean;
        duration_ms: number;
        evidence_refs?: string[];
      }>;
      // 证据（可选）
      evidence?: Array<{
        evidence_id: string;
        source: string;
        type: string;
        timestamp: string;
      }>;
    };
  };
}

