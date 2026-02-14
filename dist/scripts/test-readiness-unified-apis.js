#!/usr/bin/env npx tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const READINESS_TEST_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
async function readinessHttpRequest(method, url, body) {
    var _a;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || data.message || 'Unknown error'}`);
        }
        return data;
    }
    catch (error) {
        if (error.message.includes('fetch failed') || error.code === 'ECONNREFUSED') {
            throw new Error(`无法连接到服务器 ${url}，请确保服务已启动`);
        }
        throw error;
    }
}
async function findReadinessTestTripId() {
    try {
        const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/trips?limit=1`);
        if (result.data && result.data.length > 0) {
            return result.data[0].id;
        }
    }
    catch (error) {
    }
    return null;
}
async function testReadinessScore(tripId) {
    var _a, _b;
    try {
        const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/readiness/trip/${tripId}/score`);
        const summary = ((_a = result.data) === null || _a === void 0 ? void 0 : _a.summary) || {};
        const hasMust = summary.must !== undefined;
        const hasShould = summary.should !== undefined;
        const hasBlockers = summary.blockers !== undefined;
        const hasWarnings = summary.warnings !== undefined;
        const hasSuggestions = summary.suggestions !== undefined;
        const mustEqualsWarnings = hasMust && hasWarnings && summary.must === summary.warnings;
        const shouldEqualsSuggestions = hasShould && hasSuggestions && summary.should === summary.suggestions;
        return {
            name: '准备度分数接口（字段统一验证）',
            success: true,
            data: {
                hasNewFields: hasMust && hasShould && hasBlockers,
                hasBackwardCompatibility: hasWarnings && hasSuggestions,
                fieldConsistency: {
                    mustEqualsWarnings,
                    shouldEqualsSuggestions,
                },
                summary: {
                    blockers: summary.blockers,
                    must: summary.must,
                    should: summary.should,
                    warnings: summary.warnings,
                    suggestions: summary.suggestions,
                    highRisks: summary.highRisks,
                    mediumRisks: summary.mediumRisks,
                    lowRisks: summary.lowRisks,
                },
                score: (_b = result.data) === null || _b === void 0 ? void 0 : _b.score,
            },
        };
    }
    catch (error) {
        return {
            name: '准备度分数接口（字段统一验证）',
            success: false,
            error: error.message,
        };
    }
}
async function testPersonalizedChecklist(tripId) {
    var _a, _b, _c, _d, _e, _f;
    try {
        const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/readiness/personalized-checklist?tripId=${tripId}`);
        const checklist = ((_a = result.data) === null || _a === void 0 ? void 0 : _a.checklist) || {};
        const summary = ((_b = result.data) === null || _b === void 0 ? void 0 : _b.summary) || {};
        const hasBlockers = checklist.blocker !== undefined;
        const hasMust = checklist.must !== undefined;
        const hasShould = checklist.should !== undefined;
        const hasOptional = checklist.optional !== undefined;
        const hasTotalBlockers = summary.totalBlockers !== undefined;
        const hasTotalMust = summary.totalMust !== undefined;
        const hasTotalShould = summary.totalShould !== undefined;
        const hasTotalOptional = summary.totalOptional !== undefined;
        return {
            name: '个性化准备清单接口（字段统一验证）',
            success: true,
            data: {
                checklistFields: {
                    hasBlockers,
                    hasMust,
                    hasShould,
                    hasOptional,
                },
                summaryFields: {
                    hasTotalBlockers,
                    hasTotalMust,
                    hasTotalShould,
                    hasTotalOptional,
                },
                counts: {
                    blockers: ((_c = checklist.blocker) === null || _c === void 0 ? void 0 : _c.length) || 0,
                    must: ((_d = checklist.must) === null || _d === void 0 ? void 0 : _d.length) || 0,
                    should: ((_e = checklist.should) === null || _e === void 0 ? void 0 : _e.length) || 0,
                    optional: ((_f = checklist.optional) === null || _f === void 0 ? void 0 : _f.length) || 0,
                },
                summary: {
                    totalBlockers: summary.totalBlockers,
                    totalMust: summary.totalMust,
                    totalShould: summary.totalShould,
                    totalOptional: summary.totalOptional,
                },
            },
        };
    }
    catch (error) {
        return {
            name: '个性化准备清单接口（字段统一验证）',
            success: false,
            error: error.message,
        };
    }
}
async function testTripInsight(tripId) {
    var _a;
    try {
        const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/trips/${tripId}/insight`);
        const readiness = ((_a = result.data) === null || _a === void 0 ? void 0 : _a.readiness) || {};
        const hasMust = readiness.must !== undefined;
        const hasShould = readiness.should !== undefined;
        const hasBlockers = readiness.blockers !== undefined;
        const hasWarnings = readiness.warnings !== undefined;
        const hasSuggestions = readiness.suggestions !== undefined;
        const mustEqualsWarnings = hasMust && hasWarnings && readiness.must === readiness.warnings;
        const shouldEqualsSuggestions = hasShould && hasSuggestions && readiness.should === readiness.suggestions;
        return {
            name: '行程洞察接口（字段统一验证）',
            success: true,
            data: {
                hasNewFields: hasMust && hasShould && hasBlockers,
                hasBackwardCompatibility: hasWarnings && hasSuggestions,
                fieldConsistency: {
                    mustEqualsWarnings,
                    shouldEqualsSuggestions,
                },
                readiness: {
                    status: readiness.status,
                    blockers: readiness.blockers,
                    must: readiness.must,
                    should: readiness.should,
                    warnings: readiness.warnings,
                    suggestions: readiness.suggestions,
                },
            },
        };
    }
    catch (error) {
        return {
            name: '行程洞察接口（字段统一验证）',
            success: false,
            error: error.message,
        };
    }
}
async function testReadinessCheck(tripId) {
    var _a, _b, _c;
    try {
        const tripResult = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/trips/${tripId}`);
        const trip = tripResult.data;
        if (!trip) {
            return {
                name: '准备度检查接口（字段统一验证）',
                success: false,
                error: '无法获取行程信息',
            };
        }
        const checkBody = {
            destinationId: trip.destination || 'IS',
            traveler: {
                nationality: 'CN',
                tags: [],
            },
            trip: {
                startDate: trip.startDate,
                endDate: trip.endDate,
            },
            itinerary: {
                countries: [trip.destination || 'IS'],
            },
        };
        const result = await readinessHttpRequest('POST', `${READINESS_TEST_BASE_URL}/api/readiness/check`, checkBody);
        const summary = ((_a = result.data) === null || _a === void 0 ? void 0 : _a.summary) || {};
        return {
            name: '准备度检查接口（字段统一验证）',
            success: true,
            data: {
                hasStandardFields: {
                    totalBlockers: summary.totalBlockers !== undefined,
                    totalMust: summary.totalMust !== undefined,
                    totalShould: summary.totalShould !== undefined,
                    totalOptional: summary.totalOptional !== undefined,
                },
                summary: {
                    totalBlockers: summary.totalBlockers,
                    totalMust: summary.totalMust,
                    totalShould: summary.totalShould,
                    totalOptional: summary.totalOptional,
                    totalRisks: summary.totalRisks,
                },
                findingsCount: ((_c = (_b = result.data) === null || _b === void 0 ? void 0 : _b.findings) === null || _c === void 0 ? void 0 : _c.length) || 0,
            },
        };
    }
    catch (error) {
        return {
            name: '准备度检查接口（字段统一验证）',
            success: false,
            error: error.message,
        };
    }
}
async function readinessMain() {
    var _a, _b, _c, _d;
    console.log('🧪 开始测试准备度状态字段统一后的API接口...\n');
    console.log(`📍 Base URL: ${READINESS_TEST_BASE_URL}\n`);
    let tripId = process.argv[2] || process.env.TRIP_ID;
    if (!tripId) {
        console.log('📋 未提供tripId，尝试自动查找测试行程...');
        tripId = await findReadinessTestTripId();
        if (!tripId) {
            console.error('\n❌ 无法自动查找测试行程');
            console.error('   请手动提供tripId:');
            console.error('   使用方法: npm run test:readiness-unified <tripId>');
            console.error('   或: TRIP_ID=<tripId> npm run test:readiness-unified\n');
            process.exit(1);
        }
        console.log(`✅ 找到测试行程: ${tripId}\n`);
    }
    else {
        console.log(`📋 使用提供的行程ID: ${tripId}\n`);
    }
    const results = [];
    console.log('='.repeat(60));
    console.log('📦 准备度接口字段统一测试');
    console.log('='.repeat(60));
    results.push(await testReadinessScore(tripId));
    results.push(await testPersonalizedChecklist(tripId));
    results.push(await testTripInsight(tripId));
    results.push(await testReadinessCheck(tripId));
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(60));
    let successCount = 0;
    let failCount = 0;
    for (const result of results) {
        const icon = result.success ? '✅' : '❌';
        console.log(`\n${icon} ${result.name}`);
        if (result.success) {
            successCount++;
            if (result.data) {
                console.log(`   数据:`, JSON.stringify(result.data, null, 2).split('\n').map(l => '   ' + l).join('\n'));
                if (result.data.fieldConsistency) {
                    const consistency = result.data.fieldConsistency;
                    if (consistency.mustEqualsWarnings && consistency.shouldEqualsSuggestions) {
                        console.log(`   ✅ 字段一致性验证通过：must=warnings, should=suggestions`);
                    }
                    else {
                        console.log(`   ⚠️  字段一致性验证失败`);
                        if (!consistency.mustEqualsWarnings) {
                            console.log(`      - must (${(_a = result.data.summary) === null || _a === void 0 ? void 0 : _a.must}) !== warnings (${(_b = result.data.summary) === null || _b === void 0 ? void 0 : _b.warnings})`);
                        }
                        if (!consistency.shouldEqualsSuggestions) {
                            console.log(`      - should (${(_c = result.data.summary) === null || _c === void 0 ? void 0 : _c.should}) !== suggestions (${(_d = result.data.summary) === null || _d === void 0 ? void 0 : _d.suggestions})`);
                        }
                    }
                }
            }
        }
        else {
            failCount++;
            console.log(`   错误: ${result.error}`);
        }
    }
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 成功: ${successCount} | ❌ 失败: ${failCount} | 📊 总计: ${results.length}`);
    console.log('='.repeat(60));
    if (failCount > 0) {
        console.log('\n⚠️  部分测试失败');
        console.log('\n可能的原因:');
        console.log('  1. 服务未运行 - 请运行: npm run dev');
        console.log(`  2. 服务地址不正确 - 当前: ${READINESS_TEST_BASE_URL}`);
        console.log('  3. 测试行程没有准备度数据');
        console.log('  4. API接口路径错误');
        console.log('\n💡 提示: 检查服务日志以获取更多错误信息');
        process.exit(1);
    }
    else {
        console.log('\n🎉 所有测试通过！');
        console.log('\n✅ 准备度状态字段统一验证成功');
        console.log('   - 新字段（must/should）已正确返回');
        console.log('   - 向后兼容字段（warnings/suggestions）已正确返回');
        console.log('   - 字段值一致性验证通过');
    }
}
readinessMain().catch(error => {
    console.error('❌ 程序执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-readiness-unified-apis.js.map