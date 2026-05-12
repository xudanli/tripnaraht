/**
 * Flight MCP（Smithery · Kiwi 聚合）封装：供轻量路径航班库存传感器调用。
 *
 * FLIGHT_MCP_URL 默认：`https://server.smithery.ai/gvzq/flight-mcp`（Smithery Connect 规范入口）。
 * 不要用 `*.run.tools` 浏览器预览域名作 upstream，易导致 JSON-RPC POST **404**。
 * 需 SMITHERY_API_KEY；可选 FLIGHT_MCP_ENABLED=false 关闭。
 * 若曾用错误 URL 建连，删除 `~/.tripnara-mcp/flight-mcp-connection-id.txt` 后重试以刷新连接。
 * `FLIGHT_MCP_FALLBACK_AMADEUS`：MCP 返回工具错误（含 404）时是否对该腿回退 Amadeus（默认允许；设为 `false` 则禁用）。
 *
 * 全局 `HTTP(S)_PROXY` 若指向未监听的本地端口，Smithery SDK 会失败：见 `flight-mcp-client-connect-api.ts`，在
 * `LLM_DISABLE_PROXY=true` 或 `FLIGHT_MCP_DISABLE_PROXY=true` 时建连阶段会临时去掉代理环境变量。
 * 若建连成功但 `search_flights` 仍报 “POSTing to endpoint (HTTP 404)”，多为 Smithery 侧下游（如 Kiwi）不可用——请配置
 * `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET`，默认会优先 Amadeus（`FLIGHT_INVENTORY_PREFER=amadeus`）。
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FlightMcpClientConnectAPI } from './flight-mcp-client-connect-api';

const DEFAULT_FLIGHT_MCP_URL = 'https://server.smithery.ai/gvzq/flight-mcp';

/** 将 MCP callTool 结果压成传感器块可读行（尽力解析 JSON） */
export function formatFlightMcpToolResultToLines(result: unknown, maxLines = 3): string[] {
  const text = extractMcpToolText(result);
  if (!text?.trim()) return ['（无返回文本）'];
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const arr = extractFlightArrayFromJson(j);
    const lines: string[] = [];
    for (let i = 0; i < Math.min(arr.length, maxLines); i++) {
      lines.push(summarizeOneFlightLike(arr[i], i + 1));
    }
    return lines.length ? lines : [truncate(text, 400)];
  } catch {
    return [truncate(text, 500)];
  }
}

function extractFlightArrayFromJson(j: Record<string, unknown>): unknown[] {
  for (const key of ['flights', 'results', 'searchResults', 'data'] as const) {
    const v = j[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray((v as { data?: unknown[] }).data)) {
      return (v as { data: unknown[] }).data;
    }
  }
  return [];
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function summarizeOneFlightLike(row: unknown, idx: number): string {
  if (row == null || typeof row !== 'object') return `[${idx}] ${String(row)}`;
  const o = row as Record<string, unknown>;
  const price =
    pickNumber(o, ['price', 'total_price', 'fare', 'amount']) ??
    pickNestedString(o, ['price', 'total']);
  const cur = pickString(o, ['currency', 'curr']) ?? '';
  const dur = pickString(o, ['duration', 'fly_duration']) ?? '';
  const route =
    pickString(o, ['route', 'routes']) ||
    [pickString(o, ['flyFrom', 'origin']), pickString(o, ['flyTo', 'destination'])]
      .filter(Boolean)
      .join('→');
  const airlines = pickString(o, ['airlines', 'carrier']) ?? '';
  const bits = [cur && price != null ? `${cur} ${price}` : price != null ? String(price) : '', dur, route || airlines]
    .filter(Boolean)
    .join(' · ');
  return bits ? `[${idx}] ${bits}` : `[${idx}] ${truncate(JSON.stringify(o), 120)}`;
}

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && typeof v[0] === 'string') return v.join('/');
  }
  return undefined;
}

function pickNumber(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^[\d.]+$/.test(v)) return Number(v);
  }
  return undefined;
}

function pickNestedString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (v && typeof v === 'object') {
      const t = (v as { total?: string }).total;
      if (typeof t === 'string') return t;
    }
  }
  return undefined;
}

