---
skill_id: country_pack.CN
name: 中国 Country Pack 编排规则
version: 1
created_at: 2026-08-08T00:00:00Z
updated_at: 2026-08-08T00:00:00Z
artifact_type: country_pack
country_code: CN
tags: [china, readiness, domestic]
applicable_scenarios:
  - 中国境内行程规划
  - 入境中国行程准备度
---

# 中国 Country Pack 编排规则

## 原则
- 所有决策绑定 `countryCode=CN`；高原专项叠加 `CN_XIZANG` / `CN_SICHUAN` 阈值。
- 支付与票务默认按大陆互联网场景（微信/支付宝、分时预约、高铁）。
- 不得将冰岛 F-road / 高地规则套用到中国默认行程。

## 步骤
1. **证件**：境内居民核验身份证；入境旅客核验签证/过境免签（以移民局最新政策为准）。
2. **支付与通讯**：确认微信/支付宝或银联备用；规划大陆流量/eSIM。
3. **票务**：热门景区与高峰（国庆/暑期/春节）必须前置分时预约与交通票。
4. **自驾**：核验目的地限行与 ETC；单段距离阈值使用 `COUNTRY_PACKS.CN`（350/220/180 km）；大城市限行提示查 `city-driving-limits.v1.json`。
5. **经典/小众自驾线**：命中 `classic-self-drive-routes.v1.json`（G318/G211/青甘大环线/G219/G317/独库/滇藏等）时输出路线级 must/should，并按 `regions` 叠加子 Pack。
6. **按日骨架**：命中后加载 `classic-self-drive-day-skeletons.v1.json`（按用户「N日」就近选 variant），咨询/规划须对齐过夜地与超长驾驶日，不得当城市游自由发挥。
7. **RouteTemplate**：经典线已导入为 `CN_CLASSIC_*` RouteDirection + 按日 Template（`npx tsx scripts/import-china-classic-self-drive-templates.ts`）；规划检索命中时应优先这些模板而非普通城市游。
7b. **Catalog API**：`GET /countries/CN/classic-self-drive-routes`（及 `/:routeId`）供客户端选线；建行程用 `POST /trips/bootstrap` + `classicRouteId`。模板物化会写入 `isSelfDrive` / `productLine=china_classic_self_drive`，并按线路 seed `CN` / `CN_XIZANG` / `CN_SICHUAN` 段距离阈值。
7c. **Driving context**：`GET /countries/CN/driving-context?classicRouteId=&startDate=&endDate=&cities=`（限行 / 涉藏 / 季节窗 / 阈值 pack）；bootstrap 后摘要写入 `metadata.drivingContext`。季节窗 SSOT：`classic-self-drive-season-windows.v1.json`。
7d. **路况证据**：`GET /data-contracts/road-status` 对 CN 走 `ChinaRoadStatusAdapter`（季节窗/走廊，非准实时）；`metadata.roadStatus` 为 `CLOSED|LIMITED|UNKNOWN` 供 destination-pack 规则消费；禁止默认 `riskLevel=0` 假安全。
7e. **Overall readiness**：CN 自驾权重 `CHINA_SELF_DRIVE_*`；合规 Pack 用 `CHINA_COMPLIANCE_KNOWLEDGE_PACK`（限行/ETC/高原/检查站/预约），**禁止**回退冰岛 `no_offroad` 等结构。
8. **Place 数据**：`classic-route-places.seed.v1.json`（v1.3.2：七条线 Place + G318/青甘/独库/滇藏/G211 高德复核；`npx tsx scripts/seed-china-classic-route-places.ts`）。
9. **Place 绑定**：`npx tsx scripts/bind-china-classic-template-places.ts` 将 dayPlans.pois 写入 Place id/uuid（模板绑定目标 100%）。
9b. **热点预订**：`g318` / `qinggan` / `duku` / `dianzang` / `g211` 的 `*-hotspot-booking.v1.json`（经 `buildCnG318HotspotBookingMeta` 合并匹配，共 17 点）。
9c. **库内 Place 完善**：`enrich-china-places-from-amap.ts`（高德详情）+ `enrich-china-places-llm-description.ts`（DeepSeek 中文描述/英文名）。
10. **冒烟**：`npx tsx scripts/smoke-china-classic-template-trip.ts --cleanup`（模板物化 Trip；校验经典线识别与子 Pack）。
11. **高原**：涉藏启用 `pack.cn.xizang`；川西启用 `pack.cn.sichuan`；禁止无适应安排下连续急升。
11b. **涉藏检查站**：加载 `playbooks/tibet-checkpoint-pilot.v1`；合规卡 `checkpoint_documents`；禁止暗示代办许可；`wantsXizang` 时 `checkpointLikely=true`。
11c. **G219 热点**：古格 / 扎什伦布 / 狮泉河补给见 `g219-hotspot-booking.v1.json`。
12. **Destination Pack**：加载 `data/destination-packs/cn/`（`destination.cn`，G318 走廊 ontology + 道路/高原规则）；命中川藏/G318 时不得忽略雨季塌方与海拔门禁提示。
13. **资料缺口**：G318 最小资料清单见 `data/country-packs/CN/MATERIALS_G318.md`（P0 坐标/垭口海拔/景区预约/封路窗）。

## 规则
- **支付门禁**：规划输出中涉及餐饮/门票/打车时，默认假设移动支付可用，并为入境游客给出开通路径。
- **高峰门禁**：落在国庆/暑期/春节窗口时，必须提示票务与拥堵风险。
- **高原门禁**：行程点海拔或区域命中高原时，必须输出适应建议；DEM/海拔证据缺失时不得静默当作平原处理。
- **限行提示**：含北京/上海/深圳等自驾日时，调用限行表并提示核验当日交管通告。
- **经典线门禁**：用户提到 318/211/青甘大环线等时，不得当普通城市游处理；须提示长距、高反/戈壁补给、预约与季节窗口。
- **子 Pack**：`pack.cn.xizang`（高反/补给/检查站/垭口）、`pack.cn.sichuan`（急升/雨季塌方/冬季垭口）。

## ⚠️ 执行注意
- ReadinessPack：`pack.cn.china` / `pack.cn.xizang` / `pack.cn.sichuan`（countryCode 均为 CN）。
- Profile 源：`data/country-profiles/CN.v2.json`。
- 文件包：`data/country-packs/CN/`（含 `classic-self-drive-routes.v1.json`）。
- Destination Pack：`data/destination-packs/cn/destination.pack.json`（G318 最小闭环）。
- 资料清单：`data/country-packs/CN/MATERIALS_G318.md`。
