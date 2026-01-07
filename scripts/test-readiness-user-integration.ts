#!/usr/bin/env ts-node
/**
 * 测试准备度接口与用户偏好集成
 * 
 * 测试场景：
 * 1. 更新用户偏好（添加 nationality, residencyCountry, tags）
 * 2. 测试准备度接口（带用户认证）
 * 3. 验证用户信息是否正确传递到准备度检查
 */

import axios from 'axios';
import { Logger } from '@nestjs/common';

const logger = new Logger('ReadinessUserIntegrationTest');
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_PREFIX = '/api';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  logger.warn('⚠️  未提供认证Token，部分测试将跳过');
  logger.warn('   使用方法: ACCESS_TOKEN=your_token ts-node scripts/test-readiness-user-integration.ts');
}

const axiosInstance = axios.create({
  baseURL: BASE_URL + API_PREFIX,
  headers: {
    'Content-Type': 'application/json',
    ...(ACCESS_TOKEN && { 'Authorization': `Bearer ${ACCESS_TOKEN}` }),
  },
});

interface TestResult {
  name: string;
  passed: boolean;
  statusCode?: number;
  error?: string;
  data?: any;
}

async function runTest(name: string, fn: () => Promise<any>): Promise<TestResult> {
  logger.log(`\n📋 测试: ${name}`);
  try {
    const response = await fn();
    logger.log('✅ 成功');
    return { name, passed: true, statusCode: response.status, data: response.data };
  } catch (error: any) {
    logger.error('❌ 失败');
    logger.error(`   错误: ${error.message}`);
    if (error.response) {
      logger.error(`   状态码: ${error.response.status}`);
      logger.error(`   响应: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return {
      name,
      passed: false,
      statusCode: error.response?.status,
      error: error.message,
      data: error.response?.data,
    };
  }
}

async function testGetUserProfile(): Promise<any> {
  if (!ACCESS_TOKEN) {
    throw new Error('需要认证Token');
  }
  return axiosInstance.get('/users/profile');
}

async function testUpdateUserProfile(preferences: any): Promise<any> {
  if (!ACCESS_TOKEN) {
    throw new Error('需要认证Token');
  }
  return axiosInstance.put('/users/profile', { preferences });
}

async function testCheckReadinessWithUserInfo(): Promise<any> {
  return axiosInstance.post('/readiness/check', {
    destinationId: 'IS',
    traveler: {
      nationality: 'CN',
      residencyCountry: 'CN',
      tags: ['solo'],
    },
    itinerary: {
      countries: ['IS'],
      activities: ['hiking', 'outdoor', 'volcano'],
      season: 'winter',
    },
  });
}

async function testGetTripReadiness(tripId: string): Promise<any> {
  return axiosInstance.get(`/readiness/trip/${tripId}`);
}

async function main() {
  logger.log('🚀 开始测试准备度接口与用户偏好集成');
  logger.log(`📍 基础URL: ${BASE_URL}`);
  logger.log('');

  const results: TestResult[] = [];

  // 测试1: 获取当前用户偏好
  if (ACCESS_TOKEN) {
    results.push(await runTest('GET /users/profile (获取用户偏好)', () =>
      testGetUserProfile()
    ));

    // 测试2: 更新用户偏好（添加新字段）
    results.push(await runTest('PUT /users/profile (更新用户偏好)', () =>
      testUpdateUserProfile({
        nationality: 'CN',
        residencyCountry: 'CN',
        tags: ['solo', 'adventure'],
        travelPreferences: {
          budget: 'MEDIUM',
          pace: 'MODERATE',
        },
      })
    ));

    // 测试3: 再次获取用户偏好，验证更新
    results.push(await runTest('GET /users/profile (验证更新)', () =>
      testGetUserProfile()
    ));
  } else {
    logger.warn('⚠️  跳过需要认证的测试');
  }

  // 测试4: 手动检查准备度（带用户信息）
  results.push(await runTest('POST /readiness/check (带用户信息)', () =>
    testCheckReadinessWithUserInfo()
  ));

  // 测试5: 根据行程ID检查准备度（如果提供了行程ID）
  const tripId = process.argv[2] || process.env.TRIP_ID;
  if (tripId) {
    results.push(await runTest(`GET /readiness/trip/${tripId} (带用户认证)`, () =>
      testGetTripReadiness(tripId)
    ));
  } else {
    logger.warn('⚠️  跳过行程ID测试（提供 tripId 作为参数或设置 TRIP_ID 环境变量）');
  }

  // 汇总结果
  logger.log('\n' + '='.repeat(60));
  logger.log('📊 测试结果汇总');
  logger.log('='.repeat(60));

  const successCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  results.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    const status = result.statusCode ? ` [${result.statusCode}]` : '';
    logger.log(`${index + 1}. ${icon} ${result.name}${status}`);
    if (!result.passed) {
      logger.error(`   错误: ${result.error}`);
    } else if (result.data) {
      // 显示关键数据
      if (result.name.includes('profile')) {
        const prefs = result.data.data?.preferences;
        if (prefs) {
          logger.log(`   国籍: ${prefs.nationality || '未设置'}`);
          logger.log(`   居住国: ${prefs.residencyCountry || '未设置'}`);
          logger.log(`   标签: ${prefs.tags?.join(', ') || '未设置'}`);
        }
      } else if (result.name.includes('readiness')) {
        const findings = result.data.data?.findings?.[0];
        if (findings) {
          logger.log(`   阻塞项: ${findings.blockers?.length || 0}`);
          logger.log(`   必须项: ${findings.must?.length || 0}`);
          logger.log(`   风险: ${findings.risks?.length || 0}`);
        }
      }
    }
  });

  logger.log('\n' + '-'.repeat(60));
  logger.log(`总计: ${successCount}/${totalCount} 通过`);
  logger.log('-'.repeat(60));

  if (successCount === totalCount) {
    logger.log('🎉 所有测试通过！');
  } else {
    logger.warn('⚠️  部分测试失败');
    process.exit(1);
  }
}

main().catch(e => {
  logger.error('测试过程中发生未捕获的错误:', e);
  process.exit(1);
});

