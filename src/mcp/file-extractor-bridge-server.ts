#!/usr/bin/env node

/**
 * File Extractor MCP Bridge Server
 * 
 * 本地 MCP 服务器，桥接到 Smithery 的 File Extractor MCP 服务
 * 允许 Claude Desktop 通过 stdio 连接使用文件提取功能
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FileExtractorOAuthProvider } from './file-extractor-client.js';

// 远程客户端实例
let remoteClient: Client | null = null;
let remoteTransport: StreamableHTTPClientTransport | null = null;

async function getRemoteClient(): Promise<Client> {
  if (remoteClient) {
    return remoteClient;
  }

  const serverUrl = 'https://server.smithery.ai/@dravidsajinraj-iex/file-extractor-mcp';
  const authProvider = new FileExtractorOAuthProvider(serverUrl);
  
  remoteTransport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    authProvider,
  });

  remoteClient = new Client({
    name: 'tripnara-file-extractor-bridge',
    version: '1.0.0',
  });

  try {
    await remoteClient.connect(remoteTransport);
    console.error('✅ Connected to File Extractor MCP server');
  } catch (error) {
    console.error('❌ Failed to connect to remote server:', error);
    throw error;
  }

  return remoteClient;
}

// 创建本地 MCP 服务器
const server = new McpServer(
  {
    name: 'file-extractor-bridge',
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
  console.error('✅ File Extractor Bridge MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start bridge server:', error);
  process.exit(1);
});
