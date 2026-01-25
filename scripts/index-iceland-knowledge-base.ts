// scripts/index-iceland-knowledge-base.ts
// 索引冰岛知识库文件

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { IndexingService } from '../src/knowledge-base/services/indexing.service';

async function indexKnowledgeBase() {
  console.log('🚀 开始索引冰岛知识库...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
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
