/**
 * 比较两个 Airbnb MCP 服务器
 * 检查哪个更适合使用
 */

import * as dotenv from 'dotenv';
import { Smithery } from '@smithery/api';
import { createConnection } from '@smithery/api/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

dotenv.config();

interface ServerInfo {
  name: string;
  url: string;
  tools?: any[];
  status?: string;
  error?: string;
}

async function testServer(url: string, name: string): Promise<ServerInfo> {
  const info: ServerInfo = {
    name,
    url,
  };

  try {
    console.log(`\n🔍 测试服务器: ${name}`);
    console.log(`   URL: ${url}`);

    const smithery = new Smithery();
    const { namespaces } = await smithery.namespaces.list();
    const namespace = namespaces.length > 0 ? namespaces[0].name : (await smithery.namespaces.create()).name;

    // 创建连接
    const conn = await smithery.experimental.connect.connections.create(namespace, {
      mcpUrl: url,
    });

    info.status = conn.status?.state || 'unknown';
    console.log(`   ✅ 连接状态: ${info.status}`);

    if (conn.status?.state === 'connected') {
      // 获取 transport 并列出工具
      const { transport } = await createConnection({
        connectionId: conn.connectionId,
        namespace,
      });

      const client = new Client({
        name: 'test-comparison',
        version: '1.0.0',
      });

      await client.connect(transport);
      const { tools } = await client.listTools();
      info.tools = tools;

      console.log(`   ✅ 可用工具数量: ${tools.length}`);
      tools.forEach(tool => {
        console.log(`      - ${tool.name}: ${tool.description || 'No description'}`);
      });

      await client.close();
    } else if (conn.status?.state === 'auth_required') {
      console.log(`   ⚠️  需要授权: ${(conn.status as any).authorizationUrl || 'N/A'}`);
    } else if (conn.status?.state === 'error') {
      info.error = (conn.status as any).message || 'Unknown error';
      console.log(`   ❌ 错误: ${info.error}`);
    }

  } catch (error: any) {
    info.error = error.message;
    console.log(`   ❌ 测试失败: ${error.message}`);
  }

  return info;
}

async function compareServers() {
  console.log('📊 比较 Airbnb MCP 服务器\n');
  console.log('='.repeat(60));

  const servers = [
    {
      name: 'geobio/mcp-server-airbnb',
      url: 'https://server.smithery.ai/geobio/mcp-server-airbnb',
    },
    {
      name: 'iclickfreedownloads/mcp-server-airbnb',
      url: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
    },
  ];

  const results: ServerInfo[] = [];

  for (const server of servers) {
    const result = await testServer(server.url, server.name);
    results.push(result);
  }

  // 比较结果
  console.log('\n' + '='.repeat(60));
  console.log('📋 比较结果\n');

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.name}`);
    console.log(`   状态: ${result.status || 'unknown'}`);
    console.log(`   工具数量: ${result.tools?.length || 0}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
    console.log();
  });

  // 推荐
  const workingServers = results.filter(r => r.status === 'connected' && r.tools && r.tools.length > 0);
  
  if (workingServers.length > 0) {
    console.log('💡 推荐:');
    workingServers.forEach(server => {
      console.log(`   ✅ ${server.name} - ${server.tools?.length} 个工具可用`);
    });
  } else {
    console.log('⚠️  两个服务器都需要进一步检查');
  }
}

compareServers().catch(console.error);
