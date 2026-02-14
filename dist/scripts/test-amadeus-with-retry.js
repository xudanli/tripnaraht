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
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const https = __importStar(require("https"));
dotenv.config();
async function testAmadeusToken(clientId, clientSecret, hostname) {
    return new Promise((resolve) => {
        const apiHost = hostname === 'test' ? 'test.api.amadeus.com' : hostname;
        const postData = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
        const options = {
            hostname: apiHost,
            path: '/v1/security/oauth2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length.toString(),
            },
            timeout: 10000,
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        resolve({ success: true, token: json.access_token });
                    }
                    else {
                        resolve({
                            success: false,
                            error: json.error_description || json.error || 'Unknown error'
                        });
                    }
                }
                catch (e) {
                    resolve({ success: false, error: 'Failed to parse response' });
                }
            });
        });
        req.on('error', (e) => {
            resolve({ success: false, error: e.message });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });
        req.write(postData);
        req.end();
    });
}
async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
async function testWithRetry(options = {
    maxRetries: 12,
    retryDelay: 300,
    initialDelay: 0,
}) {
    var _a, _b, _c;
    console.log('🧪 Amadeus API 凭证测试（带重试功能）\n');
    console.log('='.repeat(60));
    console.log();
    const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
    const hostname = process.env.AMADEUS_HOSTNAME || 'test';
    if (!clientId || !clientSecret) {
        console.log('❌ 错误: 未设置 Amadeus API 凭证');
        console.log('请在 .env 文件中设置:');
        console.log('  AMADEUS_CLIENT_ID=your-client-id');
        console.log('  AMADEUS_CLIENT_SECRET=your-client-secret');
        return;
    }
    console.log('📋 测试配置:');
    console.log(`  Client ID: ${clientId.substring(0, 10)}...${clientId.substring(clientId.length - 4)}`);
    console.log(`  Client Secret: ${clientSecret.substring(0, 4)}...${clientSecret.substring(clientSecret.length - 4)}`);
    console.log(`  Hostname: ${hostname}`);
    console.log(`  最大重试次数: ${options.maxRetries}`);
    console.log(`  重试间隔: ${options.retryDelay} 秒（${options.retryDelay / 60} 分钟）`);
    console.log();
    if (options.initialDelay > 0) {
        console.log(`⏳ 等待 ${options.initialDelay} 秒后开始测试...\n`);
        await sleep(options.initialDelay);
    }
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
        console.log(`🔄 尝试 ${attempt}/${options.maxRetries}...`);
        const result = await testAmadeusToken(clientId, clientSecret, hostname);
        if (result.success) {
            console.log('✅ 成功！API 密钥已激活');
            console.log(`  获取到 access token: ${(_a = result.token) === null || _a === void 0 ? void 0 : _a.substring(0, 20)}...`);
            console.log();
            console.log('💡 现在可以运行 MCP 测试:');
            console.log('   npm run test:amadeus:search');
            return;
        }
        else {
            const isInvalidClient = ((_b = result.error) === null || _b === void 0 ? void 0 : _b.includes('invalid_client')) ||
                ((_c = result.error) === null || _c === void 0 ? void 0 : _c.includes('Client credentials are invalid'));
            if (isInvalidClient && attempt < options.maxRetries) {
                const waitMinutes = options.retryDelay / 60;
                const totalMinutes = (attempt * options.retryDelay) / 60;
                console.log(`❌ 凭证验证失败: ${result.error}`);
                console.log(`⏳ API 密钥可能尚未激活，等待 ${waitMinutes} 分钟后重试...`);
                console.log(`   已等待: ${totalMinutes.toFixed(1)} 分钟`);
                console.log(`   建议: 新创建的 API 密钥通常需要 30 分钟才能激活`);
                console.log();
                await sleep(options.retryDelay);
            }
            else {
                console.log(`❌ 测试失败: ${result.error}`);
                if (attempt >= options.maxRetries) {
                    console.log();
                    console.log('💡 已达到最大重试次数');
                    console.log('   可能的原因:');
                    console.log('   1. API 密钥尚未激活（请再等待一段时间）');
                    console.log('   2. 凭证不正确（请检查 Amadeus 控制台）');
                    console.log('   3. 使用了错误环境的凭证');
                    console.log();
                    console.log('🔧 建议操作:');
                    console.log('   1. 确认 API 密钥创建时间（如果刚创建，请等待 30 分钟）');
                    console.log('   2. 检查 Amadeus 开发者控制台中的凭证');
                    console.log('   3. 确认使用的是测试环境的凭证');
                }
                return;
            }
        }
    }
}
const args = process.argv.slice(2);
const options = {
    maxRetries: 12,
    retryDelay: 300,
    initialDelay: 0,
};
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-retries' && args[i + 1]) {
        options.maxRetries = parseInt(args[i + 1], 10);
        i++;
    }
    else if (args[i] === '--retry-delay' && args[i + 1]) {
        options.retryDelay = parseInt(args[i + 1], 10);
        i++;
    }
    else if (args[i] === '--initial-delay' && args[i + 1]) {
        options.initialDelay = parseInt(args[i + 1], 10);
        i++;
    }
}
testWithRetry(options).catch(console.error);
//# sourceMappingURL=test-amadeus-with-retry.js.map