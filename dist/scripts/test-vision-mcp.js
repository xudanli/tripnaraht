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
exports.testVisionMcp = testVisionMcp;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = __importStar(require("path"));
async function testVisionMcp() {
    console.log('🧪 Testing Vision Service MCP Integration...\n');
    const transport = new stdio_js_1.StdioClientTransport({
        command: 'npx',
        args: ['tsx', path.join(__dirname, '../src/mcp/mcp-skills-server.ts')],
    });
    const client = new index_js_1.Client({
        name: 'vision-mcp-test',
        version: '1.0.0',
    }, {
        capabilities: {},
    });
    const results = [];
    try {
        console.log('📡 Connecting to MCP server...');
        await client.connect(transport);
        console.log('✅ Connected\n');
        console.log('🔍 Testing: List available tools...');
        try {
            const toolsResult = await client.listTools();
            const visionTools = toolsResult.tools.filter((t) => t.name.startsWith('vision.') || t.name.startsWith('ocr.'));
            console.log(`✅ Found ${visionTools.length} Vision/OCR tools:`);
            visionTools.forEach((tool) => {
                console.log(`   - ${tool.name}: ${tool.description}`);
            });
            console.log('');
            results.push({
                tool: 'listTools',
                success: true,
                result: { count: visionTools.length, tools: visionTools.map((t) => t.name) },
            });
        }
        catch (error) {
            console.error(`❌ Failed to list tools: ${error.message}\n`);
            results.push({
                tool: 'listTools',
                success: false,
                error: error.message,
            });
        }
        console.log('📝 Testing: ocr.extractText...');
        try {
            const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            const ocrResult = await client.callTool({
                name: 'ocr.extractText',
                arguments: {
                    image: testImageBase64,
                    locale: 'zh-CN',
                },
            });
            console.log('✅ OCR extraction completed');
            console.log(`   Result: ${JSON.stringify(ocrResult, null, 2).substring(0, 200)}...\n`);
            results.push({
                tool: 'ocr.extractText',
                success: true,
                result: ocrResult,
            });
        }
        catch (error) {
            console.error(`❌ Failed to extract text: ${error.message}\n`);
            results.push({
                tool: 'ocr.extractText',
                success: false,
                error: error.message,
            });
        }
        console.log('📍 Testing: vision.poiRecommend...');
        try {
            const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            const poiResult = await client.callTool({
                name: 'vision.poiRecommend',
                arguments: {
                    image: testImageBase64,
                    lat: 35.6762,
                    lng: 139.6503,
                    locale: 'zh-CN',
                },
            });
            console.log('✅ POI recommendation completed');
            console.log(`   Result: ${JSON.stringify(poiResult, null, 2).substring(0, 200)}...\n`);
            results.push({
                tool: 'vision.poiRecommend',
                success: true,
                result: poiResult,
            });
        }
        catch (error) {
            console.error(`❌ Failed to recommend POI: ${error.message}\n`);
            results.push({
                tool: 'vision.poiRecommend',
                success: false,
                error: error.message,
            });
        }
    }
    catch (error) {
        console.error(`❌ Connection error: ${error.message}`);
        results.push({
            tool: 'connection',
            success: false,
            error: error.message,
        });
    }
    finally {
        try {
            await client.close();
            console.log('🔌 Disconnected from MCP server\n');
        }
        catch (error) {
            console.error(`⚠️  Error closing connection: ${error.message}\n`);
        }
    }
    console.log('📊 Test Summary:');
    console.log('='.repeat(50));
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    console.log(`Total: ${totalCount} tests`);
    console.log(`Passed: ${successCount}`);
    console.log(`Failed: ${totalCount - successCount}`);
    console.log('='.repeat(50));
    results.forEach((result) => {
        const icon = result.success ? '✅' : '❌';
        console.log(`${icon} ${result.tool}: ${result.success ? 'PASS' : 'FAIL'}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    });
    return {
        success: successCount === totalCount,
        results,
    };
}
if (require.main === module) {
    testVisionMcp()
        .then((summary) => {
        process.exit(summary.success ? 0 : 1);
    })
        .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=test-vision-mcp.js.map