/**
 * 测试 Amadeus MCP ping 工具
 * 用于验证连接和配置是否正常
 */

import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AmadeusService } from '../src/mcp/amadeus.service';

dotenv.config();

async function testPing() {
  console.log('🧪 测试 Amadeus MCP ping 工具\n');
  console.log('============================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AmadeusService);

  try {
    console.log('📡 调用 ping 工具...\n');
    const result = await service.ping();
    
    console.log('✅ Ping 成功！\n');
    console.log('结果:', JSON.stringify(result, null, 2));
    
  } catch (error: any) {
    console.error('\n❌ Ping 失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
  } finally {
    await app.close();
  }
}

testPing().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
