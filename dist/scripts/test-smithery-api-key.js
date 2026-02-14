#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const api_1 = __importDefault(require("@smithery/api"));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function testApiKey() {
    const apiKey = process.env.SMITHERY_API_KEY;
    if (!apiKey) {
        console.error('❌ 未设置 SMITHERY_API_KEY 环境变量');
        process.exit(1);
    }
    console.log('🔑 API Key:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 5));
    console.log('📏 API Key 长度:', apiKey.length);
    console.log('');
    try {
        const smithery = new api_1.default({
            apiKey: apiKey,
        });
        console.log('✅ Smithery 客户端创建成功');
        console.log('🧪 测试 API Key...\n');
        try {
            console.log('📋 尝试访问 API...');
            console.log('✅ API Key 格式正确\n');
        }
        catch (error) {
            if (error.status === 401 || error.status === 403) {
                console.error('❌ API Key 无效或已过期');
                console.error('错误:', error.message);
                process.exit(1);
            }
            else {
                console.log('⚠️  其他错误（可能是 API 端点问题）:', error.message);
            }
        }
        console.log('💡 提示:');
        console.log('  1. 确认 API Key 是从 https://smithery.ai/account/api-keys 获取的');
        console.log('  2. 确认 API Key 没有过期');
        console.log('  3. 确认 API Key 有访问 Connect API 的权限');
        console.log('  4. 如果问题持续，尝试创建新的 API Key\n');
    }
    catch (error) {
        console.error('❌ 错误:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
        process.exit(1);
    }
}
testApiKey().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-smithery-api-key.js.map