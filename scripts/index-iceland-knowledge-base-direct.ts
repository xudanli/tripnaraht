// scripts/index-iceland-knowledge-base-direct.ts
// 直接调用服务，避免加载整个应用

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../src/places/services/embedding.service';
import { LoaderService } from '../src/knowledge-base/services/loader.service';
import { ChunkingService } from '../src/knowledge-base/services/chunking.service';
import { IndexingService } from '../src/knowledge-base/services/indexing.service';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PlacesModule } from '../src/places/places.module';
import { KnowledgeBaseModule } from '../src/knowledge-base/knowledge-base.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    PlacesModule,
    KnowledgeBaseModule,
  ],
})
class SimpleIndexingModule {}

async function indexKnowledgeBase() {
  console.log('🚀 开始索引冰岛知识库...\n');

  let app: any;
  try {
    app = await NestFactory.createApplicationContext(SimpleIndexingModule, {
      logger: ['error', 'warn', 'log'],
    });

    const indexingService = app.get(IndexingService);

    // 检查知识库路径
    const configService = app.get(ConfigService);
    const kbPath = configService.get('KB_PATH') || './docs/iceland';
    console.log(`📁 知识库路径: ${kbPath}\n`);

    // 检查路径是否存在
    if (!fs.existsSync(kbPath)) {
      console.error(`❌ 知识库路径不存在: ${kbPath}`);
      console.log(`💡 请确认路径是否正确，或设置环境变量 KB_PATH`);
      process.exit(1);
    }

    // 索引所有知识库文件
    await indexingService.indexAllKnowledgeBase();

    console.log('\n✅ 知识库索引完成！');
    console.log('\n📊 下一步：');
    console.log('   - 可以通过 API 测试检索功能');
    console.log('   - POST /rag/chunks/retrieve');
    console.log('   - 查看 Prisma Studio: npx prisma studio');
  } catch (error: any) {
    console.error('\n❌ 索引失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    
    // 提供更详细的错误信息
    if (error.message?.includes('ConfigService')) {
      console.log('\n💡 提示: ConfigService 注入问题，尝试使用环境变量');
    }
    
    throw error;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

indexKnowledgeBase()
  .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 索引脚本执行失败:', error);
    process.exit(1);
  });
