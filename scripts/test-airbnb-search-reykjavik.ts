#!/usr/bin/env node

/**
 * 测试搜索雷克雅未克的 Airbnb 房源
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AirbnbMcpClientConnectAPI } from '../src/mcp/airbnb-client-connect-api';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function searchReykjavik() {
  const apiKey = process.env.SMITHERY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 未设置 SMITHERY_API_KEY 环境变量');
    console.error('\n请设置环境变量:');
    console.error('  SMITHERY_API_KEY=your-api-key-here');
    console.error('\n获取 API Key: https://smithery.ai/account/api-keys\n');
    process.exit(1);
  }

  // 尝试加载保存的 connectionId
  const configDir = path.join(os.homedir(), '.tripnara-mcp');
  const connectionIdFile = path.join(configDir, 'airbnb-connection-id.txt');
  
  let savedConnectionId: string | undefined;
  if (fs.existsSync(connectionIdFile)) {
    savedConnectionId = fs.readFileSync(connectionIdFile, 'utf-8').trim();
    console.log(`📋 使用保存的 connectionId: ${savedConnectionId}\n`);
  }

  const client = new AirbnbMcpClientConnectAPI(undefined, savedConnectionId);

  try {
    console.log('🔌 正在连接到 Airbnb MCP 服务器...\n');
    await client.connect();
    console.log('✅ 连接成功！\n');

    // 保存 connectionId
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    if (client.getConnectionId()) {
      fs.writeFileSync(connectionIdFile, client.getConnectionId()!);
      console.log(`💾 已保存 connectionId: ${client.getConnectionId()}\n`);
    }

    console.log('🔍 搜索雷克雅未克的 Airbnb 房源...\n');
    
    // 搜索雷克雅未克的房源
    // 注意：添加 ignoreRobotsText: true 以绕过 robots.txt 限制（仅用于测试）
    const searchResult = await client.callTool('airbnb_search', {
      location: 'Reykjavik, Iceland',
      adults: 2,
      checkin: undefined, // 不指定日期，使用默认
      checkout: undefined,
      children: 0,
      infants: 0,
      pets: 0,
      page: 1,
      ignoreRobotsText: true, // 绕过 robots.txt 限制（仅用于测试）
    });

    // 解析并格式化搜索结果
    if (searchResult && !searchResult.isError && searchResult.content) {
      const content = searchResult.content[0];
      if (content.type === 'text') {
        try {
          const data = JSON.parse(content.text);
          
          if (data.error) {
            console.error('❌ 搜索错误:', data.error);
            if (data.suggestion) {
              console.log('💡 建议:', data.suggestion);
            }
            return;
          }
          
          const results = data.searchResults || [];
          console.log(`\n✅ 找到 ${results.length} 个房源:\n`);
          
          // 显示前 10 个房源
          const displayCount = Math.min(10, results.length);
          for (let i = 0; i < displayCount; i++) {
            const listing = results[i];
            const name = listing.demandStayListing?.description?.name?.localizedStringWithTranslationPreference || '未知名称';
            const url = listing.url || '';
            const price = listing.structuredDisplayPrice?.primaryLine?.accessibilityLabel || '价格未知';
            const rating = listing.avgRatingA11yLabel || '无评分';
            const badges = listing.badges || '';
            const primaryLine = listing.structuredContent?.primaryLine || '';
            const location = listing.demandStayListing?.location?.coordinate;
            
            console.log(`${i + 1}. ${name}`);
            if (badges) {
              console.log(`   🏷️  标签: ${badges}`);
            }
            console.log(`   📍 ${primaryLine}`);
            console.log(`   ⭐ ${rating}`);
            console.log(`   💰 ${price}`);
            if (location) {
              console.log(`   📌 坐标: ${location.latitude}, ${location.longitude}`);
            }
            console.log(`   🔗 ${url}`);
            console.log('');
          }
          
          if (results.length > displayCount) {
            console.log(`... 还有 ${results.length - displayCount} 个房源未显示\n`);
          }
          
          // 尝试获取第一个房源的详细信息
          if (results.length > 0) {
            const firstListing = results[0];
            const listingId = firstListing.id;
            
            console.log('🏠 获取第一个房源的详细信息...\n');
            
            try {
              const detailsResult = await client.callTool('airbnb_listing_details', {
                listingId: listingId,
                ignoreRobotsText: true,
              });
              
              if (detailsResult && !detailsResult.isError && detailsResult.content) {
                const detailsContent = detailsResult.content[0];
                if (detailsContent.type === 'text') {
                  const detailsData = JSON.parse(detailsContent.text);
                  console.log('📋 房源详情:');
                  console.log(JSON.stringify(detailsData, null, 2));
                }
              }
            } catch (detailsError: any) {
              console.log(`⚠️  获取详情失败: ${detailsError.message}`);
            }
          }
          
        } catch (e: any) {
          console.error('❌ 解析搜索结果失败:', e.message);
          console.log('\n原始结果:');
          console.log(JSON.stringify(searchResult, null, 2));
        }
      }
    } else {
      console.log('📊 搜索结果:');
      console.log(JSON.stringify(searchResult, null, 2));
    }

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈:', error.stack);
    }
    process.exit(1);
  } finally {
    await client.disconnect();
    console.log('\n✅ 已断开连接');
  }
}

searchReykjavik().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
