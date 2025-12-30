// scripts/test-email-smtp.ts
import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_EMAIL = process.env.TEST_EMAIL || `test${Date.now()}@example.com`;

async function testSendCode() {
  console.log('='.repeat(60));
  console.log('📧 测试发送验证码');
  console.log('='.repeat(60));
  console.log(`测试邮箱: ${TEST_EMAIL}\n`);

  try {
    const response = await axios.post(
      `${BASE_URL}/auth/email/send-code`,
      { email: TEST_EMAIL },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      }
    );

    console.log(`HTTP 状态码: ${response.status}`);
    console.log('响应数据:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.status === 200) {
      console.log('\n✅ 验证码发送成功！');
      console.log('请检查邮箱获取验证码。');
      return true;
    } else {
      console.log('\n❌ 验证码发送失败');
      if (response.data?.message) {
        console.log(`错误信息: ${response.data.message}`);
      }
      return false;
    }
  } catch (error: any) {
    console.error('\n❌ 请求异常:');
    if (error.response) {
      console.error(`HTTP ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      console.error('请求未收到响应:', error.message);
    } else {
      console.error('错误:', error.message);
    }
    return false;
  }
}

testSendCode()
  .then((success) => {
    if (success) {
      console.log('\n💡 提示: 如果收到验证码，可以使用以下命令测试注册:');
      console.log(`VERIFICATION_CODE=123456 TEST_EMAIL=${TEST_EMAIL} npm run test:email-auth`);
    }
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('测试失败:', error);
    process.exit(1);
  });

