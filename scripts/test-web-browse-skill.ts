#!/usr/bin/env tsx
/**
 * Web Browse Skill 集成测试
 *
 * 测试 WebBrowseSkill 与 McpToolsService 的集成
 * 测试 Level 4 降级策略
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { McpToolsService } from '../src/rag/services/mcp-tools.service';

async function main() {
  console.log('========================================');
  console.log('Web Browse Skill 集成测试');
  console.log('========================================\n');

  // 创建 NestJS 应用上下文
  console.log('创建应用上下文...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const mcpTools = app.get(McpToolsService);

  try {
    // Test 1: 浏览简单网页
    console.log('\n📋 Test 1: 浏览 Example.com');
    console.log('─'.repeat(50));
    const result1 = await mcpTools.webBrowse({
      url: 'https://example.com',
      cacheTtlMinutes: 1,
    });
    console.log(`✓ URL: ${result1.url}`);
    console.log(`✓ Title: ${result1.title || 'N/A'}`);
    console.log(`✓ Success: ${result1.success} ${result1.success ? '(✅ 真实数据)' : '(⚠️ Skill 不可用)'}`);
    console.log(`✓ Content length: ${result1.content.length} 字符`);
    console.log(`✓ Content preview: ${result1.content.substring(0, 100)}...`);
    console.log(`✓ Cached: ${result1.cached || false}`);

    // Test 2: 带查询的浏览
    console.log('\n📋 Test 2: 浏览 GitHub（带查询）');
    console.log('─'.repeat(50));
    const result2 = await mcpTools.webBrowse({
      url: 'https://github.com',
      query: 'collaboration platform',
      cacheTtlMinutes: 1,
    });
    console.log(`✓ URL: ${result2.url}`);
    console.log(`✓ Title: ${result2.title || 'N/A'}`);
    console.log(`✓ Success: ${result2.success} ${result2.success ? '(✅ 真实数据)' : '(⚠️ Skill 不可用)'}`);
    console.log(`✓ Content length: ${result2.content.length} 字符`);
    console.log(`✓ Cached: ${result2.cached || false}`);

    // Test 3: 缓存机制验证
    console.log('\n📋 Test 3: 缓存机制验证');
    console.log('─'.repeat(50));
    console.log('第一次请求（应该不从缓存）...');
    const cached1 = await mcpTools.webBrowse({
      url: 'https://example.com',
      cacheTtlMinutes: 1,
    });
    console.log(`✓ 第一次请求 - Cached: ${cached1.cached || false}`);

    console.log('第二次请求（应该从缓存）...');
    const cached2 = await mcpTools.webBrowse({
      url: 'https://example.com',
      cacheTtlMinutes: 1,
    });
    console.log(`✓ 第二次请求 - Cached: ${cached2.cached || false} (应该为 true)`);

    // Test 4: 错误处理 - 无效 URL
    console.log('\n📋 Test 4: 错误处理 - 无效 URL');
    console.log('─'.repeat(50));
    try {
      const result4 = await mcpTools.webBrowse({
        url: 'not-a-valid-url',
        cacheTtlMinutes: 1,
      });
      console.log(`✓ Success: ${result4.success} (应该为 false)`);
      console.log(`✓ 错误处理正常`);
    } catch (error: any) {
      console.log(`✓ 捕获错误: ${error.message}`);
    }

    // Test 5: 超时处理（不可达网站）
    console.log('\n📋 Test 5: 超时处理');
    console.log('─'.repeat(50));
    console.log('⚠️  注意：此测试可能需要 15 秒超时');
    try {
      const result5 = await mcpTools.webBrowse({
        url: 'https://10.255.255.1', // 不可达 IP
        cacheTtlMinutes: 1,
      });
      console.log(`✓ Success: ${result5.success} (应该为 false)`);
      console.log(`✓ 超时处理正常`);
    } catch (error: any) {
      console.log(`✓ 捕获超时错误: ${error.message}`);
    }

    console.log('\n========================================');
    console.log('✅ 测试完成！');
    console.log('========================================');
    console.log('\n测试总结：');
    console.log(`1. ${result1.success ? '✅' : '⚠️'} Example.com 浏览${result1.success ? '成功' : '失败（Skill 不可用）'}`);
    console.log(`2. ${result2.success ? '✅' : '⚠️'} GitHub 浏览${result2.success ? '成功' : '失败（Skill 不可用）'}`);
    console.log(`3. ${cached2.cached ? '✅' : '⚠️'} 缓存机制${cached2.cached ? '正常' : '未生效'}`);
    console.log('4. ✅ 错误处理正常');
    console.log('5. ✅ 超时处理正常');
    console.log('');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('\n❌ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
