# 酒店品牌导入指南

## 📋 概述

本指南说明如何导入指定品牌的酒店数据，并自动关联星级。特别适用于批量导入5星级豪华酒店品牌。

## 🏨 支持的5星品牌

以下品牌会被自动识别为5星级：

### 万豪集团
- **JW万豪** (JW Marriott)
- **万豪** (Marriott)
- **万豪行政公寓** (Marriott Executive Apartments)
- **万丽** (Renaissance)
- **万怡** (Courtyard) - 4星
- **万枫** (Fairfield) - 4星
- **威斯汀** (Westin)
- **喜来登** (Sheraton)
- **瑞吉** (St. Regis)
- **W酒店** (W Hotels)

### 其他豪华品牌
- **丽思卡尔顿** (Ritz-Carlton)
- **希尔顿** (Hilton)
- **洲际** (InterContinental)
- **四季** (Four Seasons)
- **凯悦** (Hyatt)
- **香格里拉** (Shangri-La)

## 📊 CSV 文件格式

CSV 文件应包含以下字段（支持中英文字段名）：

| 中文字段 | 英文字段 | 必填 | 说明 | 示例 |
|---------|---------|------|------|------|
| 品牌 | brand | ✅ | 酒店品牌名称 | JW万豪 |
| 名称 | name | ✅ | 酒店名称 | JW万豪酒店(北京店) |
| 地址 | address | ❌ | 详细地址 | 北京市朝阳区... |
| 城市 | city | ❌ | 城市名称 | 北京市 |
| 区县 | district | ❌ | 区县名称 | 朝阳区 |
| 纬度 | lat | ❌ | 纬度（WGS84） | 39.912981 |
| 经度 | lng | ❌ | 经度（WGS84） | 116.661651 |
| 电话 | phone | ❌ | 联系电话 | 010-12345678 |
| id | id | ❌ | 酒店ID（如果提供） | B0K1PZBE68 |

**示例 CSV 内容：**
```csv
品牌,名称,地址,城市,区县,纬度,经度,电话
JW万豪,JW万豪酒店(北京店),北京市朝阳区建国门外大街1号,北京市,朝阳区,39.912981,116.661651,010-12345678
W酒店,W酒店(上海店),上海市黄浦区南京东路399号,上海市,黄浦区,31.230416,121.473701,021-87654321
```

## 🚀 导入步骤

### 步骤 1: 准备 CSV 文件

确保 CSV 文件包含品牌信息，格式符合上述要求。

**文件位置建议：**
```
downloads/hotels.csv
```

### 步骤 2: 运行导入脚本

```bash
npx ts-node --project tsconfig.backend.json scripts/import-hotels-by-brand.ts downloads/hotels.csv 5
```

**参数说明：**
- 第一个参数：CSV 文件路径
- 第二个参数：目标星级（可选，默认 5）

**功能：**
- 自动识别5星品牌
- 只导入符合目标星级的品牌（如果指定了星级）
- 品牌名称标准化（处理中英文变体）
- 自动去重（根据名称和城市）
- 批量导入（每批 1000 条）

**输出示例：**
```
🚀 开始导入酒店数据（目标星级: 5星）...
📂 读取文件: downloads/hotels.csv
📊 解析到 1000 条记录
处理批次 1/1 (1-1000)
  进度: 100.0% (已导入: 800, 5星: 800, 跳过: 200, 错误: 0)

✅ 导入完成！
📊 统计信息:
  - 总记录数: 1000
  - 成功导入: 800
  - 5星品牌: 800
  - 跳过: 200
  - 错误: 0

📋 5星品牌统计（Top 10）:
  1. 万豪: 174 家
  2. 喜来登: 143 家
  3. JW万豪: 20 家
  4. 丽思卡尔顿: 20 家
  ...
```

## 🔍 品牌识别逻辑

### 品牌标准化

脚本会自动处理品牌名称的变体：

- **中英文映射：** `JW Marriott` → `JW万豪`
- **大小写处理：** `marriott` → `万豪`
- **别名处理：** 支持多种品牌名称变体

### 星级判断

- 如果指定了目标星级（如 5），只导入符合该星级的品牌
- 如果未指定，导入所有品牌（但会标记是否为5星）

## 📊 数据验证

### 自动验证

1. **必填字段：** 名称必须存在
2. **坐标验证：** 经纬度范围检查
3. **去重检查：** 根据名称和城市去重
4. **品牌验证：** 检查是否为5星品牌（如果指定了星级）

### 数据更新

如果酒店已存在：
- 如果原来没有品牌信息，会自动更新品牌
- 如果已有品牌，跳过更新

## 🎯 使用场景

### 场景 1: 导入所有5星品牌

```bash
# 只导入5星品牌
npx ts-node --project tsconfig.backend.json scripts/import-hotels-by-brand.ts downloads/hotels.csv 5
```

### 场景 2: 导入所有品牌（不限制星级）

```bash
# 导入所有品牌，但标记5星品牌
npx ts-node --project tsconfig.backend.json scripts/import-hotels-by-brand.ts downloads/hotels.csv
```

## 🔄 与推荐系统集成

导入的酒店数据会自动在推荐系统中使用：

1. **品牌星级映射：** 已更新 `HotelPriceService` 中的品牌映射
2. **推荐逻辑：** 推荐接口会自动识别5星品牌
3. **价格估算：** 5星品牌会使用对应的价格因子

## 📋 品牌统计查询

导入后可以查询品牌统计：

```bash
npx ts-node --project tsconfig.backend.json -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.rawHotelData_Slim.groupBy({
  by: ['brand'],
  where: { brand: { in: ['JW万豪', 'W酒店', '丽思卡尔顿', '瑞吉', '万豪', '万丽', '威斯汀', '喜来登'] } },
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } },
}).then(r => {
  console.log('5星品牌统计:');
  r.forEach(s => console.log(\`  \${s.brand}: \${s._count.id} 家\`));
  p.\$disconnect();
});
"
```

## ⚠️ 注意事项

1. **品牌名称：** 确保 CSV 中的品牌名称与支持的品牌列表匹配
2. **数据去重：** 已存在的酒店不会重复导入
3. **坐标格式：** 经纬度应为 WGS84 格式
4. **批量处理：** 大量数据会自动分批处理

## 📚 相关文件

- **导入脚本：** `scripts/import-hotels-by-brand.ts`
- **推荐服务：** `src/hotels/services/hotel-price.service.ts`
- **数据表：** `prisma/schema.prisma` (RawHotelData_Slim 模型)

## 🎯 下一步

导入完成后：

1. **验证数据：** 检查导入的酒店数量和品牌分布
2. **测试推荐：** 使用推荐接口测试5星酒店推荐
3. **价格估算：** 测试5星酒店的价格估算功能

---

**最后更新：** 2025-12-10
