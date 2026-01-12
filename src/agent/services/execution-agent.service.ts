// src/agent/services/execution-agent.service.ts
/**
 * ExecutionAgentService
 * 
 * 执行阶段的 Agent，负责"贴心管家式的提醒、变更与兜底"
 * 
 * 职责：
 * - 生成提醒（出发、入住、活动、交通、天气、安全、预算）
 * - 处理变更（时间、地点、活动取消、交通延误等）
 * - 生成兜底方案（当原计划无法执行时）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExecRemindSkill } from '../../skills/exec/exec-remind.skill';
import { ExecHandleChangeSkill } from '../../skills/exec/exec-handle-change.skill';
import { ExecFallbackSkill } from '../../skills/exec/exec-fallback.skill';
import { ExecutionState, Reminder, ChangeHandlingResult, FallbackPlan } from '../../skills/exec/shared/execution-state.types';
import { PersonaShellService, PersonaShellOutput } from './persona-shell.service';

export interface ExecutionAgentRequest {
  /** Trip ID */
  tripId: string;
  
  /** 操作类型 */
  action: 'remind' | 'handle_change' | 'fallback' | 'get_status';
  
  /** 提醒相关参数（action === 'remind' 时） */
  remindParams?: {
    reminderTypes?: string[];
    advanceHours?: number;
  };
  
  /** 变更相关参数（action === 'handle_change' 时） */
  changeParams?: {
    changeType: string;
    changeDetails: any;
  };
  
  /** 兜底相关参数（action === 'fallback' 时） */
  fallbackParams?: {
    triggerReason: string;
    originalPlan: any;
  };
}

export interface ExecutionAgentResponse {
  /** 执行状态 */
  executionState: ExecutionState;
  
  /** 三人格输出（如果有） */
  personas?: PersonaShellOutput;
  
  /** UI 输出 */
  uiOutput: {
    reminders?: Reminder[];
    changeResult?: ChangeHandlingResult;
    fallbackPlan?: FallbackPlan;
    status?: {
      currentDay: number;
      currentDate: string;
      phase: 'ON_TRIP' | 'CHANGE_HANDLING' | 'FALLBACK';
      activeIssues: number;
    };
  };
}

@Injectable()
export class ExecutionAgentService {
  private readonly logger = new Logger(ExecutionAgentService.name);

  constructor(
    @Optional() private readonly execRemind?: ExecRemindSkill,
    @Optional() private readonly execHandleChange?: ExecHandleChangeSkill,
    @Optional() private readonly execFallback?: ExecFallbackSkill,
    @Optional() private readonly personaShell?: PersonaShellService,
  ) {}

  /**
   * 执行执行阶段流程
   */
  async execute(request: ExecutionAgentRequest): Promise<ExecutionAgentResponse> {
    this.logger.debug(`执行执行阶段 Agent: tripId=${request.tripId}, action=${request.action}`);

    try {
      const currentDate = new Date().toISOString().split('T')[0];
      const executionState: ExecutionState = {
        tripId: request.tripId,
        phase: 'ON_TRIP',
        currentDay: 1, // TODO: 从数据库计算
        currentDate,
        reminders: [],
        pendingChanges: [],
        activeFallbacks: [],
        lastUpdated: new Date().toISOString(),
      };

      const uiOutput: ExecutionAgentResponse['uiOutput'] = {};

      switch (request.action) {
        case 'remind':
          if (this.execRemind) {
            const remindResult = await this.execRemind.execute({
              tripId: request.tripId,
              currentDate,
              reminderTypes: request.remindParams?.reminderTypes as any,
              advanceHours: request.remindParams?.advanceHours,
            });
            executionState.reminders = remindResult.reminders;
            uiOutput.reminders = remindResult.reminders;
          }
          break;

        case 'handle_change':
          if (this.execHandleChange && request.changeParams) {
            const changeResult = await this.execHandleChange.execute({
              tripId: request.tripId,
              changeType: request.changeParams.changeType as any,
              changeDetails: request.changeParams.changeDetails,
            });
            executionState.pendingChanges.push(changeResult.result);
            executionState.phase = 'CHANGE_HANDLING';
            uiOutput.changeResult = changeResult.result;
          }
          break;

        case 'fallback':
          if (this.execFallback && request.fallbackParams) {
            const fallbackResult = await this.execFallback.execute({
              tripId: request.tripId,
              triggerReason: request.fallbackParams.triggerReason,
              originalPlan: request.fallbackParams.originalPlan,
            });
            executionState.activeFallbacks.push(fallbackResult.fallbackPlan);
            executionState.phase = 'FALLBACK';
            uiOutput.fallbackPlan = fallbackResult.fallbackPlan;
          }
          break;

        case 'get_status':
          // 获取当前状态
          uiOutput.status = {
            currentDay: executionState.currentDay,
            currentDate: executionState.currentDate,
            phase: executionState.phase,
            activeIssues: executionState.pendingChanges.length + executionState.activeFallbacks.length,
          };
          break;
      }

      return {
        executionState,
        uiOutput,
      };
    } catch (error: any) {
      this.logger.error(`执行阶段 Agent 执行失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
