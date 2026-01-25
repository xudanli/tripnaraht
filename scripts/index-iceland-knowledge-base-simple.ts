// scripts/index-iceland-knowledge-base-simple.ts
// 简化的知识库索引脚本（只加载必要模块）

import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PlacesModule } from '../src/places/places.module';
import { KnowledgeBaseModule } from '../src/knowledge-base/knowledge-base.module';
import { IndexingService } from '../src/knowledge-base/services/indexing.service';
import { Module } from '@nestjs/common';

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
class IndexingAppModule {}

async function indexKnowledgeBase() {
  console.log('🚀 开始索引冰岛知识库...\n');

  const app = await NestFactory.createApplicationContext(IndexingAppModule);
  const indexingService = app.get(IndexingService);

  try {
    // 检查知识库路径
    const configService = app.get('ConfigService' as any);
    const kbPath = configService?.get('KB_PATH') || './docs/iceland';
    console.log(`📁 知识库路径: ${kbPath}\n`);

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
    throw error;
  } finally {
    await app.close();
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
