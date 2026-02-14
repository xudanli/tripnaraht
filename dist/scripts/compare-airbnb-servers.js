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
async function testServer(url, name) {
    var _a, _b, _c, _d;
    const info = {
        name,
        url,
    };
    try {
        console.log(`\n🔍 测试服务器: ${name}`);
        console.log(`   URL: ${url}`);
        const smithery = new api_1.Smithery();
        const { namespaces } = await smithery.namespaces.list();
        const namespace = namespaces.length > 0 ? namespaces[0].name : (await smithery.namespaces.create()).name;
        const conn = await smithery.experimental.connect.connections.create(namespace, {
            mcpUrl: url,
        });
        info.status = ((_a = conn.status) === null || _a === void 0 ? void 0 : _a.state) || 'unknown';
        console.log(`   ✅ 连接状态: ${info.status}`);
        if (((_b = conn.status) === null || _b === void 0 ? void 0 : _b.state) === 'connected') {
            const { transport } = await (0, mcp_1.createConnection)({
                connectionId: conn.connectionId,
                namespace,
            });
            const client = new index_js_1.Client({
                name: 'test-comparison',
                version: '1.0.0',
            });
            await client.connect(transport);
            const { tools } = await client.listTools();
            info.tools = tools;
            console.log(`   ✅ 可用工具数量: ${tools.length}`);
            tools.forEach(tool => {
                console.log(`      - ${tool.name}: ${tool.description || 'No description'}`);
            });
            await client.close();
        }
        else if (((_c = conn.status) === null || _c === void 0 ? void 0 : _c.state) === 'auth_required') {
            console.log(`   ⚠️  需要授权: ${conn.status.authorizationUrl || 'N/A'}`);
        }
        else if (((_d = conn.status) === null || _d === void 0 ? void 0 : _d.state) === 'error') {
            info.error = conn.status.message || 'Unknown error';
            console.log(`   ❌ 错误: ${info.error}`);
        }
    }
    catch (error) {
        info.error = error.message;
        console.log(`   ❌ 测试失败: ${error.message}`);
    }
    return info;
}
async function compareServers() {
    console.log('📊 比较 Airbnb MCP 服务器\n');
    console.log('='.repeat(60));
    const servers = [
        {
            name: 'geobio/mcp-server-airbnb',
            url: 'https://server.smithery.ai/geobio/mcp-server-airbnb',
        },
        {
            name: 'iclickfreedownloads/mcp-server-airbnb',
            url: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
        },
    ];
    const results = [];
    for (const server of servers) {
        const result = await testServer(server.url, server.name);
        results.push(result);
    }
    console.log('\n' + '='.repeat(60));
    console.log('📋 比较结果\n');
    results.forEach((result, index) => {
        var _a;
        console.log(`${index + 1}. ${result.name}`);
        console.log(`   状态: ${result.status || 'unknown'}`);
        console.log(`   工具数量: ${((_a = result.tools) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        if (result.error) {
            console.log(`   错误: ${result.error}`);
        }
        console.log();
    });
    const workingServers = results.filter(r => r.status === 'connected' && r.tools && r.tools.length > 0);
    if (workingServers.length > 0) {
        console.log('💡 推荐:');
        workingServers.forEach(server => {
            var _a;
            console.log(`   ✅ ${server.name} - ${(_a = server.tools) === null || _a === void 0 ? void 0 : _a.length} 个工具可用`);
        });
    }
    else {
        console.log('⚠️  两个服务器都需要进一步检查');
    }
}
compareServers().catch(console.error);
//# sourceMappingURL=compare-airbnb-servers.js.map