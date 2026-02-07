# File Extractor MCP 前端 API 文档

**服务名称**: File Extractor MCP Server  
**Base URL**: `/api/file-extractor-mcp`  
**服务 URL**: `https://server.smithery.ai/@dravidsajinraj-iex/file-extractor-mcp`  
**认证**: 当前无需认证（生产环境可能需要）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [支持的文件格式](#支持的文件格式)
7. [注意事项](#注意事项)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/file-extractor-mcp/health
```

**响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "file-extractor-mcp"
  }
}
```

### 2. 列出可用工具

```bash
curl http://localhost:3000/api/file-extractor-mcp/tools
```

### 3. 提取文件元数据

```bash
curl -X POST http://localhost:3000/api/file-extractor-mcp/extract-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/document.pdf"
  }'
```

### 4. 提取文件内容

```bash
curl -X POST http://localhost:3000/api/file-extractor-mcp/extract-content \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/document.pdf",
    "page": 1,
    "limit": 10
  }'
```

---

## 📡 API 端点

### 1. 检查服务状态

**端点**: `GET /api/file-extractor-mcp/health`

**描述**: 检查 File Extractor MCP 服务是否可用

**响应**:
```typescript
interface HealthResponse {
  success: boolean;
  data: {
    available: boolean;
    service: string;
  };
}
```

---

### 2. 列出所有可用工具

**端点**: `GET /api/file-extractor-mcp/tools`

**描述**: 获取 File Extractor MCP 服务器提供的所有工具列表

**响应**:
```typescript
interface ToolsResponse {
  success: boolean;
  data: {
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: any;
    }>;
  };
}
```

**示例**:
```typescript
const listTools = async () => {
  const response = await fetch('/api/file-extractor-mcp/tools');
  const result = await response.json();
  if (result.success) {
    return result.data.tools;
  } else {
    throw new Error(result.error?.message || '获取工具列表失败');
  }
};

// 使用
const tools = await listTools();
console.log('可用工具:', tools);
```

---

### 3. 提取文件元数据

**端点**: `POST /api/file-extractor-mcp/extract-metadata`

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
    source?: string;      // 文件来源
    filename?: string;   // 文件名
    format?: string;     // 文件格式
    size?: number;       // 文件大小（字节）
    // ... 其他元数据字段
  };
}
```

**示例**:
```typescript
const extractMetadata = async (url: string) => {
  const response = await fetch('/api/file-extractor-mcp/extract-metadata', {
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
};

// 使用
const metadata = await extractMetadata('https://example.com/document.pdf');
console.log('文件名:', metadata.filename);
console.log('文件格式:', metadata.format);
console.log('文件大小:', metadata.size);
```

---

### 4. 提取文件内容

**端点**: `POST /api/file-extractor-mcp/extract-content`

**描述**: 从文件的公开 URL 提取内容，支持分页、搜索等功能

**请求体**:
```typescript
interface ExtractFileContentDto {
  url: string;                    // 文件的公开 URL（必需）
  page?: number;                  // 页码（用于 PDF、PPTX）
  limit?: number;                 // 返回结果数量限制
  search?: string;                 // 搜索关键词（用于电子表格）
  sheet?: string;                 // 工作表名称（用于 Excel）
  caseSensitive?: boolean;         // 搜索是否区分大小写
}
```

**响应**:
```typescript
interface ExtractFileContentResponse {
  success: boolean;
  data: {
    content: string | any;         // 文件内容（文本或结构化数据）
    page?: number;                 // 当前页码（如果有）
    totalPages?: number;           // 总页数（如果有）
    // ... 其他内容字段
  };
}
```

**示例**:

#### 提取 PDF 内容（分页）

```typescript
const extractPdfContent = async (url: string, page: number = 1) => {
  const response = await fetch('/api/file-extractor-mcp/extract-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      page,
      limit: 100,
    }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '提取内容失败');
  }
};

// 使用
const content = await extractPdfContent('https://example.com/document.pdf', 1);
console.log('第 1 页内容:', content.content);
```

#### 搜索 Excel 文件内容

```typescript
const searchExcelContent = async (url: string, keyword: string) => {
  const response = await fetch('/api/file-extractor-mcp/extract-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      search: keyword,
      caseSensitive: false,
      sheet: 'Sheet1',  // 指定工作表
    }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '搜索失败');
  }
};

