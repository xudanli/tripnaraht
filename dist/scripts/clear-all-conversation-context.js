#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const nl_conversation_context_service_1 = require("../src/trips/services/nl-conversation-context.service");
async function clearAllConversationContext() {
    var _a;
    console.log('🧹 开始清空所有会话上下文数据...\n');
    try {
        const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
            logger: ['error', 'warn', 'log'],
        });
        const contextService = app.get(nl_conversation_context_service_1.NLConversationContextService);
        console.log('📋 步骤1：获取所有会话...');
        const memorySessions = new Map();
        const memoryCache = contextService.memoryCache;
        const userClearedFlags = contextService.userClearedFlags;
        if (memoryCache) {
            for (const [key, entry] of memoryCache.entries()) {
                const userId = (_a = entry.context) === null || _a === void 0 ? void 0 : _a.userId;
                if (userId) {
                    if (!memorySessions.has(userId)) {
                        memorySessions.set(userId, []);
                    }
                    memorySessions.get(userId).push(entry.context.sessionId);
                }
            }
        }
        console.log(`   找到 ${memorySessions.size} 个用户，共 ${Array.from(memorySessions.values()).reduce((sum, sessions) => sum + sessions.length, 0)} 个会话\n`);
        console.log('📋 步骤2：删除所有会话...');
        let totalDeleted = 0;
        for (const [userId, sessionIds] of memorySessions.entries()) {
            console.log(`   删除用户 ${userId} 的 ${sessionIds.length} 个会话...`);
            const deleted = await contextService.deleteAllUserSessions(userId);
            totalDeleted += deleted;
            console.log(`   ✅ 已删除 ${deleted} 个会话\n`);
        }
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
    }
    catch (error) {
        console.error('❌ 清空失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}
clearAllConversationContext();
//# sourceMappingURL=clear-all-conversation-context.js.map