# Place Embedding 自动更新机制

## 概述

当 Place 数据发生变化时（特别是影响搜索的文本字段），系统会自动重新生成 embedding，确保向量搜索的准确性。

## 触发条件

以下字段的变化会触发 embedding 的自动更新：

1. **nameCN**（中文名称）
2. **nameEN**（英文名称）
3. **address**（地址）
4. **metadata.description**（描述）
5. **metadata.tags**（标签）

## 实现机制

### 1. 创建 Place 时

在 `PlacesService.createPlace()` 方法中，创建 Place 后会自动异步生成 embedding：

```typescript
// 创建 Place 后，异步生成 embedding（不阻塞创建操作）
this.updatePlaceEmbedding(place.id, {
  nameCN: place.nameCN,
  nameEN: place.nameEN,
  address: place.address,
  metadata: dto.metadata,
}).catch(error => {
  this.logger.warn(`创建 Place ${place.id} 后生成 embedding 失败: ${error?.message || String(error)}`);
});
```

### 2. 更新 Place 时

在 `PlacesService.enrichPlaceFromAmap()` 方法中，如果检测到文本字段变化，会自动触发 embedding 更新：

```typescript
// 检查是否有影响 embedding 的字段发生变化
const textFieldsChanged = 
  (poiData.address && poiData.address !== place.address) ||
  (updatedMetadata.description && updatedMetadata.description !== currentMetadata?.description) ||
  (updatedMetadata.tags && JSON.stringify(updatedMetadata.tags) !== JSON.stringify(currentMetadata?.tags));

// 如果文本信息发生变化，异步更新 embedding
if (textFieldsChanged) {
  this.logger.debug(`Place ${placeId} 文本信息已更新，触发 embedding 更新`);
  this.updatePlaceEmbedding(placeId, {
    nameCN: updated.nameCN,
    nameEN: updated.nameEN,
    address: updated.address,
    metadata: updatedMetadata,
  }).catch(error => {
    this.logger.warn(`更新 Place ${placeId} embedding 失败: ${error?.message || String(error)}`);
  });
}
```

## 核心方法

### `buildSearchText()`

构建用于生成 embedding 的搜索文本，包含：
- 名称（nameCN、nameEN）
- 地址
- 描述（metadata.description）
- 标签（metadata.tags）
- 评论（metadata.reviews，前3条，每条前100字符）

### `updatePlaceEmbedding()`

更新 Place 的 embedding：

1. 构建搜索文本
2. 调用 `EmbeddingService.generateEmbedding()` 生成 embedding
3. 检查是否为降级后的零向量（如果生成失败，会返回零向量）
4. 使用 PostgreSQL 的 `vector` 类型更新数据库

**注意**：
- 这是一个异步操作，不会阻塞 Place 的更新
- 如果 embedding 生成失败，只会记录警告日志，不会抛出错误
- 如果 `EmbeddingService` 未注入，会跳过更新

## 降级策略

如果 embedding 生成失败（例如 API 调用失败），`EmbeddingService` 会返回零向量。`updatePlaceEmbedding()` 会检测到这种情况并跳过更新，避免将无效的零向量写入数据库。

`VectorSearchService` 在检测到零向量时会自动降级到纯关键词搜索，确保搜索功能仍然可用。

## 日志

- **DEBUG**: `Place {id} embedding 已更新`
- **WARN**: `更新 Place {id} embedding 失败: {error}`
- **WARN**: `Place {id} embedding 生成失败（零向量），跳过更新`

## 手动更新

如果需要手动更新所有 Place 的 embedding，可以使用脚本：

```bash
npm run generate:embeddings
```

## 注意事项

1. **异步操作**：embedding 更新是异步的，不会阻塞 Place 的创建/更新操作
2. **错误处理**：embedding 更新失败不会影响 Place 的创建/更新
3. **性能考虑**：批量更新时，embedding 更新会在后台异步进行，不会显著影响性能
4. **数据一致性**：如果 embedding 更新失败，Place 数据仍然有效，只是向量搜索可能使用旧的 embedding 或降级到关键词搜索

