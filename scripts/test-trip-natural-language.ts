// scripts/test-trip-natural-language.ts
import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function testAPI(
  name: string,
  method: 'GET' | 'POST',
  endpoint: string,
  data?: any,
  headers?: Record<string, string>
): Promise<TestResult> {
  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   ${method} ${endpoint}`);
    if (data) {
      console.log(`   请求体:`, JSON.stringify(data, null, 2));
    }
    if (headers) {
      console.log(`   请求头:`, JSON.stringify(headers, null, 2));
    }

    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      data,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      validateStatus: () => true, // 不抛出错误，让我们自己处理
    });

    if (response.status >= 200 && response.status < 300) {
      console.log(`   ✅ 成功 (${response.status})`);
      console.log(`   响应:`, JSON.stringify(response.data, null, 2));
      return {
        name,
        success: true,
        data: response.data,
      };
    } else {
      console.log(`   ❌ 失败 (${response.status})`);
      console.log(`   错误:`, JSON.stringify(response.data, null, 2));
      return {
        name,
        success: false,
        error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
        data: response.data,
      };
    }
  } catch (error: any) {
    console.log(`   ❌ 异常`);
    console.log(`   错误:`, error.message);
    if (error.response) {
      console.log(`   响应数据:`, JSON.stringify(error.response.data, null, 2));
    }
    return {
      name,
      success: false,
      error: error.message,
      data: error.response?.data,
    };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('📝 自然语言创建行程接口测试');
  console.log('='.repeat(60));
  console.log(`测试服务器: ${BASE_URL}\n`);

  const results: TestResult[] = [];

  // 获取 access token
  let accessToken = process.env.ACCESS_TOKEN;
  
  // 如果没有提供 token，尝试通过邮箱登录获取
  if (!accessToken) {
    const testEmail = process.env.TEST_EMAIL;
    const testCode = process.env.VERIFICATION_CODE;
    
    if (testEmail && testCode) {
      console.log('\n📧 尝试通过邮箱登录获取 token...');
      try {
        const response = await axios.post(
          `${BASE_URL}/api/auth/email/login`,
          {
            email: testEmail,
            code: testCode,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: () => true,
          }
        );

        if (response.status === 200 && response.data.accessToken) {
          console.log('✅ 登录成功，获取到 access token');
          accessToken = response.data.accessToken;
        } else {
          console.log('❌ 登录失败:', response.data);
        }
      } catch (error: any) {
        console.log('❌ 登录异常:', error.message);
      }
    }
  }
  
  if (!accessToken) {
    console.log('\n⚠️  无法获取 access token');
    console.log('   提示: 可以通过以下方式提供 token:');
    console.log('   1. 设置环境变量: ACCESS_TOKEN=your_token');
    console.log('   2. 或设置: TEST_EMAIL=xxx@example.com VERIFICATION_CODE=123456');
    console.log('\n   先测试无认证的情况（会返回 401）\n');
  } else {
    console.log(`✅ 使用 access token: ${accessToken.substring(0, 20)}...\n`);
  }

  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  // 测试 1: 无认证（应该返回 401）
  results.push(
    await testAPI(
      '创建行程 - 无认证',
      'POST',
      '/api/trips/from-natural-language',
      {
        text: '帮我规划带娃去冰岛5天的行程,预算10万',
      }
    )
  );

  // 测试 2: 缺少必填字段
  results.push(
    await testAPI(
      '创建行程 - 缺少 text 字段',
      'POST',
      '/api/trips/from-natural-language',
      {},
      headers
    )
  );

  // 测试 3: 空文本
  results.push(
    await testAPI(
      '创建行程 - 空文本',
      'POST',
      '/api/trips/from-natural-language',
      {
        text: '',
      },
      headers
    )
  );

  // 测试 4: 有效请求（如果有 token）
  if (accessToken) {
    results.push(
      await testAPI(
        '创建行程 - 有效请求（冰岛5天）',
        'POST',
        '/api/trips/from-natural-language',
        {
          text: '帮我规划带娃去冰岛5天的行程,预算10万',
        },
        headers
      )
    );

    // 测试 5: 指定 LLM 提供商
    results.push(
      await testAPI(
        '创建行程 - 指定 OPENAI 提供商',
        'POST',
        '/api/trips/from-natural-language',
        {
          text: '帮我规划带娃去冰岛5天的行程,预算10万',
          llmProvider: 'OPENAI',
        },
        headers
      )
    );
  } else {
    console.log('\n⚠️  跳过需要认证的测试（需要设置 ACCESS_TOKEN）');
  }

  // 汇总结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  results.forEach((result) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`总计: ${results.length} 个测试`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${failCount}`);
  console.log('='.repeat(60));

  // 返回退出码
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
runTests().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});

