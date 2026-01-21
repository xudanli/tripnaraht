// src/agent/training/services/clarification-prompt-designer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ClarificationPromptTemplate } from '../interfaces/enhancement.interface';
import { randomUUID } from 'crypto';

/**
 * ClarificationPromptDesignerService
 * 
 * 职责：设计追问话术模板（缺信息时怎么问）
 */
@Injectable()
export class ClarificationPromptDesignerService {
  private readonly logger = new Logger(ClarificationPromptDesignerService.name);
  private readonly templates: Map<string, ClarificationPromptTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * 获取追问话术
   */
  getPrompt(
    scenario: string,
    missingField: string,
    language: 'en' | 'zh' = 'en',
  ): ClarificationPromptTemplate | null {
    // 查找匹配的模板
    const template = Array.from(this.templates.values()).find(
      (t) => t.scenario === scenario && t.missing_field === missingField,
    );

    if (!template) {
      this.logger.warn(
        `[ClarificationPrompt] 未找到匹配的模板: scenario=${scenario}, missingField=${missingField}`,
      );
      return null;
    }

    return template;
  }

  /**
   * 创建追问话术模板
   */
  createTemplate(template: Omit<ClarificationPromptTemplate, 'template_id'>): ClarificationPromptTemplate {
    const fullTemplate: ClarificationPromptTemplate = {
      ...template,
      template_id: `template_${randomUUID()}`,
    };

    this.templates.set(fullTemplate.template_id, fullTemplate);

    this.logger.log(
      `[ClarificationPrompt] 创建追问话术模板: templateId=${fullTemplate.template_id}`,
    );

    return fullTemplate;
  }

  /**
   * 初始化模板
   */
  private initializeTemplates(): void {
    // 场景1: 缺少目的地
    this.createTemplate({
      scenario: 'MISSING_DESTINATION',
      missing_field: 'destination',
      templates: {
        en: {
          question: 'Where would you like to travel?',
          examples: ['Iceland', 'Japan', 'New Zealand'],
          hints: ['You can specify a country, city, or region'],
        },
        zh: {
          question: '您想去哪里旅行？',
          examples: ['冰岛', '日本', '新西兰'],
          hints: ['您可以指定国家、城市或地区'],
        },
      },
      metadata: {},
    });

    // 场景2: 缺少日期
    this.createTemplate({
      scenario: 'MISSING_DATE',
      missing_field: 'date_range',
      templates: {
        en: {
          question: 'When would you like to travel?',
          examples: ['June 2025', 'Next month', 'Summer 2025'],
          hints: ['You can specify a date range or specific dates'],
        },
        zh: {
          question: '您什么时候想旅行？',
          examples: ['2025年6月', '下个月', '2025年夏天'],
          hints: ['您可以指定日期范围或具体日期'],
        },
      },
      metadata: {},
    });

    // 场景3: 缺少预算
    this.createTemplate({
      scenario: 'MISSING_BUDGET',
      missing_field: 'budget',
      templates: {
        en: {
          question: 'What is your budget for this trip?',
          examples: ['$5000', 'Around $3000', 'Flexible'],
          hints: ['You can specify a total budget or daily budget'],
        },
        zh: {
          question: '您的旅行预算是多少？',
          examples: ['5000美元', '大约3000美元', '灵活'],
          hints: ['您可以指定总预算或每日预算'],
        },
      },
      metadata: {},
    });

    // 更多场景...
  }

  /**
   * 列出所有模板
   */
  listTemplates(): ClarificationPromptTemplate[] {
    return Array.from(this.templates.values());
  }
}
