#!/usr/bin/env tsx
/**
 * 测试从路线模板创建行程，检查POI数据是否正确传递
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// 检查环境变量，如果没有设置则使用默认值
const API_BASE_URL = process.env.API_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3000';
console.log(`🔗 使用 API 地址: ${API_BASE_URL}`);

async function testCreateTripFromTemplate() {
  console.log('='.repeat(70));
  console.log('🧪 测试从路线模板创建行程 - POI数据检查');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 获取一个路线模板
    console.log('📋 步骤1: 获取路线模板列表...');
    const templatesResponse = await axios.get(`${API_BASE_URL}/api/route-directions/templates`);
    
    if (!templatesResponse.data.success) {
      console.error('❌ 获取模板列表失败:', templatesResponse.data.message);
      return;
    }

    const templates = templatesResponse.data.data;
    console.log(`✅ 找到 ${templates.length} 个模板`);
    console.log('');

    // 查找一个有POI数据的模板
    let templateWithPois: any = null;
    for (const template of templates) {
      if (template.dayPlans && Array.isArray(template.dayPlans)) {
        for (const plan of template.dayPlans) {
          if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
            templateWithPois = template;
            break;
          }
        }
        if (templateWithPois) break;
      }
    }

    if (!templateWithPois) {
      console.log('⚠️  没有找到包含POI数据的模板');
      console.log('📋 检查第一个模板的dayPlans结构:');
      if (templates.length > 0) {
        console.log(JSON.stringify(templates[0].dayPlans, null, 2));
      }
      return;
    }

    console.log(`✅ 找到包含POI数据的模板: ${templateWithPois.nameCN || templateWithPois.name} (ID: ${templateWithPois.id})`);
    console.log('');

    // 2. 检查模板的POI数据
    console.log('📋 步骤2: 检查模板的POI数据...');
    let totalPois = 0;
    templateWithPois.dayPlans.forEach((plan: any, index: number) => {
      const pois = plan.pois || [];
      totalPois += pois.length;
      console.log(`  第${plan.day || index + 1}天:`);
      console.log(`    主题: ${plan.theme || '(无)'}`);
      console.log(`    POI数量: ${pois.length}`);
      if (pois.length > 0) {
        pois.forEach((poi: any, poiIndex: number) => {
          console.log(`      ${poiIndex + 1}. ${poi.nameCN || poi.nameEN || 'N/A'} (ID: ${poi.id || 'N/A'}, Required: ${poi.required || false})`);
        });
      }
      console.log('');
    });

    console.log(`✅ 模板总POI数: ${totalPois}`);
    console.log('');

    // 3. 创建行程
    console.log('📋 步骤3: 从模板创建行程...');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7); // 7天后
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + templateWithPois.durationDays - 1);

    const createTripDto = {
      destination: 'IS',
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalBudget: 50000,
    };

    console.log('请求数据:', JSON.stringify(createTripDto, null, 2));
    console.log('');

    const createResponse = await axios.post(
      `${API_BASE_URL}/api/route-directions/templates/${templateWithPois.id}/create-trip`,
      createTripDto,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!createResponse.data.success) {
      console.error('❌ 创建行程失败:', createResponse.data.message);
      return;
    }

    const tripResult = createResponse.data.data;
    console.log(`✅ 行程创建成功! Trip ID: ${tripResult.trip.id}`);
    console.log('');

    // 4. 检查创建的行程数据
    console.log('📋 步骤4: 检查创建的行程数据...');
    console.log(`行程统计:`);
    console.log(`  总天数: ${tripResult.stats.totalDays}`);
    console.log(`  总行程项: ${tripResult.stats.totalItems}`);
    console.log(`  匹配的POI: ${tripResult.stats.placesMatched}`);
    console.log(`  缺失的POI: ${tripResult.stats.placesMissing}`);
    if (tripResult.warnings && tripResult.warnings.length > 0) {
      console.log(`  警告: ${tripResult.warnings.join(', ')}`);
    }
    console.log('');

    // 5. 检查每天的行程项
    console.log('📋 步骤5: 检查每天的行程项...');
    tripResult.generatedItems.forEach((day: any) => {
      console.log(`第${day.day}天 (${day.date}):`);
      console.log(`  行程项数量: ${day.items.length}`);
      if (day.items.length > 0) {
        day.items.forEach((item: any, index: number) => {
          console.log(`    ${index + 1}. Place ID: ${item.placeId}, 类型: ${item.type}, 时间: ${item.startTime} - ${item.endTime}`);
          if (item.note) {
            console.log(`       备注: ${item.note}`);
          }
        });
      } else {
        console.log(`    ⚠️  没有行程项!`);
      }
      console.log('');
    });

    // 6. 对比模板POI和行程项
    console.log('📋 步骤6: 对比模板POI和行程项...');
    templateWithPois.dayPlans.forEach((plan: any, index: number) => {
      const dayItems = tripResult.generatedItems[index];
      const templatePois = plan.pois || [];
      
      console.log(`第${plan.day || index + 1}天对比:`);
      console.log(`  模板POI数: ${templatePois.length}`);
      console.log(`  行程项数: ${dayItems?.items?.length || 0}`);
      
      if (templatePois.length > 0) {
        const templatePoiIds = templatePois.map((p: any) => p.id).filter((id: any) => id);
        const tripPlaceIds = (dayItems?.items || []).map((item: any) => item.placeId);
        
        const matchedIds = templatePoiIds.filter((id: number) => tripPlaceIds.includes(id));
        const missingIds = templatePoiIds.filter((id: number) => !tripPlaceIds.includes(id));
        
        console.log(`  匹配的POI: ${matchedIds.length}/${templatePoiIds.length}`);
        if (matchedIds.length > 0) {
          console.log(`    匹配的ID: ${matchedIds.join(', ')}`);
        }
        if (missingIds.length > 0) {
          console.log(`    ⚠️  缺失的POI ID: ${missingIds.join(', ')}`);
        }
      }
      console.log('');
    });

    // 7. 获取行程详情（从trips API）
    console.log('📋 步骤7: 从trips API获取行程详情...');
    const tripDetailResponse = await axios.get(
      `${API_BASE_URL}/api/trips/${tripResult.trip.id}`
    );

    if (tripDetailResponse.data.success) {
      const tripDetail = tripDetailResponse.data.data;
      console.log(`✅ 获取行程详情成功`);
      console.log(`行程天数: ${tripDetail.TripDay?.length || 0}`);
      
      if (tripDetail.TripDay && Array.isArray(tripDetail.TripDay)) {
        tripDetail.TripDay.forEach((day: any, index: number) => {
          const items = day.ItineraryItem || [];
          console.log(`  第${index + 1}天: ${items.length} 个行程项`);
        });
      }
    } else {
      console.log('⚠️  获取行程详情失败:', tripDetailResponse.data.message);
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ 测试完成');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    console.error(error);
  }
}

testCreateTripFromTemplate().catch(console.error);
