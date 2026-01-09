#!/usr/bin/env node

/**
 * 测试 EmbeddingService 注入
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.MCP_MODE ??= 'true';
process.env.DISABLE_REDIS ??= 'true';
process.env.ALLOW_NO_DATABASE ??= 'true';

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlacesEmbeddingModule } from '../places/places-embedding.module';
import { EmbeddingService } from '../places/services/embedding.service';
import { ToolsSelectSkill } from '../skills/context/tools-select.skill';
import { SkillsRegistryService } from '../skills/services/skills-registry.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PlacesEmbeddingModule, // 必须在 ToolsSelectSkill 之前导入
  ],
  providers: [
    SkillsRegistryService, // SkillsRegistryService 必须在 ToolsSelectSkill 之前
    ToolsSelectSkill,
  ],
})
class TestModule {}

async function main() {
  console.error('🧪 Testing EmbeddingService injection...\n');

  try {
    const app = await NestFactory.createApplicationContext(TestModule, {
      logger: ['error', 'warn', 'log'],
    });

    console.error('✅ App context created');

    // 检查 EmbeddingService 是否可用
    try {
      const embeddingService = app.get(EmbeddingService, { strict: false });
      console.error('✅ EmbeddingService available:', !!embeddingService);
    } catch (e) {
      console.error('❌ EmbeddingService not available:', e.message);
    }

    // 检查 ToolsSelectSkill 是否注入了 EmbeddingService
    try {
      const toolsSelectSkill = app.get(ToolsSelectSkill, { strict: false });
      console.error('✅ ToolsSelectSkill available:', !!toolsSelectSkill);
      
      // 使用反射检查私有属性
      const privateEmbeddingService = (toolsSelectSkill as any).embeddingService;
      console.error('✅ ToolsSelectSkill.embeddingService:', !!privateEmbeddingService);
      
      if (privateEmbeddingService) {
        console.error('✅ SUCCESS: EmbeddingService was injected!');
      } else {
        console.error('❌ FAILED: EmbeddingService was NOT injected');
      }
    } catch (e) {
      console.error('❌ ToolsSelectSkill error:', e.message);
    }

    await app.close();
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
