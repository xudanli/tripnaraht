// src/agent/training/services/risk-prompt-designer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { RiskPromptTemplate } from '../interfaces/enhancement.interface';
import { randomUUID } from 'crypto';

/**
 * RiskPromptDesignerService
 * 
 * 职责：设计风险提示模板（拒绝/风险提示/替代方案表达）
 */
@Injectable()
export class RiskPromptDesignerService {
  private readonly logger = new Logger(RiskPromptDesignerService.name);
  private readonly templates: Map<string, RiskPromptTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * 获取风险提示
   */
  getPrompt(
    sevLevel: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4',
    category: RiskPromptTemplate['category'],
    reason: string,
    _language: 'en' | 'zh' = 'en',
  ): RiskPromptTemplate | null {
    // 查找匹配的模板
    const template = Array.from(this.templates.values()).find(
      (t) => t.sev_level === sevLevel && t.category === category,
    );

    if (!template) {
      this.logger.warn(
        `[RiskPrompt] 未找到匹配的模板: sevLevel=${sevLevel}, category=${category}`,
      );
      return null;
    }

    // 替换reason占位符
    const customizedTemplate: RiskPromptTemplate = {
      ...template,
      templates: {
        en: {
          ...template.templates.en,
          message: template.templates.en.message.replace('{reason}', reason),
        },
        zh: {
          ...template.templates.zh,
          message: template.templates.zh.message.replace('{reason}', reason),
        },
      },
    };

    return customizedTemplate;
  }

  /**
   * 创建风险提示模板
   */
  createTemplate(template: Omit<RiskPromptTemplate, 'template_id'>): RiskPromptTemplate {
    const fullTemplate: RiskPromptTemplate = {
      ...template,
      template_id: `template_${randomUUID()}`,
    };

    this.templates.set(fullTemplate.template_id, fullTemplate);

    this.logger.log(
      `[RiskPrompt] 创建风险提示模板: templateId=${fullTemplate.template_id}`,
    );

    return fullTemplate;
  }

  /**
   * 初始化模板
   */
  private initializeTemplates(): void {
    // SEV-1: Critical风险
    this.createTemplate({
      sev_level: 'SEV-1',
      category: 'SAFETY',
      templates: {
        en: {
          title: '⚠️ Safety Risk Detected',
          message: 'This route has been blocked due to critical safety concerns: {reason}. We cannot recommend this route.',
          alternatives: [
            'Consider a safer alternative route',
            'Travel during a safer season',
            'Use a guided tour service',
          ],
          actions: {
            primary: 'View Alternative Routes',
            secondary: 'Contact Support',
          },
        },
        zh: {
          title: '⚠️ 检测到安全风险',
          message: '由于严重的安全问题，此路线已被阻止：{reason}。我们无法推荐此路线。',
          alternatives: [
            '考虑更安全的替代路线',
            '在更安全的季节旅行',
            '使用导游服务',
          ],
          actions: {
            primary: '查看替代路线',
            secondary: '联系支持',
          },
        },
      },
      interaction: {
        require_confirmation: false,
        show_details: true,
        show_alternatives: true,
      },
    });

    // SEV-2: High风险
    this.createTemplate({
      sev_level: 'SEV-2',
      category: 'SAFETY',
      templates: {
        en: {
          title: '⚠️ High Risk Warning',
          message: 'This route has significant safety risks: {reason}. Please review carefully before proceeding.',
          alternatives: [
            'Consider safer alternatives',
            'Travel with experienced guides',
            'Check weather conditions',
          ],
          actions: {
            primary: 'I Understand the Risks',
            secondary: 'View Alternatives',
          },
        },
        zh: {
          title: '⚠️ 高风险警告',
          message: '此路线存在重大安全风险：{reason}。请仔细审查后再继续。',
          alternatives: [
            '考虑更安全的替代方案',
            '与经验丰富的导游一起旅行',
            '检查天气条件',
          ],
          actions: {
            primary: '我了解风险',
            secondary: '查看替代方案',
          },
        },
      },
      interaction: {
        require_confirmation: true,
        show_details: true,
        show_alternatives: true,
      },
    });

    // SEV-3: Medium风险
    this.createTemplate({
      sev_level: 'SEV-3',
      category: 'SAFETY',
      templates: {
        en: {
          title: 'ℹ️ Safety Notice',
          message: 'This route has some safety considerations: {reason}. Please be aware.',
          actions: {
            primary: 'Continue',
            secondary: 'Learn More',
          },
        },
        zh: {
          title: 'ℹ️ 安全提示',
          message: '此路线有一些安全考虑：{reason}。请注意。',
          actions: {
            primary: '继续',
            secondary: '了解更多',
          },
        },
      },
      interaction: {
        require_confirmation: false,
        show_details: false,
        show_alternatives: false,
      },
    });

    // SEV-4: Low风险
    this.createTemplate({
      sev_level: 'SEV-4',
      category: 'SAFETY',
      templates: {
        en: {
          title: 'ℹ️ Information',
          message: '{reason}',
          actions: {
            primary: 'OK',
          },
        },
        zh: {
          title: 'ℹ️ 信息',
          message: '{reason}',
          actions: {
            primary: '确定',
          },
        },
      },
      interaction: {
        require_confirmation: false,
        show_details: false,
        show_alternatives: false,
      },
    });
  }

  /**
   * 列出所有模板
   */
  listTemplates(): RiskPromptTemplate[] {
    return Array.from(this.templates.values());
  }
}
