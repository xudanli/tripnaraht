#!/usr/bin/env node

/**
 * 模块隔离测试：逐个禁用模块，找出导致阻塞的模块
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 强制开启 MCP 模式相关开关
process.env.MCP_MODE ??= 'true';
process.env.DISABLE_REDIS ??= 'true';
process.env.ALLOW_NO_DATABASE ??= 'true';

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

async function testModule(name: string, imports: any[]) {
  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      ...imports,
    ],
  })
  class TestApp {}

  console.error(`\n🧪 Testing: ${name}`);
  console.error(`   Imports: ${imports.map(i => i.name || 'Anonymous').join(', ')}`);

  try {
    const createPromise = NestFactory.createApplicationContext(TestApp, {
      logger: ['error', 'warn', 'log'],
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after 10s`)), 10000)
    );

    const startTime = Date.now();
    const app = await Promise.race([createPromise, timeoutPromise]).catch(err => {
      err.startTime = startTime;
      throw err;
    });
    const duration = Date.now() - startTime;

    console.error(`✅ Success in ${duration}ms`);
    await app.close();
    return { success: true, duration };
  } catch (error: any) {
    const duration = error.startTime ? Date.now() - error.startTime : 0;
    if (error.message.includes('Timeout')) {
      console.error(`❌ Timeout after ${duration}ms`);
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
    return { success: false, duration, error: error.message };
  }
}

async function main() {
  console.error('🔍 Starting module isolation tests...\n');

  const { PrismaModule } = await import('../prisma/prisma.module');
  const { DecisionModule } = await import('../trips/decision/decision.module');
  const { RouteDirectionsModule } = await import('../route-directions/route-directions.module');
  const { ReadinessModule } = await import('../trips/readiness/readiness.module');
  const { SkillsModule } = await import('../skills/skills.module');

  const results = [];

  // 测试 1: 只有 ConfigModule
  results.push(await testModule('ConfigModule only', []));

  // 测试 2: ConfigModule + PrismaModule
  results.push(await testModule('ConfigModule + PrismaModule', [PrismaModule]));

  // 测试 3: ConfigModule + PrismaModule + SkillsModule
  results.push(await testModule('ConfigModule + PrismaModule + SkillsModule', [
    PrismaModule,
    SkillsModule,
  ]));

  // 测试 4: ConfigModule + PrismaModule + RouteDirectionsModule
  results.push(await testModule('ConfigModule + PrismaModule + RouteDirectionsModule', [
    PrismaModule,
    RouteDirectionsModule,
  ]));

  // 测试 5: ConfigModule + PrismaModule + ReadinessModule
  results.push(await testModule('ConfigModule + PrismaModule + ReadinessModule', [
    PrismaModule,
    ReadinessModule,
  ]));

  // 测试 6: ConfigModule + PrismaModule + DecisionModule
  results.push(await testModule('ConfigModule + PrismaModule + DecisionModule', [
    PrismaModule,
    DecisionModule,
  ]));

  // 测试 7: ConfigModule + PrismaModule + SkillsModule + RouteDirectionsModule
  results.push(await testModule('ConfigModule + PrismaModule + SkillsModule + RouteDirectionsModule', [
    PrismaModule,
    SkillsModule,
    RouteDirectionsModule,
  ]));

  // 测试 8: ConfigModule + PrismaModule + SkillsModule + RouteDirectionsModule + ReadinessModule
  results.push(await testModule('ConfigModule + PrismaModule + SkillsModule + RouteDirectionsModule + ReadinessModule', [
    PrismaModule,
    SkillsModule,
    RouteDirectionsModule,
    ReadinessModule,
  ]));

  // 测试 9: 完整的 McpAppModule
  const { McpAppModule } = await import('./mcp-app.module');
  results.push(await testModule('Full McpAppModule', [McpAppModule]));

  // 总结
  console.error('\n📊 Results Summary:');
  console.error('==================');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.error(`${status} Test ${index + 1}: ${result.success ? 'Success' : 'Failed'} (${result.duration}ms)`);
    if (!result.success) {
      console.error(`   Error: ${result.error}`);
    }
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
