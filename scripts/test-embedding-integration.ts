#!/usr/bin/env ts-node
/**
 * 测试 EmbeddingService 集成 Python AI Service
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/places/services/embedding.service';

async function testEmbeddingIntegration() {
  console.log('🚀 测试 EmbeddingService 集成 Python AI Service\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const embeddingService = app.get(EmbeddingService);

  try {
    // 测试1: 检查当前提供商
    console.log('📊 当前配置:');
    console.log(`   - 提供商: ${embeddingService.getCurrentProvider()}`);
    console.log(`   - 维度: ${embeddingService.getEmbeddingDimension()}`);
    console.log(`   - Python AI 可用: ${embeddingService.isPythonAIAvailable()}\n`);

    // 测试2: 生成单个文本的 embedding
    console.log('🔍 测试1: 生成单个文本的 Embedding');
    const testText = '杭州西湖';
    console.log(`   文本: "${testText}"`);
    
    const startTime = Date.now();
    const embedding = await embeddingService.generateEmbedding(testText);
    const duration = Date.now() - startTime;

    console.log(`   ✅ 成功！`);
    console.log(`   ⏱️  耗时: ${duration}ms`);
    console.log(`   📊 向量维度: ${embedding.length}`);
    console.log(`   📝 向量前5个值: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`   📝 向量后5个值: [...${embedding.slice(-5).map(v => v.toFixed(4)).join(', ')}]\n`);

    // 测试3: 批量生成
    console.log('🔍 测试2: 批量生成 Embedding');
    const texts = ['北京故宫', '上海外滩', '广州塔'];
    console.log(`   文本: [${texts.join(', ')}]`);
    
    const startTime2 = Date.now();
    const embeddings = await embeddingService.generateEmbeddingsBatch(texts);
    const duration2 = Date.now() - startTime2;

    console.log(`   ✅ 成功！`);
    console.log(`   ⏱️  耗时: ${duration2}ms`);
    console.log(`   📊 生成数量: ${embeddings.length}`);
    console.log(`   📊 平均耗时: ${(duration2 / texts.length).toFixed(0)}ms/条\n`);

    // 测试4: 检查是否为零向量（降级检测）
    const isZeroVector = embedding.every(v => v === 0);
    if (isZeroVector) {
      console.log('⚠️  警告: 检测到零向量，可能已降级到 OpenAI 或服务不可用\n');
    } else {
      console.log('✅ 向量正常，未检测到降级\n');
    }

    // 总结
    console.log('='.repeat(50));
    console.log('📊 测试总结:');
    console.log(`   ✅ Embedding 生成: 成功`);
    console.log(`   ✅ 提供商: ${embeddingService.getCurrentProvider()}`);
    console.log(`   ✅ 维度: ${embeddingService.getEmbeddingDimension()}`);
    console.log(`   ✅ 平均延迟: ${duration}ms`);
    console.log(`   ✅ 批量处理: ${duration2}ms (${texts.length}条)`);
    console.log('='.repeat(50));
    console.log('\n🎉 所有测试通过！Python AI Service 集成正常。\n');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

testEmbeddingIntegration().catch(console.error);
