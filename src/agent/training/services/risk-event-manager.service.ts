// src/agent/training/services/risk-event-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  RiskEvent,
  SEVLevel,
  ConstraintViolation,
} from '../interfaces/safety-compliance.interface';
import { randomUUID } from 'crypto';

/**
 * RiskEventManagerService
 * 
 * 职责：实现风险事件分级与处置流程（SEV）
 * 
 * 功能：
 * 1. classifyRiskEvent() - 分级风险事件
 * 2. handleRiskEvent() - 处置风险事件
 * 3. 告警机制
 */
@Injectable()
export class RiskEventManagerService {
  private readonly logger = new Logger(RiskEventManagerService.name);
  private readonly events: Map<string, RiskEvent> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 分级风险事件
   */
  async classifyRiskEvent(
    requestId: string,
    violations: ConstraintViolation[],
    category: RiskEvent['category'],
    description: string,
  ): Promise<RiskEvent> {
    this.logger.log(
      `[RiskEventManager] 分级风险事件: requestId=${requestId}, violations=${violations.length}`,
    );

    // 确定SEV级别
    const sevLevel = this.determineSevLevel(violations);

    // 确定状态
    let status: RiskEvent['status'] = 'PENDING';
    if (sevLevel === 'SEV-1') {
      status = 'REJECTED'; // SEV-1自动拒绝
    } else if (sevLevel === 'SEV-2') {
      status = 'PENDING'; // SEV-2需要审批
    } else {
      status = 'PENDING'; // SEV-3/SEV-4待处理
    }

    const event: RiskEvent = {
      event_id: `risk_${randomUUID()}`,
      request_id: requestId,
      sev_level: sevLevel,
      category,
      description,
      violations,
      status,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    this.events.set(event.event_id, event);

    // SEV-1/SEV-2自动告警
    if (sevLevel === 'SEV-1' || sevLevel === 'SEV-2') {
      await this.sendAlert(event);
    }

    this.logger.log(
      `[RiskEventManager] 风险事件已分级: eventId=${event.event_id}, sevLevel=${sevLevel}`,
    );

    return event;
  }

  /**
   * 处置风险事件
   */
  async handleRiskEvent(
    eventId: string,
    action: 'APPROVE' | 'REJECT' | 'MITIGATE',
    resolvedBy: string,
    mitigationDetails?: string,
  ): Promise<RiskEvent> {
    this.logger.log(
      `[RiskEventManager] 处置风险事件: eventId=${eventId}, action=${action}`,
    );

    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Risk event not found: ${eventId}`);
    }

    switch (action) {
      case 'APPROVE':
        event.status = 'APPROVED';
        break;
      case 'REJECT':
        event.status = 'REJECTED';
        break;
      case 'MITIGATE':
        event.status = 'MITIGATED';
        if (mitigationDetails) {
          event.metadata.mitigation_details = mitigationDetails;
        }
        break;
    }

    event.resolved_at = new Date().toISOString();
    event.resolved_by = resolvedBy;

    this.logger.log(
      `[RiskEventManager] 风险事件已处置: eventId=${eventId}, status=${event.status}`,
    );

    return event;
  }

  /**
   * 获取风险事件
   */
  getRiskEvent(eventId: string): RiskEvent | undefined {
    return this.events.get(eventId);
  }

  /**
   * 列出风险事件
   */
  listRiskEvents(
    filters?: {
      sev_level?: SEVLevel;
      status?: RiskEvent['status'];
      category?: RiskEvent['category'];
    },
  ): RiskEvent[] {
    let events = Array.from(this.events.values());

    if (filters) {
      if (filters.sev_level) {
        events = events.filter((e) => e.sev_level === filters.sev_level);
      }
      if (filters.status) {
        events = events.filter((e) => e.status === filters.status);
      }
      if (filters.category) {
        events = events.filter((e) => e.category === filters.category);
      }
    }

    return events.sort((a, b) => {
      const sevOrder: Record<SEVLevel, number> = {
        'SEV-1': 1,
        'SEV-2': 2,
        'SEV-3': 3,
        'SEV-4': 4,
      };
      return sevOrder[a.sev_level] - sevOrder[b.sev_level];
    });
  }

  /**
   * 确定SEV级别
   */
  private determineSevLevel(violations: ConstraintViolation[]): SEVLevel {
    if (violations.length === 0) {
      return 'SEV-4';
    }

    // 检查是否有SEV-1违反
    if (violations.some((v) => v.sev_level === 'SEV-1')) {
      return 'SEV-1';
    }

    // 检查是否有SEV-2违反
    if (violations.some((v) => v.sev_level === 'SEV-2')) {
      return 'SEV-2';
    }

    // 检查是否有SEV-3违反
    if (violations.some((v) => v.sev_level === 'SEV-3')) {
      return 'SEV-3';
    }

    return 'SEV-4';
  }

  /**
   * 发送告警
   */
  private async sendAlert(event: RiskEvent): Promise<void> {
    this.logger.warn(
      `[RiskEventManager] ⚠️ 风险事件告警: eventId=${event.event_id}, sevLevel=${event.sev_level}, category=${event.category}`,
    );

    // TODO: 实际实现应该发送告警到安全团队（邮件、Slack、PagerDuty等）
    // 这里先记录日志
  }
}
