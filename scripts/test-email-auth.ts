// scripts/test-email-auth.ts
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
  data?: any
): Promise<TestResult> {
  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   ${method} ${endpoint}`);
    if (data) {
      console.log(`   请求体:`, JSON.stringify(data, null, 2));
    }

    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      data,
      headers: {
        'Content-Type': 'application/json',
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
  console.log('📧 邮箱验证码注册与登录接口测试');
  console.log('='.repeat(60));
  console.log(`测试服务器: ${BASE_URL}\n`);

  const results: TestResult[] = [];

  // 测试邮箱（可以修改为你的测试邮箱）
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';

  // 测试 1: 发送验证码 - 无效邮箱格式
  results.push(
    await testAPI(
      '发送验证码 - 无效邮箱格式',
      'POST',
      '/api/auth/email/send-code',
      { email: 'invalid-email' }
    )
  );

  // 测试 2: 发送验证码 - 有效邮箱
  const sendCodeResult = await testAPI(
    '发送验证码 - 有效邮箱',
    'POST',
    '/api/auth/email/send-code',
    { email: testEmail }
  );
  results.push(sendCodeResult);

  // 如果发送验证码成功，等待一下让邮件发送
  if (sendCodeResult.success) {
    console.log('\n⏳ 等待 2 秒让邮件发送...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // 测试 3: 发送验证码 - 频繁请求（1分钟内）
  if (sendCodeResult.success) {
    results.push(
      await testAPI(
        '发送验证码 - 频繁请求测试',
        'POST',
        '/api/auth/email/send-code',
        { email: testEmail }
      )
    );
  }

  // 测试 4: 注册 - 无效验证码
  results.push(
    await testAPI(
      '注册 - 无效验证码',
      'POST',
      '/api/auth/email/register',
      {
        email: testEmail,
        code: '000000',
        displayName: 'Test User',
      }
    )
  );

  // 测试 5: 注册 - 有效验证码（需要从邮件中获取）
  // 注意：这个测试需要手动输入验证码
  const verificationCode = process.env.VERIFICATION_CODE;
  if (verificationCode) {
    results.push(
      await testAPI(
        '注册 - 有效验证码',
        'POST',
        '/api/auth/email/register',
        {
          email: testEmail,
          code: verificationCode,
          displayName: 'Test User',
        }
      )
    );
  } else {
    console.log('\n⚠️  跳过注册测试（需要设置 VERIFICATION_CODE 环境变量）');
    console.log('   提示: 从邮件中获取验证码，然后运行:');
    console.log(`   VERIFICATION_CODE=123456 npm run test:email-auth`);
  }

  // 测试 6: 注册 - 邮箱已注册（如果之前注册成功）
  // 这个测试会在上面的注册成功后自动触发

  // 测试 7: 注册 - 缺少必填字段
  results.push(
    await testAPI(
      '注册 - 缺少必填字段',
      'POST',
      '/api/auth/email/register',
      {
        email: testEmail,
        // 缺少 code
      }
    )
  );

  // 测试 8: 注册 - 无效邮箱格式
  results.push(
    await testAPI(
      '注册 - 无效邮箱格式',
      'POST',
      '/api/auth/email/register',
      {
        email: 'invalid-email',
        code: '123456',
      }
    )
  );

  // ==================== 登录接口测试 ====================
  
  // 用于登录测试的邮箱（假设已注册）
  const loginTestEmail = process.env.LOGIN_TEST_EMAIL || testEmail;
  
  // 测试 9: 登录 - 邮箱未注册
  results.push(
    await testAPI(
      '登录 - 邮箱未注册',
      'POST',
      '/api/auth/email/login',
      {
        email: 'notregistered@example.com',
        code: '123456',
      }
    )
  );

  // 测试 10: 登录 - 无效验证码
  results.push(
    await testAPI(
      '登录 - 无效验证码',
      'POST',
      '/api/auth/email/login',
      {
        email: loginTestEmail,
        code: '000000',
      }
    )
  );

  // 测试 11: 登录 - 缺少必填字段
  results.push(
    await testAPI(
      '登录 - 缺少必填字段',
      'POST',
      '/api/auth/email/login',
      {
        email: loginTestEmail,
        // 缺少 code
      }
    )
  );

  // 测试 12: 登录 - 无效邮箱格式
  results.push(
    await testAPI(
      '登录 - 无效邮箱格式',
      'POST',
      '/api/auth/email/login',
      {
        email: 'invalid-email',
        code: '123456',
      }
    )
  );

  // 测试 13: 登录 - 有效验证码（需要从邮件中获取）
  // 注意：这个测试需要手动输入验证码，并且用户必须已注册
  const loginVerificationCode = process.env.LOGIN_VERIFICATION_CODE;
  if (loginVerificationCode) {
    // 先发送验证码用于登录
    console.log('\n📧 为登录测试发送验证码...');
    const loginSendCodeResult = await testAPI(
      '登录 - 发送验证码',
      'POST',
      '/api/auth/email/send-code',
      { email: loginTestEmail }
    );
    
    if (loginSendCodeResult.success) {
      console.log('\n⏳ 等待 2 秒让邮件发送...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    
    results.push(
      await testAPI(
        '登录 - 有效验证码',
        'POST',
        '/api/auth/email/login',
        {
          email: loginTestEmail,
          code: loginVerificationCode,
        }
      )
    );
  } else {
    console.log('\n⚠️  跳过登录成功测试（需要设置 LOGIN_VERIFICATION_CODE 环境变量）');
    console.log('   提示: 从邮件中获取验证码，然后运行:');
    console.log(`   LOGIN_VERIFICATION_CODE=123456 LOGIN_TEST_EMAIL=${loginTestEmail} npm run test:email-auth`);
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

