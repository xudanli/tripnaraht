// scripts/test-knowledge-base-index.ts
// 测试知识库索引功能

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { IndexingService } from '../src/knowledge-base/services/indexing.service';

async function testIndexing() {
  console.log('🚀 开始测试知识库索引功能...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const indexingService = app.get(IndexingService);

  try {
    // 1. 检查知识库路径
    console.log('1. 检查知识库路径配置...');
    const configService = app.get('ConfigService' as any);
    const kbPath = configService?.get('KB_PATH') || './knowledge-base/iceland';
    console.log(`   📁 知识库路径: ${kbPath}\n`);

    // 2. 尝试索引知识库
    console.log('2. 开始索引知识库...\n');
    await indexingService.indexAllKnowledgeBase();

    console.log('\n✅ 索引测试完成！');
    console.log('\n📊 下一步：');
    console.log('   - 可以通过 API 测试检索功能');
    console.log('   - POST /rag/chunks/retrieve');
    console.log('   - POST /rag/knowledge-base/rebuild-index');
  } catch (error: any) {
    console.error('\n❌ 索引测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    
    if (error.message?.includes('ENOENT') || error.message?.includes('no such file')) {
      console.log('\n💡 提示:');
      console.log('   1. 确保知识库目录存在: knowledge-base/iceland/');
      console.log('   2. 在 .env 中配置 KB_PATH=./knowledge-base/iceland');
      console.log('   3. 准备一些 JSON 格式的知识库文件');
    }
  } finally {
    await app.close();
  }
}

testIndexing()
  .then(() => {
    console.log('\n✅ 测试脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 测试脚本执行失败:', error);
    process.exit(1);
  });
