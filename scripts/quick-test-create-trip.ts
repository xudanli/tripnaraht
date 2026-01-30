#!/usr/bin/env tsx
/**
 * 快速测试：从模板创建Trip
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

async function quickTest() {
  try {
    console.log('📋 从模板36创建Trip...\n');
    
    const response = await axios.post(
      `${API_BASE_URL}/api/route-directions/templates/36/create-trip`,
      {
        destination: 'IS',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        totalBudget: 50000,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      const tripId = response.data.data.trip.id;
      console.log(`✅ Trip创建成功!`);
      console.log(`   Trip ID: ${tripId}`);
      console.log(`   天数: ${response.data.data.stats.totalDays}`);
      console.log(`   行程项: ${response.data.data.stats.totalItems}`);
      console.log(`   匹配的POI: ${response.data.data.stats.placesMatched}`);
      console.log(`   缺失的POI: ${response.data.data.stats.placesMissing || 0}`);
      console.log('');
      console.log(`📋 验证命令:`);
      console.log(`   npx tsx scripts/check-trip-vs-template.ts ${tripId}`);
    } else {
      console.error('❌ 创建失败:', response.data.message);
    }
  } catch (error: any) {
    if (error.response) {
      console.error('❌ API错误:', error.response.status, error.response.data);
    } else {
      console.error('❌ 错误:', error.message);
    }
  }
}

quickTest();
