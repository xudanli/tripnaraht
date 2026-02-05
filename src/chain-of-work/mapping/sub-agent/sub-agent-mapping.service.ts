// src/chain-of-work/mapping/sub-agent/sub-agent-mapping.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  OrchestrationStep,
  SubAgentType,
  GuardianType,
  OrchestratorState,
} from '../../../agent/interfaces/trip-plan.interface';
import { TripNARAStepDraft, SubAgentMapping } from '../../interfaces/chain-of-work.interface';

/**
 * Sub-Agents 映射服务
 */
@Injectable()
export class SubAgentMappingService {
  private readonly logger = new Logger(SubAgentMappingService.name);

  // 步骤类型到 Sub-Agent 的映射规则（10步完整流程）
  private readonly stepToSubAgentMap: Record<OrchestrationStep, SubAgentType> = {
    'INTAKE': 'Planner',
    'RESEARCH': 'Planner', // RESEARCH 步骤通过 Domain Agents 调用 Skills
    'GATE_EVAL': 'Gatekeeper',
    'PLAN_GEN': 'Planner',
    'VERIFY': 'CoreDecision',
    'COMPLIANCE': 'Compliance',
    'REPAIR': 'LocalInsight',
    'NARRATE': 'Narrator',
    'FEEDBACK': 'CoreDecision', // RLHF 信号采集
    'DONE': 'Orchestrator',
    'FAILED': 'Orchestrator',
    'TIMEOUT': 'Orchestrator',
    'HALLUCINATION_DETECTION': 'HallucinationDetection',
  };

  // Sub-Agent 到三人格的映射规则
  private readonly subAgentToGuardianMap: Record<SubAgentType, GuardianType | null> = {
    'Planner': null,
    'Gatekeeper': 'ABU',
    'CoreDecision': 'DR_DRE',
    'LocalInsight': 'NEPTUNE',
    'Narrator': null,
    'Compliance': 'ABU',
    'Orchestrator': null,
    'HallucinationDetection': null,
  };

  /**
   * 将步骤映射到 Sub-Agent
   */
  async mapStepToSubAgent(
    step: TripNARAStepDraft,
    context?: OrchestratorState,
  ): Promise<SubAgentMapping> {
    this.logger.debug(`[SubAgentMapping] 开始映射步骤到 Sub-Agent: step_id=${step.id}, step_type=${step.step_type}`);
    
    const subAgent = this.stepToSubAgentMap[step.step_type] || 'Planner';
    const guardian = this.subAgentToGuardianMap[subAgent] || undefined;
    
    return {
      step_id: step.id,
      sub_agent: subAgent,
      guardian,
      prompt_template: this.getPromptTemplate(step, subAgent),
      output_schema: this.getOutputSchema(step, subAgent),
    };
  }

  /**
   * 获取提示词模板
   */
  private getPromptTemplate(step: TripNARAStepDraft, subAgent: SubAgentType): string {
    // TODO: 根据步骤类型和 Sub-Agent 类型生成提示词模板
    return `执行步骤: ${step.title}\n描述: ${step.description}`;
  }

  /**
   * 获取输出 Schema
   */
  private getOutputSchema(step: TripNARAStepDraft, subAgent: SubAgentType): any {
    // TODO: 根据步骤类型和 Sub-Agent 类型生成输出 Schema
    return {};
  }

  /**
   * 映射到三人格
   */
  mapToGuardian(subAgent: SubAgentType, step: OrchestrationStep): GuardianType | null {
    return this.subAgentToGuardianMap[subAgent] || null;
  }
}