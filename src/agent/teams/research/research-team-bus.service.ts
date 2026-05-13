import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type {
  ResearchAssignmentDispatchEnvelope,
  ResearchAssignmentEnvelope,
  ResearchAssignmentPayload,
  ResearchCompletionEnvelope,
  ResearchCompletionPayload,
} from './research-team-bus.types';

const DEFAULT_SLOT_TIMEOUT_MS = 180_000;

const GLOBAL_ASSIGNMENT_EVENT = 'research:assignment:dispatch';

export class ResearchTeamBusTimeoutError extends Error {
  constructor(
    readonly requestId: string,
    readonly slotId: string,
    readonly timeoutMs: number,
  ) {
    super(`ResearchTeamBus: wait timeout ${timeoutMs}ms requestId=${requestId} slotId=${slotId}`);
    this.name = 'ResearchTeamBusTimeoutError';
  }
}

/**
 * Research Team 进程内信号塔：`research:${requestId}:assigned|completed` 分频道，
 * 以 `slotId` 关联并行槽位，避免跨请求串味与幽灵回调。
 *
 * 用法概要：Leader `publishAssignment` → Member 执行后 `publishCompletion` → Leader `waitForSlot`；
 * 请求结束务必 `finalizeRequest(requestId)` 移除监听器。
 */
@Injectable()
export class ResearchTeamBusService implements OnModuleDestroy {
  private readonly logger = new Logger(ResearchTeamBusService.name);
  private readonly emitter = new EventEmitter();
  /** 每请求注册的 assignment 侧 off 句柄（completion 由 removeAllListeners 统一清） */
  private readonly assignmentUnsubs = new Map<string, Set<() => void>>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
    this.assignmentUnsubs.clear();
  }

  private assignmentChannel(requestId: string): string {
    return `research:${requestId}:assigned`;
  }

  private completionChannel(requestId: string): string {
    return `research:${requestId}:completed`;
  }

  /**
   * Leader 发起任务（同一 requestId 下可多 slot 广播；监听方按 slotId 过滤）。
   */
  publishAssignment(requestId: string, slotId: string, payload: ResearchAssignmentPayload): void {
    const envelope: ResearchAssignmentEnvelope = { slotId, payload };
    this.emitter.emit(this.assignmentChannel(requestId), envelope);
    const dispatch: ResearchAssignmentDispatchEnvelope = { requestId, slotId, payload };
    this.emitter.emit(GLOBAL_ASSIGNMENT_EVENT, dispatch);
  }

  /**
   * Member 提交结果（按 slotId 投递；Leader 侧 `waitForSlot` 过滤领取）。
   */
  publishCompletion(requestId: string, slotId: string, payload: ResearchCompletionPayload): void {
    const envelope: ResearchCompletionEnvelope = { slotId, payload };
    this.emitter.emit(this.completionChannel(requestId), envelope);
  }

  /**
   * 订阅某 request 的 assignment 流；返回 off，且会登记到 `finalizeRequest` 可批量解除。
   */
  subscribeAssignments(requestId: string, handler: (envelope: ResearchAssignmentEnvelope) => void | Promise<void>): () => void {
    const ch = this.assignmentChannel(requestId);
    const wrapped = (envelope: ResearchAssignmentEnvelope) => {
      void Promise.resolve(handler(envelope)).catch((err: unknown) => {
        this.logger.warn(
          `[ResearchTeamBus] assignment handler error requestId=${requestId} slotId=${envelope.slotId} err=${err instanceof Error ? err.message : String(err)}`,
        );
      });
    };
    this.emitter.on(ch, wrapped);
    const off = () => {
      this.emitter.off(ch, wrapped);
      this.assignmentUnsubs.get(requestId)?.delete(off);
    };
    if (!this.assignmentUnsubs.has(requestId)) {
      this.assignmentUnsubs.set(requestId, new Set());
    }
    this.assignmentUnsubs.get(requestId)!.add(off);
    return off;
  }

  /**
   * 单例 Member 在 `onModuleInit` 订阅：全请求 assignment 分发（按 payload 内 `memberKind` 等自行过滤）。
   * 与 `finalizeRequest` 无关；应在 Member `onModuleDestroy` 调用返回的 off。
   */
  subscribeGlobalAssignments(
    handler: (envelope: ResearchAssignmentDispatchEnvelope) => void | Promise<void>,
  ): () => void {
    const wrapped = (envelope: ResearchAssignmentDispatchEnvelope) => {
      void Promise.resolve(handler(envelope)).catch((err: unknown) => {
        this.logger.warn(
          `[ResearchTeamBus] global assignment handler error requestId=${envelope.requestId} slotId=${envelope.slotId} err=${err instanceof Error ? err.message : String(err)}`,
        );
      });
    };
    this.emitter.on(GLOBAL_ASSIGNMENT_EVENT, wrapped);
    return () => this.emitter.off(GLOBAL_ASSIGNMENT_EVENT, wrapped);
  }

  /**
   * Leader 等待指定 slot 的 completion（多并行时靠 slotId 过滤）。
   */
  waitForSlot(
    requestId: string,
    slotId: string,
    timeoutMs: number = DEFAULT_SLOT_TIMEOUT_MS,
  ): Promise<ResearchCompletionPayload> {
    const ch = this.completionChannel(requestId);
    return new Promise((resolve, reject) => {
      const onMsg = (envelope: ResearchCompletionEnvelope) => {
        if (envelope.slotId !== slotId) return;
        clearTimer();
        this.emitter.off(ch, onMsg);
        resolve(envelope.payload);
      };

      let timer: ReturnType<typeof setTimeout> | undefined;
      const clearTimer = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
      };

      timer = setTimeout(() => {
        this.emitter.off(ch, onMsg);
        reject(new ResearchTeamBusTimeoutError(requestId, slotId, timeoutMs));
      }, timeoutMs);

      this.emitter.on(ch, onMsg);
    });
  }

  /**
   * 请求级清理：解除 assignment 订阅并移除该 requestId 下全部 assignment/completion 监听器。
   */
  finalizeRequest(requestId: string): void {
    const subs = this.assignmentUnsubs.get(requestId);
    if (subs) {
      for (const off of subs) {
        try {
          off();
        } catch {
          // ignore
        }
      }
      this.assignmentUnsubs.delete(requestId);
    }
    this.emitter.removeAllListeners(this.assignmentChannel(requestId));
    this.emitter.removeAllListeners(this.completionChannel(requestId));
  }
}
