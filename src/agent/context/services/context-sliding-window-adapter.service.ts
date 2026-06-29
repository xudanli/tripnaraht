// src/agent/context/services/context-sliding-window-adapter.service.ts

import { Injectable, Logger } from '@nestjs/common';
import type { ContextConsumerProfile } from '../interfaces/context-window-profile.interface';
import {
  resolveContextWindowLimit,
  sliceRecentMessagesForProfile,
  sliceRecentMessagesSafeForProfile,
} from '../utils/conversation-context-window.util';

@Injectable()
export class ContextSlidingWindowAdapter {
  private readonly logger = new Logger(ContextSlidingWindowAdapter.name);

  /**
   * 将完整的 `recent_messages` 滑动截取到对应 Profile 的消费上限。
   */
  slice(profile: ContextConsumerProfile, messages: string[] | undefined | null): string[] {
    const sliced = sliceRecentMessagesForProfile(profile, messages);
    const originalSize = messages?.length ?? 0;
    const limit = resolveContextWindowLimit(profile);
    if (originalSize > limit) {
      this.logger.debug(
        `[ContextSlidingWindow] Profile [${profile}] applied. Exceeded limit (${originalSize} -> ${sliced.length}).`,
      );
    }
    return sliced;
  }

  /** 过滤非 string、trim 空行后再 slice */
  sliceSafe(profile: ContextConsumerProfile, messages: unknown[] | undefined | null): string[] {
    return sliceRecentMessagesSafeForProfile(profile, messages);
  }
}
