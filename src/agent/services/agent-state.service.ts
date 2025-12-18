// src/agent/services/agent-state.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentState } from '../interfaces/agent-state.interface';

/**
 * AgentState Service
 * 
 * 管理 AgentState（Working Memory）的生命周期
 */
@Injectable()
export class AgentStateService {
  private readonly logger = new Logger(AgentStateService.name);
  private readonly states: Map<string, AgentState> = new Map();

  /**
   * 创建初始状态
   */
  createInitialState(
    userInput: string,
    userId: string,
    tripId?: string | null,
    options?: any
  ): AgentState {
    const requestId = randomUUID();
    
    const state: AgentState = {
      request_id: requestId,
      user_input: userInput,
      trip: {
        trip_id: tripId || null,
        days: 1,
        day_boundaries: [{ start: '10:00', end: '22:00' }],
        lunch_break: {
          enabled: true,
          duration_min: 60,
          window: ['11:30', '13:30'],
        },
        pacing: 'normal',
      },
      draft: {
        nodes: [],
        hard_nodes: [],
        soft_nodes: [],
        edits: [],
      },
      memory: {
        semantic_facts: {
          pois: [],
          rules: {},
        },
        episodic_snippets: [],
        user_profile: {},
      },
      compute: {
        clusters: null,
        time_matrix_api: null,
        time_matrix_robust: null,
        optimization_results: [],
        robustness: null,
      },
      react: {
        step: 0,
        max_steps: options?.max_steps || 8,
        observations: [],
        decision_log: [],
      },
      result: {
        status: 'DRAFT',
        timeline: [],
        dropped_items: [],
        explanations: [],
      },
      observability: {
        router_ms: 0,
        latency_ms: 0,
        tool_calls: 0,
        browser_steps: 0,
        cost_est_usd: 0.0,
        fallback_used: false,
      },
    };

    this.states.set(requestId, state);
    this.logger.debug(`Created initial state for request: ${requestId}`);
    
    return state;
  }

  /**
   * 获取状态
   */
  get(requestId: string): AgentState | undefined {
    return this.states.get(requestId);
  }

  /**
   * 更新状态
   */
  update(requestId: string, updates: Partial<AgentState>): AgentState {
    const state = this.states.get(requestId);
    if (!state) {
      throw new Error(`State not found for request: ${requestId}`);
    }

    const updated = { ...state, ...updates };
    this.states.set(requestId, updated);
    return updated;
  }

  /**
   * 更新嵌套字段
   */
  updateNested(
    requestId: string,
    path: string[],
    value: any
  ): AgentState {
    const state = this.states.get(requestId);
    if (!state) {
      throw new Error(`State not found for request: ${requestId}`);
    }

    const updated = { ...state };
    let current: any = updated;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]] = { ...current[path[i]] };
    }
    
    current[path[path.length - 1]] = value;
    
    this.states.set(requestId, updated);
    return updated;
  }

  /**
   * 删除状态
   */
  delete(requestId: string): void {
    this.states.delete(requestId);
  }

  /**
   * 清理过期状态（可选，用于内存管理）
   */
  cleanup(maxAge: number = 3600000): void {
    // 实现清理逻辑（如果需要）
    // 这里可以添加基于时间戳的清理
  }
}

