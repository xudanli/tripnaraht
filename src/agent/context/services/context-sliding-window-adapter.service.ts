// src/agent/context/services/context-sliding-window-adapter.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  CONTEXT_PROFILES,
  type ContextConsumerProfile,
  type ProfileConfig,
} from '../interfaces/context-window-profile.interface';

@Injectable()
export class ContextSlidingWindowAdapter {
  private readonly logger = new Logger(ContextSlidingWindowAdapter.name);

  /**
   * 将完整的 `recent_messages` 滑动截取到对应 Profile 的消费上限。
   */
  slice(profile: ContextConsumerProfile, messages: string[] | undefined | null): string[] {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    const config = this.resolveConfig(profile);
    const sliced = messages.slice(-config.limit);

    if (messages.length > config.limit) {
      this.logger.debug(
        `[ContextSlidingWindow] Profile [${profile}] applied. Exceeded limit (${messages.length} -> ${sliced.length}).`,
      );
    }

    return sliced;
  }

  private resolveConfig(profile: ContextConsumerProfile): ProfileConfig {
    if (profile in CONTEXT_PROFILES) {
      return CONTEXT_PROFILES[profile];
    }
    return CONTEXT_PROFILES.default;
  }
}
