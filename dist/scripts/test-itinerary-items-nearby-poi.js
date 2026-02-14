#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
async function testSearchByItemId(itemId) {
    var _a;
    try {
        const url = `${API_BASE_URL}/itinerary-items/nearby-poi?itemId=${itemId}&radius=5000&limit=10`;
        console.log(`\n请求URL: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            return {
                name: '基于行程项ID搜索附近POI',
                passed: false,
                message: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const result = await response.json();
        if (!result.success) {
            return {
                name: '基于行程项ID搜索附近POI',
                passed: false,
                message: ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '请求失败',
            };
        }
        const pois = result.data || [];
        return {
            name: '基于行程项ID搜索附近POI',
            passed: true,
            message: `找到 ${pois.length} 个附近POI`,
            data: {
                count: pois.length,
                categories: [...new Set(pois.map((p) => p.category))],
                sample: pois.slice(0, 3).map((p) => ({
                    name: p.nameCN || p.nameEN,
                    category: p.category,
                    distance: `${Math.round(p.distanceMeters)}m`,
                    rating: p.rating,
                })),
            },
        };
    }
    catch (error) {
        return {
            name: '基于行程项ID搜索附近POI',
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function testSearchByCoordinates(lat, lng, categories) {
    var _a;
    try {
        let url = `${API_BASE_URL}/itinerary-items/nearby-poi?lat=${lat}&lng=${lng}&radius=5000&limit=10`;
        if (categories && categories.length > 0) {
            url += `&categories=${categories.join(',')}`;
        }
        console.log(`\n请求URL: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            return {
                name: '基于坐标搜索附近POI',
                passed: false,
                message: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const result = await response.json();
        if (!result.success) {
            return {
                name: '基于坐标搜索附近POI',
                passed: false,
                message: ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '请求失败',
            };
        }
        const pois = result.data || [];
        return {
            name: '基于坐标搜索附近POI',
            passed: true,
            message: `找到 ${pois.length} 个附近POI`,
            data: {
                count: pois.length,
                categories: [...new Set(pois.map((p) => p.category))],
                sample: pois.slice(0, 3).map((p) => ({
                    name: p.nameCN || p.nameEN,
                    category: p.category,
                    distance: `${Math.round(p.distanceMeters)}m`,
                    rating: p.rating,
                })),
            },
        };
    }
    catch (error) {
        return {
            name: '基于坐标搜索附近POI',
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function testSearchByCategory(lat, lng, category) {
    var _a;
    try {
        const url = `${API_BASE_URL}/itinerary-items/nearby-poi?lat=${lat}&lng=${lng}&categories=${category}&radius=5000&limit=5`;
        console.log(`\n请求URL: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            return {
                name: `搜索${category}类别POI`,
                passed: false,
                message: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const result = await response.json();
        if (!result.success) {
            return {
                name: `搜索${category}类别POI`,
                passed: false,
                message: ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '请求失败',
            };
        }
        const pois = result.data || [];
        const allMatchCategory = pois.every((p) => {
            var _a, _b, _c, _d;
            if (category === 'GAS_STATION') {
                return p.category === 'TRANSIT_HUB' || ((_b = (_a = p.metadata) === null || _a === void 0 ? void 0 : _a.types) === null || _b === void 0 ? void 0 : _b.includes('gas_station'));
            }
            if (category === 'REST_AREA') {
                return p.category === 'ATTRACTION' || ((_d = (_c = p.metadata) === null || _c === void 0 ? void 0 : _c.types) === null || _d === void 0 ? void 0 : _d.includes('rest_stop'));
            }
            return p.category === category;
        });
        return {
            name: `搜索${category}类别POI`,
            passed: allMatchCategory,
            message: `找到 ${pois.length} 个${category}类别POI${allMatchCategory ? '' : '（部分结果类别不匹配）'}`,
            data: {
                count: pois.length,
                allMatchCategory,
                sample: pois.slice(0, 3).map((p) => ({
                    name: p.nameCN || p.nameEN,
                    category: p.category,
                    distance: `${Math.round(p.distanceMeters)}m`,
                })),
            },
        };
    }
    catch (error) {
        return {
            name: `搜索${category}类别POI`,
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function testFilterByRating(lat, lng, minRating) {
    var _a;
    try {
        const url = `${API_BASE_URL}/itinerary-items/nearby-poi?lat=${lat}&lng=${lng}&categories=RESTAURANT&minRating=${minRating}&radius=5000&limit=10`;
        console.log(`\n请求URL: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            return {
                name: '按最小评分过滤',
                passed: false,
                message: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const result = await response.json();
        if (!result.success) {
            return {
                name: '按最小评分过滤',
                passed: false,
                message: ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '请求失败',
            };
        }
        const pois = result.data || [];
        const allMeetRating = pois.every((p) => {
            if (!p.rating)
                return false;
            return p.rating >= minRating;
        });
        return {
            name: '按最小评分过滤',
            passed: allMeetRating,
            message: `找到 ${pois.length} 个评分 >= ${minRating} 的餐厅${allMeetRating ? '' : '（部分结果不满足评分要求）'}`,
            data: {
                count: pois.length,
                allMeetRating,
                ratings: pois.map((p) => p.rating).filter((r) => r !== undefined),
            },
        };
    }
    catch (error) {
        return {
            name: '按最小评分过滤',
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function testErrorHandling() {
    try {
        const url = `${API_BASE_URL}/itinerary-items/nearby-poi`;
        console.log(`\n请求URL: ${url}`);
        const response = await fetch(url);
        const result = await response.json();
        if (!result.success && result.error) {
            return {
                name: '错误处理测试',
                passed: true,
                message: `正确返回错误: ${result.error.message}`,
            };
        }
        if (result.success && result.data === null) {
            return {
                name: '错误处理测试',
                passed: false,
                message: `返回了success但data为null，应该返回错误`,
                data: result,
            };
        }
        return {
            name: '错误处理测试',
            passed: false,
            message: '应该返回错误但没有返回',
            data: result,
        };
    }
    catch (error) {
        return {
            name: '错误处理测试',
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function getTestItemId() {
    try {
        const response = await fetch(`${API_BASE_URL}/itinerary-items?limit=1`);
        if (!response.ok) {
            return null;
        }
        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
            const item = result.data[0];
            if (item.Place) {
                return item.id;
            }
        }
        return null;
    }
    catch (error) {
        return null;
    }
}
async function main() {
    var _a, _b, _c, _d;
    console.log('==========================================');
    console.log('行程项附近POI搜索接口测试');
    console.log('==========================================');
    console.log(`API Base URL: ${API_BASE_URL}\n`);
    const results = [];
    const testLat = 64.1466;
    const testLng = -21.9426;
    console.log('【测试 1】错误处理测试');
    console.log('----------------------------------------');
    const errorTest = await testErrorHandling();
    results.push(errorTest);
    console.log(`${errorTest.passed ? '✅' : '❌'} ${errorTest.name}`);
    if (errorTest.message) {
        console.log(`   ${errorTest.message}`);
    }
    console.log('');
    console.log('【测试 2】基于坐标搜索所有类别POI');
    console.log('----------------------------------------');
    const coordTest = await testSearchByCoordinates(testLat, testLng);
    results.push(coordTest);
    console.log(`${coordTest.passed ? '✅' : '❌'} ${coordTest.name}`);
    if (coordTest.message) {
        console.log(`   ${coordTest.message}`);
    }
    if (coordTest.data) {
        console.log(`   类别: ${coordTest.data.categories.join(', ')}`);
        if (coordTest.data.sample && coordTest.data.sample.length > 0) {
            console.log(`   示例结果:`);
            coordTest.data.sample.forEach((item) => {
                console.log(`     - ${item.name} (${item.category}) - ${item.distance}${item.rating ? ` - ⭐${item.rating}` : ''}`);
            });
        }
    }
    console.log('');
    console.log('【测试 3】搜索景点类别');
    console.log('----------------------------------------');
    const attractionTest = await testSearchByCategory(testLat, testLng, 'ATTRACTION');
    results.push(attractionTest);
    console.log(`${attractionTest.passed ? '✅' : '❌'} ${attractionTest.name}`);
    if (attractionTest.message) {
        console.log(`   ${attractionTest.message}`);
    }
    if (((_a = attractionTest.data) === null || _a === void 0 ? void 0 : _a.sample) && attractionTest.data.sample.length > 0) {
        console.log(`   示例结果:`);
        attractionTest.data.sample.forEach((item) => {
            console.log(`     - ${item.name} - ${item.distance}`);
        });
    }
    console.log('');
    console.log('【测试 4】搜索餐厅类别');
    console.log('----------------------------------------');
    const restaurantTest = await testSearchByCategory(testLat, testLng, 'RESTAURANT');
    results.push(restaurantTest);
    console.log(`${restaurantTest.passed ? '✅' : '❌'} ${restaurantTest.name}`);
    if (restaurantTest.message) {
        console.log(`   ${restaurantTest.message}`);
    }
    if (((_b = restaurantTest.data) === null || _b === void 0 ? void 0 : _b.sample) && restaurantTest.data.sample.length > 0) {
        console.log(`   示例结果:`);
        restaurantTest.data.sample.forEach((item) => {
            console.log(`     - ${item.name} - ${item.distance}`);
        });
    }
    console.log('');
    console.log('【测试 5】搜索加油站类别');
    console.log('----------------------------------------');
    const gasStationTest = await testSearchByCategory(testLat, testLng, 'GAS_STATION');
    results.push(gasStationTest);
    console.log(`${gasStationTest.passed ? '✅' : '❌'} ${gasStationTest.name}`);
    if (gasStationTest.message) {
        console.log(`   ${gasStationTest.message}`);
    }
    if (((_c = gasStationTest.data) === null || _c === void 0 ? void 0 : _c.sample) && gasStationTest.data.sample.length > 0) {
        console.log(`   示例结果:`);
        gasStationTest.data.sample.forEach((item) => {
            console.log(`     - ${item.name} - ${item.distance}`);
        });
    }
    console.log('');
    console.log('【测试 6】按最小评分过滤（>= 4.0）');
    console.log('----------------------------------------');
    const ratingTest = await testFilterByRating(testLat, testLng, 4.0);
    results.push(ratingTest);
    console.log(`${ratingTest.passed ? '✅' : '❌'} ${ratingTest.name}`);
    if (ratingTest.message) {
        console.log(`   ${ratingTest.message}`);
    }
    if (((_d = ratingTest.data) === null || _d === void 0 ? void 0 : _d.ratings) && ratingTest.data.ratings.length > 0) {
        console.log(`   评分列表: ${ratingTest.data.ratings.join(', ')}`);
    }
    console.log('');
    console.log('【测试 7】基于行程项ID搜索附近POI');
    console.log('----------------------------------------');
    const itemId = await getTestItemId();
    if (itemId) {
        const itemIdTest = await testSearchByItemId(itemId);
        results.push(itemIdTest);
        console.log(`${itemIdTest.passed ? '✅' : '❌'} ${itemIdTest.name}`);
        if (itemIdTest.message) {
            console.log(`   ${itemIdTest.message}`);
        }
        if (itemIdTest.data) {
            console.log(`   类别: ${itemIdTest.data.categories.join(', ')}`);
            if (itemIdTest.data.sample && itemIdTest.data.sample.length > 0) {
                console.log(`   示例结果:`);
                itemIdTest.data.sample.forEach((item) => {
                    console.log(`     - ${item.name} (${item.category}) - ${item.distance}${item.rating ? ` - ⭐${item.rating}` : ''}`);
                });
            }
        }
    }
    else {
        console.log('⚠️  未找到可用的行程项（跳过此测试）');
    }
    console.log('');
    console.log('==========================================');
    console.log('测试总结');
    console.log('==========================================');
    console.log(`测试结果:`);
    console.log(`  ✅ 通过: ${results.filter(r => r.passed).length}`);
    console.log(`  ❌ 失败: ${results.filter(r => !r.passed).length}`);
    console.log('');
    if (results.some(r => !r.passed)) {
        console.log('失败的测试:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.name}: ${r.message}`);
        });
        process.exit(1);
    }
    else {
        console.log('✅ 所有测试通过！');
        process.exit(0);
    }
}
main().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-itinerary-items-nearby-poi.js.map