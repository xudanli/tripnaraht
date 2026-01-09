// src/places/places-embedding.module.ts
/**
 * Places Embedding Module
 * 
 * 轻量级模块，只提供 EmbeddingService
 * 用于 MCP 模式，避免加载完整的 PlacesModule（会导致启动阻塞）
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingService } from './services/embedding.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    ConfigModule, // EmbeddingService 需要 ConfigService
    LlmModule, // 提供 createOpenAIHttp 工厂函数
  ],
  providers: [
    EmbeddingService,
  ],
  exports: [
    EmbeddingService,
  ],
})
export class PlacesEmbeddingModule {}
