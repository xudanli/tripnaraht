# File Extractor Direct Service 配置指南

## 概述

File Extractor Direct Service 是无需 OAuth 认证的文件提取服务，可以直接使用，无需配置 MCP 服务器。

---

## 配置方案 2：使用 Direct Service（推荐）

### 步骤 1: 禁用 MCP 服务（可选）

为了避免 MCP 连接警告，可以在 `.env` 文件中添加：

```bash
# 禁用 File Extractor MCP 服务，直接使用 Direct Service
ENABLE_FILE_EXTRACTOR_MCP=false
```

**效果**:
- ✅ 不会尝试连接 MCP 服务器
- ✅ 不会出现 Unauthorized 警告
- ✅ 直接使用 Direct Service

### 步骤 2: 验证 Direct Service 状态

```bash
# 检查服务健康状态
curl http://localhost:3000/api/file-extractor-direct/health
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "file-extractor-direct"
  }
}
```

---

## API 接口

### 基础路径

所有 File Extractor Direct API 的基础路径为：`/api/file-extractor-direct`

### 1. 健康检查

**端点**: `GET /api/file-extractor-direct/health`

**描述**: 检查 Direct Service 是否可用

**示例请求**:
```bash
curl http://localhost:3000/api/file-extractor-direct/health
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "file-extractor-direct"
  }
}
```

---

### 2. 提取文件元数据

**端点**: `POST /api/file-extractor-direct/extract-metadata`

**描述**: 提取文件的元数据（文件名、大小、类型等）

**请求体**:
```json
{
  "url": "https://example.com/document.pdf"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "filename": "document.pdf",
    "size": 1024000,
    "type": "application/pdf",
    "pages": 10
  }
}
```

**示例请求**:
```bash
curl -X POST http://localhost:3000/api/file-extractor-direct/extract-metadata \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/document.pdf"}'
```

---

### 3. 提取文件内容

**端点**: `POST /api/file-extractor-direct/extract-content`

**描述**: 提取文件的完整内容（文本、表格等）

**请求体**:
```json
{
  "url": "https://example.com/document.pdf",
  "page": 1,
  "limit": 10,
  "search": "关键词",
  "sheet": "Sheet1"
}
```

**参数说明**:
- `url` (必需): 文件 URL
- `page` (可选): 页码（PDF 文档）
- `limit` (可选): 限制返回的行数
- `search` (可选): 搜索关键词
- `sheet` (可选): Excel 工作表名称

**响应示例**:
```json
{
  "success": true,
  "data": {
    "content": "文件内容...",
    "metadata": {
      "pages": 10,
      "totalRows": 100
    }
  }
}
```

**示例请求**:
```bash
curl -X POST http://localhost:3000/api/file-extractor-direct/extract-content \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/document.pdf",
    "page": 1,
    "limit": 10
  }'
```

---

## 使用场景

### 场景 1: 提取 PDF 文档内容

```bash
curl -X POST http://localhost:3000/api/file-extractor-direct/extract-content \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/travel-guide.pdf"}'
```

### 场景 2: 提取 Excel 表格数据

```bash
curl -X POST http://localhost:3000/api/file-extractor-direct/extract-content \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/itinerary.xlsx",
    "sheet": "行程安排",
    "limit": 50
  }'
```

### 场景 3: 搜索文档内容

```bash
curl -X POST http://localhost:3000/api/file-extractor-direct/extract-content \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/document.pdf",
    "search": "冰岛",
    "caseSensitive": false
  }'
```

---

## 与 MCP 服务的对比

| 特性 | Direct Service | MCP Service |
|------|---------------|-------------|
| **认证** | ❌ 无需认证 | ✅ 需要 OAuth |
| **配置** | ✅ 开箱即用 | ⚠️ 需要认证配置 |
| **功能** | ✅ 完整功能 | ✅ 完整功能 |
| **性能** | ✅ 直接调用 | ⚠️ 通过 MCP 桥接 |
| **推荐** | ✅ **推荐** | ⚠️ 需要认证时使用 |

---

## 故障排除

### 问题 1: 服务不可用

**检查**:
```bash
curl http://localhost:3000/api/file-extractor-direct/health
```

**解决方案**:
- 确保服务器正在运行
- 检查 `FileExtractorDirectModule` 是否正确导入

### 问题 2: 提取失败

**可能原因**:
- URL 不可访问
- 文件格式不支持
- 文件过大（默认限制 100MB）

**解决方案**:
- 检查 URL 是否可访问
- 确认文件格式是否支持（PDF、Excel、Word 等）
- 检查文件大小是否超过限制

---

## 相关文档

- `src/mcp/FILE_EXTRACTOR_DIRECT_API.md` - Direct Service API 完整文档
- `src/mcp/FILE_EXTRACTOR_DIRECT_SETUP.md` - Direct Service 设置指南
- `src/mcp/file-extractor-direct.service.ts` - Direct Service 实现

---

**最后更新**: 2026-02-10
