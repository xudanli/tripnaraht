# G318 川藏南线 — 最小资料清单（进行中）

目标：把川藏/G318 做成 **China Destination Pack + Evidence** 的深度试点（可编排、可提示、可出卡），而非一次做全中国、也非「复制一套冰岛专用接口」。  
架构北极星：[ADR-SELF-DRIVE-KERNEL](../../../internal-docs/architecture/ADR-SELF-DRIVE-KERNEL.md) —— Kernel 拥有决策；Pack 拥有知识；Adapter 拥有现实；Projection 拥有体验。既有 `classic-self-drive-routes` / `driving-context` / `road-status` **下沉为 Pack 输入**，不再作为产品层自驾逻辑扩张点。

## 已落地

- [x] Country Pack / Destination Pack / 经典线 / 飞猪 H5
- [x] **经典线 Catalog API**：`GET /countries/CN/classic-self-drive-routes`（详情 `/:routeId`）→ `POST /trips/bootstrap` + `classicRouteId`；模板物化写入 `isSelfDrive` / `productLine=china_classic_self_drive` 并 seed `CN`/`CN_XIZANG`/`CN_SICHUAN` 段距离阈值
- [x] **Driving context**：`GET /countries/CN/driving-context`（限行/涉藏/季节窗/阈值）；`classic-self-drive-season-windows.v1.json`；bootstrap 写入 `metadata.drivingContext`
- [x] **CN 路况适配器**：`ChinaRoadStatusAdapter`（季节窗+走廊粗定位）注册进 data-contracts；`GET /data-contracts/road-status?countryCode=CN&classicRouteId=&asOfDate=`；Default 兜底不再 risk=0；driving-context 含 `roadStatusHint`
- [x] **Overall readiness 去冰岛化**：`CHINA_SELF_DRIVE_*` 权重 + `CHINA_COMPLIANCE_KNOWLEDGE_PACK`；`resolveCompliancePack` 非 IS 不再回退冰岛
- [x] Place seed + 高德复核 + 垭口海拔 + 热门点预订事实 + 飞猪抽样
- [x] **v1.3 Place 加深**：七条经典线 overnight/highlight 补齐（63 City / 98 Place）；G318 增然乌湖/巴松措/大昭寺/八廓街/米拉山口/垭口海拔
- [x] **热点预订扩至 20**：G318×5 + 青甘×5 + 独库×3 + 滇藏×3 + G211×1 + **G219×3（古格/扎什伦布/狮泉河）**
- [x] **高德复核**：G318 18 / 青甘 15 / 独库 6 / 滇藏 6 / G211 9（`audits/*-amap-coords.*`；九曲十八弯已纠偏拒河北同名）
- [x] **G219/G317 复核脚本与锚点**：`verify-g219/g317-amap-coords.ts`（各 14 点）+ seed 增雀儿山垭口；**实网复核待高德日配额恢复后 `--apply`**（当前审计为 `USER_DAILY_QUERY_OVER_LIMIT`）
- [x] **库内 Place enrich**：`scripts/enrich-china-places-from-amap.ts`（对已有 CN ATTRACTION 回填 amapId/开放时间/门票/地址/短描述；`--classic-seed` / `--missing-amap` / `--normalize-altitude`）
- [x] **批量回填进度**：经典线 68 + missing-amap 持续中（审计 `audits/china-place-amap-enrich.*`）
- [x] **LLM 描述**：`scripts/enrich-china-places-llm-description.ts`（DeepSeek；经典线 68/68；`--needs-llm` 扩全国 stub）；审计 `audits/china-place-llm-desc.*`
- [x] Golden 夹具 SSOT：`src/agent/routing/cn-g318-golden-fixtures.ts`（11 条：排期/门票/租车/住宿/高反/垭口/雨季/补给/机票）
- [x] 护栏单测：`cn-g318-golden-fixtures.spec.ts` + 协议 golden eval 展开
- [x] `consult.activity_ticket` + 经典线 smoke + RAG 入库/检索
- [x] 端到端：`npm run e2e:g318-golden`（`--core` 默认 / `--booking` / `--all`）
- [x] 住宿 apply OTA 优先 upsert Place（飞猪 `otaRef` / `fliggyShId` 幂等；无坐标可建；chat `applySnapshot` 透传）
- [x] 活动/门票 apply OTA 优先 upsert Place（飞猪 `otaRef` / `fliggyPoiId`；`activities/apply` + `add_activity_to_itinerary`）
- [x] **G219/G317 垭口资料**：`g219-altitude-passes.v1.json` / `g317-altitude-passes.v1.json`（含雀儿山）
- [x] **涉藏检查站法务文案 / 试点 playbook**：`playbooks/tibet-checkpoint-pilot.v1.{json,md}` + `compliance/*.v1.md`；合规卡 `contentUrl=pack://…`；drivingContext 注入 playbook 摘要
- [x] Destination Pack 知识层起步：`knowledge/regulations/cn-regulations-severity.json`
- [x] **RAG HTTP DecisionContext 门禁**：`buildConsultationDecisionContextV0`（轻量咨询复用）；`verify-cn-g318-rag-retrieve.ts` 校验无 context→blocked / 有 context→full；`--http` 走 `POST /api/rag/chunks/retrieve`
- [x] **自驾补给 POI 类型**：`iceland-poi-categories.ts` 增 `HIGHWAY_SERVICES` / `CAR_REPAIR` / `ROAD_ASSISTANCE` / `TOLL_BOOTH` / `CHECKPOINT` / `SANITARY_DUMP`；导出 `SELF_DRIVE_SUPPLY_*` / `SELF_DRIVE_RECOVERY_*` / `OSM_SUPPLY_TAG_RULES` / `AMAP_TYPECODE_TO_CANONICAL` / `toPrismaPlaceCategory`
- [x] **自驾补给 OSM 主导入**：`scripts/import-china-self-drive-supply-from-osm.ts`（Overpass around 经典线锚点；幂等 `metadata.osmType+osmId`；`data_source=osm-self-drive-supply`；**不依赖高德**）
- [x] **自驾补给高德可选 enrich**：`scripts/import-china-self-drive-supply-from-amap.ts`（需 `AMAP_API_KEY`；非默认主源）

