/**
 * Image Direct API 简单测试脚本
 * 
 * 测试 Pexels API 和 Unsplash API 集成和基本功能
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const UNSPLASH_API_KEY = process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY;

async function testImageAPI() {
  if (!PEXELS_API_KEY && !UNSPLASH_API_KEY) {
    console.error('❌ PEXELS_API_KEY 或 UNSPLASH_ACCESS_KEY 未设置');
    console.error('💡 提示:');
    console.error('   - Pexels API: 注册 https://www.pexels.com/api/ 获取免费 API Key');
    console.error('   - Unsplash API: 注册 https://unsplash.com/developers 获取 Access Key');
    process.exit(1);
  }

  console.log('🔍 测试 Image Direct API...');
  if (PEXELS_API_KEY) {
    console.log(`📝 Pexels API Key: ${PEXELS_API_KEY.substring(0, 20)}...`);
  } else {
    console.log('⚠️  Pexels API Key 未设置（将使用 Unsplash 作为备选）');
  }
  if (UNSPLASH_API_KEY) {
    console.log(`📝 Unsplash API Key: ${UNSPLASH_API_KEY.substring(0, 20)}...`);
  } else {
    console.log('⚠️  Unsplash API Key 未设置');
  }
  console.log('');

  try {
    // 优先测试 Pexels
    if (PEXELS_API_KEY) {
      console.log('1️⃣  测试 Pexels API - 搜索图片...');
      try {
        const pexelsResponse = await axios.get('https://api.pexels.com/v1/search', {
          params: {
            query: 'nature',
            per_page: 5,
          },
          headers: {
            'Authorization': PEXELS_API_KEY,
          },
          timeout: 10000,
        });

        if (pexelsResponse.data && pexelsResponse.data.photos) {
          console.log(`✅ Pexels API 搜索成功`);
          console.log(`   找到 ${pexelsResponse.data.total_results} 张图片`);
          console.log(`   返回 ${pexelsResponse.data.photos.length} 张`);
          if (pexelsResponse.data.photos.length > 0) {
            const firstPhoto = pexelsResponse.data.photos[0];
            console.log(`   第一张图片:`);
            console.log(`     ID: ${firstPhoto.id}`);
            console.log(`     摄影师: ${firstPhoto.photographer}`);
            console.log(`     尺寸: ${firstPhoto.width}x${firstPhoto.height}`);
            console.log(`     描述: ${firstPhoto.alt || 'N/A'}`);
          }
        } else {
          console.error(`❌ Pexels API 响应格式不正确`);
        }
      } catch (pexelsError: any) {
        console.error(`❌ Pexels API 测试失败: ${pexelsError.message}`);
        if (pexelsError.response) {
          console.error(`   状态码: ${pexelsError.response.status}`);
          console.error(`   响应: ${JSON.stringify(pexelsError.response.data, null, 2)}`);
        } else if (pexelsError.code === 'ECONNABORTED' || pexelsError.message.includes('timeout')) {
          console.error(`   网络超时: 可能是网络连接问题或代理配置问题`);
        }
      }

      console.log('\n');

      // 测试 Pexels Curated
      console.log('2️⃣  测试 Pexels API - 获取推荐图片...');
      try {
        const curatedResponse = await axios.get('https://api.pexels.com/v1/curated', {
          params: {
            per_page: 3,
          },
          headers: {
            'Authorization': PEXELS_API_KEY,
          },
          timeout: 10000,
        });

        if (curatedResponse.data && curatedResponse.data.photos) {
          console.log(`✅ Pexels API 推荐图片成功`);
          console.log(`   返回 ${curatedResponse.data.photos.length} 张推荐图片`);
        } else {
          console.error(`❌ Pexels API 推荐图片响应格式不正确`);
        }
      } catch (curatedError: any) {
        console.error(`❌ Pexels API 推荐图片失败: ${curatedError.message}`);
      }
    }

    console.log('\n');

    // 测试 Unsplash（如果 Pexels 不可用或作为备选）
    if (UNSPLASH_API_KEY) {
      console.log('3️⃣  测试 Unsplash API - 搜索图片...');
      try {
        const unsplashResponse = await axios.get('https://api.unsplash.com/search/photos', {
          params: {
            query: 'travel',
            per_page: 5,
          },
          headers: {
            'Authorization': `Client-ID ${UNSPLASH_API_KEY}`,
          },
          timeout: 10000,
        });

        if (unsplashResponse.data && unsplashResponse.data.results) {
          console.log(`✅ Unsplash API 搜索成功`);
          console.log(`   找到 ${unsplashResponse.data.total || unsplashResponse.data.results.length} 张图片`);
          console.log(`   返回 ${unsplashResponse.data.results.length} 张`);
          if (unsplashResponse.data.results.length > 0) {
            const firstPhoto = unsplashResponse.data.results[0];
            console.log(`   第一张图片:`);
            console.log(`     ID: ${firstPhoto.id}`);
            console.log(`     摄影师: ${firstPhoto.user?.name || 'Unknown'}`);
            console.log(`     尺寸: ${firstPhoto.width}x${firstPhoto.height}`);
            console.log(`     描述: ${firstPhoto.description || firstPhoto.alt_description || 'N/A'}`);
          }
        } else {
          console.error(`❌ Unsplash API 响应格式不正确`);
        }
      } catch (unsplashError: any) {
        console.error(`❌ Unsplash API 测试失败: ${unsplashError.message}`);
        if (unsplashError.response) {
          console.error(`   状态码: ${unsplashError.response.status}`);
          console.error(`   响应: ${JSON.stringify(unsplashError.response.data, null, 2)}`);
        } else if (unsplashError.code === 'ECONNABORTED' || unsplashError.message.includes('timeout')) {
          console.error(`   网络超时: 可能是网络连接问题或代理配置问题`);
          console.error(`   建议: 检查网络连接、代理设置，或增加超时时间`);
        }
      }
    }

    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   网络错误: 请求已发送但未收到响应');
      console.error('   可能原因:');
      console.error('     1. 网络连接问题（代理/防火墙）');
      console.error('     2. API Key 无效或未启用');
      console.error('     3. API 配额已用完');
    } else {
      console.error('   错误详情:', error.message);
      if (error.stack) {
        console.error('   堆栈:', error.stack);
      }
    }
    process.exit(1);
  }
}

// 运行测试
testImageAPI().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
