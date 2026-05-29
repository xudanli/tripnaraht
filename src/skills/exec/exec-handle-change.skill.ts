// src/skills/exec/exec-handle-change.skill.ts
/**
 * skill.exec.handleChange
 * 
 * 目的：处理执行期间的变更（时间、地点、活动取消、交通延误等）
 * 
 * System 2 技能：需要推理和调整
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ChangeHandlingResult, ChangeType } from './shared/execution-state.types';
import { LlmService } from '../../llm/services/llm.service';

export interface ExecHandleChangeInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 变更类型 */
  changeType: ChangeType;
  
  /** 变更详情 */
  changeDetails: {
    itemId?: string;
    originalValue?: any;
    newValue?: any;
    reason?: string;
  };
  
  /** 当前计划状态 */
  currentPlan?: any;
}

export interface ExecHandleChangeOutput extends SkillOutput {
  /** 变更处理结果 */
  result: ChangeHandlingResult;
}

@Injectable()
export class ExecHandleChangeSkill implements Skill<ExecHandleChangeInput, ExecHandleChangeOutput> {
  private readonly logger = new Logger(ExecHandleChangeSkill.name);

  metadata = {
    name: 'exec.handleChange',
    description: 'exec.handleChange：处理执行期间的变更（时间、地点、活动取消、交通延误等），生成调整方案',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly llmService: LlmService,
  ) {}

  async execute(input: ExecHandleChangeInput): Promise<ExecHandleChangeOutput> {
    this.logger.debug(`执行 exec.handleChange: tripId=${input.tripId}, changeType=${input.changeType}`);

    try {
      const userPrompt = this.buildPrompt(input);
      const fullPrompt = `你是一位贴心的旅行管家。你的任务是在执行期间处理各种变更，并生成调整方案。

变更处理原则：
1. 最小化对整体行程的影响
2. 保持路线哲学和核心体验
3. 提供多个替代方案供用户选择
4. 明确说明每个方案的影响

输出必须包含：
- 调整后的计划
- 影响分析（时间、预算、体验、风险）
- 替代方案（如果有）
- 建议行动
- 是否需要用户确认

${userPrompt}`;
      
      const resultStr = await this.llmService.callLlmWithSchema(
        this.llmService.getDefaultProvider(),
        fullPrompt,
        {
          type: 'object',
          properties: {
            changeId: { type: 'string' },
            changeType: {
              type: 'string',
              enum: ['schedule_change', 'location_change', 'activity_cancelled', 'transport_delay', 'weather_impact', 'budget_overrun', 'user_request'],
            },
            originalPlan: { type: 'object' },
            adjustedPlan: { type: 'object' },
            impact: {
              type: 'object',
              properties: {
                schedule: { type: 'string' },
                budget: { type: 'string' },
                experience: { type: 'string' },
                risk: { type: 'string' },
              },
            },
            alternatives: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  option: { type: 'string' },
                  description: { type: 'string' },
                  impact: { type: 'string' },
                },
              },
            },
            recommendations: { type: 'array', items: { type: 'string' } },
            requiresConfirmation: { type: 'boolean' },
          },
          required: ['changeId', 'changeType', 'originalPlan', 'adjustedPlan', 'impact', 'recommendations', 'requiresConfirmation'],
        },
      );

      const result = JSON.parse(resultStr) as ChangeHandlingResult;

      return {
        result,
      };
    } catch (error: any) {
      this.logger.error(`处理变更失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private buildPrompt(input: ExecHandleChangeInput): string {
    const parts: string[] = [];
    
    parts.push(`## 变更信息`);
    parts.push(`变更类型: ${input.changeType}`);
    parts.push(`变更详情: ${JSON.stringify(input.changeDetails, null, 2)}`);
    
    if (input.currentPlan) {
      parts.push(`\n## 当前计划`);
      parts.push(JSON.stringify(input.currentPlan, null, 2));
    }
    
    parts.push(`\n## 要求`);
    parts.push(`请处理这个变更，生成调整方案，说明影响，并提供替代方案（如果有）`);
    
    return parts.join('\n');
  }
}
