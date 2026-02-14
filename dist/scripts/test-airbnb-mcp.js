#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const airbnb_client_1 = require("../src/mcp/airbnb-client");
async function testAirbnbMcp() {
    var _a, _b, _c;
    const client = new airbnb_client_1.AirbnbMcpClient();
    try {
        console.log('🔌 正在连接到 Airbnb MCP 服务器...\n');
        await client.connect();
        console.log('✅ 连接成功！\n');
        console.log('🛠️  测试 1: 列出所有可用工具');
        let tools = null;
        try {
            tools = await client.listTools();
            console.log(`找到 ${((_a = tools.tools) === null || _a === void 0 ? void 0 : _a.length) || 0} 个工具:`);
            if (tools.tools) {
                tools.tools.forEach((tool) => {
                    console.log(`  - ${tool.name}: ${tool.description || '无描述'}`);
                });
            }
            console.log('✅ 测试 1 通过\n');
        }
        catch (error) {
            console.error('❌ 测试 1 失败:', error);
        }
        if ((tools === null || tools === void 0 ? void 0 : tools.tools) && tools.tools.length > 0) {
            const firstTool = tools.tools[0];
            console.log(`🧪 测试 2: 调用工具 "${firstTool.name}"`);
            try {
                const result = await client.callTool(firstTool.name, {});
                console.log('结果:', JSON.stringify(result, null, 2));
                console.log('✅ 测试 2 通过\n');
            }
            catch (error) {
                if (((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('required')) || ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('参数'))) {
                    console.log(`⚠️  工具需要参数，跳过测试: ${error.message}`);
                }
                else {
                    console.error('❌ 测试 2 失败:', error);
                }
            }
        }
        console.log('🎉 所有测试完成！');
    }
    catch (error) {
        console.error('❌ 测试失败:', error);
        if (error instanceof Error) {
            console.error('错误信息:', error.message);
            console.error('堆栈:', error.stack);
        }
        process.exit(1);
    }
    finally {
        try {
            await client.disconnect();
        }
        catch (error) {
        }
    }
}
testAirbnbMcp().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-airbnb-mcp.js.map