# 新西兰 POI 数据导入指南

本文档说明如何使用新西兰 POI 数据抓取系统。

## 系统架构

新西兰 POI 系统采用与尼泊尔/冰岛/挪威相同的架构：
- **OSM 做 POI 底座**：从 Overpass API 抓取 OpenStreetMap 数据
- **分区抓取**：按旅行路径分区，避免全境一把梭
- **Readiness 规则包**：集成可执行规则，提供差异化建议

## 文件结构

```
scripts/new-zealand/
├── overpass-profiles.ts      # Overpass 查询模板（4个 Profile）
└── canonical-mapping.ts      # OSM tags 到 Canonical 类型映射

data/new-zealand/
└── region-seeds.json         # 区域配置（Phase 1 + Phase 2）

scripts/
└── import-new-zealand-poi.ts # 主导入脚本

src/trips/readiness/data/packs/
└── pack.nz.new-zealand.json  # Readiness 规则包
```

## 区域配置（Phase 1 - MVP）

### 北岛
- **NZ_AUCKLAND** (奥克兰) - 入境/城市补给，半径 50km
- **NZ_WELLINGTON** (惠灵顿) - 北岛南端 + 渡轮，半径 50km
- **NZ_ROTORUA** (罗托鲁瓦) - 地热/温泉/活动，半径 80km
- **NZ_TAUPO_TONGARIRO** (陶波/汤加里罗) - 火山国家公园 + 徒步，半径 100km

### 南岛
- **NZ_CHRISTCHURCH** (基督城) - 南岛门户，半径 50km
- **NZ_QUEENSTOWN** (皇后镇) - 最强活动枢纽，半径 80km
- **NZ_WANAKA** (瓦纳卡) - 徒步/湖区，半径 80km
- **NZ_TEKAPO_MTCOOK** (蒂卡普/库克山) - 库克山周边：徒步入口/观景点，半径 120km
- **NZ_TE_ANU_MILFORD** (蒂阿瑙/米尔福德) - 峡湾：Milford Sound 关键，半径 150km
- **NZ_FRANZ_JOSEF** (弗朗茨约瑟夫) - 冰川西岸，半径 100km
- **NZ_DUNEDIN** (但尼丁) - 东南海岸/野生动物，半径 80km

### Phase 2（未来扩展）
- NZ_NELSON_ABEL_TASMAN - 海岸徒步
- NZ_PICTON_FERRY - 渡轮枢纽更精细
- NZ_FIORDLAND_REMOTE - 更大半径

## Overpass 查询模板

### Profile A: Transport Nodes（交通节点）
- 机场、渡轮码头、公交站、停车场

### Profile B: Safety & Supply（安全保障 + 补给）
- 医院、诊所、药房、警察局
- 加油站、充电站、超市、便利店
- 厕所、庇护所

### Profile C: Activity Entry Points（玩法入口点）
- 徒步入口、信息点、观景点
- 露营地、DOC 小屋
- 船租赁、旅游办公室

### Profile D: Natural Features（自然类）
- 火山、间歇泉、温泉
- 冰川、瀑布、海滩、山峰

## Canonical 分类映射

新西兰特色分类（新增/强化）：

- **TRAILHEAD** - 徒步入口（可执行性核心）
- **HUT** - DOC 小屋/营地（新西兰徒步必备）
- **CAMPING** - 露营地
- **PARKING** - 停车场（景点入口基本就是停车场）
- **TOILETS** - 厕所（新西兰徒步/自驾极有用）
- **EV_CHARGER** - 电动车充电站（NZ 电车自驾很实用）
- **VOLCANIC** - 火山（触发安全提示）
- **GEOTHERMAL** - 地热（触发安全提示）
- **FERRY_TERMINAL** - 渡轮码头（北南岛渡轮关键）

## 使用方法

### 导入所有 Phase 1 区域的所有 Profile

```bash
npm run import:nz-poi
```

### 导入特定区域

```bash
npm run import:nz-poi --region NZ_AUCKLAND
```

### 导入特定区域和 Profile

```bash
npm run import:nz-poi --region NZ_AUCKLAND --profile A
```

### 导入所有区域（包括 Phase 2）

```bash
npm run import:nz-poi --all
```

## Readiness 规则包

新西兰 Readiness Pack 包含 4 个核心规则包：

### Pack A: Alpine & Weather（山地天气快变）
- **触发条件**：命中 TRAILHEAD/HUT 或山地覆盖高
- **规则**：
  - 分层穿衣、防雨、防风、头灯、备用保暖（must）
  - 提前查步道关闭/洪水/风速（should）
  - 检查天气预报和步道状况（must）

### Pack B: Volcanic & Geothermal（北岛火山地热）
- **触发条件**：volcano/geyser/hot_spring
- **规则**：
  - 地热区边界/高温烫伤/硫化气体注意（must）
  - 儿童/宠物提醒、拍照点安全距离（should）

### Pack C: Ferry & Island Hops（北南岛渡轮日）
- **触发条件**：命中 FERRY_TERMINAL + 路线跨海
- **规则**：
  - 预留排队/班次波动 buffer、备选班次/备选港口提示（must）
  - Neptune 修复：若班次不可用 → 换时段/换交通方式/改停靠城市

### Pack D: Sparse Supply（偏远段补给稀疏）
- **触发条件**：长路段 + FUEL/SUPPLY 密度低
- **规则**：
  - 强制插入"加油/补给停靠点"（must）
  - Dr.Dre：把补给点排到出发前或进入偏远区之前

## 数据质量与工程注意点

1. **串行执行**：每个 region 一个 job，避免连接池/并行超时
2. **region_key**：所有 POI 都带有 `regionKey: 'NZ_XXX'` 便于增量更新、统计与回滚
3. **入口点可信度**：对 parking + trailhead 近距离配对，可生成 TrailAccessPoint（"从哪停车开始走"特别实用）
4. **countryCode**：所有 POI 都带有 `countryCode: 'NZ'`

## 数据统计

导入后可通过以下查询检查数据：

```sql
-- 按 region 统计
SELECT 
  metadata->>'regionKey' as region,
  COUNT(*) as count
FROM "Place"
WHERE metadata->>'countryCode' = 'NZ'
GROUP BY metadata->>'regionKey'
ORDER BY count DESC;

-- 按 canonical type 统计
SELECT 
  metadata->>'canonicalType' as canonical_type,
  COUNT(*) as count
FROM "Place"
WHERE metadata->>'countryCode' = 'NZ'
  AND metadata->>'canonicalType' IS NOT NULL
GROUP BY metadata->>'canonicalType'
ORDER BY count DESC;
```

## 下一步

1. 运行导入脚本抓取 Phase 1 数据
2. 验证数据质量（检查 regionKey、canonicalType 分布）
3. 测试 Readiness Pack 规则触发
4. 根据实际使用情况调整区域配置和查询模板
5. 扩展到 Phase 2 区域

## 参考

- 尼泊尔实现：`scripts/nepal/`
- Readiness Pack 文档：`src/trips/readiness/HOW_TO_ADD_PACK.md`
- Overpass API 文档：https://wiki.openstreetmap.org/wiki/Overpass_API

