# 景点数据导入指南

## 📋 概述

本指南说明如何将中国景点数据导入到数据库中。数据包含 10000+ 个景点的基本信息，包括名称、等级、地址、坐标等。

## 📊 数据格式

CSV 文件应包含以下字段：

| 字段名 | 说明 | 示例 |
|--------|------|------|
| 景区名称 | 景点名称 | 北京（通州）大运河文化旅游景区 |
| 等级 | 景区等级 | 5A |
| 地址 | 详细地址 | 北京市通州区张家湾镇北运河桥南400米 |
| 省级 | 省级行政区 | 北京市 |
| 相关文件发布时间 | 发布时间 | 2025.04.15 |
| 文件网址链接 | 数据来源链接 | https://data.beijing.gov.cn/... |
| 编码地址 | 完整编码地址 | 北京市北京市通州区... |
| lng_wgs84 | 经度（WGS84） | 116.6616514 |
| lat_wgs84 | 纬度（WGS84） | 39.91298148 |

## 🚀 导入步骤

### 步骤 1: 准备 CSV 文件

确保 CSV 文件格式正确，字段名与上述表格一致。

**文件位置建议：**
```
downloads/attractions.csv
```

### 步骤 2: 导入原始数据

运行导入脚本，将 CSV 数据导入到 `RawAttractionData` 表：

```bash
npx ts-node --project tsconfig.backend.json scripts/import-attractions.ts downloads/attractions.csv
```

**脚本功能：**
- 解析 CSV 文件
- 验证数据格式
- 去重（根据名称和地址）
- 批量导入（每批 1000 条）
- 显示导入进度和统计信息

**输出示例：**
```
🚀 开始导入景点数据...
📂 读取文件: downloads/attractions.csv
📊 解析到 10000 条记录
处理批次 1/10 (1-1000)
  进度: 10.0% (已导入: 1000, 跳过: 0, 错误: 0)
...
✅ 导入完成！
📊 统计信息:
  - 总记录数: 10000
  - 成功导入: 10000
  - 跳过（重复）: 0
  - 错误: 0
```

### 步骤 3: 转换为 Place 数据

将原始数据转换为 `Place` 表数据（用于系统查询）：

```bash
npx ts-node --project tsconfig.backend.json scripts/convert-attractions-to-places.ts
```

**脚本功能：**
- 从 `RawAttractionData` 读取未处理的数据
- 提取城市信息（从地址或省级）
- 创建或匹配 `City` 记录
- 创建 `Place` 记录（包含 PostGIS 地理位置）
- 将等级转换为评分（5A → 5.0, 4A → 4.0 等）
- 标记原始数据为已处理

**输出示例：**
```
🔄 开始转换景点数据为 Place...
📊 待处理数据: 10000 条
处理批次 1/100 (1-100)
  进度: 1.0% (已创建: 100, 跳过: 0, 错误: 0)
...
✅ 转换完成！
📊 统计信息:
  - 总处理数: 10000
  - 成功创建: 9800
  - 跳过: 200
  - 错误: 0
```

## 📊 数据表结构

### RawAttractionData（原始数据表）

存储从 CSV 导入的原始数据，用于数据追溯和重新处理。

**主要字段：**
- `name`: 景区名称
- `level`: 等级（5A, 4A 等）
- `address`: 地址
- `province`: 省级行政区
- `lng`, `lat`: 经纬度
- `processed`: 是否已转换为 Place

### Place（景点表）

存储处理后的景点数据，用于系统查询和推荐。

**主要字段：**
- `name`: 景点名称
- `category`: 固定为 `ATTRACTION`
- `location`: PostGIS 地理位置
- `address`: 地址
- `cityId`: 关联城市
- `rating`: 评分（基于等级转换）
- `metadata`: JSON 元数据（包含等级、省份等信息）

## 🔍 数据验证

### 检查导入数据

```bash
# 检查原始数据数量
npx ts-node --project tsconfig.backend.json -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.rawAttractionData.count().then(c => {
  console.log('原始数据总数:', c);
  p.\$disconnect();
});
"

# 检查已转换数据数量
npx ts-node --project tsconfig.backend.json -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.place.count({ where: { category: 'ATTRACTION' } }).then(c => {
  console.log('景点总数:', c);
  p.\$disconnect();
});
"
```

### 查看示例数据

```bash
npx ts-node --project tsconfig.backend.json -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.rawAttractionData.findFirst({
  orderBy: { importedAt: 'desc' },
}).then(r => {
  console.log('最新导入:', JSON.stringify(r, null, 2));
  p.\$disconnect();
});
"
```

## 🗺️ 城市匹配逻辑

系统会自动从地址或省级信息中提取城市名称：

1. **从地址提取：** 尝试匹配 "XX省XX市" 格式
2. **从省级映射：** 使用省级到省会的映射表
3. **创建城市：** 如果城市不存在，自动创建（国家代码：CN）

**省级映射示例：**
- 北京市 → 北京
- 广东省 → 广州
- 江苏省 → 南京
- ...

## ⚠️ 注意事项

1. **数据去重：**
   - 导入时会根据名称和地址去重
   - 转换时会检查是否已存在同名景点

2. **坐标验证：**
   - 经度范围：-180 到 180
   - 纬度范围：-90 到 90
   - 无效坐标会被标记为 null

3. **必填字段：**
   - 景区名称（必填）
   - 经纬度（转换时必填）

4. **批量处理：**
   - 导入：每批 1000 条
   - 转换：每批 100 条（可调整）

5. **重新导入：**
   - 如果 CSV 文件更新，可以重新运行导入脚本
   - 已存在的记录会被跳过（根据名称和地址）

## 🔄 重新处理数据

如果需要重新转换已处理的数据：

```sql
-- 重置 processed 标志
UPDATE "RawAttractionData" SET processed = false;
```

然后重新运行转换脚本。

## 📚 相关文件

- **导入脚本：** `scripts/import-attractions.ts`
- **转换脚本：** `scripts/convert-attractions-to-places.ts`
- **Schema 定义：** `prisma/schema.prisma` (RawAttractionData 模型)

## 🎯 下一步

数据导入完成后，可以：

1. **通过 API 查询景点：**
   ```bash
   curl "http://localhost:3000/places?category=ATTRACTION&limit=10"
   ```

2. **查找附近景点：**
   ```bash
   curl "http://localhost:3000/places/nearby?lat=39.9&lng=116.6&radius=5000"
   ```

3. **在行程中使用：**
   景点数据会自动出现在行程推荐和优化中

---

**最后更新：** 2025-12-10
