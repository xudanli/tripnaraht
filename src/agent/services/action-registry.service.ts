// src/agent/services/action-registry.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { Action, PreconditionAssessment, PreconditionFinding } from '../interfaces/action.interface';
import { assessBudgetImpactForBookFlight } from '../actions/models/budget-impact.model';

/**
 * Action Registry Service
 * 
 * 管理所有可用的 Actions，提供注册、发现、执行能力
 */
@Injectable()
export class ActionRegistryService {
  private readonly logger = new Logger(ActionRegistryService.name);
  private readonly actions: Map<string, Action> = new Map();

  /**
   * 注册 Action
   */
  register(action: Action): void {
    if (this.actions.has(action.name)) {
      this.logger.warn(`Action ${action.name} already registered, overwriting`);
    }
    this.actions.set(action.name, action);
    this.logger.debug(`Registered action: ${action.name}`);
  }

  /**
   * 批量注册 Actions
   */
  registerMany(actions: Action[]): void {
    actions.forEach(action => this.register(action));
  }

  /**
   * 获取 Action
   */
  get(name: string): Action | undefined {
    return this.actions.get(name);
  }

  /**
   * 检查 Action 是否存在
   */
  has(name: string): boolean {
    return this.actions.has(name);
  }

  /**
   * 列出所有 Actions
   */
  list(): Action[] {
    return Array.from(this.actions.values());
  }

  /**
   * 按类别查找 Actions
   */
  findByCategory(category: string): Action[] {
    return this.list().filter(action => action.name.startsWith(`${category}.`));
  }

  /**
   * 检查前置条件
   */
  checkPreconditions(actionName: string, state: any, actionInput?: any): PreconditionAssessment {
    const action = this.get(actionName);
    if (!action) {
      return {
        status: 'blocked',
        findings: [
          { code: 'UNKNOWN', message: `Action not registered: ${actionName}`, severity: 'BLOCK' } satisfies PreconditionFinding,
        ],
      };
    }

    // Action-specific assessment hook (preferred for preview).
    if (typeof action.assess_preconditions === 'function') {
      try {
        const res = action.assess_preconditions(actionInput, state) as any;
        return res;
      } catch (e: any) {
        return {
          status: 'blocked',
          findings: [
            { code: 'UNKNOWN', message: `assess_preconditions threw: ${e?.message ?? String(e)}`, severity: 'BLOCK' },
          ],
        };
      }
    }

    const findings: PreconditionFinding[] = [];

    // Heuristic model hook: BOOK:FLIGHT style actions typically map to trip.apply_user_edit.
    // If an action declares a wallet precondition, emit a shadow budget delta.
    const wantsWallet = (action.metadata.preconditions ?? []).some((p) => String(p).includes('wallet.'));
    const hasPrice = actionInput && (actionInput.price != null || actionInput.amount != null);
    if (wantsWallet && hasPrice) {
      const assessed = assessBudgetImpactForBookFlight({ actionInput, state });
      findings.push(...assessed.findings);
      return {
        status: assessed.status,
        findings,
        ...(assessed.shadow_delta ? { shadow_delta: assessed.shadow_delta } : {}),
      };
    }

    // Fallback: dotted-path existence checks from metadata.preconditions
    for (const precondition of action.metadata.preconditions ?? []) {
      if (!this.evaluatePrecondition(precondition, state)) {
        findings.push({
          code: 'MISSING_FIELD',
          message: `Missing required precondition: ${precondition}`,
          path: precondition,
          severity: 'BLOCK',
        });
      }
    }

    return {
      status: findings.some((f) => f.severity === 'BLOCK') ? 'blocked' : 'feasible',
      findings,
    };
  }

  /**
   * 评估前置条件
   */
  private evaluatePrecondition(precondition: string, state: any): boolean {
    // 简单实现：检查 state 中是否存在所需字段
    // 可以根据需要扩展为更复杂的表达式求值
    const parts = precondition.split('.');
    let current = state;
    for (const part of parts) {
      if (current === undefined || current === null) {
        return false;
      }
      current = current[part];
    }
    return current !== undefined && current !== null;
  }
}

