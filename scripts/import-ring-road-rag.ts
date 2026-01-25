#!/usr/bin/env ts-node
/**
 * 导入冰岛环岛公路RAG文档
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const ROUTE_FILE = path.join(__dirname, '../data/iceland/ring-road-route-rag.json');

async function importRouteDocument() {
  console.log('📖 读取路线文档...');
  const routeData = JSON.parse(fs.readFileSync(ROUTE_FILE, 'utf-8'));

  console.log('🚀 开始导入RAG文档...');
  console.log(`   端点: ${BASE_URL}/api/rag/index/batch`);
  console.log(`   路线ID: ${routeData.route?.route_id || 'unknown'}`);
  console.log(`   路线名称: ${routeData.route?.route_name || 'unknown'}`);

  try {
    const response = await axios.post(
      `${BASE_URL}/api/rag/index/batch`,
      routeData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 300000, // 5分钟超时
      }
    );

    console.log('✅ 导入成功！');
    console.log(`   生成的文档数量: ${response.data.count}`);
    console.log(`   文档IDs: ${JSON.stringify(response.data.ids, null, 2)}`);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      console.error('❌ API错误:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('❌ 请求超时或网络错误:', error.message);
    } else {
      console.error('❌ 错误:', error.message);
    }
    throw error;
  }
}

// 执行导入
importRouteDocument()
  .then(() => {
    console.log('\n✨ 完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 导入失败:', error.message);
    process.exit(1);
  });
