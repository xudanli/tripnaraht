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
const airbnb_service_1 = require("../src/mcp/airbnb.service");
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function testService() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    console.log('🧪 测试 Airbnb Service（直接调用）\n');
    console.log('='.repeat(60));
    const service = new airbnb_service_1.AirbnbService();
    try {
        console.log('\n测试 1: 检查授权状态');
        console.log('-'.repeat(60));
        const status = await service.checkAuthStatus();
        console.log('结果:', JSON.stringify(status, null, 2));
        if (status.isAuthorized) {
            console.log('✅ 已授权');
            console.log(`   Connection ID: ${status.connectionId}`);
        }
        else {
            console.log('❌ 未授权');
            if (status.authorizationUrl) {
                console.log(`   授权 URL: ${status.authorizationUrl}`);
            }
        }
        if (!status.isAuthorized) {
            console.log('\n测试 2: 获取授权 URL');
            console.log('-'.repeat(60));
            try {
                const authUrl = await service.getAuthorizationUrl();
                console.log('结果:', JSON.stringify(authUrl, null, 2));
                console.log('✅ 获取授权 URL 成功');
                console.log(`   授权 URL: ${authUrl.authorizationUrl}`);
                console.log(`   Connection ID: ${authUrl.connectionId}`);
                console.log('\n💡 提示: 请访问上面的授权 URL 完成授权');
                console.log('   授权完成后，可以运行以下命令验证:');
                console.log(`   npm run test:airbnb:service -- --verify ${authUrl.connectionId}`);
            }
            catch (error) {
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Already authorized')) {
                    console.log('ℹ️  已经完成授权，无需再次授权');
                }
                else {
                    console.error('❌ 获取授权 URL 失败:', error.message);
                }
            }
        }
        const verifyArg = process.argv.find(arg => arg.startsWith('--verify='));
        if (verifyArg) {
            const verifyConnectionId = verifyArg.split('=')[1];
            console.log('\n测试 3: 验证授权');
            console.log('-'.repeat(60));
            console.log(`   Connection ID: ${verifyConnectionId}`);
            const verifyResult = await service.verifyAuthorization(verifyConnectionId);
            console.log('结果:', JSON.stringify(verifyResult, null, 2));
            if (verifyResult.isAuthorized) {
                console.log('✅ 授权验证成功');
            }
            else {
                console.log('❌ 授权尚未完成');
            }
        }
        console.log('\n测试 4: 列出所有可用工具');
        console.log('-'.repeat(60));
        try {
            const tools = await service.listTools();
            console.log('结果:', JSON.stringify(tools, null, 2));
            if (tools && tools.tools) {
                const toolsList = tools.tools;
                console.log(`✅ 找到 ${toolsList.length} 个工具:`);
                toolsList.forEach((tool, index) => {
                    console.log(`   ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
                });
            }
        }
        catch (error) {
            if ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('OAuth authorization required')) {
                console.log('❌ 需要完成 OAuth 授权');
                const authUrl = error.message.split('Visit: ')[1] || '';
                if (authUrl) {
                    console.log(`   授权 URL: ${authUrl}`);
                }
            }
            else {
                console.error('❌ 列出工具失败:', error.message);
            }
        }
        if (status.isAuthorized) {
            console.log('\n测试 5: 搜索房源');
            console.log('-'.repeat(60));
            try {
                const searchResult = await service.searchListings({
                    location: 'Reykjavik, Iceland',
                    adults: 2,
                    children: 0,
                    ignoreRobotsText: true,
                });
                console.log('结果类型:', typeof searchResult);
                if (searchResult && searchResult.content) {
                    const content = searchResult.content[0];
                    if (content.type === 'text') {
                        try {
                            const data = JSON.parse(content.text);
                            if (data.searchResults) {
                                console.log(`✅ 搜索成功，找到 ${data.searchResults.length} 个房源`);
                                const displayCount = Math.min(3, data.searchResults.length);
                                for (let i = 0; i < displayCount; i++) {
                                    const listing = data.searchResults[i];
                                    const name = ((_e = (_d = (_c = listing.demandStayListing) === null || _c === void 0 ? void 0 : _c.description) === null || _d === void 0 ? void 0 : _d.name) === null || _e === void 0 ? void 0 : _e.localizedStringWithTranslationPreference) || '未知名称';
                                    const price = ((_g = (_f = listing.structuredDisplayPrice) === null || _f === void 0 ? void 0 : _f.primaryLine) === null || _g === void 0 ? void 0 : _g.accessibilityLabel) || '价格未知';
                                    console.log(`\n   ${i + 1}. ${name}`);
                                    console.log(`      价格: ${price}`);
                                    console.log(`      URL: ${listing.url}`);
                                }
                            }
                            else {
                                console.log('⚠️  搜索结果为空或格式异常');
                                console.log('原始数据:', JSON.stringify(data, null, 2).substring(0, 500));
                            }
                        }
                        catch (parseError) {
                            console.log('⚠️  无法解析搜索结果');
                            console.log('原始内容:', content.text.substring(0, 500));
                        }
                    }
                }
                else {
                    console.log('⚠️  搜索结果格式异常');
                    console.log('结果:', JSON.stringify(searchResult, null, 2).substring(0, 500));
                }
            }
            catch (error) {
                if ((_h = error.message) === null || _h === void 0 ? void 0 : _h.includes('OAuth authorization required')) {
                    console.log('❌ 需要完成 OAuth 授权');
                }
                else {
                    console.error('❌ 搜索失败:', error.message);
                }
            }
        }
        else {
            console.log('\n⚠️  跳过搜索测试（需要授权）');
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
    finally {
        await service.onModuleDestroy();
    }
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Airbnb Service 测试脚本（直接调用服务层）

用法:
  npm run test:airbnb:service                    # 运行所有测试
  npm run test:airbnb:service -- --verify=<id>  # 验证指定 connectionId

注意: 此脚本直接调用服务层，不需要启动 HTTP 服务器
  `);
    process.exit(0);
}
testService().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-airbnb-service.js.map