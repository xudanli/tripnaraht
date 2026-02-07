/**
 * Restaurant Direct API 简单测试脚本
 * 
 * 测试 Google Places API 集成和基本功能
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

async function testRestaurantSearch() {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY 或 GOOGLE_PLACES_API_KEY 未设置');
    process.exit(1);
  }

  console.log('🔍 测试 Restaurant Direct API...\n');

  try {
    // 测试 1: 文本搜索餐厅
    console.log('1️⃣  测试文本搜索餐厅...');
    const searchResponse = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: {
        query: 'italian restaurant',
        type: 'restaurant',
        key: GOOGLE_MAPS_API_KEY,
        language: 'en',
      },
    });

    if (searchResponse.data.status === 'OK' || searchResponse.data.status === 'ZERO_RESULTS') {
      console.log(`✅ 文本搜索成功，找到 ${searchResponse.data.results?.length || 0} 个结果`);
      if (searchResponse.data.results && searchResponse.data.results.length > 0) {
        const firstResult = searchResponse.data.results[0];
        console.log(`   第一个结果: ${firstResult.name}`);
        console.log(`   地址: ${firstResult.formatted_address || firstResult.vicinity}`);
        console.log(`   评分: ${firstResult.rating || 'N/A'}`);
        console.log(`   Place ID: ${firstResult.place_id}`);
      }
    } else {
      console.error(`❌ 文本搜索失败: ${searchResponse.data.status}`);
      if (searchResponse.data.error_message) {
        console.error(`   错误信息: ${searchResponse.data.error_message}`);
      }
    }

    console.log('\n');

    // 测试 2: 附近搜索（使用纽约坐标）
    console.log('2️⃣  测试附近搜索餐厅...');
    const nearbyResponse = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
      params: {
        location: '40.7128,-74.0060', // 纽约坐标
        radius: 5000,
        type: 'restaurant',
        key: GOOGLE_MAPS_API_KEY,
        language: 'en',
      },
    });

    if (nearbyResponse.data.status === 'OK' || nearbyResponse.data.status === 'ZERO_RESULTS') {
      console.log(`✅ 附近搜索成功，找到 ${nearbyResponse.data.results?.length || 0} 个结果`);
      if (nearbyResponse.data.results && nearbyResponse.data.results.length > 0) {
        const firstResult = nearbyResponse.data.results[0];
        console.log(`   第一个结果: ${firstResult.name}`);
        console.log(`   地址: ${firstResult.vicinity || firstResult.formatted_address}`);
        console.log(`   评分: ${firstResult.rating || 'N/A'}`);
      }
    } else {
      console.error(`❌ 附近搜索失败: ${nearbyResponse.data.status}`);
      if (nearbyResponse.data.error_message) {
        console.error(`   错误信息: ${nearbyResponse.data.error_message}`);
      }
    }

    console.log('\n');

    // 测试 3: 获取餐厅详情（如果有结果）
    if (searchResponse.data.results && searchResponse.data.results.length > 0) {
      const placeId = searchResponse.data.results[0].place_id;
      console.log(`3️⃣  测试获取餐厅详情 (Place ID: ${placeId})...`);
      
      const detailsResponse = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: {
          place_id: placeId,
          key: GOOGLE_MAPS_API_KEY,
          language: 'en',
          fields: [
            'place_id',
            'name',
            'formatted_address',
            'geometry',
            'rating',
            'user_ratings_total',
            'price_level',
            'types',
            'opening_hours',
            'photos',
            'formatted_phone_number',
            'website',
            'reviews',
          ].join(','),
        },
      });

      if (detailsResponse.data.status === 'OK') {
        const details = detailsResponse.data.result;
        console.log('✅ 获取餐厅详情成功');
        console.log(`   名称: ${details.name}`);
        console.log(`   地址: ${details.formatted_address}`);
        console.log(`   评分: ${details.rating || 'N/A'} (${details.user_ratings_total || 0} 条评价)`);
        console.log(`   价格等级: ${details.price_level ? '$'.repeat(details.price_level) : 'N/A'}`);
        console.log(`   类型: ${details.types?.slice(0, 3).join(', ') || 'N/A'}`);
        if (details.opening_hours) {
          console.log(`   现在营业: ${details.opening_hours.open_now ? '是' : '否'}`);
        }
        if (details.formatted_phone_number) {
          console.log(`   电话: ${details.formatted_phone_number}`);
        }
        if (details.website) {
          console.log(`   网站: ${details.website}`);
        }
        if (details.reviews && details.reviews.length > 0) {
          console.log(`   评价数量: ${details.reviews.length}`);
        }
      } else {
        console.error(`❌ 获取餐厅详情失败: ${detailsResponse.data.status}`);
        if (detailsResponse.data.error_message) {
          console.error(`   错误信息: ${detailsResponse.data.error_message}`);
        }
      }
    }

    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   请求错误:', error.request);
    } else {
      console.error('   错误详情:', error);
    }
    process.exit(1);
  }
}

// 运行测试
testRestaurantSearch().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
