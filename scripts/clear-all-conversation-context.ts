#!/usr/bin/env tsx
/**
 * 清空所有会话上下文数据
 * 
 * 功能：
 * 1. 清空内存缓存中的所有会话
 * 2. 清空 Redis 中的所有会话（如果可用）
 * 3. 清空清空标记
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NLConversationContextService } from '../src/trips/services/nl-conversation-context.service';

async function clearAllConversationContext() {
  console.log('🧹 开始清空所有会话上下文数据...\n');

  try {
    // 创建 NestJS 应用上下文
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const contextService = app.get(NLConversationContextService);

    // 1. 获取所有用户的所有会话（从内存缓存）
    console.log('📋 步骤1：获取所有会话...');
    const memorySessions = new Map<string, string[]>(); // userId -> sessionIds
    
    // 通过反射访问私有属性（仅用于清理脚本）
    const memoryCache = (contextService as any).memoryCache;
    const userClearedFlags = (contextService as any).userClearedFlags;
    
    if (memoryCache) {
      for (const [key, entry] of memoryCache.entries()) {
        const userId = entry.context?.userId;
        if (userId) {
          if (!memorySessions.has(userId)) {
            memorySessions.set(userId, []);
          }
          memorySessions.get(userId)!.push(entry.context.sessionId);
        }
      }
    }

    console.log(`   找到 ${memorySessions.size} 个用户，共 ${Array.from(memorySessions.values()).reduce((sum, sessions) => sum + sessions.length, 0)} 个会话\n`);

    // 2. 删除每个用户的所有会话
    console.log('📋 步骤2：删除所有会话...');
    let totalDeleted = 0;
    
    for (const [userId, sessionIds] of memorySessions.entries()) {
      console.log(`   删除用户 ${userId} 的 ${sessionIds.length} 个会话...`);
      const deleted = await contextService.deleteAllUserSessions(userId);
      totalDeleted += deleted;
      console.log(`   ✅ 已删除 ${deleted} 个会话\n`);
    }

    // 3. 清空内存缓存和清空标记
    console.log('📋 步骤3：清空内存缓存和清空标记...');
    if (memoryCache) {
      memoryCache.clear();
      console.log('   ✅ 内存缓存已清空');
    }
    
    if (userClearedFlags) {
      userClearedFlags.clear();
      console.log('   ✅ 清空标记已清空');
    }

    console.log('\n✅ 清空完成！');
    console.log(`   总计删除: ${totalDeleted} 个会话`);
    console.log(`   清空用户数: ${memorySessions.size}`);

    await app.close();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ 清空失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

clearAllConversationContext();
