#!/usr/bin/env node

/**
 * 简单的测试：验证 NestJS createApplicationContext 是否能正常工作
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Injectable, OnModuleInit, Logger } from '@nestjs/common';

@Injectable()
class TestService implements OnModuleInit {
  private readonly logger = new Logger(TestService.name);

  async onModuleInit() {
    console.error('✅ TestService.onModuleInit called!');
    this.logger.log('TestService.onModuleInit called');
  }
}

@Module({
  providers: [TestService],
})
class TestModule implements OnModuleInit {
  private readonly logger = new Logger(TestModule.name);

  async onModuleInit() {
    console.error('✅ TestModule.onModuleInit called!');
    this.logger.log('TestModule.onModuleInit called');
  }
}

async function test() {
  console.error('Creating simple test app context...');
  
  try {
    const app = await NestFactory.createApplicationContext(TestModule, {
      logger: ['error', 'warn', 'log'],
    });
    
    console.error('✅ Test app context created successfully!');
    
    const testService = app.get(TestService);
    console.error('✅ Got TestService:', !!testService);
    
    await app.close();
    console.error('✅ Test app closed');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

test();
