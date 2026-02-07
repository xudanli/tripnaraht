#!/usr/bin/env node

/**
 * Stripe MCP Bridge Server
 * 
 * 本地 MCP 服务器，桥接到 Smithery 的 Stripe MCP 服务
 * 允许 Claude Desktop 通过 stdio 连接使用 Stripe 支付功能
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StripeOAuthProvider } from './stripe-client.js';

// 远程客户端实例
let remoteClient: Client | null = null;
let remoteTransport: StreamableHTTPClientTransport | null = null;

async function getRemoteClient(): Promise<Client> {
  if (remoteClient) {
    return remoteClient;
  }

  const serverUrl = 'https://server.smithery.ai/stripe';
  
  // 先尝试无认证连接
  try {
    console.error('尝试无认证连接 Stripe MCP 服务器...');
    remoteTransport = new StreamableHTTPClientTransport(new URL(serverUrl), {});

    remoteClient = new Client({
      name: 'tripnara-stripe-bridge',
      version: '1.0.0',
    });

    await remoteClient.connect(remoteTransport);
    console.error('✅ Connected to Stripe MCP server (无需认证)');
    return remoteClient;
    } catch (noAuthError: any) {
    // 如果无认证失败，尝试使用 OAuth
    const errorMessage = noAuthError.message || '';
    const errorCode = noAuthError.code || '';
    const needsAuth = 
      errorMessage.includes('Unauthorized') || 
      errorMessage.includes('401') || 
      errorMessage.includes('403') ||
      errorMessage.includes('invalid_token') ||
      errorMessage.includes('Missing Authorization') ||
      errorCode === 401 ||
      errorCode === 403;
    
    if (needsAuth) {
      console.error('⚠️  无认证连接失败，尝试 OAuth 认证...');
      
      // 清理之前的连接
      if (remoteClient) {
        try {
          await remoteClient.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }
      remoteClient = null;
      remoteTransport = null;
      
      const authProvider = new StripeOAuthProvider(serverUrl);
      
      remoteTransport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        authProvider,
      });

      remoteClient = new Client({
        name: 'tripnara-stripe-bridge',
        version: '1.0.0',
      });

      try {
        await remoteClient.connect(remoteTransport);
        console.error('✅ Connected to Stripe MCP server (使用 OAuth 认证)');
        return remoteClient;
      } catch (authError) {
        console.error('❌ OAuth 认证也失败:', authError);
        throw authError;
      }
    } else {
      console.error('❌ Failed to connect to remote server:', noAuthError);
      throw noAuthError;
    }
  }
}

// 创建本地 MCP 服务器
const server = new McpServer(
  {
    name: 'stripe-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
// @ts-ignore - setRequestHandler exists at runtime but not in type definitions
server.setRequestHandler('tools/list', async () => {
  try {
    const client = await getRemoteClient();
    const tools = await client.listTools();
    return {
      tools: tools.tools || [],
    };
  } catch (error) {
    console.error('Error listing tools:', error);
    throw error;
  }
});

// 处理工具调用请求
// @ts-ignore - setRequestHandler exists at runtime but not in type definitions
server.setRequestHandler('tools/call', async (request) => {
  try {
    const client = await getRemoteClient();
    const result = await client.callTool({
      name: request.params.name,
      arguments: request.params.arguments || {},
    });
    return result;
  } catch (error) {
    console.error(`Error calling tool ${request.params.name}:`, error);
    throw error;
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ Stripe Bridge MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start bridge server:', error);
  process.exit(1);
});
