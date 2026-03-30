// 诊断脚本：隔离测试 DecisionModule 的每个导入，找出哪个导致卡死
import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

// 强制 MCP 模式
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.MCP_MODE = 'true';
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

const timeout = 8000;

async function bootWithImports(imports: any[], name: string) {
  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule,
      ...imports,
    ],
    providers: [],
  })
  class TestApp {}

  console.log(`\n=== Boot: ${name} (timeout ${timeout}ms) ===`);
  const start = Date.now();
  
  try {
    const createPromise = NestFactory.createApplicationContext(TestApp, {
      logger: ['error', 'warn'],
    });
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout ${timeout}ms`)), timeout);
    });
    
    const app = await Promise.race([createPromise, timeoutPromise]);
    const duration = Date.now() - start;
    console.log(`✅ Boot OK: ${name} in ${duration}ms`);
    await (app as any).close();
  } catch (error: any) {
    console.log(`❌ Boot FAILED: ${name}: ${error.message}`);
  }
}

async function diagnose() {
  // 动态导入，避免在模块级别加载问题模块
  const { TransportModule } = await import('../transport/transport.module');
  const { ReadinessModule } = await import('../trips/readiness/readiness.module');
  const { PlacesModule } = await import('../places/places.module');
  const { PlacesLiteModule } = await import('../places/places-lite.module');
  const { RouteDirectionsModule } = await import('../route-directions/route-directions.module');
  const { MemoryModule } = await import('../agent/memory/memory.module');
  const { LlmModule } = await import('../llm/llm.module');
  const { DecisionModule } = await import('../trips/decision/decision.module');

  // 1. 单独测试每个导入
  await bootWithImports([TransportModule], 'TransportModule only');
  await bootWithImports([ReadinessModule], 'ReadinessModule only');
  await bootWithImports([PlacesModule], 'PlacesModule only');
  await bootWithImports([PlacesLiteModule], 'PlacesLiteModule only');
  await bootWithImports([RouteDirectionsModule], 'RouteDirectionsModule only');
  await bootWithImports([MemoryModule], 'MemoryModule only');
  await bootWithImports([LlmModule], 'LlmModule only');
  
  // 2. 测试 DecisionModule 本身（在 MCP 模式下应该使用 PlacesLiteModule）
  await bootWithImports([DecisionModule], 'DecisionModule only (MCP mode)');

  // 3. 组合测试
  await bootWithImports([TransportModule, ReadinessModule], 'Transport + Readiness');
  await bootWithImports([TransportModule, ReadinessModule, RouteDirectionsModule], 'Transport + Readiness + RouteDirections');
  await bootWithImports([TransportModule, ReadinessModule, RouteDirectionsModule, MemoryModule], 'Transport + Readiness + RouteDirections + Memory');
  await bootWithImports([TransportModule, ReadinessModule, RouteDirectionsModule, MemoryModule, LlmModule], 'Transport + Readiness + RouteDirections + Memory + Llm');
  await bootWithImports([TransportModule, ReadinessModule, PlacesLiteModule, RouteDirectionsModule, MemoryModule, LlmModule], 'All imports (using PlacesLiteModule)');
  
  // 4. 测试包含 DecisionModule 的组合
  await bootWithImports([TransportModule, ReadinessModule, DecisionModule, RouteDirectionsModule, MemoryModule, LlmModule], 'All imports + DecisionModule');
}

diagnose().catch(console.error);
