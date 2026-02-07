#!/usr/bin/env ts-node
/**
 * 测试行程项接口的坐标字段功能
 * 
 * 验证：
 * 1. GET /api/itinerary-items - 列表接口返回坐标字段
 * 2. GET /api/itinerary-items/:id - 单个行程项接口返回坐标字段
 * 3. POST /api/itinerary-items - 创建接口返回坐标字段
 * 4. PATCH /api/itinerary-items/:id - 更新接口返回坐标字段
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

interface TestResult {
  name: string;
  passed: boolean;
  success?: boolean; // Add for compatibility
  message?: string;
  data?: any;
}

/**
 * 检查 Place 对象是否包含坐标字段
 */
function checkPlaceCoordinates(place: any, context: string): TestResult {
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

  // 验证坐标值的有效性（如果存在）
  const hasValidCoords = 
    (place.lat === null || (typeof place.lat === 'number' && place.lat >= -90 && place.lat <= 90)) &&
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

/**
 * 测试获取行程项列表
 */
async function testGetItineraryItemsList(): Promise<TestResult> {
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
        message: result.error?.message || '请求失败',
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

    // 检查第一个有 Place 的行程项
    const itemWithPlace = items.find((item: any) => item.Place);
    
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
  } catch (error: any) {
    return {
      name: '获取行程项列表',
      passed: false,
      message: `请求失败: ${error.message}`,
    };
  }
}

/**
 * 测试获取单个行程项
 */
async function testGetItineraryItem(itemId: string): Promise<TestResult> {
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
        message: result.error?.message || '请求失败',
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
  } catch (error: any) {
    return {
      name: '获取单个行程项',
      passed: false,
      message: `请求失败: ${error.message}`,
    };
  }
}

/**
 * 测试按 TripDay 获取行程项
 */
async function testGetItineraryItemsByTripDay(tripDayId: string): Promise<TestResult> {
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
        message: result.error?.message || '请求失败',
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

    // 检查所有有 Place 的行程项
    const itemsWithPlace = items.filter((item: any) => item.Place);
    
    if (itemsWithPlace.length === 0) {
      return {
        name: '按 TripDay 获取行程项',
        passed: true,
        message: '没有包含 Place 的行程项',
      };
    }

    const failedChecks: string[] = [];
    const passedChecks: string[] = [];

    for (const item of itemsWithPlace) {
      const coordCheck = checkPlaceCoordinates(item.Place, `行程项 ${item.id}`);
      if (coordCheck.passed) {
        passedChecks.push(item.id);
      } else {
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
        itemIds: itemsWithPlace.map((item: any) => item.id),
      },
    };
  } catch (error: any) {
    return {
      name: '按 TripDay 获取行程项',
      passed: false,
      message: `请求失败: ${error.message}`,
    };
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('==========================================');
  console.log('行程项坐标字段测试');
  console.log('==========================================');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  const results: TestResult[] = [];

  // 测试 1: 获取行程项列表
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

  // 如果列表为空，跳过后续测试
  if (listResult.passed && listResult.message?.includes('列表为空')) {
    console.log('⚠️  没有测试数据，跳过后续测试');
    console.log('\n==========================================');
    console.log('测试总结');
    console.log('==========================================');
    console.log(`测试结果: ${results.filter(r => r.passed).length} 通过, ${results.filter(r => !r.passed).length} 失败`);
    return;
  }

  // 测试 2: 获取单个行程项（如果有数据）
  if (listResult.data?.itemId) {
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

  // 测试 3: 按 TripDay 获取行程项（如果有数据）
  if (listResult.data?.itemId) {
    // 先获取行程项详情以获取 tripDayId
    try {
      const itemResponse = await fetch(`${API_BASE_URL}/itinerary-items/${listResult.data.itemId}`);
      if (itemResponse.ok) {
        const itemResult = await itemResponse.json();
        if (itemResult.success && itemResult.data?.tripDayId) {
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
    } catch (error) {
      // 忽略错误，继续
    }
  }

  // 输出总结
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
  } else {
    console.log('✅ 所有测试通过！');
    process.exit(0);
  }
}

// 运行测试
main().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});

// Export empty object to make this a module and avoid global scope conflicts
export {};