// 使用
const results = await searchExcelContent('https://example.com/data.xlsx', 'trip');
console.log('搜索结果:', results);
```

---

## 📊 数据模型

### Metadata

```typescript
interface Metadata {
  source?: string;      // 文件来源
  filename?: string;    // 文件名
  format?: string;      // 文件格式（PDF, DOCX, XLSX 等）
  size?: number;         // 文件大小（字节）
  mimeType?: string;     // MIME 类型
  // ... 其他元数据字段
}
```

### FileContent

```typescript
interface FileContent {
  content: string | any;    // 文件内容（文本或结构化数据）
  page?: number;            // 当前页码（PDF、PPTX）
  totalPages?: number;      // 总页数（PDF、PPTX）
  sheet?: string;           // 工作表名称（Excel）
  // ... 其他内容字段
}
```

---

## ⚠️ 错误处理

### 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

### 常见错误

1. **服务不可用**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "File Extractor MCP service is not available. Please check configuration."
     }
   }
   ```

2. **URL 无法访问**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "Failed to download file from URL"
     }
   }
   ```

3. **不支持的文件格式**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "Unsupported file format"
     }
   }
   ```

4. **参数错误**
   ```json
   {
     "success": false,
     "error": {
       "code": "BAD_REQUEST",
       "message": "Invalid request parameters"
     }
   }
   ```

---

## 💡 使用示例

### React Hook 示例

