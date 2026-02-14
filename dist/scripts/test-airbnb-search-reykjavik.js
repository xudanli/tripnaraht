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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const airbnb_client_connect_api_1 = require("../src/mcp/airbnb-client-connect-api");
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function searchReykjavik() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const apiKey = process.env.SMITHERY_API_KEY;
    if (!apiKey) {
        console.error('❌ 未设置 SMITHERY_API_KEY 环境变量');
        console.error('\n请设置环境变量:');
        console.error('  SMITHERY_API_KEY=your-api-key-here');
        console.error('\n获取 API Key: https://smithery.ai/account/api-keys\n');
        process.exit(1);
    }
    const configDir = path.join(os.homedir(), '.tripnara-mcp');
    const connectionIdFile = path.join(configDir, 'airbnb-connection-id.txt');
    let savedConnectionId;
    if (fs.existsSync(connectionIdFile)) {
        savedConnectionId = fs.readFileSync(connectionIdFile, 'utf-8').trim();
        console.log(`📋 使用保存的 connectionId: ${savedConnectionId}\n`);
    }
    const client = new airbnb_client_connect_api_1.AirbnbMcpClientConnectAPI(undefined, savedConnectionId);
    try {
        console.log('🔌 正在连接到 Airbnb MCP 服务器...\n');
        await client.connect();
        console.log('✅ 连接成功！\n');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        if (client.getConnectionId()) {
            fs.writeFileSync(connectionIdFile, client.getConnectionId());
            console.log(`💾 已保存 connectionId: ${client.getConnectionId()}\n`);
        }
        console.log('🔍 搜索雷克雅未克的 Airbnb 房源...\n');
        const searchResult = await client.callTool('airbnb_search', {
            location: 'Reykjavik, Iceland',
            adults: 2,
            checkin: undefined,
            checkout: undefined,
            children: 0,
            infants: 0,
            pets: 0,
            page: 1,
            ignoreRobotsText: true,
        });
        if (searchResult && !searchResult.isError && searchResult.content) {
            const content = searchResult.content[0];
            if (content.type === 'text') {
                try {
                    const data = JSON.parse(content.text);
                    if (data.error) {
                        console.error('❌ 搜索错误:', data.error);
                        if (data.suggestion) {
                            console.log('💡 建议:', data.suggestion);
                        }
                        return;
                    }
                    const results = data.searchResults || [];
                    console.log(`\n✅ 找到 ${results.length} 个房源:\n`);
                    const displayCount = Math.min(10, results.length);
                    for (let i = 0; i < displayCount; i++) {
                        const listing = results[i];
                        const name = ((_c = (_b = (_a = listing.demandStayListing) === null || _a === void 0 ? void 0 : _a.description) === null || _b === void 0 ? void 0 : _b.name) === null || _c === void 0 ? void 0 : _c.localizedStringWithTranslationPreference) || '未知名称';
                        const url = listing.url || '';
                        const price = ((_e = (_d = listing.structuredDisplayPrice) === null || _d === void 0 ? void 0 : _d.primaryLine) === null || _e === void 0 ? void 0 : _e.accessibilityLabel) || '价格未知';
                        const rating = listing.avgRatingA11yLabel || '无评分';
                        const badges = listing.badges || '';
                        const primaryLine = ((_f = listing.structuredContent) === null || _f === void 0 ? void 0 : _f.primaryLine) || '';
                        const location = (_h = (_g = listing.demandStayListing) === null || _g === void 0 ? void 0 : _g.location) === null || _h === void 0 ? void 0 : _h.coordinate;
                        console.log(`${i + 1}. ${name}`);
                        if (badges) {
                            console.log(`   🏷️  标签: ${badges}`);
                        }
                        console.log(`   📍 ${primaryLine}`);
                        console.log(`   ⭐ ${rating}`);
                        console.log(`   💰 ${price}`);
                        if (location) {
                            console.log(`   📌 坐标: ${location.latitude}, ${location.longitude}`);
                        }
                        console.log(`   🔗 ${url}`);
                        console.log('');
                    }
                    if (results.length > displayCount) {
                        console.log(`... 还有 ${results.length - displayCount} 个房源未显示\n`);
                    }
                    if (results.length > 0) {
                        const firstListing = results[0];
                        const listingId = firstListing.id;
                        console.log('🏠 获取第一个房源的详细信息...\n');
                        try {
                            const detailsResult = await client.callTool('airbnb_listing_details', {
                                listingId: listingId,
                                ignoreRobotsText: true,
                            });
                            if (detailsResult && !detailsResult.isError && detailsResult.content) {
                                const detailsContent = detailsResult.content[0];
                                if (detailsContent.type === 'text') {
                                    const detailsData = JSON.parse(detailsContent.text);
                                    console.log('📋 房源详情:');
                                    console.log(JSON.stringify(detailsData, null, 2));
                                }
                            }
                        }
                        catch (detailsError) {
                            console.log(`⚠️  获取详情失败: ${detailsError.message}`);
                        }
                    }
                }
                catch (e) {
                    console.error('❌ 解析搜索结果失败:', e.message);
                    console.log('\n原始结果:');
                    console.log(JSON.stringify(searchResult, null, 2));
                }
            }
        }
        else {
            console.log('📊 搜索结果:');
            console.log(JSON.stringify(searchResult, null, 2));
        }
    }
    catch (error) {
        console.error('❌ 错误:', error.message);
        if (error.stack) {
            console.error('\n堆栈:', error.stack);
        }
        process.exit(1);
    }
    finally {
        await client.disconnect();
        console.log('\n✅ 已断开连接');
    }
}
searchReykjavik().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-airbnb-search-reykjavik.js.map