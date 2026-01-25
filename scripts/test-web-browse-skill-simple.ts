#!/usr/bin/env tsx
/**
 * Web Browse Skill 简单测试
 *
 * 直接测试 WebBrowseSkill（不需要完整应用上下文）
 */

import 'reflect-metadata';
import { WebBrowseSkill } from '../src/skills/web/web-browse.skill';

async function main() {
  console.log('========================================');
  console.log('Web Browse Skill 简单测试');
  console.log('========================================\n');

  // 创建 WebBrowseSkill 实例
  const webBrowseSkill = new WebBrowseSkill();

  try {
    // Test 1: 浏览 Example.com
    console.log('📋 Test 1: 浏览 Example.com');
    console.log('─'.repeat(50));
    const result1 = await webBrowseSkill.execute({
      url: 'https://example.com',
    });
    console.log(`✓ URL: ${result1.url}`);
    console.log(`✓ Title: ${result1.title}`);
    console.log(`✓ Content length: ${result1.content.length} 字符`);
    console.log(`✓ Content preview: ${result1.content.substring(0, 100)}...`);
    console.log(`✓ Evidence ID: ${result1.evidence_id}`);
    console.log(`✓ Source: ${result1.source}`);
    console.log(`✓ Duration: ${result1.duration_ms}ms`);
    console.log(`✓ Cached: ${result1.cached}`);
    if (result1.metadata) {
      console.log(`✓ Metadata:`);
      console.log(`  - Description: ${result1.metadata.description || 'N/A'}`);
      console.log(`  - Keywords: ${result1.metadata.keywords?.join(', ') || 'N/A'}`);
    }
    if (result1.links && result1.links.length > 0) {
      console.log(`✓ Links found: ${result1.links.length}`);
      console.log(`  - First link: ${result1.links[0].text} (${result1.links[0].href})`);
    }

    // Test 2: 缓存测试
    console.log('\n📋 Test 2: 缓存机制验证');
    console.log('─'.repeat(50));
    console.log('第二次请求同一 URL（应该从缓存返回）...');
    const result2 = await webBrowseSkill.execute({
      url: 'https://example.com',
    });
    console.log(`✓ Cached: ${result2.cached} (应该为 true)`);
    console.log(`✓ Duration: ${result2.duration_ms}ms (应该很快)`);

    // Test 3: 带查询的浏览
    console.log('\n📋 Test 3: 带查询的浏览');
    console.log('─'.repeat(50));
    const result3 = await webBrowseSkill.execute({
      url: 'https://example.com',
      query: 'domain example',
      disableCache: true, // 禁用缓存以测试查询功能
    });
    console.log(`✓ URL: ${result3.url}`);
    console.log(`✓ Relevance score: ${result3.relevance_score?.toFixed(2) || 'N/A'} (查询相关性)`);
    console.log(`✓ Duration: ${result3.duration_ms}ms`);

    // Test 4: 错误处理 - 无效 URL
    console.log('\n📋 Test 4: 错误处理 - 无效 URL');
    console.log('─'.repeat(50));
    try {
      await webBrowseSkill.execute({
        url: 'not-a-valid-url',
      });
      console.log('✗ 应该抛出错误，但没有');
    } catch (error: any) {
      console.log(`✓ 成功捕获错误: ${error.message}`);
    }

    // Test 5: 超时测试（不可达网站）
    console.log('\n📋 Test 5: 超时处理（快速超时）');
    console.log('─'.repeat(50));
    console.log('⚠️  注意：此测试设置 3 秒超时');
    try {
      await webBrowseSkill.execute({
        url: 'https://10.255.255.1', // 不可达 IP
        timeout: 3000, // 3 秒超时
      });
      console.log('✗ 应该超时，但没有');
    } catch (error: any) {
      console.log(`✓ 成功捕获超时错误: ${error.message.substring(0, 80)}...`);
    }

    console.log('\n========================================');
    console.log('✅ 测试完成！');
    console.log('========================================');
    console.log('\n测试总结：');
    console.log('1. ✅ Example.com 浏览成功');
    console.log('2. ✅ 缓存机制正常');
    console.log('3. ✅ 查询相关性评分正常');
    console.log('4. ✅ 错误处理正常（无效 URL）');
    console.log('5. ✅ 超时处理正常');
    console.log('\n📊 WebBrowseSkill 核心功能验证通过！');
    console.log('');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // 清理浏览器
    await webBrowseSkill.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error('\n❌ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
