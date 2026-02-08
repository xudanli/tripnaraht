# MCP 能力管理数据库迁移指南

## 概述

MCP 能力管理功能已升级为使用数据库持久化存储，替代了之前的内存存储方案。

## 数据库模型

### McpCapability 表结构

```sql
CREATE TABLE mcp_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  tools JSONB DEFAULT '[]'::jsonb,
  category VARCHAR(50),
  auth_required BOOLEAN DEFAULT false,
  default_enabled BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mcp_capabilities_service_name ON mcp_capabilities(service_name);
CREATE INDEX idx_mcp_capabilities_enabled ON mcp_capabilities(enabled);
CREATE INDEX idx_mcp_capabilities_category ON mcp_capabilities(category);
```

## 迁移步骤

### 方法 1: 使用脚本自动执行（推荐）

```bash
# 使用提供的脚本
./scripts/apply-mcp-capability-migration.sh
```

### 方法 2: 手动执行 SQL 文件

```bash
# 直接执行 SQL 文件
psql $DATABASE_URL -f prisma/migrations/manual_add_mcp_capability.sql
```

### 方法 3: 使用 Prisma Migrate（如果 shadow database 配置正确）

```bash
# 生成迁移文件
npx prisma migrate dev --name add_mcp_capability

# 注意：如果遇到 shadow database 错误，请使用方法 1 或 2
```

### 方法 4: 手动复制 SQL 执行

如果 Prisma Migrate 遇到 shadow database 问题，可以手动执行以下 SQL（或使用 `prisma/migrations/manual_add_mcp_capability.sql` 文件）：

```sql
-- 创建表
CREATE TABLE IF NOT EXISTS mcp_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  tools JSONB DEFAULT '[]'::jsonb,
  category VARCHAR(50),
  auth_required BOOLEAN DEFAULT false,
  default_enabled BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_mcp_capabilities_service_name ON mcp_capabilities(service_name);
CREATE INDEX IF NOT EXISTS idx_mcp_capabilities_enabled ON mcp_capabilities(enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_capabilities_category ON mcp_capabilities(category);

-- 插入默认数据（所有能力默认启用）
INSERT INTO mcp_capabilities (service_name, display_name, description, enabled, tools, category, auth_required, default_enabled)
VALUES
  ('google_maps', 'Google Maps', 'Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能', true, '["google_maps.searchPlaces", "google_maps.geocode", "google_maps.getRoute", "google_maps.computeDistanceMatrix"]'::jsonb, 'mapping', false, true),
  ('weather', 'Weather', '天气服务，提供当前天气和天气预报', true, '["weather.getCurrentWeather", "weather.getWeatherByDatetimeRange", "weather.getCurrentDateTime"]'::jsonb, 'weather', false, true),
  ('postgresql', 'PostgreSQL', 'PostgreSQL 数据库查询服务', true, '["postgresql.query", "postgresql.execute"]'::jsonb, 'database', false, true),
  ('airbnb', 'Airbnb', 'Airbnb 房源搜索服务', true, '["airbnb.search", "airbnb.listingDetails"]'::jsonb, 'accommodation', true, true),
  ('rail', 'Rail', '铁路查询服务', true, '["rail.searchRoutes", "rail.getRouteDetails"]'::jsonb, 'transportation', true, true),
  ('file_extractor', 'File Extractor', '文件内容提取服务', true, '["file_extractor.extract_file_content"]'::jsonb, 'utility', false, true),
  ('stripe', 'Stripe', 'Stripe 支付服务', true, '["stripe.createPaymentIntent", "stripe.confirmPaymentIntent", "stripe.getPaymentIntent", "stripe.refundPayment"]'::jsonb, 'payment', true, true),
  ('browserbase', 'Browserbase', 'Browserbase 浏览器自动化服务', true, '["browserbase.createSession", "browserbase.navigate", "browserbase.screenshot", "browserbase.click", "browserbase.evaluate"]'::jsonb, 'automation', true, true),
  ('currency', 'Currency Exchange', '货币汇率转换服务', true, '["currency.getLatestRates", "currency.convert", "currency.getRateTrend"]'::jsonb, 'finance', false, true),
  ('hotel', 'Hotel', '酒店搜索服务', true, '["hotel.search", "hotel.getDetails"]'::jsonb, 'accommodation', false, true),
  ('restaurant', 'Restaurant', '餐厅搜索服务', true, '["restaurant.search", "restaurant.nearby"]'::jsonb, 'dining', false, true),
  ('translation', 'Translation', '翻译服务', true, '["translation.translate", "translation.detectLanguage"]'::jsonb, 'utility', false, true),
  ('image', 'Image Search', '图片搜索服务', true, '["image.search", "image.recommend"]'::jsonb, 'media', false, true),
  ('vision', 'Vision Service', '视觉识别服务，提供 OCR 和 POI 识别', true, '["vision.poiRecommend", "ocr.extractText"]'::jsonb, 'vision', false, true)
ON CONFLICT (service_name) DO NOTHING;
```

## 自动初始化

服务启动时会自动检查并创建缺失的能力记录：

- 如果数据库中不存在某个能力的记录，会自动创建默认记录
- 默认状态为 `enabled: true`
- 所有能力定义都在代码中维护，确保一致性

## 数据迁移（从内存到数据库）

如果之前使用内存存储，现在切换到数据库存储：

1. **无需手动迁移**：服务启动时会自动创建所有能力的默认记录
2. **状态保持**：如果之前有自定义的状态，需要手动设置：
   ```bash
   # 禁用某个服务
   curl -X PUT http://localhost:3000/mcp/capabilities/stripe/status \
     -H "Content-Type: application/json" \
     -d '{"serviceName": "stripe", "status": "disabled"}'
   ```

## 验证迁移

```bash
# 检查所有能力
curl http://localhost:3000/mcp/capabilities

# 检查统计信息
curl http://localhost:3000/mcp/capabilities/statistics

# 检查数据库记录
psql $DATABASE_URL -c "SELECT service_name, enabled FROM mcp_capabilities ORDER BY service_name;"
```

## 回滚（如果需要）

如果需要回滚到内存存储：

1. 删除表（谨慎操作）：
   ```sql
   DROP TABLE IF EXISTS mcp_capabilities;
   ```

2. 恢复代码到之前的版本（使用内存存储的版本）

## 注意事项

1. **首次启动**：首次启动服务时，会自动在数据库中创建所有能力的默认记录
2. **性能**：使用内存缓存提高查询性能，同时保证数据一致性
3. **降级处理**：如果数据库操作失败，会自动降级到内存缓存，确保服务可用性
4. **数据一致性**：所有状态变更都会先更新数据库，再更新缓存