function extractMcpToolText(result: unknown): string | null {
  if (result == null) return null;
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  const parts = r.content;
  if (!Array.isArray(parts)) return typeof result === 'string' ? result : JSON.stringify(result);
  const texts = parts.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text!);
  return texts.length ? texts.join('\n') : JSON.stringify(result);
}

/**
 * MCP SDK 可能不把异常当 throw，而在返回里带 `isError` 或错误正文（含 HTTP 404）。
 * 用于区分「工具失败」与「成功返回空列表」，以便回退 Amadeus。
 */
export function isFlightMcpToolResultFailure(result: unknown, lines?: string[]): boolean {
  const r = result as { isError?: boolean };
  if (r && typeof r === 'object' && r.isError === true) return true;
  const text = extractMcpToolText(result) ?? '';
  const errPat =
    /Error (?:calling tool|searching flights)|HTTP\s*404|statusCode["']?\s*:\s*404|"Not Found"|POSTing to endpoint/i;
  if (errPat.test(text)) return true;
  if (lines?.some((l) => errPat.test(l))) return true;
  return false;
}

@Injectable()
export class FlightMcpService implements OnModuleDestroy {
  private readonly logger = new Logger(FlightMcpService.name);
  private client: FlightMcpClientConnectAPI | null = null;
  private readonly configDir = path.join(os.homedir(), '.tripnara-mcp');
  private readonly connectionIdFile = path.join(this.configDir, 'flight-mcp-connection-id.txt');

  get isAvailable(): boolean {
    if (process.env.FLIGHT_MCP_ENABLED === 'false') return false;
    return !!process.env.SMITHERY_API_KEY?.trim();
  }

  get mcpUrl(): string {
    return (process.env.FLIGHT_MCP_URL || DEFAULT_FLIGHT_MCP_URL).trim();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private async getClient(): Promise<FlightMcpClientConnectAPI> {
    if (this.client?.connected) {
      return this.client;
    }

    let savedConnectionId: string | undefined;
    if (fs.existsSync(this.connectionIdFile)) {
      savedConnectionId = fs.readFileSync(this.connectionIdFile, 'utf-8').trim();
    }

    this.client = new FlightMcpClientConnectAPI(this.mcpUrl, undefined, savedConnectionId);

    try {
      await this.client.connect();
      const connectionId = this.client.getConnectionId();
      if (connectionId) {
        if (!fs.existsSync(this.configDir)) fs.mkdirSync(this.configDir, { recursive: true });
        fs.writeFileSync(this.connectionIdFile, connectionId);
      }
    } catch (e: any) {
      this.logger.warn(`Flight MCP connect failed: ${e?.message ?? e}`);
      throw e;
    }

    return this.client;
  }

  /**
   * 上游返回 404 等时丢弃缓存的 Smithery connectionId，使下次 `createConnection` 使用当前 FLIGHT_MCP_URL。
   */
  clearCachedConnectionOnTransportError(textSample: string): void {
    if (!/404|Not Found|POSTing to endpoint/i.test(textSample)) return;
    try {
      if (fs.existsSync(this.connectionIdFile)) {
        fs.unlinkSync(this.connectionIdFile);
        this.logger.warn(
          'Flight MCP: 已删除缓存的 connectionId（上游曾报 404/Not Found）。请确认 FLIGHT_MCP_URL 为 https://server.smithery.ai/gvzq/flight-mcp 后重试。',
        );
      }
      this.client = null;
    } catch {
      /* ignore */
    }
  }

  /** 工具返回正文疑似传输层 404 时，清除 Smithery connection 缓存 */
  invalidateConnectionCacheFromRaw(raw: unknown): void {
    const t = extractMcpToolText(raw) ?? '';
    this.clearCachedConnectionOnTransportError(t);
  }

  /**
   * 单程搜索；origin/destination 可为 IATA 或城市名（与 MCP 文档一致）。
   */
  async searchFlightsOneWay(params: {
    origin: string;
    destination: string;
    departDate: string;
  }): Promise<{ raw: unknown; lines: string[] }> {
    const client = await this.getClient();
    const raw = await client.callTool('search_flights', {
      origin: params.origin,
      destination: params.destination,
      depart_date: params.departDate,
    });
    const lines = formatFlightMcpToolResultToLines(raw, 3);
    return { raw, lines };
  }
}
