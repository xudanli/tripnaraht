# 新西兰 POI 数据

## 概述

新西兰 POI 数据抓取和集成方案，采用与挪威/冰岛/斯瓦尔巴完全一致的体系：**OSM 做 POI 底座 + 分区抓取 + Readiness 可执行规则**。

新西兰非常适合这一套：徒步入口（tracks）、DOC 小屋/营地、观景点、补给点都能把行程做得很落地。

## 核心特点

- **分区抓取**：按旅行路径分区，不一把梭全境
- **可执行性优先**：trailhead + parking + hut/camp_site + toilets 四类把可执行性托起来
- **Readiness 规则**：Alpine & Weather、Volcanic & Geothermal、Ferry & Island Hops、Sparse Supply

## 区域配置

### Phase 1: MVP（覆盖 80% 行程）

#### 北岛

1. **NZ_AUCKLAND** - 奥克兰（入境/城市补给）
   - 中心点: (-36.8485, 174.7633)
   - 半径: 50km

2. **NZ_WELLINGTON** - 惠灵顿（北岛南端 + 渡轮）
   - 中心点: (-41.2865, 174.7762)
   - 半径: 50km

3. **NZ_ROTORUA** - 罗托鲁瓦（地热/温泉/活动）
   - 中心点: (-38.1368, 176.2497)
   - 半径: 80km

4. **NZ_TAUPO_TONGARIRO** - 陶波/汤加里罗（火山国家公园 + 徒步）
   - 中心点: (-39.0292, 175.8784)
   - 半径: 120km

#### 南岛

5. **NZ_CHRISTCHURCH** - 基督城（南岛门户）
   - 中心点: (-43.5321, 172.6362)
   - 半径: 50km

6. **NZ_QUEENSTOWN** - 皇后镇（最强活动枢纽）
   - 中心点: (-45.0312, 168.6626)
   - 半径: 80km

7. **NZ_WANAKA** - 瓦纳卡（徒步/湖区）
   - 中心点: (-44.6939, 169.1318)
   - 半径: 80km

8. **NZ_TEKAPO_MTCOOK** - 蒂卡普/库克山（徒步入口/观景点）
   - 中心点: (-43.8878, 170.5103)
   - 半径: 150km

9. **NZ_TE_ANU_MILFORD** - 蒂阿瑙/米尔福德峡湾（关键）
   - 中心点: (-45.4150, 167.7183)
   - 半径: 200km

10. **NZ_FRANZ_JOSEF** - 弗朗茨约瑟夫（冰川西岸）
    - 中心点: (-43.3891, 170.1819)
    - 半径: 120km

11. **NZ_DUNEDIN** - 但尼丁（东南海岸/野生动物）
    - 中心点: (-45.8741, 170.5036)
    - 半径: 50km

### Phase 2: 增强（更偏远/更硬核）

12. **NZ_NELSON_ABEL_TASMAN** - 尼尔森/亚伯塔斯曼（海岸徒步）
    - 中心点: (-41.2706, 173.2840)
    - 半径: 80km

13. **NZ_PICTON_FERRY** - 皮克顿渡轮枢纽（更精细）
    - 中心点: (-41.2906, 174.0089)
    - 半径: 50km

14. **NZ_FIORDLAND_REMOTE** - 峡湾偏远区域（更大半径）
    - 中心点: (-45.4150, 167.7183)
    - 半径: 200km

## 快速开始

### 1. 抓取 POI 数据

```bash
# 使用 npm script（推荐）
npm run fetch:poi:newzealand -- --phase1
npm run fetch:poi:newzealand -- --region=NZ_AUCKLAND
npm run fetch:poi:newzealand -- --all

# 或直接使用 ts-node
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-newzealand.ts --phase1
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-newzealand.ts --region=NZ_AUCKLAND
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-newzealand.ts --all
```

### 2. 导入到数据库

```bash
# 导入原始 OSM 数据
ts-node --project tsconfig.backend.json scripts/import-osm-poi-to-postgis.ts \
  --input data/geographic/poi/osm/newzealand/raw/all_regions.json
```

### 3. 规范化处理

