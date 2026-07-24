// src/agent/services/trip-detail-agent.service.ts
/**
 * TripDetailAgentService
 * 
 * 行程详情页的 Agent，负责"理解与掌控旅行现状"
 * 
 * 职责：
 * - 理解当前行程状态
 * - 分析行程健康度
 * - 解释决策
 * - 展示证据
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DetailState, TripHealth, TripStatusUnderstanding, DecisionExplanation } from '../../skills/detail/shared/detail-state.types';
import { PersonaShellService, PersonaShellOutput } from './persona-shell.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import type { Skill } from '../../skills/interfaces/skill.interface';

export interface TripDetailAgentRequest {
  /** Trip ID */
  tripId: string;
  
  /** 操作类型 */
  action: 'get_status' | 'get_health' | 'explain_decisions' | 'show_evidence' | 'get_full';
  
  /** 决策 ID（explain_decisions 时使用） */
  decisionId?: string;
  
  /** 证据引用（show_evidence 时使用） */
  evidenceRefs?: string[];
}

export interface TripDetailAgentResponse {
  /** 详情状态 */
  detailState: DetailState;
  
  /** 三人格输出（如果有） */
  personas?: PersonaShellOutput;
  
  /** UI 输出 */
  uiOutput: {
    status?: TripStatusUnderstanding;
    health?: TripHealth;
    explanations?: DecisionExplanation[];
    evidence?: Array<{
      id: string;
      source: string;
      excerpt: string;
      relevance: string;
      confidence: 'low' | 'medium' | 'high';
    }>;
  };
}

@Injectable()
export class TripDetailAgentService {
  private readonly logger = new Logger(TripDetailAgentService.name);

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly personaShell?: PersonaShellService,
  ) {}

  /**
   * 执行行程详情页流程
   */
  async execute(request: TripDetailAgentRequest): Promise<TripDetailAgentResponse> {
    this.logger.debug(`执行行程详情页 Agent: tripId=${request.tripId}, action=${request.action}`);

    try {
      // TODO: 从数据库查询行程数据
      const tripData = {};
      
      // TODO: 从存储中获取 PlanState（如果有）
      const planState = null;

      const detailState: DetailState = {
        tripId: request.tripId,
        health: {
          overall: 'healthy',
          dimensions: {
            schedule: { status: 'healthy', score: 100, issues: [] },
            budget: { status: 'healthy', score: 100, issues: [] },
            pace: { status: 'healthy', score: 100, issues: [] },
            feasibility: { status: 'healthy', score: 100, issues: [] },
          },
        },
        statusUnderstanding: {
          currentPhase: 'PLANNING',
          progress: { completed: 0, total: 0, percentage: 0 },
          nextSteps: [],
          risks: [],
          opportunities: [],
        },
        decisionExplanations: [],
        evidence: [],
        lastUpdated: new Date().toISOString(),
      };

      const uiOutput: TripDetailAgentResponse['uiOutput'] = {};

      // 根据操作类型执行相应技能
      if (request.action === 'get_status' || request.action === 'get_full') {
        const skill = this.skillsRegistry?.getSkill('detail.understandStatus') as
          | Skill<{ tripId: string; tripData: unknown }, { statusUnderstanding: TripStatusUnderstanding }>
          | undefined;
        if (skill) {
          const statusResult = await skill.execute({
            tripId: request.tripId,
            tripData,
          });
          detailState.statusUnderstanding = statusResult.statusUnderstanding;
          uiOutput.status = statusResult.statusUnderstanding;
        }
      }

      if (request.action === 'get_health' || request.action === 'get_full') {
        const skill = this.skillsRegistry?.getSkill('detail.analyzeHealth') as
          | Skill<{ tripId: string; tripData: unknown; planState: null }, { health: TripHealth }>
          | undefined;
        if (skill) {
          const healthResult = await skill.execute({
            tripId: request.tripId,
            tripData,
            planState,
          });
          detailState.health = healthResult.health;
          uiOutput.health = healthResult.health;
        }
      }

      if (request.action === 'explain_decisions' || request.action === 'get_full') {
        const skill = this.skillsRegistry?.getSkill('detail.explainDecision') as
          | Skill<{ tripId: string; decisionId?: string }, { explanations: DecisionExplanation[] }>
          | undefined;
        if (skill) {
          const explainResult = await skill.execute({
            tripId: request.tripId,
            decisionId: request.decisionId,
          });
          detailState.decisionExplanations = explainResult.explanations;
          uiOutput.explanations = explainResult.explanations;
        }
      }

      if (request.action === 'show_evidence' || request.action === 'get_full') {
        const skill = this.skillsRegistry?.getSkill('detail.showEvidence') as
          | Skill<
              { tripId: string; evidenceRefs?: string[]; planState: null },
              { evidence: DetailState['evidence'] }
            >
          | undefined;
        if (skill) {
          const evidenceResult = await skill.execute({
            tripId: request.tripId,
            evidenceRefs: request.evidenceRefs,
            planState,
          });
          detailState.evidence = evidenceResult.evidence;
          uiOutput.evidence = evidenceResult.evidence;
        }
      }

      return {
        detailState,
        uiOutput,
      };
    } catch (error: any) {
      this.logger.error(`行程详情页 Agent 执行失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
