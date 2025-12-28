# 尼泊尔 POI 导入指南

## 📋 概述

本指南说明如何将尼泊尔 POI 数据导入到现有流水线：
**Overpass → poi_osm_raw → poi_canonical → GeoFacts/Readiness/Decision**

## 🗺️ Region Seeds（区域种子点）

### MVP 覆盖的 8 个 Regions

| region_key | 名称 | 场景 | 坐标 (lat, lng) | 半径 |
|------------|------|------|----------------|------|
| NP_KTM | 加德满都 | 城市补给/签证/交通枢纽 | 27.700769, 85.300140 | 50km |
| NP_PKR | 博卡拉 | 安娜普尔纳门户 | 28.2669, 83.9685 | 70km |
| NP_BESISAHAR | 贝西萨哈 | Annapurna Circuit 起点 | 28.2311, 84.3775 | 65km |
| NP_LUKLA | 卢克拉 | EBC 空路入口 | 27.6869, 86.7298 | 100km |
| NP_NAMCHE | 南池市场 | EBC 核心补给镇 | 27.80528, 86.71058 | 80km |
| NP_CHITWAN_SAURAHA | 奇特旺 | 丛林活动/安全点 | 27.549698, 84.371147 | 80km |
| NP_LUMBINI | 蓝毗尼 | 文化朝圣 | 27.4672, 83.2749 | 50km |
| NP_WELLNESS_RING | 加德满都谷地周边 | 轻量徒步/观景兜底 | 同 NP_KTM | 100km |

### 未来扩展 Regions

- `NP_LANGTANG_SYABRUBESI` - Langtang 徒步区域
- `NP_MANASLU_SOTI_KHOLA` - Manaslu 徒步区域（限制区域）
- `NP_MUSTANG_JOMSOM` - Mustang 限制区域

配置文件：`data/nepal/region-seeds.json`

---

## 🔍 Overpass 查询 Profile

按场景组合查询，避免一次 query 太大。每个 region 依次跑 4 个 profile（串行）：

### Profile A: Trekking Core（徒步核心）
- `highway=trailhead` - 徒步入口
- `tourism=information` - 信息点
- `tourism=viewpoint` - 观景点
- `tourism=camp_site` - 露营地
- `tourism=alpine_hut` - 高山小屋
- `amenity=shelter` - 庇护所
- `amenity=toilets` - 厕所

### Profile B: Tea House / Lodge（茶屋/住宿）
- `tourism=guest_house` - 客栈
- `tourism=hotel` - 酒店
- `tourism=hostel` - 青年旅舍
- 名称包含 "Tea House" / "Teahouse" / "Lodge" / "Guest House"

### Profile C: Safety & Supply（安全与补给）
- `amenity=hospital` - 医院
- `amenity=clinic` - 诊所
- `amenity=pharmacy` - 药房
- `amenity=police` - 警察局
- `amenity=fuel` - 加油站
- `shop=supermarket` - 超市
- `shop=convenience` - 便利店

### Profile D: Transport Nodes（交通节点）
- `aeroway=aerodrome` - 机场
- `aeroway=terminal` - 航站楼
- `public_transport=station` - 公共交通站
- `highway=bus_stop` - 巴士站
- `amenity=parking` - 停车场

配置文件：`scripts/nepal/overpass-profiles.ts`

---

## 🏷️ Canonical 分类映射

尼泊尔新增/强化的 Canonical 类型：

| Canonical Type | OSM Tags | 说明 |
|----------------|----------|------|
| **TRAILHEAD** | `highway=trailhead` | 徒步入口 |
| **HUT** | `tourism=alpine_hut`, `amenity=shelter` | 山屋/庇护所 |
| **CAMPING** | `tourism=camp_site` | 露营地 |
| **TEAHOUSE_LODGE** | `tourism=guest_house/hotel/hostel` + 名称匹配 | 茶屋/客栈（尼泊尔特色） |
| **TOILETS** | `amenity=toilets` | 厕所 |
| **SUPPLY** | `shop=supermarket/convenience`, `amenity=fuel` | 补给点 |
| **SAFETY_MEDICAL** | `amenity=hospital/clinic/pharmacy/police` | 安全/医疗 |
| **AIRPORT** | `aeroway=aerodrome/terminal` | 机场 |
| **TRANSIT** | `public_transport=station`, `highway=bus_stop` | 交通枢纽 |
| **PARKING** | `amenity=parking` | 停车场 |

配置文件：`scripts/nepal/canonical-mapping.ts`

---

## 📜 许可/合规规则

### TIMS & 导游规则

**触发条件**：行程包含 `TRAILHEAD`/`HUT`/`CAMPING` 且 region 属于尼泊尔徒步区域

**Agent 动作**：

1. **Abu（降级策略）**
   - 若用户拒绝向导/不想办手续
   - → 降级为城市周边轻量徒步（KTM 谷地、Pokhara 周边）

2. **Dr.Dre（插入任务）**
   - 在行程第一天插入 "办证/集合/Briefing" 任务
   - 类型：`PERMIT_BRIEFING`
   - 时长：120 分钟

3. **Neptune（修复策略）**
   - 若计划里出现"单人深入偏远区"
   - → 修复为"跟团/换线路/增加缓冲点"

### Restricted Area Permit（限制区域特别许可）

**限制区域**：
- Upper Mustang (`NP_MUSTANG_JOMSOM`)
- Manaslu (`NP_MANASLU_SOTI_KHOLA`)