```typescript
import { useState } from 'react';

export const useFileExtractor = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractMetadata = async (url: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/file-extractor-mcp/extract-metadata', {
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
      const response = await fetch('/api/file-extractor-mcp/extract-content', {
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

### 使用 Hook

```typescript
const FileExtractorComponent = () => {
  const { loading, error, extractMetadata, extractContent } = useFileExtractor();
  const [metadata, setMetadata] = useState<any>(null);
  const [content, setContent] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState('');

  const handleExtractMetadata = async () => {
    try {
      const result = await extractMetadata(fileUrl);
      setMetadata(result);
    } catch (err) {
      console.error('提取元数据失败:', err);
    }
  };

  const handleExtractContent = async () => {
    try {
      const result = await extractContent(fileUrl, { page: 1, limit: 100 });
      setContent(result);
    } catch (err) {
      console.error('提取内容失败:', err);
    }
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div>
      <input
        type="text"
        value={fileUrl}
        onChange={(e) => setFileUrl(e.target.value)}
        placeholder="输入文件 URL"
      />
      <button onClick={handleExtractMetadata}>提取元数据</button>
      <button onClick={handleExtractContent}>提取内容</button>
      
      {metadata && (
        <div>
          <h3>元数据</h3>
          <pre>{JSON.stringify(metadata, null, 2)}</pre>
        </div>
      )}
      
      {content && (
        <div>
          <h3>内容</h3>
          <pre>{JSON.stringify(content, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
```

### 完整业务场景示例

#### 场景 1: 处理用户上传的行程文档

```typescript
/**
 * 处理用户上传的 PDF 行程文档
 */
async function processTripDocument(pdfUrl: string) {
  // 1. 提取元数据
  const metadata = await extractMetadata(pdfUrl);
  console.log('文档信息:', {
    filename: metadata.filename,
    format: metadata.format,
    size: metadata.size,
  });

  // 2. 提取第一页内容
  const firstPage = await extractContent(pdfUrl, {
    page: 1,
    limit: 100,
  });
  
  console.log('第一页内容:', firstPage.content);

  // 3. 如果文档有多页，可以提取更多页
  if (firstPage.totalPages && firstPage.totalPages > 1) {
    const allPages = [];
    for (let page = 1; page <= Math.min(firstPage.totalPages, 5); page++) {
      const pageContent = await extractContent(pdfUrl, {
        page,
        limit: 100,
      });
      allPages.push(pageContent);
    }
    return { metadata, pages: allPages };
  }

  return { metadata, content: firstPage };
}

// 使用
const tripDoc = await processTripDocument('https://example.com/trip-plan.pdf');
```

#### 场景 2: 从 Excel 文件中导入行程数据

```typescript
/**
 * 从 Excel 文件中导入行程数据
 */
async function importTripDataFromExcel(excelUrl: string) {
  // 1. 提取元数据
  const metadata = await extractMetadata(excelUrl);
  console.log('Excel 文件信息:', metadata);

  // 2. 提取第一个工作表的内容
  const sheetContent = await extractContent(excelUrl, {
    sheet: 'Sheet1',
    limit: 1000,
  });

  // 3. 解析为行程数据
  const trips = parseExcelToTrips(sheetContent.content);
  return trips;
}

// 使用
const trips = await importTripDataFromExcel('https://example.com/trips.xlsx');
```

#### 场景 3: 搜索文档中的关键词

```typescript
/**
 * 在文档中搜索关键词
 */
async function searchInDocument(docUrl: string, keyword: string) {
  // 对于 PDF，需要逐页搜索
  const metadata = await extractMetadata(docUrl);
  
  if (metadata.format === 'PDF') {
    const results = [];
    // 假设最多搜索前 10 页
    for (let page = 1; page <= 10; page++) {
      try {
        const pageContent = await extractContent(docUrl, {
          page,
          limit: 1000,
        });
        
        if (pageContent.content.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({
            page,
            content: pageContent.content,
          });
        }
      } catch (error) {
        // 如果页面不存在，停止搜索
        break;
      }
    }
    return results;
  }
  
  // 对于 Excel，使用搜索功能
  if (metadata.format === 'XLSX') {
    const searchResults = await extractContent(docUrl, {
      search: keyword,
      caseSensitive: false,
    });
    return searchResults;
  }
  
  return [];
}

// 使用
const results = await searchInDocument('https://example.com/document.pdf', 'trip');
console.log('搜索结果:', results);
```

---

## 📄 支持的文件格式

### 已支持格式

- ✅ **PDF** - 便携式文档格式
- ✅ **DOC, DOCX** - Microsoft Word 文档
- ✅ **PPTX** - Microsoft PowerPoint 演示文稿
- ✅ **CSV** - 逗号分隔值文件
- ✅ **XLSX** - Microsoft Excel 电子表格

### 格式特性

| 格式 | 元数据提取 | 内容提取 | 分页支持 | 搜索支持 |
|------|-----------|---------|---------|---------|
| PDF | ✅ | ✅ | ✅ | ✅ |
| DOCX | ✅ | ✅ | ❌ | ✅ |
| PPTX | ✅ | ✅ | ✅ | ✅ |
| CSV | ✅ | ✅ | ❌ | ✅ |
| XLSX | ✅ | ✅ | ❌ | ✅ |

---

## ⚠️ 注意事项

### 1. URL 要求

- **公开访问**: URL 必须是公开可访问的，不需要认证
- **HTTPS 支持**: 支持 HTTPS URL
- **云存储支持**: 支持 Google Drive 和其他云存储 URL（如果服务支持）

### 2. 文件大小限制

- **建议大小**: 小于 50MB 的文件处理效果最好
- **大文件**: 大文件可能需要更长的处理时间
- **超时**: 如果文件过大，可能会超时

### 3. 性能考虑

- **分页提取**: 对于大 PDF 文件，使用分页提取而不是一次性提取全部内容
- **限制结果**: 使用 `limit` 参数限制返回结果数量
- **缓存**: 对于重复访问的文件，考虑在前端缓存结果

### 4. 错误处理

- **网络错误**: 处理网络连接失败的情况
- **URL 错误**: 处理 URL 无法访问的情况
- **格式错误**: 处理不支持的文件格式
- **超时**: 设置合理的超时时间

### 5. 安全考虑

- **URL 验证**: 确保只处理可信的 URL
- **文件类型验证**: 验证文件类型是否符合预期
- **内容验证**: 验证提取的内容是否符合预期格式

---

## 📋 接口清单

### 核心功能接口

| 接口 | 方法 | 描述 | 优先级 |
|------|------|------|--------|
| `/extract-metadata` | POST | 提取文件元数据 | ⭐⭐⭐⭐⭐ |
| `/extract-content` | POST | 提取文件内容 | ⭐⭐⭐⭐⭐ |

### 辅助接口

| 接口 | 方法 | 描述 | 优先级 |
|------|------|------|--------|
| `/health` | GET | 服务健康检查 | ⭐⭐⭐ |
| `/tools` | GET | 列出可用工具 | ⭐⭐ |

---

## 🎯 业务场景快速参考

### 场景 1: 行程文档处理

**接口调用顺序**:
```
POST /extract-metadata → POST /extract-content (page=1) → POST /extract-content (page=2) ...
```

**典型用例**: 处理用户上传的 PDF 行程文档，提取行程信息

---

### 场景 2: 数据导入

**接口调用顺序**:
```
POST /extract-metadata → POST /extract-content (sheet=Sheet1)
```

**典型用例**: 从 Excel 文件中导入行程数据、景点信息

---

### 场景 3: 文档搜索

**接口调用顺序**:
```
POST /extract-metadata → POST /extract-content (search=关键词)
```

**典型用例**: 在文档中搜索特定信息、关键词定位

---

## 🔗 相关文档

### 技术文档
- **集成指南**: `FILE_EXTRACTOR_MCP_INTEGRATION.md` - 完整集成文档
- **MCP 服务器文档**: `MCP_SERVERS_SUMMARY.md` - MCP 服务器总结

### 外部资源
- **Smithery 服务器页面**: https://smithery.ai/server/@dravidsajinraj-iex/file-extractor-mcp
- **MCP SDK 文档**: https://modelcontextprotocol.io/

---

**最后更新**: 2026-02-07  
**文档版本**: v1.0  
**状态**: ✅ 已完成（HTTP API 控制器和文档）
