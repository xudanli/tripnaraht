# 路线模板数据整合到推荐系统

## ✅ 已完成

已将路线模板（RouteTemplate）和路线方向（RouteDirection）数据整合到目的地推荐系统中。

## 设计目标

1. **数据源扩展**：推荐引擎不仅使用内置数据和 ReadinessPack，还使用路线方向数据
2. **数据丰富度**：路线方向包含更详细的信息（标签、季节性、风险画像等）
3. **向后兼容**：不影响现有的推荐逻辑，路线方向数据作为补充数据源

## 实现状态

✅ **已完成**：
- 在 `RecommendationEngineService` 中注入 `RouteDirectionsService`
- 在 `getCandidates` 方法中添加从路线方向获取数据的逻辑
- 添加 `createDestinationFromRouteDirection` 方法转换数据格式
- 更新 `SharedAssistantsModule` 导入 `RouteDirectionsModule`
- 编译通过，无错误

## 数据映射

### RouteDirection → DestinationRecommendation

| RouteDirection 字段 | DestinationRecommendation 字段 | 说明 |
|-------------------|------------------------------|------|
| `countryCode` | `countryCode` | 直接映射 |
| `nameCN` / `nameEN` | `nameCN` / `name` | 名称映射 |
| `description` | `description` / `descriptionCN` | 描述映射 |
| `tags` | `tags` | 标签数组 |
| `tags` (前4个) | `highlights` / `highlightsCN` | 亮点（翻译后） |
| `seasonality.bestMonths` | `bestSeasons` | 最佳季节（格式化） |
| `metadata.budgetRange` | `estimatedBudget` | 预算范围（如果有） |
| `id` (转换为字符串) | `id` | ID映射（格式：`route_direction_${id}`） |

## 实现方案

### 1. 修改 RecommendationEngineService

在 `getCandidates` 方法中添加从路线方向获取数据的逻辑：

```typescript
// 从路线方向获取（如果可用）
if (this.routeDirectionsService && normalizedCountryCode) {
  try {
    const routeDirections = await this.routeDirectionsService.findRouteDirectionsByCountry(
      normalizedCountryCode,
      { limit: 10 }
    );
    
    for (const rd of routeDirections.active) {
      // 转换为 DestinationRecommendation
      const destination = this.createDestinationFromRouteDirection(rd);
      if (!candidates.some(c => c.id === destination.id)) {
        candidates.push(destination);
      }
    }
  } catch (error: any) {
    this.logger.warn(`从路线方向获取候选失败: ${error.message}`);
  }
}
```

### 2. 添加转换方法

```typescript
private createDestinationFromRouteDirection(rd: RouteDirectionData): DestinationRecommendation {
  const seasonality = rd.seasonality as any;
  const bestMonths = seasonality?.bestMonths || [];
  
  return {
    id: `route_direction_${rd.id}`,
    countryCode: rd.countryCode,
    name: rd.nameEN || rd.name || '',
    nameCN: rd.nameCN || rd.name || '',
    description: rd.description || '',
    descriptionCN: rd.description || '',
    highlights: rd.tags?.slice(0, 4) || [],
    highlightsCN: this.translateTags(rd.tags?.slice(0, 4) || []),
    matchScore: 0, // 将在 scoreDestination 中计算
    matchReasons: [],
    matchReasonsCN: [],
    estimatedBudget: {
      min: 2000,
      max: 8000,
      currency: 'USD',
    },
    bestSeasons: this.formatBestSeasons(bestMonths),
    tags: rd.tags || [],
    imageUrl: undefined,
  };
}
```

## 优先级

数据源优先级（从高到低）：
1. **内置数据**（destinationTags）- 最可靠，数据完整
2. **路线方向数据**（RouteDirection）- 丰富的信息，包含路线规划知识
3. **ReadinessPack 数据**（数据库）- 补充数据源

## 优势

1. **更丰富的推荐信息**：路线方向包含标签、季节性、风险画像等
2. **更好的匹配度**：基于路线规划知识，推荐更符合实际旅行需求
3. **可扩展性**：随着路线方向数据的增加，推荐质量会持续提升

## 注意事项

1. **ID 冲突**：路线方向的 ID 格式为 `route_direction_${id}`，避免与内置数据冲突
2. **可选依赖**：RouteDirectionsService 作为可选依赖，如果不可用则跳过
3. **性能考虑**：路线方向查询可能较慢，需要适当的错误处理和超时控制
