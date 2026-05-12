// src/decision-draft/mapping/decision-type-to-step-draft.mapper.ts

/**
 * Decision Type → Step Draft 映射器
 * 
 * 将业务层的决策类型映射到技术层的步骤类型
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionType, DecisionTypeMappingRule } from '../interfaces/decision-draft.interface';
import { OrchestrationStep, SubAgentType, GuardianType } from '../../agent/interfaces/trip-plan.interface';

/**
 * Decision Type → Step Draft 映射服务
 */
@Injectable()
export class DecisionTypeToStepDraftMapper {
  private readonly logger = new Logger(DecisionTypeToStepDraftMapper.name);

  /**
   * 映射规则表
   */
  private readonly mappingRules: Record<DecisionType, DecisionTypeMappingRule> = {
    'transport-decision': {
      decision_type: 'transport-decision',
      step_types: ['RESEARCH', 'GATE_EVAL'],
      required_skills: ['transport.search', 'poi.search'],
      sub_agent: 'Gatekeeper' as SubAgentType,
      guardian: 'ABU',
    },
    'pace-decision': {
      decision_type: 'pace-decision',
      step_types: ['PLAN_GEN', 'VERIFY'],
      required_skills: ['dem.get_profile'],
      sub_agent: 'CoreDecision' as SubAgentType,
      guardian: 'DR_DRE',
    },
    'poi-selection': {
      decision_type: 'poi-selection',
      step_types: ['RESEARCH', 'PLAN_GEN'],
      required_skills: ['poi.search', 'opening_hours.get'],
      sub_agent: 'Planner' as SubAgentType,
      guardian: undefined,
    },
    'route-optimization': {
      decision_type: 'route-optimization',
      step_types: ['PLAN_GEN', 'VERIFY'],
      required_skills: [],
      sub_agent: 'CoreDecision' as SubAgentType,
      guardian: 'DR_DRE',
    },
    'weather-strategy': {
      decision_type: 'weather-strategy',
      step_types: ['RESEARCH', 'REPAIR'],
      required_skills: ['weather.get'],
      sub_agent: 'LocalInsight' as SubAgentType,
      guardian: 'NEPTUNE',
    },
    'budget-balance': {
      decision_type: 'budget-balance',
      step_types: ['PLAN_GEN', 'VERIFY'],
      required_skills: [],
      sub_agent: 'Planner' as SubAgentType,
      guardian: undefined,
    },
  };

  /**
   * 获取决策类型对应的步骤类型列表
   */
  getStepTypes(decisionType: DecisionType): OrchestrationStep[] {
    const rule = this.mappingRules[decisionType];
    if (!rule) {
      this.logger.warn(`[DecisionTypeMapper] 未知的决策类型: ${decisionType}`);
      return [];
    }
    return rule.step_types as OrchestrationStep[];
  }

  /**
   * 获取决策类型对应的必需 Skills
   */
  getRequiredSkills(decisionType: DecisionType): string[] {
    const rule = this.mappingRules[decisionType];
    if (!rule) {
      return [];
    }
    return rule.required_skills;
  }

  /**
   * 获取决策类型对应的 Sub-Agent
   */
  getSubAgent(decisionType: DecisionType): SubAgentType | null {
    const rule = this.mappingRules[decisionType];
    if (!rule) {
      return null;
    }
    return rule.sub_agent as SubAgentType;
  }

  /**
   * 获取决策类型对应的三人格
   */
  getGuardian(decisionType: DecisionType): GuardianType | null {
    const rule = this.mappingRules[decisionType];
    if (!rule || !rule.guardian) {
      return null;
    }
    return rule.guardian;
  }

  /**
   * 获取完整的映射规则
   */
  getMappingRule(decisionType: DecisionType): DecisionTypeMappingRule | null {
    return this.mappingRules[decisionType] || null;
  }

  /**
   * 获取所有映射规则
   */
  getAllMappingRules(): DecisionTypeMappingRule[] {
    return Object.values(this.mappingRules);
  }
}