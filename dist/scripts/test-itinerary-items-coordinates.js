#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
function checkPlaceCoordinates(place, context) {
    if (!place) {
        return {
            name: `检查 ${context} 的 Place 坐标`,
            passed: false,
            message: 'Place 对象不存在',
        };
    }
    const hasLat = place.lat !== undefined;
    const hasLng = place.lng !== undefined;
    const hasLatitude = place.latitude !== undefined;
    const hasLongitude = place.longitude !== undefined;
    const hasCoordinates = place.coordinates !== undefined;
    const allFieldsPresent = hasLat && hasLng && hasLatitude && hasLongitude;
    if (!allFieldsPresent) {
        return {
            name: `检查 ${context} 的 Place 坐标字段`,
            passed: false,
            message: `缺少坐标字段: lat=${hasLat}, lng=${hasLng}, latitude=${hasLatitude}, longitude=${hasLongitude}`,
            data: {
                place: {
                    id: place.id,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    lat: place.lat,
                    lng: place.lng,
                    latitude: place.latitude,
                    longitude: place.longitude,
                    coordinates: place.coordinates,
                },
            },
        };
    }
    const hasValidCoords = (place.lat === null || (typeof place.lat === 'number' && place.lat >= -90 && place.lat <= 90)) &&
        (place.lng === null || (typeof place.lng === 'number' && place.lng >= -180 && place.lng <= 180)) &&
        (place.latitude === null || (typeof place.latitude === 'number' && place.latitude >= -90 && place.latitude <= 90)) &&
        (place.longitude === null || (typeof place.longitude === 'number' && place.longitude >= -180 && place.longitude <= 180));
    if (!hasValidCoords && (place.lat !== null || place.lng !== null)) {
        return {
            name: `检查 ${context} 的 Place 坐标值有效性`,
            passed: false,
            message: `坐标值超出有效范围: lat=${place.lat}, lng=${place.lng}, latitude=${place.latitude}, longitude=${place.longitude}`,
        };
    }
    return {
        name: `检查 ${context} 的 Place 坐标字段`,
        passed: true,
        message: `坐标字段完整: lat=${place.lat}, lng=${place.lng}, latitude=${place.latitude}, longitude=${place.longitude}`,
        data: {
            coordinates: {
                lat: place.lat,
                lng: place.lng,
                latitude: place.latitude,
                longitude: place.longitude,
                coordinates: place.coordinates,
            },
        },
    };
}
async function testGetItineraryItemsList() {
    var _a;
    try {
        const response = await fetch(`${API_BASE_URL}/itinerary-items`);
        if (!response.ok) {
            return {
                name: '获取行程项列表',
                passed: false,
                message: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const result = await response.json();
        if (!result.success) {
            return {
                name: '获取行程项列表',
                passed: false,
                message: ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '请求失败',
            };
        }
        const items = result.data || [];
        if (items.length === 0) {
            return {
                name: '获取行程项列表',
                passed: true,
                message: '列表为空（无测试数据）',
            };
        }
        const itemWithPlace = items.find((item) => item.Place);
        if (!itemWithPlace) {
            return {
                name: '获取行程项列表',
                passed: true,
                message: '没有包含 Place 的行程项',
            };
        }
        const coordCheck = checkPlaceCoordinates(itemWithPlace.Place, `行程项 ${itemWithPlace.id}`);
        return {
            name: '获取行程项列表',
            passed: coordCheck.passed,
            message: coordCheck.message,
            data: {
                itemId: itemWithPlace.id,
                ...coordCheck.data,
            },
        };
    }
    catch (error) {
        return {
            name: '获取行程项列表',
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function testGetItineraryItem(itemId) {
    var _a;
    try {
        const response = await fetch(`${API_BASE_URL}/itinerary-items/${itemId}`);
        if (!response.ok) {
            return {
                name: '获取单个行程项',
                passed: false,
                message: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const result = await response.json();
        if (!result.success) {
            return {
                name: '获取单个行程项',
                passed: false,
                message: ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '请求失败',
            };
        }
        const item = result.data;
        if (!item) {
            return {
                name: '获取单个行程项',
                passed: false,
                message: '未返回数据',
            };
        }
        if (!item.Place) {
            return {
                name: '获取单个行程项',
                passed: true,
                message: '行程项没有关联 Place',
            };
        }
        const coordCheck = checkPlaceCoordinates(item.Place, `行程项 ${item.id}`);
        return {
            name: '获取单个行程项',
            passed: coordCheck.passed,
            message: coordCheck.message,
            data: {
                itemId: item.id,
                ...coordCheck.data,
            },
        };
    }
    catch (error) {
        return {
            name: '获取单个行程项',
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function testGetItineraryItemsByTripDay(tripDayId) {
    var _a;
    try {
        const response = await fetch(`${API_BASE_URL}/itinerary-items?tripDayId=${tripDayId}`);
        if (!response.ok) {
            return {
                name: '按 TripDay 获取行程项',
                passed: false,
                message: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const result = await response.json();
        if (!result.success) {
            return {
                name: '按 TripDay 获取行程项',
                passed: false,
                message: ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '请求失败',
            };
        }
        const items = result.data || [];
        if (items.length === 0) {
            return {
                name: '按 TripDay 获取行程项',
                passed: true,
                message: '该 TripDay 没有行程项',
            };
        }
        const itemsWithPlace = items.filter((item) => item.Place);
        if (itemsWithPlace.length === 0) {
            return {
                name: '按 TripDay 获取行程项',
                passed: true,
                message: '没有包含 Place 的行程项',
            };
        }
        const failedChecks = [];
        const passedChecks = [];
        for (const item of itemsWithPlace) {
            const coordCheck = checkPlaceCoordinates(item.Place, `行程项 ${item.id}`);
            if (coordCheck.passed) {
                passedChecks.push(item.id);
            }
            else {
                failedChecks.push(`${item.id}: ${coordCheck.message}`);
            }
        }
        if (failedChecks.length > 0) {
            return {
                name: '按 TripDay 获取行程项',
                passed: false,
                message: `部分行程项缺少坐标字段: ${failedChecks.join('; ')}`,
                data: {
                    total: itemsWithPlace.length,
                    passed: passedChecks.length,
                    failed: failedChecks.length,
                },
            };
        }
        return {
            name: '按 TripDay 获取行程项',
            passed: true,
            message: `所有 ${itemsWithPlace.length} 个行程项的 Place 都包含坐标字段`,
            data: {
                total: itemsWithPlace.length,
                itemIds: itemsWithPlace.map((item) => item.id),
            },
        };
    }
    catch (error) {
        return {
            name: '按 TripDay 获取行程项',
            passed: false,
            message: `请求失败: ${error.message}`,
        };
    }
}
async function main() {
    var _a, _b, _c, _d;
    console.log('==========================================');
    console.log('行程项坐标字段测试');
    console.log('==========================================');
    console.log(`API Base URL: ${API_BASE_URL}\n`);
    const results = [];
    console.log('【测试 1】获取行程项列表');
    console.log('----------------------------------------');
    const listResult = await testGetItineraryItemsList();
    results.push(listResult);
    console.log(`${listResult.passed ? '✅' : '❌'} ${listResult.name}`);
    if (listResult.message) {
        console.log(`   ${listResult.message}`);
    }
    if (listResult.data) {
        console.log(`   数据:`, JSON.stringify(listResult.data, null, 2));
    }
    console.log('');
    if (listResult.passed && ((_a = listResult.message) === null || _a === void 0 ? void 0 : _a.includes('列表为空'))) {
        console.log('⚠️  没有测试数据，跳过后续测试');
        console.log('\n==========================================');
        console.log('测试总结');
        console.log('==========================================');
        console.log(`测试结果: ${results.filter(r => r.passed).length} 通过, ${results.filter(r => !r.passed).length} 失败`);
        return;
    }
    if ((_b = listResult.data) === null || _b === void 0 ? void 0 : _b.itemId) {
        console.log('【测试 2】获取单个行程项');
        console.log('----------------------------------------');
        const singleResult = await testGetItineraryItem(listResult.data.itemId);
        results.push(singleResult);
        console.log(`${singleResult.passed ? '✅' : '❌'} ${singleResult.name}`);
        if (singleResult.message) {
            console.log(`   ${singleResult.message}`);
        }
        if (singleResult.data) {
            console.log(`   数据:`, JSON.stringify(singleResult.data, null, 2));
        }
        console.log('');
    }
    if ((_c = listResult.data) === null || _c === void 0 ? void 0 : _c.itemId) {
        try {
            const itemResponse = await fetch(`${API_BASE_URL}/itinerary-items/${listResult.data.itemId}`);
            if (itemResponse.ok) {
                const itemResult = await itemResponse.json();
                if (itemResult.success && ((_d = itemResult.data) === null || _d === void 0 ? void 0 : _d.tripDayId)) {
                    console.log('【测试 3】按 TripDay 获取行程项');
                    console.log('----------------------------------------');
                    const tripDayResult = await testGetItineraryItemsByTripDay(itemResult.data.tripDayId);
                    results.push(tripDayResult);
                    console.log(`${tripDayResult.passed ? '✅' : '❌'} ${tripDayResult.name}`);
                    if (tripDayResult.message) {
                        console.log(`   ${tripDayResult.message}`);
                    }
                    if (tripDayResult.data) {
                        console.log(`   数据:`, JSON.stringify(tripDayResult.data, null, 2));
                    }
                    console.log('');
                }
            }
        }
        catch (error) {
        }
    }
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
//# sourceMappingURL=test-itinerary-items-coordinates.js.map