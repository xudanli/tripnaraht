// scripts/test-new-apis.ts
/**
 * 测试新添加的接口：
 * 1. GET /route-directions/templates/:id/available-pois
 * 2. POST /places/admin/batch
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function checkServerRunning(): Promise<boolean> {
  try {
    // 尝试访问根路径或健康检查端点
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

async function testAvailablePoisApi() {
  console.log('\n=== 测试接口 1: GET /route-directions/templates/:id/available-pois ===\n');

  // 检查服务是否运行
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    console.log('⚠️  服务未运行，请先启动服务: npm run dev');
    console.log('   跳过接口测试，仅显示测试用例...\n');
    return;
  }

  try {
    // 1. 查询一个存在的路线模板
    const template = await prisma.routeTemplate.findFirst({
      where: { isActive: true },
      include: {
        routeDirection: {
          select: {
            id: true,
            nameCN: true,
            countryCode: true,
          },
        },
      },
    });

    if (!template) {
      console.log('❌ 未找到可用的路线模板，跳过测试');
      return;
    }

    console.log(`✅ 找到路线模板: ID=${template.id}, 名称=${template.nameCN || template.name}`);
    console.log(`   关联路线方向: ID=${template.routeDirection.id}, 国家=${template.routeDirection.countryCode}`);

    // 2. 测试基本查询
    console.log('\n📋 测试 1: 基本查询（无参数）');
    const url1 = `${API_BASE_URL}/route-directions/templates/${template.id}/available-pois`;
    console.log(`请求 URL: ${url1}`);
    
    const response1 = await fetch(url1);
    const data1 = await response1.json();
    
    if (response1.ok && data1.success) {
      console.log(`✅ 成功！返回 ${data1.data.places.length} 个POI`);
      console.log(`   总数: ${data1.data.total}, 页码: ${data1.data.page}, 每页: ${data1.data.limit}`);
      if (data1.data.places.length > 0) {
        console.log(`   示例POI: ${data1.data.places[0].nameCN} (ID: ${data1.data.places[0].id})`);
      }
    } else {
      console.log(`❌ 失败: ${JSON.stringify(data1, null, 2)}`);
    }

    // 3. 测试带类别筛选
    console.log('\n📋 测试 2: 按类别筛选（ATTRACTION）');
    const url2 = `${API_BASE_URL}/route-directions/templates/${template.id}/available-pois?category=ATTRACTION&limit=5`;
    console.log(`请求 URL: ${url2}`);
    
    const response2 = await fetch(url2);
    const data2 = await response2.json();
    
    if (response2.ok && data2.success) {
      console.log(`✅ 成功！返回 ${data2.data.places.length} 个景点`);
      if (data2.data.places.length > 0) {
        console.log(`   示例: ${data2.data.places[0].nameCN} (${data2.data.places[0].category})`);
      }
    } else {
      console.log(`❌ 失败: ${JSON.stringify(data2, null, 2)}`);
    }

    // 4. 测试搜索关键词
    console.log('\n📋 测试 3: 搜索关键词');
    const url3 = `${API_BASE_URL}/route-directions/templates/${template.id}/available-pois?search=瀑布&limit=5`;
    console.log(`请求 URL: ${url3}`);
    
    const response3 = await fetch(url3);
    const data3 = await response3.json();
    
    if (response3.ok && data3.success) {
      console.log(`✅ 成功！返回 ${data3.data.places.length} 个匹配的POI`);
      if (data3.data.places.length > 0) {
        console.log(`   示例: ${data3.data.places[0].nameCN}`);
      }
    } else {
      console.log(`❌ 失败: ${JSON.stringify(data3, null, 2)}`);
    }

    // 5. 测试分页
    console.log('\n📋 测试 4: 分页查询');
    const url4 = `${API_BASE_URL}/route-directions/templates/${template.id}/available-pois?page=1&limit=3`;
    console.log(`请求 URL: ${url4}`);
    
    const response4 = await fetch(url4);
    const data4 = await response4.json();
    
    if (response4.ok && data4.success) {
      console.log(`✅ 成功！返回 ${data4.data.places.length} 个POI`);
      console.log(`   页码: ${data4.data.page}, 每页: ${data4.data.limit}, 总数: ${data4.data.total}`);
    } else {
      console.log(`❌ 失败: ${JSON.stringify(data4, null, 2)}`);
    }

    // 6. 测试不存在的模板ID
    console.log('\n📋 测试 5: 不存在的模板ID');
    const url5 = `${API_BASE_URL}/route-directions/templates/99999/available-pois`;
    console.log(`请求 URL: ${url5}`);
    
    const response5 = await fetch(url5);
    const data5 = await response5.json();
    
    if (!response5.ok && !data5.success) {
      console.log(`✅ 正确返回错误: ${data5.error?.message || '未找到'}`);
    } else {
      console.log(`❌ 应该返回错误但成功了`);
    }

  } catch (error: any) {
    console.error(`❌ 测试失败: ${error.message}`);
    console.error(error.stack);
  }
}

async function testBatchPlacesApi() {
  console.log('\n=== 测试接口 2: POST /places/admin/batch ===\n');

  // 检查服务是否运行
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    console.log('⚠️  服务未运行，请先启动服务: npm run dev');
    console.log('   跳过接口测试，仅显示测试用例...\n');
    return;
  }

  try {
    // 1. 查询一些存在的POI ID
    const places = await prisma.place.findMany({
      take: 5,
      select: {
        id: true,
        nameCN: true,
      },
    });

    if (places.length === 0) {
      console.log('❌ 未找到可用的POI，跳过测试');
      return;
    }

    const placeIds = places.map(p => p.id);
    console.log(`✅ 找到 ${places.length} 个POI用于测试`);
    console.log(`   POI IDs: ${placeIds.join(', ')}`);
    places.forEach(p => console.log(`   - ${p.nameCN} (ID: ${p.id})`));

    // 2. 测试批量查询
    console.log('\n📋 测试 1: 批量查询POI详情');
    const url = `${API_BASE_URL}/places/admin/batch`;
    console.log(`请求 URL: ${url}`);
    console.log(`请求体: ${JSON.stringify({ ids: placeIds }, null, 2)}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: placeIds }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log(`✅ 成功！返回 ${data.data.places.length} 个POI详情`);
      if (data.data.places.length > 0) {
        const place = data.data.places[0];
        console.log(`\n   示例POI详情:`);
        console.log(`   - ID: ${place.id}`);
        console.log(`   - 名称: ${place.nameCN}${place.nameEN ? ` (${place.nameEN})` : ''}`);
        console.log(`   - 类别: ${place.category}`);
        console.log(`   - 评分: ${place.rating || 'N/A'}`);
        console.log(`   - 地址: ${place.address || 'N/A'}`);
        console.log(`   - 位置: ${place.location ? `${place.location.lat}, ${place.location.lng}` : 'N/A'}`);
        console.log(`   - 城市: ${place.city ? place.city.name : 'N/A'}`);
      }
    } else {
      console.log(`❌ 失败: ${JSON.stringify(data, null, 2)}`);
    }

    // 3. 测试空数组
    console.log('\n📋 测试 2: 空数组（应该返回错误）');
    const response2 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [] }),
    });

    const data2 = await response2.json();
    if (!response2.ok || !data2.success) {
      console.log(`✅ 正确返回错误: ${data2.error?.message || '验证失败'}`);
    } else {
      console.log(`❌ 应该返回错误但成功了`);
    }

    // 4. 测试不存在的ID
    console.log('\n📋 测试 3: 包含不存在的ID');
    const response3 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [999999, 999998] }),
    });

    const data3 = await response3.json();
    if (response3.ok && data3.success) {
      console.log(`✅ 成功！返回 ${data3.data.places.length} 个POI（应该为0）`);
    } else {
      console.log(`❌ 失败: ${JSON.stringify(data3, null, 2)}`);
    }

    // 5. 测试单个ID
    console.log('\n📋 测试 4: 单个ID查询');
    const response4 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [placeIds[0]] }),
    });

    const data4 = await response4.json();
    if (response4.ok && data4.success) {
      console.log(`✅ 成功！返回 ${data4.data.places.length} 个POI`);
      if (data4.data.places.length > 0) {
        console.log(`   POI: ${data4.data.places[0].nameCN}`);
      }
    } else {
      console.log(`❌ 失败: ${JSON.stringify(data4, null, 2)}`);
    }

  } catch (error: any) {
    console.error(`❌ 测试失败: ${error.message}`);
    console.error(error.stack);
  }
}

async function main() {
  console.log('🚀 开始测试新添加的接口...\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  try {
    // 测试接口1
    await testAvailablePoisApi();

    // 测试接口2
    await testBatchPlacesApi();

    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error(`\n❌ 测试过程中出错: ${error.message}`);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
