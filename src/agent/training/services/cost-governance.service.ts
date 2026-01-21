// src/agent/training/services/cost-governance.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * CostGovernanceService
 * 
 * 职责：实现成本治理（token/tool/latency budget）
 */
@Injectable()
export class CostGovernanceService {
  private readonly logger = new Logger(CostGovernanceService.name);
  private readonly budgets: Map<string, Budget> = new Map();
  private readonly costs: Map<string, CostRecord[]> = new Map();

  /**
   * 检查预算
   */
  async checkBudget(
    requestId: string,
    budgetType: 'TOKEN' | 'TOOL' | 'LATENCY',
    amount: number,
  ): Promise<{ allowed: boolean; remaining: number; exceeded: boolean }> {
    const budget = this.getOrCreateBudget(requestId, budgetType);
    const remaining = budget.limit - budget.used;

    const allowed = remaining >= amount;
    const exceeded = budget.used >= budget.limit;

    if (exceeded) {
      this.logger.warn(
        `[CostGovernance] 预算超限: requestId=${requestId}, type=${budgetType}, used=${budget.used}, limit=${budget.limit}`,
      );
    }

    return {
      allowed,
      remaining: Math.max(0, remaining),
      exceeded,
    };
  }

  /**
   * 记录成本
   */
  async trackCost(
    requestId: string,
    budgetType: 'TOKEN' | 'TOOL' | 'LATENCY',
    amount: number,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const budget = this.getOrCreateBudget(requestId, budgetType);
    budget.used += amount;

    // 记录成本历史
    if (!this.costs.has(requestId)) {
      this.costs.set(requestId, []);
    }

    this.costs.get(requestId)!.push({
      request_id: requestId,
      budget_type: budgetType,
      amount,
      timestamp: Date.now(),
      metadata: metadata || {},
    });

    this.logger.debug(
      `[CostGovernance] 记录成本: requestId=${requestId}, type=${budgetType}, amount=${amount}, total=${budget.used}`,
    );
  }

  /**
   * 获取或创建预算
   */
  private getOrCreateBudget(
    requestId: string,
    budgetType: 'TOKEN' | 'TOOL' | 'LATENCY',
  ): Budget {
    const key = `${requestId}_${budgetType}`;
    if (!this.budgets.has(key)) {
      const defaultLimits: Record<string, number> = {
        TOKEN: 100000, // 默认10万token
        TOOL: 50, // 默认50次tool调用
        LATENCY: 30000, // 默认30秒延迟预算
      };

      this.budgets.set(key, {
        request_id: requestId,
        budget_type: budgetType,
        limit: defaultLimits[budgetType],
        used: 0,
        created_at: Date.now(),
      });
    }
    return this.budgets.get(key)!;
  }

  /**
   * 设置预算限制
   */
  setBudgetLimit(
    requestId: string,
    budgetType: 'TOKEN' | 'TOOL' | 'LATENCY',
    limit: number,
  ): void {
    const budget = this.getOrCreateBudget(requestId, budgetType);
    budget.limit = limit;
    this.logger.log(
      `[CostGovernance] 设置预算限制: requestId=${requestId}, type=${budgetType}, limit=${limit}`,
    );
  }

  /**
   * 获取成本记录
   */
  getCostRecords(requestId: string): CostRecord[] {
    return this.costs.get(requestId) || [];
  }

  /**
   * 获取预算使用情况
   */
  getBudgetUsage(requestId: string, budgetType: 'TOKEN' | 'TOOL' | 'LATENCY'): Budget | null {
    const key = `${requestId}_${budgetType}`;
    return this.budgets.get(key) || null;
  }
}

/**
 * 预算
 */
interface Budget {
  request_id: string;
  budget_type: 'TOKEN' | 'TOOL' | 'LATENCY';
  limit: number;
  used: number;
  created_at: number;
}

/**
 * 成本记录
 */
export interface CostRecord {
  request_id: string;
  budget_type: 'TOKEN' | 'TOOL' | 'LATENCY';
  amount: number;
  timestamp: number;
  metadata: Record<string, any>;
}
