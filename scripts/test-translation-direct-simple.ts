/**
 * Translation Direct API 简单测试脚本
 * 
 * 测试 Google Translate API 集成和基本功能
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GOOGLE_TRANSLATE_API_KEY = 
  process.env.GOOGLE_TRANSLATE_API_KEY || 
  process.env.GOOGLE_MAPS_API_KEY;

async function testTranslation() {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    console.error('❌ GOOGLE_TRANSLATE_API_KEY 或 GOOGLE_MAPS_API_KEY 未设置');
    process.exit(1);
  }

  console.log('🔍 测试 Translation Direct API...');
  console.log(`📝 API Key: ${GOOGLE_TRANSLATE_API_KEY.substring(0, 20)}...\n`);

  try {
    // 测试 1: 翻译单个文本（使用 GET 请求，Google Translate API v2 支持 GET）
    console.log('1️⃣  测试翻译单个文本（GET 请求）...');
    const translateResponse = await axios.get(
      'https://translation.googleapis.com/language/translate/v2',
      {
        params: {
          q: 'Hello, world!',
          target: 'zh',
          key: GOOGLE_TRANSLATE_API_KEY,
        },
        timeout: 10000, // 10 秒超时
      }
    );

    if (translateResponse.data && translateResponse.data.data && translateResponse.data.data.translations) {
      const translation = translateResponse.data.data.translations[0];
      console.log(`✅ 翻译成功`);
      console.log(`   原文: Hello, world!`);
      console.log(`   译文: ${translation.translatedText}`);
      if (translation.detectedSourceLanguage) {
        console.log(`   检测到的源语言: ${translation.detectedSourceLanguage}`);
      }
    } else {
      console.error(`❌ 翻译失败: 响应格式不正确`);
      console.error(`   响应数据:`, JSON.stringify(translateResponse.data, null, 2));
    }

    console.log('\n');

    // 测试 2: 批量翻译（使用 GET 请求）
    console.log('2️⃣  测试批量翻译（GET 请求）...');
    // 注意：批量翻译需要将数组转换为多个 q 参数
    const batchTranslateResponse = await axios.get(
      'https://translation.googleapis.com/language/translate/v2',
      {
        params: {
          q: ['Good morning', 'How are you?', 'Thank you'],
          target: 'ja',
          key: GOOGLE_TRANSLATE_API_KEY,
        },
        timeout: 10000,
      }
    );

    if (batchTranslateResponse.data && batchTranslateResponse.data.data && batchTranslateResponse.data.data.translations) {
      const translations = batchTranslateResponse.data.data.translations;
      console.log(`✅ 批量翻译成功，翻译了 ${translations.length} 条文本`);
      translations.forEach((translation: any, index: number) => {
        console.log(`   ${index + 1}. ${translation.translatedText}`);
      });
    } else {
      console.error(`❌ 批量翻译失败: 响应格式不正确`);
    }

    console.log('\n');

    // 测试 3: 检测语言（使用 GET 请求）
    console.log('3️⃣  测试语言检测（GET 请求）...');
    const detectResponse = await axios.get(
      'https://translation.googleapis.com/language/translate/v2/detect',
      {
        params: {
          q: 'Bonjour le monde',
          key: GOOGLE_TRANSLATE_API_KEY,
        },
        timeout: 10000,
      }
    );

    if (detectResponse.data && detectResponse.data.data && detectResponse.data.data.detections) {
      const detections = detectResponse.data.data.detections[0];
      if (detections && detections.length > 0) {
        const detection = detections[0];
        console.log(`✅ 语言检测成功`);
        console.log(`   文本: Bonjour le monde`);
        console.log(`   检测到的语言: ${detection.language}`);
        console.log(`   置信度: ${detection.confidence || 'N/A'}`);
      } else {
        console.error(`❌ 语言检测失败: 未检测到语言`);
      }
    } else {
      console.error(`❌ 语言检测失败: 响应格式不正确`);
    }

    console.log('\n');

    // 测试 4: 获取支持的语言列表
    console.log('4️⃣  测试获取支持的语言列表...');
    const languagesResponse = await axios.get(
      'https://translation.googleapis.com/language/translate/v2/languages',
      {
        params: {
          key: GOOGLE_TRANSLATE_API_KEY,
          target: 'zh', // 获取中文名称
        },
        timeout: 10000,
      }
    );

    if (languagesResponse.data && languagesResponse.data.data && languagesResponse.data.data.languages) {
      const languages = languagesResponse.data.data.languages;
      console.log(`✅ 获取语言列表成功，共 ${languages.length} 种语言`);
      console.log(`   前 10 种语言:`);
      languages.slice(0, 10).forEach((lang: any) => {
        console.log(`     - ${lang.language}: ${lang.name || 'N/A'}`);
      });
    } else {
      console.error(`❌ 获取语言列表失败: 响应格式不正确`);
    }

    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
      if (error.response.data?.error) {
        console.error('   API 错误:', error.response.data.error.message || error.response.data.error);
      }
    } else if (error.request) {
      console.error('   网络错误: 请求已发送但未收到响应');
      console.error('   可能原因:');
      console.error('     1. 网络连接问题（代理/防火墙）');
      console.error('     2. API Key 无效或未启用 Google Translate API');
      console.error('     3. API 配额已用完');
      console.error('   建议:');
      console.error('     - 检查网络连接和代理设置');
      console.error('     - 验证 API Key 是否正确');
      console.error('     - 确认 Google Cloud 项目中已启用 Translation API');
      console.error('     - 检查 API 配额和计费设置');
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
testTranslation().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
