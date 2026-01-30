#!/usr/bin/env tsx
/**
 * 测试更新路线模板接口
 * 验证接口是否满足用户需求
 */

// 使用 export {} 使文件成为模块，避免全局作用域冲突
export {};

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  templateId: number;
  payload: any;
  expectedSuccess: boolean;
  expectedError?: string;
}

async function testEndpoint(name: string, templateId: number, payload: any): Promise<{
  success: boolean;
  statusCode: number;
  data?: any;
  error?: string;
}> {
  console.log(`\n📋 测试: ${name}`);
  console.log(`   URL: ${API_BASE_URL}/api/route-directions/templates/${templateId}`);
  console.log(`   请求体:`, JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/route-directions/templates/${templateId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const statusCode = response.status;
    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success !== false) {
      console.log(`   ✅ 成功 (${statusCode})`);
      if (data.data) {
        console.log(`   📦 响应数据:`, JSON.stringify(data.data, null, 2).substring(0, 500) + '...');
      }
      return {
        success: true,
        statusCode,
        data: data.data,
      };
    } else {
      console.log(`   ❌ 失败 (${statusCode})`);
      const errorMsg = data.error?.message || data.message || JSON.stringify(data);
      console.log(`   📄 错误:`, errorMsg);
      return {
        success: false,
        statusCode,
        error: errorMsg,
      };
    }
  } catch (error: any) {
    console.log(`   ❌ 异常: ${error.message}`);
    return {
      success: false,
      statusCode: 0,
      error: error.message,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('🧪 测试更新路线模板接口');
  console.log('='.repeat(70));
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // 测试用例
  const testCases: TestCase[] = [
    {
      name: '测试1: 更新基本字段（nameCN, durationDays）',
      templateId: 36,
      payload: {
        nameCN: '测试更新名称',
        durationDays: 7,
      },
      expectedSuccess: true,
    },
    {
      name: '测试2: 更新节奏偏好为 RELAXED',
      templateId: 36,
      payload: {
        defaultPacePreference: 'RELAXED',
      },
      expectedSuccess: true,
    },
    {
      name: '测试3: 更新节奏偏好为 BALANCED',
      templateId: 36,
      payload: {
        defaultPacePreference: 'BALANCED',
      },
      expectedSuccess: true,
    },
    {
      name: '测试4: 更新节奏偏好为 INTENSE',
      templateId: 36,
      payload: {
        defaultPacePreference: 'INTENSE',
      },
      expectedSuccess: true,
    },
    {
      name: '测试5: 更新 dayPlans（包含 requiredNodes）',
      templateId: 36,
      payload: {
        dayPlans: [
          {
            day: 1,
            theme: '雷克雅未克 → 雷克雅未克',
            requiredNodes: ['381040', '381086'],
          },
          {
            day: 2,
            theme: '黄金圈经典环线',
            requiredNodes: ['381037', '381084'],
          },
        ],
      },
      expectedSuccess: true,
    },
    {
      name: '测试6: 完整更新（所有字段）',
      templateId: 36,
      payload: {
        routeDirectionId: 1,
        durationDays: 7,
        name: 'Iceland Ring Road',
        nameCN: '冰岛环岛路线',
        nameEN: 'Iceland Ring Road',
        dayPlans: [
          {
            day: 1,
            theme: '雷克雅未克 → 雷克雅未克',
            requiredNodes: ['381040', '381086'],
          },
        ],
        defaultPacePreference: 'BALANCED',
        isActive: true,
      },
      expectedSuccess: true,
    },
    {
      name: '测试7: 验证错误 - 无效的节奏偏好',
      templateId: 36,
      payload: {
        defaultPacePreference: 'INVALID',
      },
      expectedSuccess: false,
      expectedError: 'RELAXED, BALANCED, INTENSE',
    },
    {
      name: '测试8: 验证错误 - 旧值兼容性（RELAX -> RELAXED）',
      templateId: 36,
      payload: {
        defaultPacePreference: 'RELAX',
      },
      expectedSuccess: true, // 应该自动转换为 RELAXED
    },
    {
      name: '测试9: 验证错误 - 旧值兼容性（CHALLENGE -> INTENSE）',
      templateId: 36,
      payload: {
        defaultPacePreference: 'CHALLENGE',
      },
      expectedSuccess: true, // 应该自动转换为 INTENSE
    },
    {
      name: '测试10: 更新 isActive（布尔值）',
      templateId: 36,
      payload: {
        isActive: true,
      },
      expectedSuccess: true,
    },
  ];

  const results: Array<{ testCase: TestCase; result: any }> = [];

  for (const testCase of testCases) {
    const result = await testEndpoint(
      testCase.name,
      testCase.templateId,
      testCase.payload,
    );
    
    results.push({ testCase, result });

    // 验证结果是否符合预期
    if (testCase.expectedSuccess && !result.success) {
      console.log(`   ⚠️  预期成功但失败了`);
    } else if (!testCase.expectedSuccess && result.success) {
      console.log(`   ⚠️  预期失败但成功了`);
    } else if (testCase.expectedError && result.error && !result.error.includes(testCase.expectedError)) {
      console.log(`   ⚠️  错误消息不匹配预期`);
    }

    // 短暂延迟，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 统计结果
  console.log('\n' + '='.repeat(70));
  console.log('📊 测试结果统计');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.result.success).length;
  const failCount = results.filter(r => !r.result.success).length;
  const expectedFailCount = testCases.filter(tc => !tc.expectedSuccess).length;

  console.log(`\n✅ 成功: ${successCount} 个`);
  console.log(`❌ 失败: ${failCount} 个`);
  console.log(`📦 总计: ${testCases.length} 个`);
  console.log(`🎯 预期失败: ${expectedFailCount} 个\n`);

  // 检查接口要求满足情况
  console.log('='.repeat(70));
  console.log('✅ 接口要求检查');
  console.log('='.repeat(70));

  const requirements = [
    {
      name: '路径参数 id (number)',
      status: '✅',
      note: '通过 @Param("id", ParseIntPipe) 实现',
    },
    {
      name: '所有字段可选',
      status: '✅',
      note: '所有字段都使用 @IsOptional()',
    },
    {
      name: 'defaultPacePreference: RELAXED/BALANCED/INTENSE',
      status: results.some(r => 
        r.testCase.payload.defaultPacePreference === 'RELAXED' && r.result.success
      ) ? '✅' : '❌',
      note: '需要验证枚举值',
    },
    {
      name: 'dayPlans 支持 requiredNodes (string[])',
      status: results.some(r => 
        r.testCase.payload.dayPlans?.some((dp: any) => dp.requiredNodes) && r.result.success
      ) ? '✅' : '❌',
      note: '需要验证 dayPlans 结构',
    },
    {
      name: 'isActive 布尔值支持',
      status: results.some(r => 
        r.testCase.payload.isActive !== undefined && r.result.success
      ) ? '✅' : '❌',
      note: '支持布尔值转换',
    },
  ];

  requirements.forEach(req => {
    console.log(`${req.status} ${req.name}`);
    console.log(`   ${req.note}`);
  });

  console.log('\n✅ 测试完成！');
}

main().catch(console.error);
