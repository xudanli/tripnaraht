# Place 表结构分析

## 当前字段结构

### 基础字段
- `id` - 主键（自增）
- `uuid` - 唯一标识符
- `nameCN` - 中文名称（主要显示）
- `nameEN` - 英文名称（用于国际化）
- `category` - 类别（ATTRACTION, RESTAURANT, SHOPPING, HOTEL, TRANSIT_HUB）
- `location` - 地理位置（PostGIS geography Point）
- `address` - 地址
- `cityId` - 关联城市
- `googlePlaceId` - Google Places API ID（唯一）
- `rating` - 评分（0-5）
- `createdAt` - 创建时间
- `updatedAt` - 更新时间

### JSONB 字段
- `metadata` - 通用元数据（营业时间、联系方式、设施、酒店评分等）
- `physicalMetadata` - 体力消耗元数据（地形、疲劳度、游玩时长等）

## 当前存储在 metadata 中的常见数据

根据代码分析，以下数据目前存储在 `metadata` JSONB 中：

1. **基础信息**
   - `description` - 描述/简介
   - `source` - 数据来源（'mafengwo', 'osm', 'iceland_lmi' 等）
   - `sourceUrl` - 原始数据URL
   - `images` - 图片URL数组
   - `tags` - 标签数组

2. **营业时间**
   - `openingHours` - 结构化营业时间

3. **联系方式**
   - `phone` - 电话
   - `website` - 网站
   - `contact` - 联系方式对象

4. **酒店特定**
   - `location_score` - 位置评分
   - `hotel_tier` - 酒店星级

5. **景点特定**
   - `ticketPrice` - 门票价格
   - `subCategory` - 子类别（如自然POI）
   - `mainCategory` - 主类别

## 是否需要添加独立字段？

### ✅ 建议保持现状（使用 JSONB）

**理由：**
1. **灵活性**：不同类别的地点需要不同的字段结构
2. **查询性能**：PostgreSQL JSONB 支持 GIN 索引，查询性能良好
3. **扩展性**：新增字段无需修改 schema
4. **代码简洁**：避免大量可选字段

### ⚠️ 可考虑添加的字段（如果查询频率很高）

如果以下字段经常被用于：
- WHERE 条件过滤
- ORDER BY 排序
- 频繁的全文搜索

可以考虑提取为独立字段：

#### 1. `description` (Text?)
- **用途**：地点描述/简介
- **当前**：存储在 `metadata->>'description'`
- **建议**：如果经常需要全文搜索，可以考虑独立字段 + 全文索引
- **优先级**：中

#### 2. `source` (String?)
- **用途**：数据来源标识
- **当前**：存储在 `metadata->>'source'`
- **建议**：如果经常按来源过滤，可以考虑独立字段 + 索引
- **优先级**：低（查询频率不高）

#### 3. `status` (Enum?)
- **用途**：地点状态（ACTIVE, CLOSED, VERIFIED, PENDING 等）
- **当前**：无
- **建议**：如果需要状态管理，可以考虑添加
- **优先级**：中

#### 4. `photoUrl` (String?) 或 `photoUrls` (String[]?)
- **用途**：主图片URL或图片URL数组
- **当前**：存储在 `metadata->>'images'`
- **建议**：如果经常需要快速获取图片，可以考虑独立字段
- **优先级**：低（JSONB 查询已足够快）

#### 5. `phone` (String?)
- **用途**：联系电话
- **当前**：存储在 `metadata->>'phone'` 或 `metadata->'contact'->>'phone'`
- **建议**：如果经常需要按电话搜索，可以考虑独立字段
- **优先级**：低

#### 6. `website` (String?)
- **用途**：官方网站
- **当前**：存储在 `metadata->>'website'` 或 `metadata->'contact'->>'website'`
- **建议**：如果经常需要按网站搜索，可以考虑独立字段
- **优先级**：低

#### 7. `tags` (String[]?)
- **用途**：标签数组
- **当前**：存储在 `metadata->>'tags'`
- **建议**：PostgreSQL 数组类型支持，可以考虑独立字段 + GIN 索引
- **优先级**：中（如果标签查询频繁）

#### 8. `isVerified` (Boolean?)
- **用途**：是否已验证
- **当前**：无
- **建议**：如果需要验证状态管理，可以考虑添加
- **优先级**：中

#### 9. `popularityScore` (Float?)
- **用途**：受欢迎程度评分
- **当前**：无
- **建议**：如果需要按受欢迎程度排序，可以考虑添加
- **优先级**：低

#### 10. `visitCount` (Int?)
- **用途**：访问次数统计
- **当前**：无
- **建议**：如果需要统计功能，可以考虑添加
- **优先级**：低

## 推荐方案

### 方案 A：保持现状（推荐）✅
- **优点**：灵活、易扩展、代码简洁
- **缺点**：某些查询需要 JSONB 路径操作
- **适用场景**：当前数据结构和查询模式

### 方案 B：添加高频查询字段
如果发现某些字段查询频率很高，可以考虑提取：

```prisma
model Place {
  // ... 现有字段 ...
  
  // 可选：高频查询字段
  description    String?  // 如果经常全文搜索
  source         String?  // 如果经常按来源过滤
  status         PlaceStatus? // 如果需要状态管理
  tags           String[] // 如果标签查询频繁
  isVerified     Boolean? @default(false)
  
  @@index([source])
  @@index([status])
  @@index([tags], type: Gin)
  @@index([isVerified])
}
```

## 结论

**当前 Place 表结构已经足够完善**，建议：

1. ✅ **保持现状**：继续使用 JSONB 存储灵活数据
2. ⚠️ **监控查询**：如果发现某些 JSONB 字段查询频率很高，再考虑提取
3. 📊 **性能优化**：确保 JSONB 字段有适当的 GIN 索引
4. 🔍 **全文搜索**：如果需要全文搜索 description，考虑使用 PostgreSQL 的全文搜索功能

## 当前索引情况

```prisma
@@index([metadata(ops: JsonbPathOps)], type: Gin)
```

这个 GIN 索引已经支持高效的 JSONB 查询，包括：
- `metadata->>'source' = 'mafengwo'`
- `metadata->>'subCategory' = 'volcano'`
- `metadata->'contact'->>'phone'`

## 建议

除非有明确的性能问题或业务需求，**不建议添加新字段**。当前结构已经很好地平衡了灵活性和性能。
