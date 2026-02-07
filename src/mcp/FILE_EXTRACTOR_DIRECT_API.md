# File Extractor Direct API 接口文档

**服务名称**: File Extractor Direct Service  
**Base URL**: `/api/file-extractor-direct`  
**认证**: ✅ **无需认证**（完全自主实现）

---

## 📋 概述

File Extractor Direct Service 是直接实现的文件提取服务，不依赖外部 MCP 服务，**无需 OAuth 认证**。

### 特点

- ✅ **无需认证** - 完全自主实现，无需 OAuth
- ✅ **更稳定** - 不依赖第三方服务
- ✅ **更快速** - 本地处理，无需网络请求到外部服务
- ✅ **支持格式**: PDF, DOCX, XLSX, CSV

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/file-extractor-direct/health
```

**响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "file-extractor-direct",
    "features": ["PDF", "DOCX", "XLSX", "CSV"],
    "authentication": "none"
  }
}
```

### 2. 提取文件元数据

```bash
curl -X POST http://localhost:3000/api/file-extractor-direct/extract-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/document.pdf"
  }'
```

### 3. 提取文件内容

```bash
curl -X POST http://localhost:3000/api/file-extractor-direct/extract-content \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/document.pdf",
    "page": 1,
    "limit": 100
  }'
```

---

## 📡 API 端点

### 1. 检查服务状态

**端点**: `GET /api/file-extractor-direct/health`

**描述**: 检查 File Extractor Direct 服务是否可用

**响应**:
```typescript
interface HealthResponse {
  success: boolean;
  data: {
    available: boolean;
    service: string;
    features: string[];  // ["PDF", "DOCX", "XLSX", "CSV"]
    authentication: "none";
  };
}
```

---

### 2. 提取文件元数据

**端点**: `POST /api/file-extractor-direct/extract-metadata`

**描述**: 从文件的公开 URL 提取元数据信息

**请求体**:
```typescript
interface ExtractMetadataDto {
  url: string;  // 文件的公开 URL
}
```

**响应**:
```typescript
interface ExtractMetadataResponse {
  success: boolean;
  data: {
    source: string;      // 文件来源 URL
    filename: string;    // 文件名
    format: string;      // 文件格式（PDF, DOCX, XLSX 等）
    size: number;        // 文件大小（字节）
    mimeType?: string;   // MIME 类型
    pages?: number;      // PDF 页数
    sheets?: string[];   // Excel 工作表列表
    title?: string;      // PDF 标题（如果有）
    author?: string;     // PDF 作者（如果有）
  };
}
```

**示例**:
```typescript
const metadata = await fetch('/api/file-extractor-direct/extract-metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com/document.pdf' }),
});

const result = await metadata.json();
console.log('文件名:', result.data.filename);
console.log('文件大小:', result.data.size);
console.log('页数:', result.data.pages);
```

---

### 3. 提取文件内容

**端点**: `POST /api/file-extractor-direct/extract-content`

**描述**: 从文件的公开 URL 提取内容

**请求体**:
```typescript
interface ExtractFileContentDto {
  url: string;                    // 文件的公开 URL（必需）
  page?: number;                  // 页码（用于 PDF）
  limit?: number;                 // 返回结果数量限制
  search?: string;                 // 搜索关键词（用于 Excel/CSV）
  sheet?: string;                 // 工作表名称（用于 Excel）
  caseSensitive?: boolean;         // 搜索是否区分大小写
}
```

**响应**:
```typescript
interface ExtractFileContentResponse {
  success: boolean;
  data: {
    content: string | any[];       // 文件内容（文本或结构化数据）
    page?: number;                 // 当前页码（PDF）
    totalPages?: number;           // 总页数（PDF）
    sheet?: string;                // 工作表名称（Excel）
  };
}
```

**示例**:

#### 提取 PDF 内容
```typescript
const content = await fetch('/api/file-extractor-direct/extract-content', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com/document.pdf',
    page: 1,
    limit: 1000,
  }),
});
```

#### 提取 Excel 内容并搜索
```typescript
const results = await fetch('/api/file-extractor-direct/extract-content', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com/data.xlsx',
    sheet: 'Sheet1',
    search: '关键词',
    caseSensitive: false,
  }),
});
```

---

## 📊 支持的文件格式

| 格式 | 元数据提取 | 内容提取 | 分页支持 | 搜索支持 |
|------|-----------|---------|---------|---------|
| **PDF** | ✅ | ✅ | ✅ | ✅ |
| **DOCX** | ✅ | ✅ | ❌ | ✅ |
| **XLSX** | ✅ | ✅ | ❌ | ✅ |
| **CSV** | ✅ | ✅ | ❌ | ✅ |
| **PPTX** | ⚠️ 部分 | ❌ | ❌ | ❌ |

---

## 💡 使用示例

### React Hook 示例

```typescript
import { useState } from 'react';

export const useFileExtractorDirect = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractMetadata = async (url: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/file-extractor-direct/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      const result = await response.json();
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error?.message || '提取元数据失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const extractContent = async (
    url: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      sheet?: string;
      caseSensitive?: boolean;
    }
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/file-extractor-direct/extract-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...options }),
      });
      
      const result = await response.json();
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error?.message || '提取内容失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    extractMetadata,
    extractContent,
  };
};
```

---

## ⚠️ 注意事项

### 1. 文件大小限制

- **最大文件大小**: 100MB
- **超时时间**: 60秒
- **建议**: 对于大文件，使用分页提取

### 2. URL 要求

- **公开访问**: URL 必须是公开可访问的
- **HTTPS 支持**: 支持 HTTPS URL
- **文件格式**: 必须是支持的文件格式

### 3. 性能考虑

- **PDF 处理**: 大 PDF 文件可能需要较长时间
- **Excel 处理**: 大型 Excel 文件建议使用搜索功能限制结果
- **并发限制**: 注意服务器资源限制

### 4. 错误处理

常见错误：
- **文件下载失败**: URL 无法访问或网络问题
- **不支持的文件格式**: 文件格式不在支持列表中
- **文件过大**: 超过 100MB 限制
- **超时**: 文件处理时间超过 60 秒

---

## 🔄 与 MCP 服务的区别

| 特性 | Direct Service | MCP Service |
|------|---------------|-------------|
| **认证** | ✅ 无需认证 | ❌ 需要 OAuth |
| **稳定性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **速度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **功能** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **支持格式** | PDF, DOCX, XLSX, CSV | PDF, DOCX, PPTX, CSV, XLSX |

**建议**: 
- **优先使用 Direct Service**（无需认证，更稳定）
- **需要 PPTX 支持时**使用 MCP Service（如果已认证）

---

## 🧪 测试

```bash
# 运行测试脚本
npm run mcp:test:file-extractor:direct
```

测试脚本会测试：
- ✅ 健康检查
- ✅ PDF 元数据和内容提取
- ✅ DOCX 元数据和内容提取
- ✅ XLSX 元数据和内容提取
- ✅ Excel 搜索功能
- ✅ 错误处理

---

## 📚 相关文档

- **无认证方案文档**: `FILE_EXTRACTOR_NO_AUTH_OPTIONS.md`
- **MCP 服务文档**: `FILE_EXTRACTOR_MCP_FRONTEND_API.md`
- **测试指南**: `FILE_EXTRACTOR_MCP_TEST_GUIDE.md`

---

**最后更新**: 2026-02-07  
**版本**: v1.0  
**状态**: ✅ 已完成（无需认证，可直接使用）
