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
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`\n📡 ${options.method || 'GET'} ${url}`);
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });
        const data = await response.json();
        if (!response.ok) {
            console.log(`❌ 状态码: ${response.status}`);
            console.log(`响应:`, JSON.stringify(data, null, 2));
            return data;
        }
        console.log(`✅ 状态码: ${response.status}`);
        console.log(`响应:`, JSON.stringify(data, null, 2));
        return data;
    }
    catch (error) {
        console.error(`❌ 请求失败:`, error.message);
        return {
            success: false,
            error: {
                code: 'REQUEST_ERROR',
                message: error.message,
            },
        };
    }
}
async function testAuthStatus() {
    console.log('\n' + '='.repeat(60));
    console.log('测试 1: 检查授权状态');
    console.log('='.repeat(60));
    const result = await apiRequest('/airbnb/auth/status');
    if (result.success && result.data) {
        if (result.data.isAuthorized) {
            console.log('✅ 已授权');
            console.log(`   Connection ID: ${result.data.connectionId}`);
        }
        else {
            console.log('❌ 未授权');
            if (result.data.authorizationUrl) {
                console.log(`   授权 URL: ${result.data.authorizationUrl}`);
            }
        }
    }
    return result;
}
async function testGetAuthUrl() {
    var _a, _b;
    console.log('\n' + '='.repeat(60));
    console.log('测试 2: 获取授权 URL');
    console.log('='.repeat(60));
    const result = await apiRequest('/airbnb/auth/url');
    if (result.success && result.data) {
        console.log('✅ 获取授权 URL 成功');
        console.log(`   授权 URL: ${result.data.authorizationUrl}`);
        console.log(`   Connection ID: ${result.data.connectionId}`);
        return result.data;
    }
    else if ((_b = (_a = result.error) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.includes('已经完成授权')) {
        console.log('ℹ️  已经完成授权，无需再次授权');
    }
    return null;
}
async function testVerifyAuth(connectionId) {
    console.log('\n' + '='.repeat(60));
    console.log('测试 3: 验证授权');
    console.log('='.repeat(60));
    const result = await apiRequest('/airbnb/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
    });
    if (result.success && result.data) {
        if (result.data.isAuthorized) {
            console.log('✅ 授权验证成功');
            console.log(`   消息: ${result.data.message || '已授权'}`);
        }
        else {
            console.log('❌ 授权尚未完成');
            console.log(`   消息: ${result.data.message || '未授权'}`);
        }
    }
    return result;
}
async function testListTools() {
    var _a;
    console.log('\n' + '='.repeat(60));
    console.log('测试 4: 列出所有可用工具');
    console.log('='.repeat(60));
    const typedResult = await apiRequest('/airbnb/tools');
    if (typedResult.success && ((_a = typedResult.data) === null || _a === void 0 ? void 0 : _a.tools)) {
        console.log(`✅ 找到 ${typedResult.data.tools.length} 个工具:`);
        typedResult.data.tools.forEach((tool, index) => {
            console.log(`   ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
        });
    }
    return typedResult;
}
async function testSearch() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    console.log('\n' + '='.repeat(60));
    console.log('测试 5: 搜索房源');
    console.log('='.repeat(60));
    const result = await apiRequest('/airbnb/search', {
        method: 'POST',
        body: JSON.stringify({
            location: 'Reykjavik, Iceland',
            adults: 2,
            children: 0,
            infants: 0,
            pets: 0,
            ignoreRobotsText: true,
        }),
    });
    if (result.success && result.data) {
        const typedResult = result;
        if ((_a = typedResult.data) === null || _a === void 0 ? void 0 : _a.results) {
            console.log(`✅ 搜索成功，找到 ${typedResult.data.total || typedResult.data.results.length} 个房源`);
            const displayCount = Math.min(3, typedResult.data.results.length);
            for (let i = 0; i < displayCount; i++) {
                const listing = typedResult.data.results[i];
                const name = ((_d = (_c = (_b = listing.demandStayListing) === null || _b === void 0 ? void 0 : _b.description) === null || _c === void 0 ? void 0 : _c.name) === null || _d === void 0 ? void 0 : _d.localizedStringWithTranslationPreference) || '未知名称';
                const price = ((_f = (_e = listing.structuredDisplayPrice) === null || _e === void 0 ? void 0 : _e.primaryLine) === null || _f === void 0 ? void 0 : _f.accessibilityLabel) || '价格未知';
                console.log(`\n   ${i + 1}. ${name}`);
                console.log(`      价格: ${price}`);
                console.log(`      URL: ${listing.url}`);
            }
        }
        else {
            console.log('⚠️  搜索结果为空');
        }
    }
    else if (((_g = result.error) === null || _g === void 0 ? void 0 : _g.code) === 'UNAUTHORIZED') {
        console.log('❌ 需要完成 OAuth 授权');
        if ((_h = result.error.details) === null || _h === void 0 ? void 0 : _h.authorizationUrl) {
            console.log(`   授权 URL: ${result.error.details.authorizationUrl}`);
        }
    }
    return result;
}
async function testGetListingDetails(listingId) {
    var _a;
    console.log('\n' + '='.repeat(60));
    console.log('测试 6: 获取房源详情');
    console.log('='.repeat(60));
    const result = await apiRequest(`/airbnb/listing/${listingId}`);
    if (result.success && result.data) {
        console.log('✅ 获取房源详情成功');
        console.log('   数据:', JSON.stringify(result.data, null, 2).substring(0, 500) + '...');
    }
    else if (((_a = result.error) === null || _a === void 0 ? void 0 : _a.code) === 'UNAUTHORIZED') {
        console.log('❌ 需要完成 OAuth 授权');
    }
    return result;
}
async function main() {
    var _a, _b;
    console.log('🧪 Airbnb API 接口测试');
    console.log(`📍 API Base URL: ${API_BASE_URL}`);
    console.log('='.repeat(60));
    try {
        const statusResult = await testAuthStatus();
        const typedStatusResult = statusResult;
        const isAuthorized = typedStatusResult.success && ((_a = typedStatusResult.data) === null || _a === void 0 ? void 0 : _a.isAuthorized);
        let connectionId = (_b = typedStatusResult.data) === null || _b === void 0 ? void 0 : _b.connectionId;
        if (!isAuthorized) {
            const authUrlData = await testGetAuthUrl();
            if (authUrlData) {
                const typedAuthUrlData = authUrlData;
                if (typedAuthUrlData.connectionId) {
                    connectionId = typedAuthUrlData.connectionId;
                }
                console.log('\n💡 提示: 请访问上面的授权 URL 完成授权');
                console.log('   授权完成后，可以运行以下命令验证:');
                console.log(`   npm run test:airbnb:api -- --verify ${connectionId}`);
            }
        }
        const verifyArg = process.argv.find(arg => arg.startsWith('--verify='));
        if (verifyArg) {
            const verifyConnectionId = verifyArg.split('=')[1];
            await testVerifyAuth(verifyConnectionId);
        }
        else if (connectionId && !isAuthorized) {
            console.log('\n💡 提示: 使用 --verify=<connectionId> 参数验证授权');
        }
        await testListTools();
        if (isAuthorized) {
            const searchResult = await testSearch();
            const typedSearchResult = searchResult;
            if (typedSearchResult.success && typedSearchResult.data && typedSearchResult.data.results && typedSearchResult.data.results.length > 0) {
                const firstListingId = typedSearchResult.data.results[0].id;
                await testGetListingDetails(firstListingId);
            }
        }
        else {
            console.log('\n⚠️  跳过搜索和详情测试（需要授权）');
        }
        console.log('\n' + '='.repeat(60));
        console.log('✅ 测试完成');
        console.log('='.repeat(60));
    }
    catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
        process.exit(1);
    }
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Airbnb API 测试脚本

用法:
  npm run test:airbnb:api                    # 运行所有测试
  npm run test:airbnb:api -- --verify=<id>    # 验证指定 connectionId

环境变量:
  API_BASE_URL                                # API 基础 URL（默认: http://localhost:3000/api）
  `);
    process.exit(0);
}
main().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-airbnb-api.js.map