**规则**：
- 只要 itinerary 命中这些区域标签
- → `constraints.requiresRestrictedPermit=true`
- → 生成办理指引（不硬写价格，避免过期）

配置文件：`data/nepal/country-rules.json`

---

## 🚀 使用方法

### 1. 导入所有 Region 和 Profile（推荐）

```bash
npm run import:nepal-poi -- --all
```

### 2. 导入特定 Region

```bash
# 只导入加德满都
npm run import:nepal-poi -- --region NP_KTM

# 只导入博卡拉
npm run import:nepal-poi -- --region NP_PKR
```

### 3. 导入特定 Region 的特定 Profile

```bash
# 只导入加德满都的 Profile A（徒步核心）
npm run import:nepal-poi -- --region NP_KTM --profile A

# 只导入博卡拉的 Profile B（茶屋/住宿）
npm run import:nepal-poi -- --region NP_PKR --profile B
```

### 4. 导入流程

脚本会自动：
1. 读取 `data/nepal/region-seeds.json` 获取 region 配置
2. 使用 `scripts/nepal/overpass-profiles.ts` 构建查询
3. 调用 Overpass API 获取 POI 数据
4. 使用 `scripts/nepal/canonical-mapping.ts` 映射分类
5. 导入到 `Place` 表（去重、upsert）

---

## 📊 DEM 测试场景

尼泊尔是全球 DEM 价值最"显性"的目的地之一，建议测试以下 3 个场景：

### 1. EBC / Annapurna 爬升差异

**场景**：同样 10km，爬升差异导致时长/休息点不同（effortScore）

**Regions**：`NP_LUKLA`, `NP_NAMCHE`, `NP_BESISAHAR`, `NP_PKR`

**指标**：
- `maxElevation` - 最高海拔
- `totalAscent` - 累计爬升
- `maxSlope` - 最大坡度

### 2. 高海拔适应节奏

**场景**：连续两天海拔上升过快 → Dr.Dre 自动插入适应日

**Regions**：`NP_LUKLA`, `NP_NAMCHE`

**约束**：
- `maxDailyElevationGain`: 500 米
- 动作：`INSERT_ACCLIMATIZATION_DAY`

### 3. 偏远段补给稀疏

**场景**：长距离无 SUPPLY/FUEL/医疗 → Abu 降级强度 + Neptune 插入补给停靠

**Regions**：`NP_LUKLA`, `NP_NAMCHE`

**约束**：
- `maxDistanceWithoutSupply`: 15 公里
- 动作：`REDUCE_INTENSITY`, `INSERT_SUPPLY_STOP`

---

## 📁 文件结构

```
data/nepal/
  ├── region-seeds.json          # Region 种子点配置
  └── country-rules.json        # 尼泊尔规则和约束

scripts/nepal/
  ├── overpass-profiles.ts       # Overpass 查询 Profile 定义
  └── canonical-mapping.ts      # Canonical 分类映射

scripts/
  └── import-nepal-poi.ts       # 主导入脚本
```

---

## 🔧 配置说明

### Region Seeds 配置

编辑 `data/nepal/region-seeds.json` 添加新 region：

```json
{
  "region_key": "NP_NEW_REGION",
  "name": "新区域",
  "name_en": "New Region",
  "description": "描述",
  "seed": {
    "lat": 27.700769,
    "lng": 85.300140
  },
  "radius_km": 50,
  "scenario": "场景类型",
  "priority": 1
}
```

### 添加新的 Canonical 类型

编辑 `scripts/nepal/canonical-mapping.ts`：

```typescript
{
  canonicalType: 'NEW_TYPE',
  osmTags: [
    { key: 'tourism', value: 'new_tag', description: '描述' },
  ],
  priority: 10,
}
```

---

## ✅ 验证导入结果

### 1. 检查数据库

```sql
-- 查看导入的 POI 数量
SELECT 
  metadata->>'regionKey' as region,
  metadata->>'profile' as profile,
  metadata->>'canonicalType' as canonical_type,
  COUNT(*) as count
FROM "Place"
WHERE metadata->>'regionKey' LIKE 'NP_%'
GROUP BY region, profile, canonical_type
ORDER BY region, profile;
```

### 2. 检查特定 Region

```sql
-- 查看加德满都的 POI
SELECT 
  "nameCN",
  category,
  metadata->>'canonicalType' as canonical_type,
  ST_AsText(location) as location
FROM "Place"
WHERE metadata->>'regionKey' = 'NP_KTM'
LIMIT 20;
```

---

## 🐛 故障排除

### Overpass API 超时

- 减少 `radius_km` 或分批导入
- 增加 `timeout` 时间（默认 200 秒）

### 重复导入

- 脚本会自动去重（基于 OSM ID）
- 已存在的 POI 会跳过

### 分类映射失败

- 检查 `scripts/nepal/canonical-mapping.ts` 中的映射规则
- 查看 `metadata->>'rawTags'` 确认 OSM tags

---

## 📚 相关文档

- [Overpass API 文档](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [OSM Tags 参考](https://wiki.openstreetmap.org/wiki/Tags)
- [NTB 官方文档](https://ntb.gov.np)

---

## 🎯 下一步

1. ✅ 导入 MVP 8 个 regions
2. ⏭️ 测试 DEM 场景（爬升差异、高海拔适应、补给稀疏）
3. ⏭️ 集成到 Agent 决策流程（TIMS/限制区域规则）
4. ⏭️ 扩展更多 regions（Langtang、Manaslu、Mustang）

