import { Injectable } from '@nestjs/common';
import type { BehaviorSignal } from '../draft-synthesis/user-intent/behavior-signal.types';
import {
  applyBehaviorSignal,
  createDefaultUserIntentState,
} from '../draft-synthesis/user-intent/intent-evolution.engine';
import type { UserIntentState } from '../draft-synthesis/user-intent/user-intent-state.types';

/**
 * 用户意图状态引擎（内存版骨架；生产可换 Redis / Prisma）。
 */
@Injectable()
export class UserIntentStateService {
  private readonly store = new Map<string, UserIntentState>();

  getOrCreate(userId: string): UserIntentState {
    let s = this.store.get(userId);
    if (!s) {
      s = createDefaultUserIntentState(userId);
      this.store.set(userId, s);
    }
    return s;
  }

  /** 覆盖写入（登录同步画像等） */
  put(userId: string, state: UserIntentState): void {
    this.store.set(userId, state);
  }

  applySignal(userId: string, signal: BehaviorSignal): UserIntentState {
    const prev = this.getOrCreate(userId);
    const next = applyBehaviorSignal(prev, signal);
    this.store.set(userId, next);
    return next;
  }
}
