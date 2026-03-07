#!/usr/bin/env npx tsx
/**
 * 测试 POST /api/vision/poi-recommend 接口
 *
 * 功能：上传图片做 OCR，再根据位置搜索附近 POI
 * 请求：multipart/form-data，包含 image、lat、lng、locale
 * 响应：ocrResult、candidates、suggestions
 *
 * 用法: API_BASE_URL=http://localhost:3000 npx tsx scripts/test-vision-poi-recommend-api.ts [图片路径]
 * 若不传图片路径，使用内建的最小 PNG（1x1 像素）作为测试
 */

import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// 最小有效 PNG（1x1 像素，透明）
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function getTestImage(imagePath?: string): Promise<Buffer> {
  if (imagePath) {
    const resolved = path.resolve(imagePath);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved);
    }
    console.warn(`⚠️  图片不存在: ${resolved}，使用内建测试图`);
  }
  return Buffer.from(MINIMAL_PNG_BASE64, 'base64');
}

async function poiRecommend(
  image: Buffer,
  lat: number,
  lng: number,
  locale?: string
) {
  const form = new FormData();
  form.append('image', image, {
    filename: 'test.png',
    contentType: 'image/png',
  });
  form.append('lat', String(lat));
  form.append('lng', String(lng));
  if (locale) form.append('locale', locale);

  const { data } = await axios.post(`${BASE}/api/vision/poi-recommend`, form, {
    headers: {
      ...form.getHeaders(),
    },
    timeout: 30000,
  });
  return data;
}

async function main() {
  console.log('=== 测试 POST /api/vision/poi-recommend ===\n');
  console.log(`API: ${BASE}/api/vision/poi-recommend`);
  console.log('参数: image, lat=35.6762, lng=139.6503, locale=zh-CN\n');

  const imagePath = process.argv[2];
  const image = await getTestImage(imagePath);
  console.log(`📷 图片: ${imagePath || '内建 1x1 PNG'} (${image.length} bytes)\n`);

  try {
    const result = await poiRecommend(
      image,
      35.6762, // 东京塔附近
      139.6503,
      'zh-CN'
    );

    console.log('✅ 响应成功\n');
    console.log('--- success:', result.success);
    if (result.error) {
      console.log('--- error:', result.error);
    }
    if (result.data) {
      const { ocrResult, candidates, suggestions } = result.data;
      console.log('\n--- ocrResult ---');
      console.log('  fullText:', ocrResult?.fullText?.slice(0, 100) ?? '(无)');
      console.log('  lines:', ocrResult?.lines?.length ?? 0, '行');

      console.log('\n--- candidates (附近 POI) ---');
      console.log('  数量:', candidates?.length ?? 0);
      (candidates || []).slice(0, 5).forEach((c: any, i: number) => {
        console.log(
          `  [${i + 1}] ${c.name ?? c.id} - 距离 ${c.distanceM ?? '?'}m, 评分 ${c.rating ?? '?'}`
        );
      });

      console.log('\n--- suggestions ---');
      console.log('  数量:', suggestions?.length ?? 0);
      (suggestions || []).slice(0, 3).forEach((s: any, i: number) => {
        console.log(`  [${i + 1}] ${s.title} (confidence: ${s.confidence})`);
      });
    }

    console.log('\n=== 测试完成 ===');
  } catch (err: any) {
    console.error('❌ 请求失败:', err.message || err.code || String(err));
    if (err.code === 'ECONNREFUSED') {
      console.error('   请确认服务已启动: npm run dev');
    }
    if (err.response) {
      console.error('   status:', err.response.status);
      console.error('   data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
