# File Extractor MCP 服务集成指南

## 📋 概述

本文档说明如何将 [Smithery 提供的 File Extractor MCP 服务](https://smithery.ai/server/@dravidsajinraj-iex/file-extractor-mcp) 集成到项目中。

### 服务信息

- **服务名称**: File Extractor MCP Server
- **服务 URL**: `https://server.smithery.ai/@dravidsajinraj-iex/file-extractor-mcp`
- **服务类型**: 远程 HTTP/SSE MCP 服务器
- **功能**: 从各种文件格式中提取内容和元数据

### 支持的文件格式

- ✅ PDF
- ✅ DOC, DOCX
- ✅ PPTX
- ✅ CSV
- ✅ XLSX

### 核心能力

- ✅ **元数据提取**: 提取文件属性（来源、文件名、格式、大小等）
- ✅ **内容提取**: 提取文件内容，支持分页和搜索
- ✅ **URL 下载**: 处理公开 URL 的文件下载
- ✅ **云存储支持**: 支持 Google Drive 和其他云存储 URL

---

## 🔧 集成方式

### 方式 1: 在 Cursor 中使用（推荐）⭐

File Extractor 工具已经集成到 MCP Skills Server 中，重启 Cursor 后即可使用：

1. **提取文件元数据**:
   ```
   提取这个 PDF 文件的元数据: https://example.com/document.pdf
   ```

2. **提取文件内容**:
   ```
   提取这个 Excel 文件的内容: https://example.com/data.xlsx
   ```

3. **搜索文件内容**:
   ```
   在这个文档中搜索关键词 "trip": https://example.com/document.pdf
   ```

### 方式 2: 在 Claude Desktop 中使用

#### 配置 Claude Desktop

在 Claude Desktop 配置文件中添加（根据您的操作系统）：

**macOS**:
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows**:
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux**:
```bash
~/.config/Claude/claude_desktop_config.json
```

配置内容：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": ["tsx", "src/mcp/mcp-skills-server.ts"],
      "cwd": "/home/devbox/project"
    },
    "file-extractor": {
      "command": "npx",
      "args": ["tsx", "src/mcp/file-extractor-bridge-server.ts"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

**注意**: 将 `cwd` 路径替换为您的实际项目路径。

---

### 方式 3: 创建桥接 MCP 服务器（用于项目集成）⭐

桥接服务器已创建在 `src/mcp/file-extractor-bridge-server.ts`，可以直接使用。

#### 启动桥接服务器

```bash
npm run mcp:file-extractor
```

---

### 方式 4: 在代码中集成（程序化使用）

如果需要在项目代码中直接使用 File Extractor 功能，可以使用客户端类。

#### 创建客户端连接

```typescript
import { FileExtractorMcpClient } from './mcp/file-extractor-client';

const client = new FileExtractorMcpClient();
await client.connect();

// 提取元数据
const metadata = await client.extractMetadata('https://example.com/document.pdf');

// 提取内容
const content = await client.extractFileContent('https://example.com/document.pdf', {
  page: 1,
  limit: 10,
});

// 搜索内容
const searchResults = await client.extractFileContent('https://example.com/document.pdf', {
  search: '关键词',
  caseSensitive: false,
});

await client.disconnect();
```

---

## 🛠️ 工具列表

### 1. `file_extractor.extract_metadata`

提取文件的元数据信息。

**参数**:
- `url` (string, 必需): 文件的公开 URL

**返回**: 文件元数据对象，包含：
- `source`: 文件来源
- `filename`: 文件名
- `format`: 文件格式
- `size`: 文件大小
- 其他属性

**示例**:
```typescript
{
  url: "https://example.com/document.pdf"
}
```

---

### 2. `file_extractor.extract_file_content`

提取文件的内容。

**参数**:
- `url` (string, 必需): 文件的公开 URL
- `page` (number, 可选): 页码（用于 PDF、PPTX）
- `limit` (number, 可选): 返回结果数量限制
- `search` (string, 可选): 搜索关键词（用于电子表格）
- `sheet` (string, 可选): 工作表名称（用于 Excel）
- `caseSensitive` (boolean, 可选): 搜索是否区分大小写

**返回**: 文件内容对象

**示例**:
```typescript
{
  url: "https://example.com/document.pdf",
  page: 1,
  limit: 10
}
```

---

## 📁 文件结构

```
src/mcp/
├── file-extractor-bridge-server.ts    # File Extractor 桥接服务器
├── file-extractor-client.ts            # File Extractor 客户端
├── FILE_EXTRACTOR_MCP_INTEGRATION.md  # 本文件

scripts/
├── test-file-extractor-mcp.ts         # File Extractor 测试
└── file-extractor-auth.ts             # File Extractor 认证助手
```

---

## 🧪 测试

### 运行测试脚本

```bash
# 测试连接和功能
npm run mcp:test:file-extractor

# 认证助手（如果需要）
npm run mcp:auth:file-extractor
```

### 测试示例

测试脚本会：
1. ✅ 连接到 File Extractor MCP 服务器
2. ✅ 列出所有可用工具
3. ✅ 测试提取文件元数据
4. ✅ 测试提取文件内容

---

## 🔐 认证

File Extractor MCP 服务可能需要 OAuth 认证（取决于服务配置）。

### 首次认证

如果服务需要认证，运行：

```bash
npm run mcp:auth:file-extractor
```

认证信息会保存在 `~/.tripnara-mcp/file-extractor-mcp-*.json` 文件中。

---

## 💡 使用场景

### 在 TripNara 中的应用

- ✅ **行程文档处理**: 从用户上传的 PDF 行程文档中提取信息
- ✅ **数据导入**: 从 Excel/CSV 文件中导入行程数据
- ✅ **内容分析**: 分析旅行指南、攻略文档的内容
- ✅ **元数据提取**: 获取文档的基本信息用于分类和搜索

---

## 🔄 集成到 MCP Skills Server

File Extractor 工具已自动集成到 `mcp-skills-server.ts` 中。

工具名称格式: `file_extractor.{tool_name}`

例如：
- `file_extractor.extract_metadata`
- `file_extractor.extract_file_content`

---

## 📚 相关资源

- [Smithery 平台](https://smithery.ai/) - 浏览更多 MCP 服务
- [File Extractor MCP 服务页面](https://smithery.ai/server/@dravidsajinraj-iex/file-extractor-mcp)
- [MCP SDK 文档](https://modelcontextprotocol.io/) - MCP SDK 官方文档

---

## ✅ 状态

- ✅ File Extractor MCP - 已集成，可以使用
- ✅ 桥接服务器 - 已创建
- ✅ 客户端类 - 已创建
- ✅ 测试脚本 - 已创建
- ✅ 集成到 MCP Skills Server - 已完成

---

**最后更新**: 2026-02-07
