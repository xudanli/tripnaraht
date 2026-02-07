# File Extractor MCP 测试指南

## 📋 概述

File Extractor MCP 服务需要 OAuth 认证才能使用。本文档说明如何完成认证和测试。

---

## 🔐 认证步骤

### 方法 1: 使用认证助手脚本（推荐）

```bash
npm run mcp:auth:file-extractor
```

脚本会：
1. 尝试连接服务
2. 如果需要认证，显示认证 URL
3. 引导您完成认证流程
4. 验证认证状态

### 方法 2: 手动认证

1. **运行诊断脚本查看认证 URL**:
   ```bash
   npx tsx scripts/test-file-extractor-diagnose.ts
   ```

2. **访问显示的认证 URL**（在浏览器中打开）

3. **完成 OAuth 授权**

4. **认证信息会自动保存**到 `~/.tripnara-mcp/file-extractor-mcp-*.json`

---

## 🧪 测试方法

### 1. 测试 MCP 客户端连接

```bash
npm run mcp:test:file-extractor
```

这会测试：
- ✅ 连接到 File Extractor MCP 服务器
- ✅ 列出所有可用工具
- ✅ 提取文件元数据
- ✅ 提取文件内容

### 2. 测试 HTTP API（需要服务器运行）

首先确保 NestJS 服务器运行：
```bash
npm run dev
```

然后测试 API：
```bash
npm run mcp:test:file-extractor:api
```

### 3. 诊断连接问题

```bash
npx tsx scripts/test-file-extractor-diagnose.ts
```

---

## 📝 测试用例

### 测试用例 1: 提取 PDF 元数据

```typescript
import { FileExtractorMcpClient } from './mcp/file-extractor-client';

const client = new FileExtractorMcpClient();
await client.connect();

const metadata = await client.extractMetadata(
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
);

console.log('元数据:', metadata);
```

### 测试用例 2: 提取 PDF 内容（分页）

```typescript
const content = await client.extractFileContent(
  'https://example.com/document.pdf',
  {
    page: 1,
    limit: 100,
  }
);

console.log('内容:', content);
```

### 测试用例 3: 搜索 Excel 文件内容

```typescript
const results = await client.extractFileContent(
  'https://example.com/data.xlsx',
  {
    search: '关键词',
    caseSensitive: false,
    sheet: 'Sheet1',
  }
);

console.log('搜索结果:', results);
```

---

## ⚠️ 常见问题

### 1. 连接超时

**症状**: `Request timed out`

**可能原因**:
- 服务 URL 不正确
- 网络连接问题
- 服务需要认证但未完成

**解决方法**:
1. 检查服务 URL 是否正确
2. 运行诊断脚本检查网络连接
3. 完成 OAuth 认证

### 2. 未授权错误

**症状**: `Unauthorized` 或 `UnauthorizedError`

**解决方法**:
1. 运行 `npm run mcp:auth:file-extractor` 完成认证
2. 检查 `~/.tripnara-mcp/` 目录中是否有认证文件
3. 如果认证文件存在但仍有问题，删除后重新认证

### 3. 服务不可用

**症状**: HTTP API 返回 `service is not available`

**解决方法**:
1. 检查 File Extractor MCP 服务是否正常初始化
2. 查看服务器日志中的错误信息
3. 确认服务 URL 配置正确

---

## 🔍 调试技巧

### 查看认证信息

```bash
ls -la ~/.tripnara-mcp/file-extractor-mcp-*
```

### 查看服务器日志

如果使用 NestJS HTTP API，查看服务器启动日志：
```bash
npm run dev
```

查找 `File Extractor MCP service initialized` 或错误信息。

### 测试网络连接

```bash
curl -v https://server.smithery.ai/@dravidsajinraj-iex/file-extractor-mcp
```

---

## 📊 测试结果示例

### 成功连接

```
✅ Connected to File Extractor MCP server
✅ Found 2 tools:
   1. extract_metadata: Extract file metadata
   2. extract_file_content: Extract file content
✅ Metadata extraction successful
✅ Content extraction successful
```

### 需要认证

```
🔐 需要 OAuth 认证
请访问以下 URL 完成认证:
https://auth.smithery.ai/...
等待认证完成...
```

---

## 🎯 下一步

完成认证后，您可以：

1. **在代码中使用**:
   ```typescript
   import { FileExtractorMcpService } from './mcp/file-extractor-mcp.service';
   ```

2. **通过 HTTP API 使用**:
   ```bash
   curl -X POST http://localhost:3000/api/file-extractor-mcp/extract-metadata \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com/file.pdf"}'
   ```

3. **在 MCP Skills Server 中使用**:
   工具会自动注册为 `file_extractor.extract_metadata` 和 `file_extractor.extract_file_content`

---

**最后更新**: 2026-02-07