```bash
# 规范化 POI（分类映射等）
ts-node --project tsconfig.backend.json scripts/normalize-osm-poi.ts
```

## POI 类型

### 交通节点
- `AIRPORT` - 机场
- `FERRY_TERMINAL` - 渡轮码头（北南岛渡轮关键）
- `PIER_DOCK` - 栈桥/码头
- `PARKING` - 停车点（景点入口基本就是停车场）
- `TRANSIT` - 公共交通

### 安全保障点 + 补给
- `HOSPITAL`, `CLINIC`, `PHARMACY` - 医疗
- `SAFETY` (police) - 警察/消防
- `FUEL` - 加油站
- `EV_CHARGER` - 充电桩（新西兰电车自驾很实用）
- `SUPPLY` - 超市/便利店
- `TOILETS` - 厕所（新西兰徒步/自驾极有用）

### 玩法入口点
- `TRAILHEAD` - 徒步入口（highway=trailhead）
- `HUT` - DOC 小屋（tourism=alpine_hut + amenity=shelter）
- `CAMPING` - 露营地（tourism=camp_site）
- `INFORMATION` - 游客中心
- `VIEWPOINT` - 观景点
- `BOAT_RENTAL` - 船只租赁

### 新西兰自然类
- `VOLCANIC` - 火山（natural=volcano）
- `GEOTHERMAL` - 地热（natural=geyser, natural=hot_spring）
- `GLACIER` - 冰川（natural=glacier）
- `WATERFALL` - 瀑布（natural=waterfall）
- `BEACH` - 海滩（natural=beach）
- `PEAK` - 山峰（natural=peak）

## Overpass 查询策略

脚本使用 4 类查询，串行执行避免限流：

1. **交通节点**：机场、渡轮、公交、停车
2. **安全保障+补给**：医疗、警察、加油站、充电桩、超市、厕所
3. **玩法入口点**：徒步入口、信息点、观景点、营地、DOC 小屋
4. **自然类**：火山、地热、冰川、瀑布、海滩、山峰

每个查询之间等待 2 秒，每个区域之间等待 5 秒。

## Readiness 规则包

### Pack A: Alpine & Weather（山地天气快变）
- **触发**：命中 TRAILHEAD/HUT 或山地覆盖高
- **must**：分层穿衣、防雨、防风、头灯、备用保暖
- **should**：提前查步道关闭/洪水/风速（后续接天气可动态修复）

### Pack B: Volcanic & Geothermal（北岛火山地热）
- **触发**：volcano/geyser/hot_spring
- **must**：地热区边界/高温烫伤/硫化气体注意
- **should**：儿童/宠物提醒、拍照点安全距离

### Pack C: Ferry & Island Hops（北南岛渡轮日）
- **触发**：命中 FERRY_TERMINAL + 路线跨海
- **must**：预留排队/班次波动 buffer、备选班次/备选港口提示
- **Neptune 修复**：若班次不可用 → 换时段/换交通方式/改停靠城市

### Pack D: Sparse Supply（偏远段补给稀疏）
- **触发**：长路段 + FUEL/SUPPLY 密度低
- **must**：强制插入"加油/补给停靠点"
- **Dr.Dre**：把补给点排到出发前或进入偏远区之前

## 数据质量与工程注意点

1. **串行抓取**：每个 region 一个 job，避免 Overpass 连接池/并行超时
2. **去重处理**：基于 `type:id` 去重，避免重复 POI
3. **区域标识**：每个 POI 包含 `region_key`, `region_name`, `region_center`
4. **入口点可信度**：对 parking + trailhead 近距离配对，生成 TrailAccessPoint（"从哪停车开始走"特别实用）

## 相关文件

- `scripts/fetch-osm-poi-newzealand.ts` - 抓取脚本
- `scripts/import-osm-poi-to-postgis.ts` - 导入脚本
- `scripts/normalize-osm-poi.ts` - 规范化脚本
- `src/trips/readiness/config/country-pack.config.ts` - 国家包配置（已包含 NZ）

## 参考

- [POI 数据集成总结](../../../../../docs/POI_DATA_INTEGRATION_SUMMARY.md)
- [OSM POI 集成指南](../../../../../docs/OSM_POI_INTEGRATION.md)

