# Google Calendar MCP 服务集成指南

## 📋 概述

本文档说明如何将 [Smithery 提供的 Google Calendar MCP 服务](https://smithery.ai/server/googlecalendar) 集成到项目中。

### 服务信息

- **服务名称**: Google Calendar MCP
- **服务 URL**: `https://server.smithery.ai/googlecalendar`
- **服务类型**: 远程 HTTP/SSE MCP 服务器
- **功能**: 提供 29 个 Google Calendar 相关工具（创建事件、列出事件、删除事件等）

---

## 🔧 集成方式

### 方式 1: 在 Claude Desktop 中使用（通过 Smithery Connect API）⭐

**注意**: Claude Desktop 目前主要支持本地 stdio 连接的 MCP 服务器。对于远程 HTTP/SSE 服务器（如 Smithery），有两种方式：

#### 选项 A: 使用 Smithery Connect API（推荐）

Smithery 提供了 Connect API，可以简化远程服务器的连接。但目前 Claude Desktop 可能还不直接支持远程 URL 配置。

#### 选项 B: 通过代码桥接（推荐用于生产环境）

创建一个本地 MCP 服务器作为桥接，连接到 Smithery 的远程服务器。这样可以：
- 在 Claude Desktop 中正常使用
- 处理认证和令牌管理
- 提供统一的接口

详见下面的"方式 2: 在代码中集成"部分。

---

### 方式 2: 创建桥接 MCP 服务器（用于 Claude Desktop）⭐

创建一个本地 MCP 服务器，桥接到 Smithery 的 Google Calendar 服务。这样可以在 Claude Desktop 中直接使用。

#### 创建桥接服务器

```typescript
// src/mcp/google-calendar-bridge-server.ts
#!/usr/bin/env node

/**
 * Google Calendar MCP Bridge Server
 * 
 * 本地 MCP 服务器，桥接到 Smithery 的 Google Calendar MCP 服务
 * 允许 Claude Desktop 通过 stdio 连接使用 Google Calendar 功能
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import * as fs from 'fs';
import * as path from 'path';

// 简单的文件系统 OAuth Provider
class FileOAuthProvider implements OAuthClientProvider {
  private tokenFile: string;
  private clientInfoFile: string;
  private codeVerifierFile: string;

  constructor(private serverUrl: string) {
    const configDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.tripnara-mcp');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.tokenFile = path.join(configDir, 'google-calendar-tokens.json');
    this.clientInfoFile = path.join(configDir, 'google-calendar-client-info.json');
    this.codeVerifierFile = path.join(configDir, 'google-calendar-code-verifier.txt');
  }

  get redirectUrl(): string {
    return 'http://localhost:3000/oauth/callback';
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'TripNara Google Calendar Bridge',
      client_uri: 'http://localhost:3000',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read write',
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformation | undefined {
    if (fs.existsSync(this.clientInfoFile)) {
      return JSON.parse(fs.readFileSync(this.clientInfoFile, 'utf-8'));
    }
    return undefined;
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    fs.writeFileSync(this.clientInfoFile, JSON.stringify(info, null, 2));
  }

  tokens(): OAuthTokens | undefined {
    if (fs.existsSync(this.tokenFile)) {
      return JSON.parse(fs.readFileSync(this.tokenFile, 'utf-8'));
    }
    return undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    console.error('\n🔐 请访问以下 URL 完成 Google Calendar 认证:');
    console.error(url.toString());
    console.error('\n认证完成后，服务器将自动连接。\n');
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    fs.writeFileSync(this.codeVerifierFile, verifier);
  }

  async codeVerifier(): Promise<string> {
    if (fs.existsSync(this.codeVerifierFile)) {
      return fs.readFileSync(this.codeVerifierFile, 'utf-8');
    }
    throw new Error('No code verifier stored');
  }
}

// 创建远程客户端
let remoteClient: Client | null = null;

async function getRemoteClient(): Promise<Client> {
  if (remoteClient) {
    return remoteClient;
  }

  const authProvider = new FileOAuthProvider('https://server.smithery.ai/googlecalendar');
  const transport = new StreamableHTTPClientTransport(
    'https://server.smithery.ai/googlecalendar',
    { authProvider }
  );

  remoteClient = new Client({
    name: 'tripnara-google-calendar-bridge',
    version: '1.0.0',
  });

  await remoteClient.connect(transport);
  return remoteClient;
}

// 创建本地 MCP 服务器
const server = new McpServer(
  {
    name: 'google-calendar-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 注册工具：将所有工具转发到远程服务器
server.setRequestHandler('tools/list', async () => {
  const client = await getRemoteClient();
  return await client.listTools();
});

server.setRequestHandler('tools/call', async (request) => {
  const client = await getRemoteClient();
  return await client.callTool({
    name: request.params.name,
    arguments: request.params.arguments || {},
  });
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ Google Calendar Bridge MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start bridge server:', error);
  process.exit(1);
});
```

#### 配置 Claude Desktop

在 Claude Desktop 配置文件中添加：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": ["tsx", "src/mcp/mcp-skills-server.ts"],
      "cwd": "/home/devbox/project"
    },
    "google-calendar": {
      "command": "npx",
      "args": ["tsx", "src/mcp/google-calendar-bridge-server.ts"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

---

### 方式 3: 在代码中集成（程序化使用）

如果需要在项目代码中直接使用 Google Calendar MCP 服务，可以使用 MCP SDK 的 HTTP 客户端。

#### 安装依赖

项目已包含 `@modelcontextprotocol/sdk`，无需额外安装。

#### 创建客户端连接

创建一个新的服务文件来管理 Google Calendar MCP 连接：

```typescript
// src/mcp/google-calendar-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * 简单的 OAuth Provider 实现（用于服务器端）
 * 注意：生产环境应该使用更安全的令牌存储方式
 */
class ServerOAuthProvider implements OAuthClientProvider {
  private tokens?: OAuthTokens;
  private clientInfo?: OAuthClientInformation;
  private codeVerifier?: string;

  constructor(private serverUrl: string, private clientName: string) {}

  get redirectUrl(): string {
    // 服务器端应用的回调 URL
    return process.env.GOOGLE_CALENDAR_OAUTH_CALLBACK_URL || 'http://localhost:3000/oauth/callback';
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.clientName,
      client_uri: process.env.CLIENT_URI || 'http://localhost:3000',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read write',
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInfo;
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    this._clientInfo = info;
    // TODO: 持久化到数据库或文件系统
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
    // TODO: 持久化到数据库或加密存储
    console.log('✅ OAuth tokens saved (should persist to secure storage)');
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    // 服务器端：输出授权 URL，让用户手动访问
    console.log('\n🔐 请访问以下 URL 完成认证:');
    console.log(url.toString());
    console.log('\n认证完成后，请在回调 URL 中获取授权码。\n');
    // 或者使用浏览器自动打开（如果环境支持）
    // const open = await import('open');
    // await open.default(url.toString());
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    this._codeVerifier = verifier;
  }

  async codeVerifier(): Promise<string> {
    if (!this._codeVerifier) {
      throw new Error('No code verifier stored');
    }
    return this._codeVerifier;
  }
}

export class GoogleCalendarMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private authProvider: ServerOAuthProvider;

  constructor() {
    // 创建 OAuth Provider
    this.authProvider = new ServerOAuthProvider(
      'https://server.smithery.ai/googlecalendar',
      'TripNara Google Calendar Client'
    );

    // 创建 HTTP 传输层
    this.transport = new StreamableHTTPClientTransport(
      'https://server.smithery.ai/googlecalendar',
      {
        authProvider: this.authProvider,
      }
    );

    // 创建 MCP 客户端
    this.client = new Client({
      name: 'tripnara-google-calendar-client',
      version: '1.0.0',
    });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
    console.log('✅ Google Calendar MCP client connected');
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  /**
   * 列出日历事件
   */
  async listEvents(params: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }): Promise<any> {
    const result = await this.client.callTool({
      name: 'events_list',
      arguments: params,
    });
    return result;
  }

  /**
   * 创建日历事件
   */
  async createEvent(params: {
    calendarId?: string;
    summary: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    description?: string;
    location?: string;
  }): Promise<any> {
    const result = await this.client.callTool({
      name: 'create_event',
      arguments: params,
    });
    return result;
  }

  /**
   * 删除日历事件
   */
  async deleteEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<any> {
    const result = await this.client.callTool({
      name: 'delete_event',
      arguments: params,
    });
    return result;
  }

  /**
   * 获取当前日期时间
   */
  async getCurrentDateTime(): Promise<any> {
    const result = await this.client.callTool({
      name: 'get_current_date_time',
      arguments: {},
    });
    return result;
  }

  /**
   * 查找空闲时间段
   */
  async findFreeSlots(params: {
    calendarId?: string;
    timeMin: string;
    timeMax: string;
    durationMinutes?: number;
  }): Promise<any> {
    const result = await this.client.callTool({
      name: 'find_free_slots',
      arguments: params,
    });
    return result;
  }
}
```

#### 使用示例

```typescript
// 示例：在行程执行服务中使用 Google Calendar
import { GoogleCalendarMcpClient } from './mcp/google-calendar-client';

async function syncTripToCalendar(tripId: string) {
  const calendarClient = new GoogleCalendarMcpClient();
  
  try {
    await calendarClient.connect();
    
    // 获取行程信息
    const trip = await getTrip(tripId);
    
    // 为每个行程项创建日历事件
    for (const day of trip.days) {
      for (const item of day.items) {
        await calendarClient.createEvent({
          summary: item.placeName,
          start: {
            dateTime: item.startTime,
            timeZone: trip.timezone,
          },
          end: {
            dateTime: item.endTime,
            timeZone: trip.timezone,
          },
          description: `行程项: ${item.placeName}`,
          location: item.place?.address,
        });
      }
    }
    
    console.log('✅ 行程已同步到 Google Calendar');
  } catch (error) {
    console.error('❌ 同步失败:', error);
  } finally {
    await calendarClient.disconnect();
  }
}
```

---

## 🛠️ 可用工具列表

Google Calendar MCP 服务提供以下主要工具：

### 事件管理
- `events_list` - 列出日历事件
- `create_event` - 创建新事件
- `delete_event` - 删除事件
- `patch_event` - 部分更新事件
- `update_event` - 完整更新事件
- `find_event` - 查找特定事件

### 日历管理
- `list_calendars` - 列出所有日历
- `get_calendar` - 获取日历详情
- `create_calendar` - 创建新日历
- `delete_calendar` - 删除日历
- `update_calendar` - 更新日历

### 实用工具
- `get_current_date_time` - 获取当前日期时间
- `find_free_slots` - 查找空闲时间段
- `quick_add` - 快速添加事件（自然语言）

### 参与者管理
- `remove_attendee` - 移除参与者
- `add_attendee` - 添加参与者

完整工具列表请参考 [Smithery 文档](https://smithery.ai/server/googlecalendar)。

---

## 🔐 认证说明

Smithery 的 Google Calendar MCP 服务遵循 MCP 授权规范：

1. **首次连接**: 会自动打开浏览器进行 Google OAuth 认证
2. **后续使用**: 认证信息会被保存，无需重复认证
3. **权限范围**: 需要访问 Google Calendar 的读写权限

---

## 💡 使用场景

### 场景 1: 行程同步到日历

将 TripNara 生成的行程自动同步到用户的 Google Calendar：

```typescript
// 在行程生成后自动同步
async function onTripCreated(trip: Trip) {
  const calendarClient = new GoogleCalendarMcpClient();
  await calendarClient.connect();
  
  // 创建日历事件
  for (const day of trip.days) {
    for (const item of day.items) {
      await calendarClient.createEvent({
        summary: `${day.dayNumber} - ${item.placeName}`,
        start: { dateTime: item.startTime },
        end: { dateTime: item.endTime },
        description: `行程: ${trip.name}`,
      });
    }
  }
}
```

### 场景 2: 检查用户可用时间

在规划行程前，检查用户日历中的空闲时间：

```typescript
async function checkUserAvailability(date: string) {
  const calendarClient = new GoogleCalendarMcpClient();
  await calendarClient.connect();
  
  const freeSlots = await calendarClient.findFreeSlots({
    timeMin: `${date}T00:00:00Z`,
    timeMax: `${date}T23:59:59Z`,
    durationMinutes: 60, // 至少需要 1 小时空闲
  });
  
  return freeSlots;
}
```

### 场景 3: 行程变更提醒

当行程发生变更时，自动更新日历事件：

```typescript
async function updateCalendarOnTripChange(tripId: string, changes: TripChange[]) {
  const calendarClient = new GoogleCalendarMcpClient();
  await calendarClient.connect();
  
  for (const change of changes) {
    if (change.type === 'time_change') {
      await calendarClient.patchEvent({
        calendarId: 'primary',
        eventId: change.eventId,
        start: { dateTime: change.newStartTime },
        end: { dateTime: change.newEndTime },
      });
    }
  }
}
```

---

## 🧪 测试连接

### 测试方法 1: 使用桥接服务器（Claude Desktop）

1. 启动桥接服务器：
   ```bash
   npx tsx src/mcp/google-calendar-bridge-server.ts
   ```

2. 首次运行会提示访问认证 URL，完成 OAuth 认证

3. 在 Claude Desktop 中配置桥接服务器（见方式 2）

4. 在对话中询问："列出我今天的日历事件"

5. 如果成功返回事件列表，说明连接正常

### 测试方法 2: 使用代码测试

创建测试脚本：

```typescript
// scripts/test-google-calendar-mcp.ts
import { GoogleCalendarMcpClient } from '../src/mcp/google-calendar-client';

async function test() {
  const client = new GoogleCalendarMcpClient();
  
  try {
    await client.connect();
    console.log('✅ 连接成功');
    
    const now = await client.getCurrentDateTime();
    console.log('当前时间:', now);
    
    const events = await client.listEvents({
      maxResults: 5,
    });
    console.log('事件列表:', events);
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await client.disconnect();
  }
}

test();
```

运行测试：
```bash
npx tsx scripts/test-google-calendar-mcp.ts
```

---

## ⚠️ 注意事项

1. **网络连接**: 远程服务器需要稳定的网络连接
2. **认证**: 首次使用需要完成 Google OAuth 认证流程
3. **配额限制**: Smithery 服务可能有调用频率限制，请参考其文档
4. **错误处理**: 建议添加重试机制和错误处理
5. **隐私**: 确保用户了解数据会被同步到 Google Calendar

---

## 📚 相关资源

- [Smithery Google Calendar MCP 服务页面](https://smithery.ai/server/googlecalendar)
- [MCP SDK 文档](https://modelcontextprotocol.io/)
- [Smithery 使用文档](https://smithery.ai/docs/use/connect)
- [Google Calendar API 文档](https://developers.google.com/calendar/api)

---

## 🔄 更新日志

- **2026-02-06**: 初始版本，添加 Google Calendar MCP 集成指南
