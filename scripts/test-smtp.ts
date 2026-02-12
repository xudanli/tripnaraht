// scripts/test-smtp.ts
// 测试 SMTP 连接的脚本
import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

dotenv.config();

async function testSmtp() {
  const config = {
    host: process.env.SMTP_HOST || 'smtp.exmail.qq.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '465', 10) === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  };

  console.log('=== SMTP 配置测试 ===');
  console.log(`服务器: ${config.host}:${config.port}`);
  console.log(`SSL: ${config.secure}`);
  console.log(`用户名: ${config.user}`);
  console.log(`密码: ${config.pass ? '已设置 (' + config.pass.length + '字符)' : '未设置'}`);
  console.log('');

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // 添加调试输出
    debug: true,
    logger: true,
  });

  console.log('正在验证 SMTP 连接...');
  
  try {
    await transporter.verify();
    console.log('✅ SMTP 连接成功！');
  } catch (error: any) {
    console.log('❌ SMTP 连接失败:', error.message);
    console.log('');
    console.log('可能的原因:');
    console.log('1. 授权码不正确 - 请在企业微信邮箱后台重新获取');
    console.log('2. SMTP 服务未开启 - 请在企业微信管理后台开启');
    console.log('3. 网络问题 - 检查是否能访问 smtp.exmail.qq.com');
  }
}

testSmtp();
