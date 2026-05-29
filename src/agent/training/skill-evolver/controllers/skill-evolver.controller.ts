import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../auth/decorators/public.decorator';
import { successResponse } from '../../../../common/dto/standard-response.dto';
import type { EvolveSkillOptions, SkillEvolverTask } from '../interfaces/skill-evolver.types';
import { MetaSkillEngineService } from '../services/meta-skill-engine.service';
import { SkillRegistryService } from '../services/skill-registry.service';
import { TrajectoryStoreService } from '../services/trajectory-store.service';
import { AgentSkillsInteropService } from '../services/agent-skills-interop.service';

class EvolveSkillDto {
  skill_id!: string;
  tasks?: SkillEvolverTask[];
  task_batch_id?: string;
  replay_case_id?: string;
  eval_mode?: 'llm' | 'fixture' | 'decision_replay';
  max_rounds?: number;
  strategy_count?: number;
  min_score_delta?: number;
  no_improvement_stop_rounds?: number;
  dry_run?: boolean;
  regression_gate?: boolean;
  export_agent_skills?: boolean;
  export_agent_skills_root?: string;
  seed_id?: string;
  /** 默认 true（有 E2E source id 时）；设 false 强制 fixture+LLM 轨迹 */
  use_decision_replay?: boolean;
  /** 真实 TripDecisionEngine 回放（或 SKILL_EVOLVER_LIVE_DECISION_REPLAY） */
  live_decision_replay?: boolean;
  force_edit_below_score?: number;
  /** country_pack 进化成功后写入 ReadinessPack */
  sync_readiness_pack?: boolean;
  verbose?: boolean;
}

class ExportAgentSkillsDto {
  skill_ids?: string[];
  export_root?: string;
}

@ApiTags('Skill Evolver')
@Controller('training/skill-evolver')
export class SkillEvolverController {
  private readonly logger = new Logger(SkillEvolverController.name);

  constructor(
    private readonly engine: MetaSkillEngineService,
    private readonly registry: SkillRegistryService,
    private readonly trajectoryStore: TrajectoryStoreService,
    private readonly agentSkillsInterop: AgentSkillsInteropService,
  ) {}

  @Public()
  @Get('skills')
  @ApiOperation({ summary: '列出可进化 Markdown 技能' })
  listSkills() {
    this.registry.ensureLayout();
    const reg = this.registry.loadRegistry();
    return successResponse({
      basePath: this.registry.getBasePath(),
      skills: reg.skills,
    });
  }

  @Public()
  @Get('skills/:skillId')
  @ApiOperation({ summary: '加载当前版本技能' })
  getSkill(@Param('skillId') skillId: string) {
    try {
      const skill = this.registry.load(skillId);
      return successResponse({ skill });
    } catch (e) {
      throw new HttpException(
        e instanceof Error ? e.message : '技能不存在',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Public()
  @Get('skills/:skillId/trajectories')
  @ApiOperation({ summary: '列出技能相关轨迹' })
  listTrajectories(@Param('skillId') skillId: string) {
    const trajectories = this.trajectoryStore.listBySkill(skillId);
    return successResponse({ skillId, count: trajectories.length, trajectories });
  }

  @Public()
  @Get('agent-skills/manifest')
  @ApiOperation({ summary: '读取 Agent Skills 导出 manifest' })
  getAgentSkillsManifest() {
    const manifest = this.agentSkillsInterop.readManifest();
    return successResponse({
      exportRoot: this.agentSkillsInterop.defaultExportRoot(),
      manifest,
    });
  }

  @Public()
  @Get('agent-skills/validate')
  @ApiOperation({ summary: '校验源技能是否符合 agentskills.io 规范' })
  validateAgentSkills() {
    const result = this.agentSkillsInterop.validate();
    return successResponse(result);
  }

  @Public()
  @Post('agent-skills/export')
  @ApiOperation({ summary: '导出为 agentskills.io 目录结构' })
  exportAgentSkills(@Body() body: ExportAgentSkillsDto) {
    try {
      const result = this.agentSkillsInterop.export(body.skill_ids, body.export_root);
      return successResponse(result);
    } catch (e) {
      throw new HttpException(
        e instanceof Error ? e.message : '导出失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Public()
  @Post('evolve')
  @ApiOperation({ summary: '运行 SkillEvolver Lite 进化循环' })
  async evolve(@Body() body: EvolveSkillDto) {
    if (!body.skill_id?.trim()) {
      throw new HttpException('skill_id 必填', HttpStatus.BAD_REQUEST);
    }
    if (!body.tasks?.length && !body.task_batch_id && !body.replay_case_id) {
      throw new HttpException(
        '需提供 tasks、task_batch_id 或 replay_case_id',
        HttpStatus.BAD_REQUEST,
      );
    }

    const options = this.buildEvolveOptions(body);

    try {
      const result = body.tasks?.length
        ? await this.engine.evolve(body.skill_id.trim(), body.tasks, options)
        : await this.engine.evolve(body.skill_id.trim(), options);
      return successResponse(result);
    } catch (e) {
      this.logger.error(`evolve failed: ${e instanceof Error ? e.message : e}`);
      throw new HttpException(
        e instanceof Error ? e.message : '进化失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Post('pipeline')
  @ApiOperation({ summary: '一键：进化 + 导出 Agent Skills + 校验' })
  async pipeline(@Body() body: EvolveSkillDto) {
    if (!body.skill_id?.trim()) {
      throw new HttpException('skill_id 必填', HttpStatus.BAD_REQUEST);
    }
    if (!body.tasks?.length && !body.task_batch_id && !body.replay_case_id) {
      throw new HttpException(
        '需提供 tasks、task_batch_id 或 replay_case_id',
        HttpStatus.BAD_REQUEST,
      );
    }

    const options = this.buildEvolveOptions(body, {
      exportAgentSkills: body.export_agent_skills ?? !body.dry_run,
    });

    const evolveResult = body.tasks?.length
      ? await this.engine.evolve(body.skill_id.trim(), body.tasks, options)
      : await this.engine.evolve(body.skill_id.trim(), options);

    let exportResult = null;
    if (!body.dry_run) {
      try {
        exportResult = this.agentSkillsInterop.export([body.skill_id.trim()]);
      } catch (e) {
        this.logger.warn(`pipeline export: ${e instanceof Error ? e.message : e}`);
      }
    }
    const validation = this.agentSkillsInterop.validate();

    return successResponse({
      evolve: evolveResult,
      agentSkillsExport: exportResult,
      agentSkillsValidation: validation,
    });
  }

  private buildEvolveOptions(
    body: EvolveSkillDto,
    overrides: Partial<EvolveSkillOptions> = {},
  ): EvolveSkillOptions {
    return {
      maxRounds: body.max_rounds,
      strategyCount: body.strategy_count,
      minScoreDelta: body.min_score_delta,
      noImprovementStopRounds: body.no_improvement_stop_rounds,
      dryRun: body.dry_run,
      evalMode: body.eval_mode,
      taskBatchId: body.task_batch_id,
      replayCaseId: body.replay_case_id,
      regressionGate: body.regression_gate,
      exportAgentSkills: body.export_agent_skills,
      exportAgentSkillsRoot: body.export_agent_skills_root,
      seedId: body.seed_id,
      useDecisionReplay: body.use_decision_replay,
      liveDecisionReplay: body.live_decision_replay,
      syncReadinessPack: body.sync_readiness_pack,
      verbose: body.verbose,
      forceEditBelowScore: body.force_edit_below_score,
      ...overrides,
    };
  }
}
