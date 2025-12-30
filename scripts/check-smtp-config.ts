// scripts/check-smtp-config.ts
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function checkConfig() {
  console.log('='.repeat(60));
  console.log('🔍 检查 SMTP 配置');
  console.log('='.repeat(60));

  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const configService = app.get(ConfigService);

    const smtpHost = configService.get<string>('SMTP_HOST');
    const smtpPort = configService.get<string>('SMTP_PORT');
    const smtpUser = configService.get<string>('SMTP_USER');
    const smtpPassword = configService.get<string>('SMTP_PASSWORD') || configService.get<string>('SMTP_PASS');
    const smtpSecure = configService.get<string>('SMTP_SECURE');
    const smtpFrom = configService.get<string>('SMTP_FROM');

    console.log('\n📋 当前配置:');
    console.log(`  SMTP_HOST: ${smtpHost || '❌ 未设置'}`);
    console.log(`  SMTP_PORT: ${smtpPort || '❌ 未设置'}`);
    console.log(`  SMTP_USER: ${smtpUser || '❌ 未设置'}`);
    console.log(`  SMTP_PASSWORD/SMTP_PASS: ${smtpPassword ? '✅ 已设置' : '❌ 未设置'}`);
    console.log(`  SMTP_SECURE: ${smtpSecure || '❌ 未设置'}`);
    console.log(`  SMTP_FROM: ${smtpFrom || '❌ 未设置'}`);

    console.log('\n📝 预期配置 (Resend):');
    console.log('  SMTP_HOST=smtp.resend.com');
    console.log('  SMTP_PORT=465 (或 587)');
    console.log('  SMTP_USER=resend');
    console.log('  SMTP_PASS=<你的 Resend API Key>');
    console.log('  SMTP_SECURE=true');

    const isConfigured = smtpHost && smtpPort && smtpUser && smtpPassword;
    
    if (isConfigured) {
      console.log('\n✅ SMTP 配置完整');
    } else {
      console.log('\n❌ SMTP 配置不完整');
      console.log('\n💡 提示:');
      console.log('  1. 确保 .env 文件中包含所有必需的 SMTP 配置');
      console.log('  2. 如果已更新 .env 文件，请重启服务:');
      console.log('     - 停止当前服务 (Ctrl+C)');
      console.log('     - 运行: npm run dev');
    }

    await app.close();
    process.exit(isConfigured ? 0 : 1);
  } catch (error: any) {
    console.error('检查配置失败:', error.message);
    process.exit(1);
  }
}

checkConfig();

