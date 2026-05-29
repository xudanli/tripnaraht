// src/agent/context/agent-context.module.ts

import { Module } from '@nestjs/common';
import { ContextSlidingWindowAdapter } from './services/context-sliding-window-adapter.service';

@Module({
  providers: [ContextSlidingWindowAdapter],
  exports: [ContextSlidingWindowAdapter],
})
export class AgentContextModule {}
