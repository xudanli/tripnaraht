/**
 * Flight Search MCP（Smithery / gvzq/flight-mcp）—— Connect API 客户端。
 *
 * 上游 MCP URL 须用 Smithery 托管入口，例如：https://server.smithery.ai/gvzq/flight-mcp
 * （`*.run.tools` 多为文档页，直连易导致 Connect 代理 POST 404）
 * 需要环境变量：SMITHERY_API_KEY（https://smithery.ai/account/api-keys）
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createConnection, SmitheryAuthorizationError } from '@smithery/api/mcp';

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'] as const;

/**
 * 与 HotelDirect / LLM 一致：全局 HTTP(S)_PROXY 指向本机未监听端口时，Smithery SDK 的 fetch 会失败或返回 404。
 * `LLM_DISABLE_PROXY=true` 或 `FLIGHT_MCP_DISABLE_PROXY=true` 时在建立连接期间临时移除这些变量。
 */
function shouldBypassEnvProxyForSmitheryFlight(): boolean {
  return (
    process.env.FLIGHT_MCP_DISABLE_PROXY === 'true' || process.env.LLM_DISABLE_PROXY === 'true'
  );
}

function temporarilyUnsetProxyEnv(): () => void {
  const saved: Partial<Record<(typeof PROXY_ENV_KEYS)[number], string>> = {};
  for (const k of PROXY_ENV_KEYS) {
    const v = process.env[k];
    if (v !== undefined) {
      saved[k] = v;
      delete process.env[k];
    }
  }
  return () => {
    for (const k of PROXY_ENV_KEYS) {
      const v = saved[k];
      if (v !== undefined) process.env[k] = v;
    }
  };
}

export class FlightMcpClientConnectAPI {
  private client: Client | null = null;
  private transport: any = null;
  private connectionId: string | null = null;
  private isConnected = false;

  get connected(): boolean {
    return this.isConnected;
  }

  constructor(
    private readonly mcpUrl: string,
    private readonly namespace?: string,
    private readonly connectionIdOverride?: string,
  ) {}

  async connect(): Promise<void> {
    if (this.isConnected && this.client) return;

    const restoreProxy = shouldBypassEnvProxyForSmitheryFlight() ? temporarilyUnsetProxyEnv() : () => {};
    try {
      let transport: any;
      let connectionId: string;

      if (this.connectionIdOverride) {
        const connectionOptions: any = {
          connectionId: this.connectionIdOverride,
        };
        if (this.namespace) connectionOptions.namespace = this.namespace;
        const result = await createConnection(connectionOptions);
        transport = result.transport;
        connectionId = this.connectionIdOverride;
      } else {
        const connectionOptions: any = {
          mcpUrl: this.mcpUrl,
        };
        if (this.namespace) connectionOptions.namespace = this.namespace;
        const result = await createConnection(connectionOptions);
        transport = result.transport;
        connectionId = result.connectionId;
      }

      this.transport = transport;
      this.connectionId = connectionId;

      this.client = new Client({
        name: 'tripnara-flight-mcp-client',
        version: '1.0.0',
      });

      await this.client.connect(transport);
      this.isConnected = true;
    } catch (error) {
      if (error instanceof SmitheryAuthorizationError) {
        this.connectionId = error.connectionId;
        throw new Error(`Smithery authorization required. Visit: ${error.authorizationUrl}`);
      }
      throw error;
    } finally {
      restoreProxy();
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.close();
      this.isConnected = false;
    } catch {
      /* ignore */
    }
  }

  async callTool(name: string, arguments_: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensureConnected();
    return await this.client!.callTool({
      name,
      arguments: arguments_,
    });
  }

  getConnectionId(): string | null {
    return this.connectionId;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
  }
}
