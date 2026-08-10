# Iceland Region Golden Set — QA checklist (2026-07-qa1)

对照产品评审结论落地。`placeId` 仍需在 Catalog 核坐标/实体；本文件只保证**建模语义**。

## 验收状态总览

| wizardRegionId | packId(s) | coverageStatus | regionalGoldenSetReady | supportLevel |
|----------------|-----------|----------------|------------------------|--------------|
| golden_circle | golden_circle | ATTRACTION_READY | true | full |
| south_coast | south_coast_west + east | ATTRACTION_READY | true | full |
| snaefellsnes | snaefellsnes | ATTRACTION_READY | true | full |
| reykjanes | reykjavik_arrival | ATTRACTION_READY | true | full |
| north | north (+ subregions) | ATTRACTION_READY | true | full |
| westfjords | westfjords (+ subregions) | ATTRACTION_READY | true | full |
| highlands | highlands (+ subregions) | ATTRACTION_READY | true | full |
| east_fjords | east_fjords | **CORRIDOR_ONLY** | **false** | corridor_only |
| ring_road | ring_road | CORRIDOR_ONLY | false | corridor |

## 已按评审修正的 8 项

| # | 问题 | 落地 |
|---|------|------|
| P0 | 381088 = Skaftafell + 冰川徒步 | 徒步 → `exp_glacier_hike_skaftafell` EXPERIENCE_PRODUCT |
| P0 | 381108 = 地点 + Super Jeep | Jeep → `exp_landmannalaugar_superjeep` |
| P0 | 381099 / 381087 重复 | canonical 381099，381087 = ALIAS_OF |
| P0 | 381458 / 381290 重复 | canonical 381458，381290 = ALIAS_OF |
| P1 | Skaftafell / Svartifoss | PARENT_CHILD；Svartifoss `parentPlaceId=381088` |
| P1 | Reynisfjara / Dyrhólaey | `SOFT_ALTERNATIVE`（非硬互斥） |
| P1 | East Fjords 仅服务点 | `CORRIDOR_ONLY` + `regionalGoldenSetReady=false` |
| P1 | North / Westfjords / Highlands 过大 | `subregions` + `requireSubregionDayScope` |

## 其它建模调整

- Geysir → displayName「Geysir / Haukadalur Geothermal Area (Strokkur)」, `ATTRACTION_AREA`
- Þingvellir / Gullfoss：`coverageRole=PRIMARY` + `routeRoles` ENTRY/EXIT（多角色同实体）
- 381042：`TOWN_HUB` + `ORIGIN_BASE`（不再当 LODGING）
- Vík 381092：`TOWN_HUB`（REST/MEAL/OVERNIGHT/WEATHER_FALLBACK）
- Jökulsárlón + Diamond Beach：`CO_VISIT_CLUSTER` `sce_lagoon`
- Höfn：东峡湾 ENTRY / 南岸东 EXIT 城镇枢纽，非景点 PRIMARY
- Mývatn Baths 预约：`exp_myvatn_bath_admission`
- Landmannalaugar Hot Spring：PARENT_CHILD under 381108

## 四层字段

见 `types/iceland-region-planning-pack.types.ts`：`entityType` / `coverageRole` / `routeRoles` / `relations.relationType`。

## 接入 Initial Plan

见 [`../INITIAL_PLAN_SEED.md`](../INITIAL_PLAN_SEED.md)：Golden Set → Candidate Seed → Arrange Input（不写 PlanVersion）。

## 程序化核对

```ts
// IcelandRegionPlanningPackService.getGoldenSetInventory()
```

或单测：`packs/iceland-region-planning-packs.spec.ts`。
