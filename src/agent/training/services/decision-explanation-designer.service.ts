// src/agent/training/services/decision-explanation-designer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { DecisionExplanationUIDesign } from '../interfaces/enhancement.interface';
import { randomUUID } from 'crypto';

/**
 * DecisionExplanationDesignerService
 * 
 * 职责：设计决策解释UI（信息层级、可视化格式）
 */
@Injectable()
export class DecisionExplanationDesignerService {
  private readonly logger = new Logger(DecisionExplanationDesignerService.name);
  private readonly designs: Map<string, DecisionExplanationUIDesign> = new Map();

  constructor() {
    this.initializeDesigns();
  }

  /**
   * 获取决策解释UI设计
   */
  getDesign(designId?: string): DecisionExplanationUIDesign | null {
    if (designId) {
      return this.designs.get(designId) || null;
    }

    // 返回默认设计
    return Array.from(this.designs.values())[0] || null;
  }

  /**
   * 创建UI设计
   */
  createDesign(design: Omit<DecisionExplanationUIDesign, 'design_id'>): DecisionExplanationUIDesign {
    const fullDesign: DecisionExplanationUIDesign = {
      ...design,
      design_id: `design_${randomUUID()}`,
    };

    this.designs.set(fullDesign.design_id, fullDesign);

    this.logger.log(
      `[DecisionExplanationDesigner] 创建UI设计: designId=${fullDesign.design_id}`,
    );

    return fullDesign;
  }

  /**
   * 初始化设计
   */
  private initializeDesigns(): void {
    // 默认设计
    this.createDesign({
      information_hierarchy: {
        level_1_summary: '决策摘要（1-2句话，核心决策和结果）',
        level_2_process: '决策过程（关键步骤和推理）',
        level_3_evidence: '详细证据（证据链、数据来源）',
      },
      visualization_formats: [
        {
          type: 'DECISION_TREE',
          description: '决策树可视化，展示决策路径',
          use_case: '复杂多步骤决策',
        },
        {
          type: 'EVIDENCE_GRAPH',
          description: '证据图，展示证据之间的关系',
          use_case: '需要展示证据链',
        },
        {
          type: 'TIMELINE',
          description: '时间线，展示决策的时间顺序',
          use_case: '需要展示决策时间线',
        },
      ],
      user_friendly_format: {
        summary_length: 200, // 摘要最多200字符
        detail_expandable: true, // 详细信息可展开
        evidence_collapsible: true, // 证据可折叠
      },
    });
  }

  /**
   * 列出所有设计
   */
  listDesigns(): DecisionExplanationUIDesign[] {
    return Array.from(this.designs.values());
  }
}
