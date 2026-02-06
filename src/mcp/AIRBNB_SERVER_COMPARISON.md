# Airbnb MCP 服务器对比

## 📊 服务器对比结果

### geobio/mcp-server-airbnb
- **状态**: ✅ Connected
- **工具数量**: 2
- **可用工具**:
  1. `airbnb_search` - 搜索 Airbnb 房源
  2. `airbnb_listing_details` - 获取房源详细信息

### iclickfreedownloads/mcp-server-airbnb
- **状态**: ✅ Connected  
- **工具数量**: 4
- **可用工具**:
  1. `airbnb_search` - 搜索 Airbnb 房源
  2. `airbnb_listing_details` - 获取房源详细信息
  3. `getListingPhotos` - 提取房源照片 URL
  4. `analyzeListingPhotos` - 分析房源照片

## 🔍 功能对比

| 功能 | geobio | iclickfreedownloads |
|------|--------|---------------------|
| 搜索房源 | ✅ | ✅ |
| 获取房源详情 | ✅ | ✅ |
| 获取照片 | ❌ | ✅ |
| 分析照片 | ❌ | ✅ |

## 💡 推荐

### 当前项目使用: iclickfreedownloads/mcp-server-airbnb

**原因**:
1. **功能更全面** - 包含照片相关功能，更适合完整的房源展示
2. **已集成** - 项目代码已经使用此服务器
3. **工具更多** - 4个工具 vs 2个工具

### 何时考虑 geobio/mcp-server-airbnb

如果：
- 只需要基本的搜索和详情功能
- 不需要照片相关功能
- 希望使用更简洁的服务器

## 🔄 切换服务器

如果需要切换到 `geobio/mcp-server-airbnb`，需要更新以下文件：

### 1. 更新 `airbnb-client-connect-api.ts`

```typescript
// 第 60 行
mcpUrl: 'https://server.smithery.ai/geobio/mcp-server-airbnb',
```

### 2. 更新 `airbnb-bridge-server.ts`

```typescript
// 第 148 行
const serverUrl = 'https://server.smithery.ai/geobio/mcp-server-airbnb';
```

### 3. 更新相关文档

更新所有提到服务器 URL 的文档。

## 📝 注意事项

1. **OAuth 认证**: 切换服务器后，需要重新进行 OAuth 认证
2. **工具差异**: `geobio` 版本没有照片相关工具，相关代码需要调整
3. **API 兼容性**: 两个服务器的 `airbnb_search` 和 `airbnb_listing_details` 工具参数应该相同

## ✅ 建议

**保持使用 `iclickfreedownloads/mcp-server-airbnb`**，因为：
- 功能更完整
- 已集成照片功能
- 代码已经适配
- 两个服务器都正常工作，但当前使用的功能更多
