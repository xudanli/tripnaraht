#!/usr/bin/env tsx
/**
 * 测试更新路线模板的 requiredNodes 字段
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

async function testUpdateRequiredNodes() {
  console.log('='.repeat(70));
  console.log('🧪 测试更新路线模板的 requiredNodes 字段');
  console.log('='.repeat(70));
  console.log('');

  const templateId = 36; // 替换为实际的模板ID

  // 测试数据
  const updateData = {
    dayPlans: [
      {
        day: 1,
        theme: '测试主题 - 第1天',
        requiredNodes: ['381117', '381108'],
      },
      {
        day: 2,
        theme: '测试主题 - 第2天',
        requiredNodes: ['381037'],
      },
      {
        day: 3,
        theme: '',
        requiredNodes: [],
      },
      {
        day: 4,
        theme: '',
        requiredNodes: [],
      },
      {
        day: 5,
        theme: '',
        requiredNodes: [],
      },
    ],
  };

  try {
    console.log('📤 发送更新请求...');
    console.log('请求数据:', JSON.stringify(updateData, null, 2));
    console.log('');

    // 1. 更新模板
    const updateResponse = await axios.put(
      `${API_BASE_URL}/route-directions/templates/${templateId}`,
      updateData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✅ 更新成功');
    console.log('响应状态:', updateResponse.status);
    console.log('');

    // 2. 验证保存结果
    console.log('🔍 验证保存结果...');
    const getResponse = await axios.get(
      `${API_BASE_URL}/route-directions/templates/${templateId}`,
    );

    const template = getResponse.data.data;
    const dayPlans = template.dayPlans;

    console.log('返回的 dayPlans:');
    console.log(JSON.stringify(dayPlans, null, 2));
    console.log('');

    // 3. 检查 requiredNodes
    console.log('📋 检查 requiredNodes 字段:');
    let allValid = true;

    dayPlans.forEach((plan: any, index: number) => {
      const expected = updateData.dayPlans[index];
      const hasRequiredNodes = 'requiredNodes' in plan;
      const matches = JSON.stringify(plan.requiredNodes) === JSON.stringify(expected.requiredNodes);

      console.log(`  第${plan.day}天:`);
      console.log(`    期望: ${JSON.stringify(expected.requiredNodes)}`);
      console.log(`    实际: ${JSON.stringify(plan.requiredNodes)}`);
      console.log(`    字段存在: ${hasRequiredNodes ? '✅' : '❌'}`);
      console.log(`    值匹配: ${matches ? '✅' : '❌'}`);
      console.log('');

      if (!hasRequiredNodes || !matches) {
        allValid = false;
      }
    });

    if (allValid) {
      console.log('✅ 所有 requiredNodes 字段都正确保存！');
    } else {
      console.log('❌ 部分 requiredNodes 字段保存失败！');
    }

    console.log('');
    console.log('='.repeat(70));
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testUpdateRequiredNodes().catch(console.error);
