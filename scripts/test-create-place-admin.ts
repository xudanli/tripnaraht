// scripts/test-create-place-admin.ts
/**
 * 测试创建地点管理接口：POST /places/admin
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function checkServerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api-docs`, { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      return response.status !== 404;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    return false;
  }
}

async function testCreatePlaceAdmin() {
  console.log('\n=== 测试接口: POST /places/admin ===\n');

  // 检查服务是否运行
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    console.log('⚠️  服务未运行，请先启动服务: npm run dev');
    console.log('   跳过接口测试，仅显示测试用例...\n');
    return;
  }

  try {
    // 1. 查询一个存在的城市ID用于测试
    const city = await prisma.city.findFirst({
      select: {
        id: true,
        name: true,
        nameCN: true,
        countryCode: true,
      },
    });

    if (!city) {
      console.log('❌ 未找到可用的城市，无法进行测试');
      return;
    }

    console.log(`✅ 找到测试城市: ${city.nameCN || city.name} (ID: ${city.id}, 国家: ${city.countryCode})\n`);

    // 2. 测试1: 基本创建（必填字段）
    console.log('📋 测试 1: 基本创建（必填字段）');
    const testData1 = {
      nameCN: `测试景点_${Date.now()}`,
      category: 'ATTRACTION',
      lat: 64.1466,
      lng: -21.9426,
      cityId: city.id,
    };

    console.log(`请求体: ${JSON.stringify(testData1, null, 2)}`);

    const response1 = await fetch(`${API_BASE_URL}/places/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData1),
    });

    const data1 = await response1.json();

    if (response1.ok && data1.success) {
      console.log(`✅ 成功！创建地点 ID: ${data1.data.id}`);
      console.log(`   UUID: ${data1.data.uuid}`);
      console.log(`   名称: ${data1.data.nameCN}`);
      console.log(`   类别: ${data1.data.category}`);
      console.log(`   城市ID: ${data1.data.cityId}`);
      
      const placeId = data1.data.id;

      // 3. 测试2: 完整字段创建
      console.log('\n📋 测试 2: 完整字段创建');
      const testData2 = {
        nameCN: `完整测试景点_${Date.now()}`,
        nameEN: `Complete Test Attraction_${Date.now()}`,
        category: 'ATTRACTION',
        lat: 64.9244,
        lng: -23.3122,
        address: 'Grundarfjörður, Iceland',
        cityId: city.id,
        rating: 4.8,
        description: '这是一个完整的测试景点，包含所有字段',
        metadata: {
          openingHours: '24/7',
          bestTimeToVisit: 'sunset',
          tags: ['photography', 'nature'],
        },
      };

      const response2 = await fetch(`${API_BASE_URL}/places/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData2),
      });

      const data2 = await response2.json();

      if (response2.ok && data2.success) {
        console.log(`✅ 成功！创建地点 ID: ${data2.data.id}`);
        console.log(`   名称: ${data2.data.nameCN} (${data2.data.nameEN})`);
        console.log(`   地址: ${data2.data.address}`);
        console.log(`   评分: ${data2.data.rating}`);
        console.log(`   描述: ${data2.data.description?.substring(0, 50)}...`);
        console.log(`   元数据: ${JSON.stringify(data2.data.metadata).substring(0, 100)}...`);
      } else {
        console.log(`❌ 失败: ${JSON.stringify(data2, null, 2)}`);
      }

      // 4. 测试3: 创建餐厅
      console.log('\n📋 测试 3: 创建餐厅');
      const testData3 = {
        nameCN: `测试餐厅_${Date.now()}`,
        nameEN: `Test Restaurant_${Date.now()}`,
        category: 'RESTAURANT',
        lat: 64.1466,
        lng: -21.9426,
        address: 'Reykjavik, Iceland',
        cityId: city.id,
        rating: 4.5,
        description: '一家美味的测试餐厅',
        metadata: {
          cuisine: 'Icelandic',
          priceRange: '$$',
          openingHours: {
            monday: '11:00-22:00',
            tuesday: '11:00-22:00',
            wednesday: '11:00-22:00',
            thursday: '11:00-22:00',
            friday: '11:00-23:00',
            saturday: '11:00-23:00',
            sunday: '12:00-21:00',
          },
        },
      };

      const response3 = await fetch(`${API_BASE_URL}/places/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData3),
      });

      const data3 = await response3.json();

      if (response3.ok && data3.success) {
        console.log(`✅ 成功！创建餐厅 ID: ${data3.data.id}`);
        console.log(`   名称: ${data3.data.nameCN}`);
        console.log(`   类别: ${data3.data.category}`);
        console.log(`   评分: ${data3.data.rating}`);
      } else {
        console.log(`❌ 失败: ${JSON.stringify(data3, null, 2)}`);
      }

      // 5. 测试4: 错误情况 - 缺少必填字段
      console.log('\n📋 测试 4: 错误情况 - 缺少必填字段（nameCN）');
      const testData4 = {
        category: 'ATTRACTION',
        lat: 64.1466,
        lng: -21.9426,
        cityId: city.id,
      };

      const response4 = await fetch(`${API_BASE_URL}/places/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData4),
      });

      const data4 = await response4.json();

      if (!response4.ok || !data4.success) {
        console.log(`✅ 正确返回错误: ${data4.error?.message || '验证失败'}`);
      } else {
        console.log(`❌ 应该返回错误但成功了`);
      }

      // 6. 测试5: 错误情况 - 无效的类别
      console.log('\n📋 测试 5: 错误情况 - 无效的类别');
      const testData5 = {
        nameCN: '测试地点',
        category: 'INVALID_CATEGORY',
        lat: 64.1466,
        lng: -21.9426,
        cityId: city.id,
      };

      const response5 = await fetch(`${API_BASE_URL}/places/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData5),
      });

      const data5 = await response5.json();

      if (!response5.ok || !data5.success) {
        console.log(`✅ 正确返回错误: ${data5.error?.message || '验证失败'}`);
      } else {
        console.log(`❌ 应该返回错误但成功了`);
      }

      // 7. 清理：删除测试创建的地点（可选）
      console.log('\n📋 清理测试数据（可选）');
      console.log(`   测试创建的地点 ID: ${placeId}`);
      console.log('   如需删除，可以使用 DELETE /places/admin/:id 接口');

    } else {
      console.log(`❌ 失败: ${JSON.stringify(data1, null, 2)}`);
    }

  } catch (error: any) {
    console.error(`❌ 测试失败: ${error.message}`);
    console.error(error.stack);
  }
}

async function main() {
  console.log('🚀 开始测试创建地点管理接口...\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  try {
    await testCreatePlaceAdmin();
    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error(`\n❌ 测试过程中出错: ${error.message}`);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
