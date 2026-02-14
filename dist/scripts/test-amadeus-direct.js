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
const amadeus_client_connect_api_1 = require("../src/mcp/amadeus-client-connect-api");
dotenv.config();
async function testAmadeus() {
    var _a, _b, _c;
    console.log('🧪 直接测试 Amadeus MCP 客户端\n');
    console.log('='.repeat(60));
    console.log();
    const client = new amadeus_client_connect_api_1.AmadeusMcpClientConnectAPI();
    try {
        console.log('1️⃣ 连接到 Amadeus MCP 服务器...');
        await client.connect();
        console.log('✅ 连接成功\n');
        console.log('2️⃣ 测试 ping 工具...');
        try {
            const pingResult = await client.callTool('ping', {});
            console.log('✅ Ping 成功:', JSON.stringify(pingResult, null, 2));
        }
        catch (error) {
            console.log('❌ Ping 失败:', error.message);
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Configuration required')) {
                console.log('\n💡 提示: 服务器报告需要配置');
                console.log('   这可能是凭证传递的问题，或者凭证本身无效');
            }
        }
        console.log();
        console.log('3️⃣ 列出可用工具...');
        try {
            const tools = await client.listTools();
            console.log('✅ 工具列表:');
            if (tools.tools) {
                tools.tools.forEach((tool) => {
                    console.log(`   - ${tool.name}: ${tool.description || 'No description'}`);
                });
            }
            else {
                console.log('   工具:', JSON.stringify(tools, null, 2));
            }
        }
        catch (error) {
            console.log('❌ 获取工具列表失败:', error.message);
        }
        console.log();
        console.log('4️⃣ 测试航班搜索...');
        try {
            const searchResult = await client.callTool('search_flight_offers', {
                originLocationCode: 'SYD',
                destinationLocationCode: 'BKK',
                departureDate: '2026-05-02',
                adults: 1,
                returnDate: '2026-05-10',
            });
            console.log('✅ 搜索成功!');
            console.log('结果:', JSON.stringify(searchResult, null, 2).substring(0, 500) + '...');
        }
        catch (error) {
            console.log('❌ 搜索失败:', error.message);
            if ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('Configuration required')) {
                console.log('\n💡 提示: 服务器报告需要配置');
                console.log('   可能的原因:');
                console.log('   1. 凭证传递方式不正确');
                console.log('   2. 凭证本身无效（需要等待激活或重新生成）');
                console.log('   3. 服务器未正确读取查询参数');
            }
            else if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('invalid_client')) {
                console.log('\n💡 提示: 凭证无效');
                console.log('   请检查:');
                console.log('   1. Client ID 和 Secret 是否正确');
                console.log('   2. 凭证是否已激活（新创建的密钥可能需要等待 30 分钟）');
                console.log('   3. 是否使用了正确的环境（测试 vs 生产）');
            }
        }
    }
    catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
    }
    finally {
        console.log('\n5️⃣ 断开连接...');
        await client.disconnect();
        console.log('✅ 已断开连接');
    }
}
testAmadeus().catch(console.error);
//# sourceMappingURL=test-amadeus-direct.js.map