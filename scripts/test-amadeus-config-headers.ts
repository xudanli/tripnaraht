/**
 * 测试 Amadeus MCP 配置传递
 * 检查 headers 是否正确传递
 */

import * as dotenv from 'dotenv';
import { Smithery } from '@smithery/api';
import { createConnection } from '@smithery/api/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

dotenv.config();

async function testConfigHeaders() {
  console.log('🧪 测试 Amadeus MCP 配置传递\n');
  
  const smithery = new Smithery();
  
  // 获取或创建 namespace
  const { namespaces } = await smithery.namespaces.list();
  const namespace = namespaces.length > 0 ? namespaces[0].name : (await smithery.namespaces.create()).name;
  
  console.log(`📦 Namespace: ${namespace}\n`);
  
  const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
  
  console.log('🔑 凭证检查:');
  console.log(`  Client ID: ${clientId ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`  Client Secret: ${clientSecret ? '✅ 已设置' : '❌ 未设置'}\n`);
  
  if (!clientId || !clientSecret) {
    console.log('❌ 错误: 未设置 Amadeus API 凭证');
    console.log('请在 .env 文件中设置:');
    console.log('  AMADEUS_CLIENT_ID=your-client-id');
    console.log('  AMADEUS_CLIENT_SECRET=your-client-secret');
    return;
  }
  
  // 准备连接配置
  const mcpUrl = 'https://server.smithery.ai/@almogqwinz/mcp-amadeus-api';
  const connectionConfig: any = {
    mcpUrl,
    headers: {
      'amadeus-client-id': clientId,
      'amadeus-client-secret': clientSecret,
      'AMADEUS_CLIENT_ID': clientId,
      'AMADEUS_CLIENT_SECRET': clientSecret,
      'amadeus-api-key': clientId,
      'amadeus-api-secret': clientSecret,
    },
  };
  
  if (process.env.AMADEUS_HOSTNAME) {
    connectionConfig.headers['amadeus-hostname'] = process.env.AMADEUS_HOSTNAME;
    connectionConfig.headers['AMADEUS_HOSTNAME'] = process.env.AMADEUS_HOSTNAME;
  }
  
  console.log('📤 发送配置:');
  console.log(`  MCP URL: ${mcpUrl}`);
  console.log(`  Headers: ${Object.keys(connectionConfig.headers).length} 个`);
  Object.keys(connectionConfig.headers).forEach(key => {
    const value = connectionConfig.headers[key];
    const masked = key.toLowerCase().includes('secret') || key.toLowerCase().includes('key') 
      ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
      : value;
    console.log(`    ${key}: ${masked}`);
  });
  console.log();
  
  try {
    console.log('🔄 创建连接...\n');
    const conn = await smithery.experimental.connect.connections.create(namespace, connectionConfig);
    
    console.log('✅ 连接创建成功!');
    console.log(`  Connection ID: ${conn.connectionId}`);
    console.log(`  Status: ${conn.status?.state || 'unknown'}`);
    
    if (conn.status) {
      if (conn.status.state === 'connected') {
        console.log('\n✅ 连接已就绪，可以开始使用!');
      } else if (conn.status.state === 'auth_required') {
        console.log('\n⚠️  需要授权:');
        console.log(`  ${(conn.status as any).authorizationUrl || 'N/A'}`);
      } else if (conn.status.state === 'error') {
        console.log('\n❌ 连接错误:');
        console.log(`  ${(conn.status as any).message || 'Unknown error'}`);
      }
    }
    
    // 尝试调用工具来测试配置是否生效
    if (conn.status?.state === 'connected') {
      console.log('\n🧪 测试调用工具...');
      try {
        // 使用 MCP SDK Client 来调用工具
        const { transport } = await createConnection({
          connectionId: conn.connectionId,
          namespace,
        });
        
        const mcpClient = new Client({
          name: 'test-amadeus-config',
          version: '1.0.0',
        });
        
        await mcpClient.connect(transport);
        console.log('✅ MCP Client 连接成功');
        
        // 列出可用工具
        const { tools } = await mcpClient.listTools();
        console.log(`✅ 工具列表获取成功!`);
        console.log(`  找到 ${tools.length} 个工具:`);
        tools.forEach(tool => {
          console.log(`    - ${tool.name}: ${tool.description || 'No description'}`);
        });
        
        // 尝试调用 ping 工具
        if (tools.some(t => t.name === 'ping')) {
          console.log('\n🧪 测试 ping 工具...');
          const pingResult = await mcpClient.callTool({
            name: 'ping',
            arguments: {},
          });
          console.log('✅ Ping 成功!');
          console.log(`  结果: ${JSON.stringify(pingResult.content, null, 2)}`);
        }
        
        await mcpClient.close();
      } catch (error: any) {
        console.log('❌ 工具调用失败:');
        console.log(`  ${error.message}`);
        if (error.message?.includes('Configuration required')) {
          console.log('\n💡 提示: 服务器仍然报告需要配置。');
          console.log('这可能意味着:');
          console.log('1. 服务器没有定义配置 schema，需要在 Smithery 平台上手动配置');
          console.log('2. Header 名称不正确，需要查看服务器文档');
          console.log('3. 配置需要通过其他方式传递（如查询参数）');
        }
      }
    }
    
  } catch (error: any) {
    console.log('❌ 错误:');
    console.log(`  ${error.message}`);
    if (error.response) {
      console.log(`  Status: ${error.response.status}`);
      console.log(`  Body: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

testConfigHeaders().catch(console.error);
