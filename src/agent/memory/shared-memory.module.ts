// src/agent/memory/shared-memory.module.ts
/**
 * 强制将 MemoryModule 挂入应用 DI 图：子模块不再各自决定是否 import Memory。
 * @Global 后任意 provider 可注入 MemoryService / DecisionParamsInjector 等（仍建议在功能模块显式 imports 以表达依赖）。
 */
import { Global, Module } from '@nestjs/common';
import { MemoryModule } from './memory.module';

@Global()
@Module({
  imports: [MemoryModule],
  exports: [MemoryModule],
})
export class SharedMemoryModule {}
