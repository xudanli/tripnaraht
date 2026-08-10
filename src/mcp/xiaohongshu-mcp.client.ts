/**
 * 小红书 MCP HTTP 客户端（Streamable HTTP）。
 * 默认: http://localhost:18060/mcp
 * 上游: https://github.com/xpzouying/xiaohongshu-mcp
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export class XiaohongshuMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected = false;

  constructor(
    private readonly serverUrl: string = process.env.XHS_MCP_URL?.trim() ||
      'http://localhost:18060/mcp',
  ) {}

  async connect(): Promise<void> {
    if (this.isConnected && this.client) return;

    this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl));
    this.client = new Client({
      name: 'tripnara-xiaohongshu-client',
      version: '1.0.0',
    });
    await this.client.connect(this.transport);
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
    this.transport = null;
    this.isConnected = false;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
    if (!this.client) throw new Error('Xiaohongshu MCP client not initialized');

    const result = await this.client.callTool({ name, arguments: args });
    return unwrapMcpToolResult(result);
  }

  async listTools(): Promise<unknown[]> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
    if (!this.client) throw new Error('Xiaohongshu MCP client not initialized');
    const tools = await this.client.listTools();
    return tools.tools ?? [];
  }
}

/** 解析 MCP CallToolResult → JSON / 文本 */
export function unwrapMcpToolResult(result: unknown): unknown {
  const r = result as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  if (r?.isError) {
    const msg =
      r.content?.map((c) => c.text).filter(Boolean).join('\n') ||
      'Xiaohongshu MCP tool error';
    throw new Error(msg);
  }
  if (r?.structuredContent != null) return r.structuredContent;
  const texts = (r?.content ?? [])
    .filter((c) => c?.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text!.trim())
    .filter(Boolean);
  if (!texts.length) return result;
  const joined = texts.join('\n');
  try {
    return JSON.parse(joined);
  } catch {
    return joined;
  }
}
