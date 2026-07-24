import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { FineTuneService, FineTuneConfig, TrainingTask } from '../services/fine-tune.service';
import { VllmClientService } from '../services/vllm-client.service';
import {
  LlmJudgeClientService,
  ScoreRequest,
  CompareRequest,
  LoraEvalRequest,
} from '../services/llm-judge-client.service';
import { ModelDeploymentService } from '../services/model-deployment.service';
import { ShadowDeploymentWorkflowService } from '../services/shadow-deployment-workflow.service';
import { evaluateShadowPromotionGates } from '../utils/shadow-promotion-gate.util';

/**
 * 启动训练请求
 */
class StartTrainingDto {
  /** 基座模型 */
  model_name?: string;
  /** LoRA rank */
  lora_rank?: number;
  /** LoRA alpha */
  lora_alpha?: number;
  /** 学习率 */
  learning_rate?: number;
  /** 训练轮数 */
  num_epochs?: number;
  /** 批次大小 */
  batch_size?: number;
  /** 数据集名称 */
  dataset_name?: string;
  /** sft | dpo | sft_then_dpo */
  training_stage?: 'sft' | 'dpo' | 'sft_then_dpo';
  sft_num_epochs?: number;
  dpo_num_epochs?: number;
  sft_learning_rate?: number;
  dpo_learning_rate?: number;
  dpo_pair_types?: string[];
  dpo_rejected_sources?: string[];
  /** 从检查点恢复 */
  resume_from_checkpoint?: string;
}

/**
 * 生成请求
 */
class GenerateDto {
  /** 用户请求 */
  user_request!: string;
  /** 系统提示 */
  system_prompt?: string;
  /** LoRA 适配器 */
  lora_adapter?: string;
  /** 温度 */
  temperature?: number;
  /** 最大 token 数 */
  max_tokens?: number;
}

/**
 * 计划评分请求
 */
class ScorePlanDto {
  request_id!: string;
  plan!: { day: number; activities: any[]; summary?: string }[];
  user_request!: string;
  evidence?: any[];
  decision_log?: any[];
  context?: any;
}

/**
 * 计划比较请求
 */
class ComparePlansDto {
  request_id!: string;
  plan_a!: { day: number; activities: any[]; summary?: string }[];
  plan_b!: { day: number; activities: any[]; summary?: string }[];
  user_request!: string;
}

/**
 * LoRA 评估请求
 */
class EvaluateLoraDto {
  request_id!: string;
  prompt!: string;
  baseline_response!: string;
  lora_response!: string;
  task_type?: string;
  ground_truth?: string;
}

/**
 * TripNARA 训练管理 API
 * 
 * 提供：
 * - LoRA 微调训练管理
 * - vLLM 推理服务管理
 * - 训练数据准备
 * - 模型评估
 */
@ApiTags('Training')
@Controller('api/training')
@Public() // 暂时公开，后续可添加认证
export class TrainingController {
  private readonly logger = new Logger(TrainingController.name);
  
  constructor(
    private readonly fineTuneService: FineTuneService,
    private readonly vllmClientService: VllmClientService,
    private readonly llmJudgeClientService: LlmJudgeClientService,
    private readonly modelDeploymentService: ModelDeploymentService,
    private readonly shadowDeployment: ShadowDeploymentWorkflowService,
  ) {}
  
  // ============================================
  // 健康检查
  // ============================================
  
  @Get('health')
  @ApiOperation({ summary: '服务健康检查' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async healthCheck() {
    const trainServiceHealthy = await this.fineTuneService.checkTrainServiceHealth();
    const vllmServiceHealthy = this.vllmClientService.isServiceAvailable();
    const llmJudgeHealthy = this.llmJudgeClientService.isServiceHealthy();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        train_service: trainServiceHealthy,
        vllm_service: vllmServiceHealthy,
        llm_judge_service: llmJudgeHealthy,
      },
    };
  }
  
  @Get('gpu/info')
  @ApiOperation({ summary: '获取 GPU 信息' })
  @ApiResponse({ status: 200, description: 'GPU 信息' })
  async getGpuInfo() {
    return this.fineTuneService.getGpuInfo();
  }

  @Get('deployment/audit')
  @ApiOperation({ summary: '获取部署审计日志（P5：部署流程可追溯）' })
  @ApiResponse({ status: 200, description: '最近 100 条部署/回滚记录' })
  getDeploymentAudit() {
    return this.modelDeploymentService.getDeploymentAudit();
  }

  @Get('deployment/current')
  @ApiOperation({ summary: '获取当前生产版本' })
  @ApiResponse({ status: 200, description: '当前部署的模型版本' })
  async getCurrentDeployedVersion() {
    const version = await this.modelDeploymentService.getCurrentDeployedVersion();
    return { version };
  }
  
