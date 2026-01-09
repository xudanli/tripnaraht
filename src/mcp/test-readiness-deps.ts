#!/usr/bin/env node

/**
 * ReadinessModule 依赖隔离测试
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
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

  try {
    const createPromise = NestFactory.createApplicationContext(TestApp, {
      logger: ['error', 'warn'],
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
  console.error('🔍 Testing ReadinessModule dependencies...\n');

  const { PrismaModule } = await import('../prisma/prisma.module');
  const { UsersModule } = await import('../users/users.module');
  const { TripsModule } = await import('../trips/trips.module');
  const { ReadinessModule } = await import('../trips/readiness/readiness.module');

  const results = [];

  // 测试 1: PrismaModule
  results.push(await testModule('PrismaModule only', [PrismaModule]));

  // 测试 2: PrismaModule + UsersModule
  results.push(await testModule('PrismaModule + UsersModule', [PrismaModule, UsersModule]));

  // 测试 3: PrismaModule + TripsModule
  results.push(await testModule('PrismaModule + TripsModule', [PrismaModule, TripsModule]));

  // 测试 4: PrismaModule + UsersModule + TripsModule
  results.push(await testModule('PrismaModule + UsersModule + TripsModule', [
    PrismaModule,
    UsersModule,
    TripsModule,
  ]));

  // 测试 5: ReadinessModule (包含所有依赖)
  results.push(await testModule('ReadinessModule (full)', [PrismaModule, ReadinessModule]));

  // 总结
  console.error('\n📊 Results:');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.error(`${status} Test ${index + 1}: ${result.success ? 'Success' : 'Failed'} (${result.duration}ms)`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
