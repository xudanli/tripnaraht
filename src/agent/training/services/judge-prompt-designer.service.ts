// src/agent/training/services/judge-prompt-designer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { JudgePromptTemplate } from '../interfaces/enhancement.interface';
import { randomUUID } from 'crypto';

/**
 * JudgePromptDesignerService
 * 
 * 职责：设计Judge Prompts、评分标准、校准集
 */
@Injectable()
export class JudgePromptDesignerService {
  private readonly logger = new Logger(JudgePromptDesignerService.name);
  private readonly templates: Map<string, JudgePromptTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * 获取Judge Prompt模板
   */
  getTemplate(templateId?: string): JudgePromptTemplate | null {
    if (templateId) {
      return this.templates.get(templateId) || null;
    }

    // 返回默认模板
    return Array.from(this.templates.values())[0] || null;
  }

  /**
   * 创建Judge Prompt模板
   */
  createTemplate(template: Omit<JudgePromptTemplate, 'template_id'>): JudgePromptTemplate {
    const fullTemplate: JudgePromptTemplate = {
      ...template,
      template_id: `template_${randomUUID()}`,
    };

    this.templates.set(fullTemplate.template_id, fullTemplate);

    this.logger.log(
      `[JudgePromptDesigner] 创建Judge Prompt模板: templateId=${fullTemplate.template_id}`,
    );

    return fullTemplate;
  }

  /**
   * 初始化模板
   */
  private initializeTemplates(): void {
    // 默认质量评分模板
    this.createTemplate({
      name: 'Quality Score Judge',
      scoring_criteria: [
        {
          criterion: 'Executability',
          weight: 0.3,
          description: '规划是否可执行（时间、地点、可达性）',
        },
        {
          criterion: 'Safety',
          weight: 0.3,
          description: '规划是否安全（风险评估、合规性）',
        },
        {
          criterion: 'User Satisfaction',
          weight: 0.2,
          description: '规划是否满足用户需求',
        },
        {
          criterion: 'Evidence Quality',
          weight: 0.2,
          description: '证据是否充分和可靠',
        },
      ],
      prompt_template: `You are a quality judge for trip planning. Evaluate the following plan and provide a score from 0 to 1.

Plan: {plan}
User Request: {user_request}
Evidence: {evidence}

Scoring Criteria:
1. Executability (30%): Is the plan executable? (time windows, locations, accessibility)
2. Safety (30%): Is the plan safe? (risk assessment, compliance)
3. User Satisfaction (20%): Does the plan meet user needs?
4. Evidence Quality (20%): Is the evidence sufficient and reliable?

Provide:
- Overall score (0-1)
- Scores for each criterion
- Reasoning
- Diagnostic labels (if any issues detected)`,
      calibration_examples: [
        {
          input: {
            plan: 'A well-structured 3-day itinerary with verified POIs',
            user_request: 'Plan a trip to Iceland',
            evidence: 'Complete evidence chain',
          },
          expected_score: 0.9,
          reasoning: 'High executability, safe, meets user needs, strong evidence',
        },
        // 更多校准示例...
      ],
    });
  }

  /**
   * 列出所有模板
   */
  listTemplates(): JudgePromptTemplate[] {
    return Array.from(this.templates.values());
  }
}