  // ============================================
  // 训练管理
  // ============================================
  
  @Post('start')
  @ApiOperation({ summary: '启动训练任务' })
  @ApiResponse({ status: 200, description: '任务已启动' })
  @ApiResponse({ status: 400, description: '请求错误' })
  async startTraining(@Body() dto: StartTrainingDto) {
    const taskId = `train-${Date.now()}`;
    
    this.logger.log(`Starting training task: ${taskId}`);
    
    const config: Partial<FineTuneConfig> = {};
    if (dto.model_name) config.model_name = dto.model_name;
    if (dto.lora_rank) config.lora_rank = dto.lora_rank;
    if (dto.lora_alpha) config.lora_alpha = dto.lora_alpha;
    if (dto.learning_rate) config.learning_rate = dto.learning_rate;
    if (dto.num_epochs) config.num_epochs = dto.num_epochs;
    if (dto.batch_size) config.batch_size = dto.batch_size;
    if (dto.dataset_name) config.dataset_name = dto.dataset_name;
    if (dto.training_stage) config.training_stage = dto.training_stage;
    if (dto.sft_num_epochs != null) config.sft_num_epochs = dto.sft_num_epochs;
    if (dto.dpo_num_epochs != null) config.dpo_num_epochs = dto.dpo_num_epochs;
    if (dto.sft_learning_rate != null) config.sft_learning_rate = dto.sft_learning_rate;
    if (dto.dpo_learning_rate != null) config.dpo_learning_rate = dto.dpo_learning_rate;
    if (dto.dpo_pair_types?.length) {
      config.dpo_pair_types = dto.dpo_pair_types as FineTuneConfig['dpo_pair_types'];
    }
    if (dto.dpo_rejected_sources?.length) {
      config.dpo_rejected_sources = dto.dpo_rejected_sources as FineTuneConfig['dpo_rejected_sources'];
    }

    try {
      const result = await this.fineTuneService.startTraining(
        taskId,
        config,
        dto.resume_from_checkpoint,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        { success: false, error: message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('pipeline/sft-then-dpo')
  @ApiOperation({
    summary: '启动 sft_then_dpo 两阶段串联（Chain-of-Repair SFT → 真拓扑 DPO）',
  })
  @ApiResponse({ status: 200, description: 'Pipeline 已排队' })
  async startSftThenDpoPipeline(@Body() dto: StartTrainingDto & { task_id?: string }) {
    const taskId = dto.task_id ?? `pipeline-${Date.now()}`;
    const config: Partial<FineTuneConfig> = { training_stage: 'sft_then_dpo' };
    if (dto.model_name) config.model_name = dto.model_name;
    if (dto.lora_rank) config.lora_rank = dto.lora_rank;
    if (dto.lora_alpha) config.lora_alpha = dto.lora_alpha;
    if (dto.sft_num_epochs != null) config.sft_num_epochs = dto.sft_num_epochs;
    if (dto.dpo_num_epochs != null) config.dpo_num_epochs = dto.dpo_num_epochs;
    if (dto.sft_learning_rate != null) config.sft_learning_rate = dto.sft_learning_rate;
    if (dto.dpo_learning_rate != null) config.dpo_learning_rate = dto.dpo_learning_rate;
    if (dto.dpo_pair_types?.length) {
      config.dpo_pair_types = dto.dpo_pair_types as FineTuneConfig['dpo_pair_types'];
    }
    if (dto.dpo_rejected_sources?.length) {
      config.dpo_rejected_sources = dto.dpo_rejected_sources as FineTuneConfig['dpo_rejected_sources'];
    }

    try {
      const result = await this.fineTuneService.startSftThenDpoPipeline(
        taskId,
        config,
        dto.resume_from_checkpoint,
      );
      return { success: true, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        { success: false, error: message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('pipeline/:taskId')
  @ApiOperation({ summary: '获取 sft_then_dpo Pipeline 状态' })
  async getPipelineStatus(@Param('taskId') taskId: string) {
    return this.fineTuneService.getPipelineStatus(taskId);
  }

  @Post('pipeline/flywheel')
  @ApiOperation({
    summary: 'Decision OS 飞轮：ETL + sft_then_dpo（可选 wait 直至完成）',
  })
  async runDecisionFlywheel(
    @Body()
    body: StartTrainingDto & { task_id?: string; wait?: boolean },
  ) {
    const config: Partial<FineTuneConfig> = { training_stage: 'sft_then_dpo' };
    if (body.model_name) config.model_name = body.model_name;
    if (body.dpo_pair_types?.length) {
      config.dpo_pair_types = body.dpo_pair_types as FineTuneConfig['dpo_pair_types'];
    }
    if (body.dpo_rejected_sources?.length) {
      config.dpo_rejected_sources = body.dpo_rejected_sources as FineTuneConfig['dpo_rejected_sources'];
    }

    try {
      const result = await this.fineTuneService.runDecisionFlywheelPipeline({
        taskId: body.task_id,
        config,
        wait: body.wait === true,
      });
      return { success: true, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        { success: false, error: message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  
  @Get('shadow/active')
  @ApiOperation({ summary: '当前活跃阴影适配器' })
  getActiveShadow() {
    return {
      active: this.shadowDeployment.getActiveShadow(),
      enabled: this.shadowDeployment.isShadowDeployEnabled(),
    };
  }

  @Get('shadow/registrations')
  @ApiOperation({ summary: '阴影适配器注册历史' })
  listShadowRegistrations() {
    return this.shadowDeployment.listShadowRegistrations();
  }

  @Get('shadow/:shadowVersion/metrics')
  @ApiOperation({ summary: '阴影评测聚合指标与晋升门控' })
  getShadowMetrics(@Param('shadowVersion') shadowVersion: string) {
    const metrics = this.shadowDeployment.getShadowMetrics(shadowVersion);
    const gate = evaluateShadowPromotionGates(metrics);
    return { metrics, gate };
  }

  @Get('shadow/metrics/prometheus')
  @ApiOperation({ summary: 'Prometheus 格式阴影指标' })
  getShadowPrometheusMetrics(@Query('shadow_version') shadowVersion?: string) {
    const body = this.shadowDeployment.getShadowMetricsPrometheus(shadowVersion);
    return body;
  }

  @Post('shadow/:shadowVersion/promote')
  @ApiOperation({ summary: '将阴影候选晋升为主 Planner（需门控通过或 force）' })
  async promoteShadow(
    @Param('shadowVersion') shadowVersion: string,
    @Query('force') force?: string,
  ) {
      const result = await this.shadowDeployment.promote(shadowVersion, {
      force: force === '1' || force === 'true',
    });
    if (!result.promoted) {
      throw new HttpException(
        { success: false, ...result },
        HttpStatus.BAD_REQUEST,
      );
    }
    return { success: true, ...result };
  }

  @Get('tasks')
  @ApiOperation({ summary: '列出所有训练任务' })
  @ApiResponse({ status: 200, description: '任务列表' })
  async listTasks(): Promise<TrainingTask[]> {
    return this.fineTuneService.listTrainingTasks();
  }
  
  @Get('tasks/:taskId')
  @ApiOperation({ summary: '获取训练任务状态' })
  @ApiResponse({ status: 200, description: '任务状态' })
  @ApiResponse({ status: 404, description: '任务不存在' })
  async getTaskStatus(@Param('taskId') taskId: string) {
    const task = await this.fineTuneService.getTrainingStatus(taskId);
    
    if (!task) {
      throw new HttpException(
        { error: `Task ${taskId} not found` },
        HttpStatus.NOT_FOUND,
      );
    }
    
    return task;
  }
  
  @Post('tasks/:taskId/cancel')
  @ApiOperation({ summary: '取消训练任务' })
  @ApiResponse({ status: 200, description: '任务已取消' })
  @ApiResponse({ status: 404, description: '任务不存在' })
  async cancelTask(@Param('taskId') taskId: string) {
    try {
      const result = await this.fineTuneService.cancelTraining(taskId);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  // ============================================
  // 数据管理
  // ============================================
  
  @Post('data/prepare')
  @ApiOperation({ summary: '准备训练数据' })
  @ApiResponse({ status: 200, description: '数据准备完成' })
  async prepareTrainingData(
    @Query('min_validation_score') minValidationScore?: number,
    @Query('min_total_reward') minTotalReward?: number,
    @Query('max_usage_count') maxUsageCount?: number,
    @Query('limit') limit?: number,
  ) {
    try {
      const result = await this.fineTuneService.prepareTrainingData({
        minValidationScore: minValidationScore ? parseFloat(String(minValidationScore)) : undefined,
        minTotalReward: minTotalReward ? parseFloat(String(minTotalReward)) : undefined,
        maxUsageCount: maxUsageCount ? parseInt(String(maxUsageCount)) : undefined,
        limit: limit ? parseInt(String(limit)) : undefined,
      });
      
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  // ============================================
  // 模型管理
  // ============================================
  
  @Get('models')
  @ApiOperation({ summary: '列出已训练的模型' })
  @ApiResponse({ status: 200, description: '模型列表' })
  async listModels() {
    return this.fineTuneService.listTrainedModels();
  }
  
  @Get('experiments')
  @ApiOperation({ summary: '列出 MLflow 实验' })
  @ApiResponse({ status: 200, description: '实验列表' })
  async listExperiments() {
    return this.fineTuneService.listExperiments();
  }
  
  @Get('experiments/:experimentId/runs')
  @ApiOperation({ summary: '列出 MLflow 运行' })
  @ApiResponse({ status: 200, description: '运行列表' })
  async listRuns(@Param('experimentId') experimentId: string) {
    return this.fineTuneService.listRuns(experimentId);
  }
  
  // ============================================
  // vLLM 推理
  // ============================================
  
  @Get('vllm/models')
  @ApiOperation({ summary: '列出 vLLM 可用模型' })
  @ApiResponse({ status: 200, description: '模型列表' })
  async listVllmModels() {
    return this.vllmClientService.listModels();
  }
  
  @Get('vllm/adapters')
  @ApiOperation({ summary: '列出已加载的 LoRA 适配器' })
  @ApiResponse({ status: 200, description: '适配器列表' })
  async listLoraAdapters() {
    return this.vllmClientService.getLoadedAdapters();
  }
  
  @Post('vllm/generate')
  @ApiOperation({ summary: '生成文本（使用 vLLM）' })
  @ApiResponse({ status: 200, description: '生成结果' })
  async generate(@Body() dto: GenerateDto) {
    if (!this.vllmClientService.isServiceAvailable()) {
      throw new HttpException(
        { error: 'vLLM service is not available' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    
    try {
      const result = await this.vllmClientService.generateDecision({
        userRequest: dto.user_request,
        systemPrompt: dto.system_prompt,
        loraAdapter: dto.lora_adapter,
        temperature: dto.temperature,
        maxTokens: dto.max_tokens,
      });
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  // ============================================
  // 完整训练流程
  // ============================================
  
  @Post('pipeline/run')
  @ApiOperation({ summary: '执行完整训练流程' })
  @ApiResponse({ status: 200, description: '流程已启动' })
  async runPipeline(
    @Body() config?: Partial<FineTuneConfig>,
    @Query('min_validation_score') minValidationScore?: number,
    @Query('min_total_reward') minTotalReward?: number,
  ) {
    try {
      const result = await this.fineTuneService.runFullTrainingPipeline({
        config,
        minValidationScore: minValidationScore ? parseFloat(String(minValidationScore)) : undefined,
        minTotalReward: minTotalReward ? parseFloat(String(minTotalReward)) : undefined,
      });
      
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  // ============================================
  // LLM Judge 评估
  // ============================================
  
  @Get('judge/health')
  @ApiOperation({ summary: 'LLM Judge 服务健康检查' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async judgeHealthCheck() {
    return this.llmJudgeClientService.checkHealth();
  }
  
  @Post('judge/score')
  @ApiOperation({ summary: '对计划进行质量评分' })
  @ApiResponse({ status: 200, description: '评分结果' })
  async scorePlan(@Body() dto: ScorePlanDto) {
    try {
      const result = await this.llmJudgeClientService.scorePlan(dto as ScoreRequest);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  @Post('judge/batch-score')
  @ApiOperation({ summary: '批量评分' })
  @ApiResponse({ status: 200, description: '批量评分结果' })
  async batchScore(@Body() requests: ScorePlanDto[]) {
    try {
      const result = await this.llmJudgeClientService.batchScore(requests as ScoreRequest[]);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  @Post('judge/compare')
  @ApiOperation({ summary: '比较两个计划' })
  @ApiResponse({ status: 200, description: '比较结果' })
  async comparePlans(@Body() dto: ComparePlansDto) {
    try {
      const result = await this.llmJudgeClientService.comparePlans(dto as CompareRequest);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  @Post('judge/evaluate-lora')
  @ApiOperation({ summary: '评估 LoRA 模型输出质量' })
  @ApiResponse({ status: 200, description: '评估结果' })
  async evaluateLora(@Body() dto: EvaluateLoraDto) {
    try {
      const result = await this.llmJudgeClientService.evaluateLora(dto as LoraEvalRequest);
      return { success: true, ...result };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  @Post('judge/batch-evaluate-lora')
  @ApiOperation({ summary: '批量评估 LoRA 模型' })
  @ApiResponse({ status: 200, description: '批量评估结果' })
  async batchEvaluateLora(@Body() requests: EvaluateLoraDto[]) {
    try {
      const results = await this.llmJudgeClientService.batchEvaluateLora(
        requests as LoraEvalRequest[],
      );
      const report = await this.llmJudgeClientService.generateLoraEvalReport(results);
      return { success: true, results, report };
    } catch (error: any) {
      throw new HttpException(
        { success: false, error: error?.message || String(error) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
