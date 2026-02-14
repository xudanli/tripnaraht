#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USE_API = process.env.USE_API !== 'false';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '500', 10);
const MAX_PLACES = parseInt(process.env.MAX_PLACES || '0', 10);
function hasOpeningHours(metadata) {
    var _a, _b;
    if (!metadata)
        return false;
    if (((_a = metadata.basic) === null || _a === void 0 ? void 0 : _a.openingHours) || ((_b = metadata.basic) === null || _b === void 0 ? void 0 : _b.openingHoursStructured)) {
        return true;
    }
    if (metadata.openingHours) {
        return true;
    }
    return false;
}
async function batchEnrichPlaces(placeIds) {
    var _a;
    try {
        const response = await axios_1.default.post(`${BASE_URL}/api/places/attractions/batch-enrich`, {
            placeIds,
            batchSize: BATCH_SIZE,
            delay: DELAY_MS,
        }, {
            timeout: 300000,
            headers: {
                'Content-Type': 'application/json',
            },
            proxy: false,
            httpAgent: false,
            httpsAgent: false,
        });
        return response.data;
    }
    catch (error) {
        if (error.response) {
            throw new Error(`API错误 (${error.response.status}): ${((_a = error.response.data) === null || _a === void 0 ? void 0 : _a.message) || error.message}`);
        }
        throw error;
    }
}
async function main() {
    console.log('='.repeat(60));
    console.log('批量更新冰岛POI开放时间（通过API调用）');
    console.log('='.repeat(60));
    console.log(`📍 API地址: ${BASE_URL}`);
    console.log(`📦 批次大小: ${BATCH_SIZE}`);
    console.log(`⏱️  延迟时间: ${DELAY_MS}ms`);
    console.log('');
    try {
        console.log('📋 查询没有开放时间的冰岛POI...');
        const allPlaces = await prisma.place.findMany({
            where: {
                City: {
                    countryCode: 'IS',
                },
                category: 'ATTRACTION',
            },
            include: {
                City: true,
            },
        });
        console.log(`   找到 ${allPlaces.length} 个冰岛POI，检查开放时间...`);
        const places = allPlaces
            .filter(place => !hasOpeningHours(place.metadata))
            .slice(0, MAX_PLACES || allPlaces.length);
        console.log(`   找到 ${places.length} 个需要更新开放时间的POI\n`);
        if (places.length === 0) {
            console.log('✅ 所有POI都已包含开放时间数据');
            return;
        }
        const placeIds = places.map(p => p.id);
        console.log(`📝 准备更新以下POI: ${placeIds.join(', ')}\n`);
        let result;
        const startTime = Date.now();
        if (USE_API) {
            console.log('🚀 开始调用批量更新API...');
            console.log(`   将更新 ${placeIds.length} 个POI，分 ${Math.ceil(placeIds.length / BATCH_SIZE)} 批处理\n`);
            try {
                result = await batchEnrichPlaces(placeIds);
            }
            catch (error) {
                if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
                    console.error('\n⚠️  API连接失败');
                    console.error(`   尝试连接: ${BASE_URL}/api/places/attractions/batch-enrich`);
                    console.error('   可能原因:');
                    console.error('     1. 服务未运行 - 运行 "npm run dev" 启动服务');
                    console.error(`     2. 端口不正确 - 检查服务实际监听的端口（当前: ${BASE_URL}）`);
                    console.error('     3. 防火墙/代理问题');
                    console.error('\n   提示: 可以设置 BASE_URL 环境变量指定正确的服务地址\n');
                    throw error;
                }
                throw error;
            }
        }
        else {
            console.log('🚀 直接使用服务方法更新...');
            console.log(`   将更新 ${placeIds.length} 个POI\n`);
            console.error('⚠️  直接调用服务方法需要NestJS应用上下文');
            console.error('   建议: 启动服务后使用API方式，或使用 script:import-iceland-opening-hours:amap');
            throw new Error('请使用API方式或启动服务');
        }
        const elapsed = Date.now() - startTime;
        console.log('='.repeat(60));
        console.log('📊 批量更新结果');
        console.log('='.repeat(60));
        console.log(`✅ 成功: ${result.success || 0}`);
        console.log(`❌ 失败: ${result.failed || 0}`);
        console.log(`📊 总计: ${result.total || 0}`);
        console.log(`⏱️  耗时: ${(elapsed / 1000).toFixed(2)}秒`);
        if (result.results && Array.isArray(result.results)) {
            const failedResults = result.results.filter((r) => r.status === 'failed');
            if (failedResults.length > 0) {
                console.log('\n❌ 失败详情:');
                failedResults.forEach((r) => {
                    console.log(`  - ${r.name} (ID: ${r.placeId}): ${r.error || '未知错误'}`);
                });
            }
            const successResults = result.results.filter((r) => r.status === 'success');
            if (successResults.length > 0) {
                console.log(`\n✅ 成功详情（前10个）:`);
                successResults.slice(0, 10).forEach((r) => {
                    console.log(`  - ${r.name} (ID: ${r.placeId})`);
                });
                if (successResults.length > 10) {
                    console.log(`  ... 还有 ${successResults.length - 10} 个成功更新`);
                }
            }
        }
        console.log('\n🔍 验证更新结果...');
        const updatedPlaces = await prisma.place.findMany({
            where: {
                id: { in: placeIds },
            },
        });
        let updatedCount = 0;
        for (const place of updatedPlaces) {
            if (hasOpeningHours(place.metadata)) {
                updatedCount++;
            }
        }
        console.log(`   验证: ${updatedCount}/${placeIds.length} 个POI已包含开放时间数据`);
        if (updatedCount === placeIds.length) {
            console.log('\n🎉 所有POI都已成功更新开放时间！');
        }
        else if (updatedCount > 0) {
            console.log(`\n⚠️  部分POI更新成功（${updatedCount}/${placeIds.length}）`);
        }
        else {
            console.log('\n⚠️  未检测到开放时间更新，可能需要检查API响应');
        }
        console.log('\n✅ 批量更新完成！');
    }
    catch (error) {
        console.error('\n❌ 程序执行失败:', error.message);
        if (error.response) {
            console.error(`   API响应: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        console.error('\n💡 提示:');
        console.error('   1. 确保服务正在运行: npm run dev');
        console.error(`   2. 检查API地址是否正确: ${BASE_URL}`);
        console.error('   3. 检查网络连接');
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch(error => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=batch-update-iceland-opening-hours.js.map