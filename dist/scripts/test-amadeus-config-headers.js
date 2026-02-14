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
const api_1 = require("@smithery/api");
const mcp_1 = require("@smithery/api/mcp");
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
dotenv.config();
async function testConfigHeaders() {
    var _a, _b, _c;
    console.log('🧪 测试 Amadeus MCP 配置传递\n');
    const smithery = new api_1.Smithery();
    const { namespaces } = await smithery.namespaces.list();
    const namespace = namespaces.length > 0 ? namespaces[0].name : (await smithery.namespaces.create()).name;
    console.log(`📦 Namespace: ${namespace}\n`);
    const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
    console.log('🔑 凭证检查:');
    console.log(`  Client ID: ${clientId ? '✅ 已设置' : '❌ 未设置'}`);
    console.log(`  Client Secret: ${clientSecret ? '✅ 已设置' : '❌ 未设置'}\n`);
    if (!clientId || !clientSecret) {
        console.log('❌ 错误: 未设置 Amadeus API 凭证');
        console.log('请在 .env 文件中设置:');
        console.log('  AMADEUS_CLIENT_ID=your-client-id');
        console.log('  AMADEUS_CLIENT_SECRET=your-client-secret');
        return;
    }
    const mcpUrl = 'https://server.smithery.ai/@almogqwinz/mcp-amadeus-api';
    const connectionConfig = {
        mcpUrl,
        headers: {
            'amadeus-client-id': clientId,
            'amadeus-client-secret': clientSecret,
            'AMADEUS_CLIENT_ID': clientId,
            'AMADEUS_CLIENT_SECRET': clientSecret,
            'amadeus-api-key': clientId,
            'amadeus-api-secret': clientSecret,
        },
    };
    if (process.env.AMADEUS_HOSTNAME) {
        connectionConfig.headers['amadeus-hostname'] = process.env.AMADEUS_HOSTNAME;
        connectionConfig.headers['AMADEUS_HOSTNAME'] = process.env.AMADEUS_HOSTNAME;
    }
    console.log('📤 发送配置:');
    console.log(`  MCP URL: ${mcpUrl}`);
    console.log(`  Headers: ${Object.keys(connectionConfig.headers).length} 个`);
    Object.keys(connectionConfig.headers).forEach(key => {
        const value = connectionConfig.headers[key];
        const masked = key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')
            ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
            : value;
        console.log(`    ${key}: ${masked}`);
    });
    console.log();
    try {
        console.log('🔄 创建连接...\n');
        const conn = await smithery.experimental.connect.connections.create(namespace, connectionConfig);
        console.log('✅ 连接创建成功!');
        console.log(`  Connection ID: ${conn.connectionId}`);
        console.log(`  Status: ${((_a = conn.status) === null || _a === void 0 ? void 0 : _a.state) || 'unknown'}`);
        if (conn.status) {
            if (conn.status.state === 'connected') {
                console.log('\n✅ 连接已就绪，可以开始使用!');
            }
            else if (conn.status.state === 'auth_required') {
                console.log('\n⚠️  需要授权:');
                console.log(`  ${conn.status.authorizationUrl || 'N/A'}`);
            }
            else if (conn.status.state === 'error') {
                console.log('\n❌ 连接错误:');
                console.log(`  ${conn.status.message || 'Unknown error'}`);
            }
        }
        if (((_b = conn.status) === null || _b === void 0 ? void 0 : _b.state) === 'connected') {
            console.log('\n🧪 测试调用工具...');
            try {
                const { transport } = await (0, mcp_1.createConnection)({
                    connectionId: conn.connectionId,
                    namespace,
                });
                const mcpClient = new index_js_1.Client({
                    name: 'test-amadeus-config',
                    version: '1.0.0',
                });
                await mcpClient.connect(transport);
                console.log('✅ MCP Client 连接成功');
                const { tools } = await mcpClient.listTools();
                console.log(`✅ 工具列表获取成功!`);
                console.log(`  找到 ${tools.length} 个工具:`);
                tools.forEach(tool => {
                    console.log(`    - ${tool.name}: ${tool.description || 'No description'}`);
                });
                if (tools.some(t => t.name === 'ping')) {
                    console.log('\n🧪 测试 ping 工具...');
                    const pingResult = await mcpClient.callTool({
                        name: 'ping',
                        arguments: {},
                    });
                    console.log('✅ Ping 成功!');
                    console.log(`  结果: ${JSON.stringify(pingResult.content, null, 2)}`);
                }
                await mcpClient.close();
            }
            catch (error) {
                console.log('❌ 工具调用失败:');
                console.log(`  ${error.message}`);
                if ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('Configuration required')) {
                    console.log('\n💡 提示: 服务器仍然报告需要配置。');
                    console.log('这可能意味着:');
                    console.log('1. 服务器没有定义配置 schema，需要在 Smithery 平台上手动配置');
                    console.log('2. Header 名称不正确，需要查看服务器文档');
                    console.log('3. 配置需要通过其他方式传递（如查询参数）');
                }
            }
        }
    }
    catch (error) {
        console.log('❌ 错误:');
        console.log(`  ${error.message}`);
        if (error.response) {
            console.log(`  Status: ${error.response.status}`);
            console.log(`  Body: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
}
testConfigHeaders().catch(console.error);
//# sourceMappingURL=test-amadeus-config-headers.js.map