## 工程命令

```bash
# Place 入库 + 模板绑定
npx tsx scripts/seed-china-classic-route-places.ts
npx tsx scripts/bind-china-classic-template-places.ts
# 高德复核
npx tsx scripts/verify-g318-amap-coords.ts --apply
npx tsx scripts/verify-qinggan-amap-coords.ts --apply
npx tsx scripts/verify-duku-amap-coords.ts --apply
npx tsx scripts/verify-dianzang-amap-coords.ts --apply
npx tsx scripts/verify-g211-amap-coords.ts --apply
npx tsx scripts/verify-g219-amap-coords.ts --apply
npx tsx scripts/verify-g317-amap-coords.ts --apply

# 自驾补给 POI — OSM 主源（无需 AMAP_API_KEY）
npm run script:import-china-self-drive-supply-osm:g318:dry-run
npx tsx scripts/import-china-self-drive-supply-from-osm.ts --route=g318 --limit-per-anchor=20
npx tsx scripts/import-china-self-drive-supply-from-osm.ts --route=all --types=fuel,charging,camping --dry-run
# 可选：高德 enrich（需 AMAP_API_KEY）
npm run script:import-china-self-drive-supply-amap:g318:dry-run

# 护栏单测（无 DB）
npx jest src/agent/routing/cn-g318-golden-fixtures.spec.ts \
  src/trips/readiness/utils/cn-g318-hotspot-booking.util.spec.ts \
  src/trips/readiness/utils/cn-tibet-checkpoint-playbook.util.spec.ts \
  src/trips/readiness/utils/cn-driving-context.util.spec.ts \
  --no-coverage

# 向量库入库 / 检索冒烟（含 DecisionContext 门禁；--http 需本地 API）
SEED_CN_G318_ROAD_CONSTRAINT_WRITE=1 npm run seed:cn-g318-road-constraint-chunks
npx tsx scripts/verify-cn-g318-rag-retrieve.ts --gate-only
npx tsx scripts/verify-cn-g318-rag-retrieve.ts
API_BASE_URL=http://localhost:3000 npx tsx scripts/verify-cn-g318-rag-retrieve.ts --http

# 端到端
npm run e2e:g318-golden
npx tsx scripts/e2e-g318-golden-chat.ts --booking
npx tsx scripts/e2e-g318-golden-chat.ts --all
```

## 还缺

| 项 | 状态 | Kernel 映射 |
|----|------|-------------|
| G219/G317 高德实网复核回写 | 脚本与审计骨架已就绪；待配额恢复后 `npx tsx scripts/verify-g219-amap-coords.ts --apply` / `verify-g317-amap-coords.ts --apply` | Pack 路段几何 / Place |
| 自驾补给 POI 实网入库 | OSM 主导入已就绪；跑 `import-china-self-drive-supply-from-osm --route=g318`；偏远缺口可人工补或可选高德 enrich；Overview/nearby 消费方未接 | ResourceSlice fuel/charging/shelter/recovery |
| 充电实时状态 | 冷启动用 OSM 坐标；实时空闲未接 | Evidence Adapter |
| 准实时交警 / DEM | 季节窗+走廊顾问已接（`cn.seasonal-advisory`）；准实时交警/DEM 仍缺 | Evidence Adapter（`live_traffic` / elevation） |
| Destination Pack 对齐冰岛深度 | 已有 regulations 知识起步；仍缺 certification / **RoadSegmentProfile** 走廊分解 / 天气知识包 | Pack capabilities + segment graph |
| 行中投影灌入 CN 语义 | overview 已影子灌入 `advisories` + `selfDriveKernel`（K4）；daily-drive 待跟 | Projection ← `DriveAdvisory`（ADR K4） |

## 自驾补给数据源选型

| 用途 | 推荐 | 角色 |
|------|------|------|
| POI 冷启动（**主源**） | **OSM / Overpass**（`import-china-self-drive-supply-from-osm.ts`） | 油/电/停/服务区/超市/厕所/汽修/营地等；无需高德 Key |
| 缺口 enrich（可选） | 高德 Web 服务（`AMAP_API_KEY`） | 仅 OSM 稀疏段补点/纠偏；非默认 |
| 驾车路径/沿途搜 | 高德或自建路由 | 后续走廊加密（当前用经典线城市锚点） |
| 充电实时状态 | 运营商/聚合（特来电、小鹏、国家充电设施平台等） | 补「能不能充」，非冷启动坐标 |
| 露营补洞 | OSM `tourism=camp_site` + 人工名单 | 专业营地无稳定开放 API |
| 备选地图 | 腾讯/百度 Place | 仅极端缺口；不双写默认 |

## 免责

坐标为高德 POI；季节窗与票价为示意；**非测绘级、非实时交警/门市价**。涉藏证件与检查站要求以主管部门当日规定为准，平台不代办审批。
