// src/agent/services/action-registry.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../interfaces/action.interface';

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
  checkPreconditions(actionName: string, state: any): boolean {
    const action = this.get(actionName);
    if (!action) {
      return false;
    }

    // 简单的前置条件检查（可以根据需要扩展）
    for (const precondition of action.metadata.preconditions) {
      // 这里可以实现更复杂的条件检查逻辑
      if (!this.evaluatePrecondition(precondition, state)) {
        return false;
      }
    }

    return true;
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

