#!/usr/bin/env node

/**
 * Airbnb MCP Bridge Server
 * 
 * 本地 MCP 服务器，桥接到 Smithery 的 Airbnb MCP 服务
 * 允许 Claude Desktop 通过 stdio 连接使用 Airbnb 功能
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 简单的文件系统 OAuth Provider
class FileOAuthProvider implements OAuthClientProvider {
  private tokenFile: string;
  private clientInfoFile: string;
  private codeVerifierFile: string;
  private configDir: string;

  constructor(private serverUrl: string) {
    // 创建配置目录
    const homeDir = os.homedir();
    this.configDir = path.join(homeDir, '.tripnara-mcp');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 使用服务器名称作为文件名的一部分
    const serverName = serverUrl.split('/').pop() || 'airbnb';
    this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
    this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
    this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
  }

  get redirectUrl(): string {
    return 'http://localhost:3000/oauth/callback';
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'TripNara Airbnb Bridge',
      client_uri: 'http://localhost:3000',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read write',
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformation | undefined {
    try {
      if (fs.existsSync(this.clientInfoFile)) {
        const content = fs.readFileSync(this.clientInfoFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Failed to read client info: ${error}`);
    }
    return undefined;
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    try {
      fs.writeFileSync(this.clientInfoFile, JSON.stringify(info, null, 2));
      console.error('✅ Client information saved');
    } catch (error) {
      console.error(`Failed to save client info: ${error}`);
    }
  }

  tokens(): OAuthTokens | undefined {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const content = fs.readFileSync(this.tokenFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Failed to read tokens: ${error}`);
    }
    return undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    try {
      fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
      console.error('✅ OAuth tokens saved');
    } catch (error) {
      console.error(`Failed to save tokens: ${error}`);
    }
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    console.error('\n🔐 ============================================');
    console.error('Airbnb 认证');
    console.error('============================================');
    console.error('\n请访问以下 URL 完成 Airbnb 认证:');
    console.error(`\n${url.toString()}\n`);
    console.error('认证完成后，服务器将自动连接。');
    console.error('============================================\n');
    
    // 尝试自动打开浏览器（如果环境支持）
    try {
      const { default: open } = await import('open');
      await open(url.toString());
      console.error('✅ 已在浏览器中打开认证页面\n');
    } catch (error) {
      // 如果 open 包不可用，忽略错误
    }
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    try {
      fs.writeFileSync(this.codeVerifierFile, verifier);
    } catch (error) {
      console.error(`Failed to save code verifier: ${error}`);
    }
  }

  async codeVerifier(): Promise<string> {
    try {
      if (fs.existsSync(this.codeVerifierFile)) {
        return fs.readFileSync(this.codeVerifierFile, 'utf-8');
      }
    } catch (error) {
      console.error(`Failed to read code verifier: ${error}`);
    }
    throw new Error('No code verifier stored');
  }
}

// 远程客户端实例
let remoteClient: Client | null = null;
let remoteTransport: StreamableHTTPClientTransport | null = null;

async function getRemoteClient(): Promise<Client> {
  if (remoteClient) {
    return remoteClient;
  }

  const serverUrl = 'https://server.smithery.ai/geobio/mcp-server-airbnb';
  const authProvider = new FileOAuthProvider(serverUrl);
  
  remoteTransport = new StreamableHTTPClientTransport(serverUrl, {
    authProvider,
  });

  remoteClient = new Client({
    name: 'tripnara-airbnb-bridge',
    version: '1.0.0',
  });

  try {
    await remoteClient.connect(remoteTransport);
    console.error('✅ Connected to Airbnb MCP server');
  } catch (error) {
    console.error('❌ Failed to connect to remote server:', error);
    throw error;
  }

  return remoteClient;
}

// 创建本地 MCP 服务器
const server = new McpServer(
  {
    name: 'airbnb-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具列表处理器：转发到远程服务器
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

// 工具调用处理器：转发到远程服务器
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
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('✅ Airbnb Bridge MCP Server started');
    console.error('Ready to accept connections from Claude Desktop');
  } catch (error) {
    console.error('❌ Failed to start bridge server:', error);
    process.exit(1);
  }
}

// 处理进程退出
process.on('SIGINT', async () => {
  console.error('\n🛑 Shutting down bridge server...');
  if (remoteClient) {
    try {
      await remoteClient.close();
    } catch (error) {
      // 忽略关闭错误
    }
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n🛑 Shutting down bridge server...');
  if (remoteClient) {
    try {
      await remoteClient.close();
    } catch (error) {
      // 忽略关闭错误
    }
  }
  process.exit(0);
});

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
