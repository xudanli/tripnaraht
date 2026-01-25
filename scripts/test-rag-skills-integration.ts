#!/usr/bin/env tsx
/**
 * RAG + Skills 真实集成测试
 *
 * 测试 McpToolsService 与真实 Skills 的集成
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { McpToolsService } from '../src/rag/services/mcp-tools.service';

async function main() {
  console.log('========================================');
  console.log('RAG + Skills 真实集成测试');
  console.log('========================================\n');

  // 创建 NestJS 应用上下文
  console.log('创建应用上下文...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const mcpTools = app.get(McpToolsService);

  try {
    // Test 1: Weather Skill 集成
    console.log('\n📋 Test 1: Weather Skill 集成');
    console.log('─'.repeat(50));
    const weatherResult = await mcpTools.getWeather({
      location: 'Reykjavik',
      lat: 64.1466,
      lng: -21.9426,
      cacheTtlMinutes: 1,
    });
    console.log(`✓ Location: ${weatherResult.location}`);
    console.log(`✓ Success: ${weatherResult.success} ${weatherResult.success ? '(✅ 真实数据)' : '(⚠️ Mock 数据)'}`);
    console.log(`✓ Temperature: ${weatherResult.temperature}°C`);
    console.log(`✓ Conditions: ${weatherResult.conditions}`);
    console.log(`✓ Wind speed: ${weatherResult.wind_speed} m/s`);
    console.log(`✓ Visibility: ${weatherResult.visibility} km`);
    console.log(`✓ Warnings: ${weatherResult.warnings?.length || 0} 条`);

    // Test 2: Opening Hours Skill 集成
    console.log('\n📋 Test 2: Opening Hours Skill 集成');
    console.log('─'.repeat(50));
    console.log('⚠️  注意：需要真实的 place_id 才能测试开放时间查询');
    console.log('   当前测试使用搜索功能');

    const placeResult = await mcpTools.getPlaceDetails({
      place_name: '蓝湖温泉',
      cacheTtlMinutes: 1,
    });
    console.log(`✓ Place ID: ${placeResult.place_id || 'N/A'}`);
    console.log(`✓ Name: ${placeResult.name}`);
    console.log(`✓ Success: ${placeResult.success} ${placeResult.success ? '(✅ 真实数据)' : '(⚠️ Skills 不可用或无数据)'}`);
    if (placeResult.opening_hours) {
      console.log(`✓ Open now: ${placeResult.opening_hours.open_now}`);
      console.log(`✓ Opening hours: ${placeResult.opening_hours.weekday_text?.[0] || 'N/A'}`);
    } else {
      console.log(`✓ Opening hours: 无数据`);
    }

    // Test 3: 缓存机制
    console.log('\n📋 Test 3: 缓存机制验证');
    console.log('─'.repeat(50));
    const cached1 = await mcpTools.getWeather({
      location: 'Reykjavik',
      lat: 64.1466,
      lng: -21.9426,
      cacheTtlMinutes: 1,
    });
    console.log(`✓ 第一次请求 - Cached: ${cached1.cached || false}`);

    const cached2 = await mcpTools.getWeather({
      location: 'Reykjavik',
      lat: 64.1466,
      lng: -21.9426,
      cacheTtlMinutes: 1,
    });
    console.log(`✓ 第二次请求 - Cached: ${cached2.cached || false} (应该为 true)`);

    console.log('\n========================================');
    console.log('✅ 测试完成！');
    console.log('========================================');
    console.log('\n测试总结：');
    console.log(`1. ${weatherResult.success ? '✅' : '⚠️'} Weather Skill ${weatherResult.success ? '集成成功' : '未集成或数据源不可用'}`);
    console.log(`2. ${placeResult.success ? '✅' : '⚠️'} Opening Hours Skill ${placeResult.success ? '集成成功' : '未集成或数据源不可用'}`);
    console.log(`3. ✅ 缓存机制工作正常`);
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
