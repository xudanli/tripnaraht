---
name: country-pack-cn
description: "中国 Country Pack 编排规则. Use when: 中国行程规划与准备度; 国内支付/票务/限行; G318/G211/青甘大环线等自驾线; 高原 CN_XIZANG/CN_SICHUAN; china; readiness."
license: Proprietary. TripNARA internal skill.
compatibility: TripNARA SkillEvolver markdown skill; loadable in Claude Code / Cursor Agent Skills.
metadata:
  tripnara-skill-id: country_pack.CN
  tripnara-version: 1
  tripnara-artifact-type: country_pack
  tripnara-country-code: CN
---

<!-- tripnara-skill-evolver: export copy; source under data/skill-evolver/seeds/country_pack.CN.md -->

# 中国 Country Pack 编排规则

## 原则
- 所有决策绑定 `countryCode=CN`；高原专项叠加 `CN_XIZANG` / `CN_SICHUAN` 阈值。
- 支付与票务默认按大陆互联网场景（微信/支付宝、分时预约、高铁）。
- 不得将冰岛 F-road / 高地规则套用到中国默认行程。

## 步骤
1. **证件**：境内居民核验身份证；入境旅客核验签证/过境免签。
2. **支付与通讯**：确认微信/支付宝或银联备用；规划大陆流量/eSIM。
3. **票务**：热门景区与高峰必须前置分时预约与交通票。
4. **自驾**：核验目的地限行与 ETC；单段阈值使用 `COUNTRY_PACKS.CN`；大城市查 `city-driving-limits.v1.json`。
5. **经典/小众自驾线**：查 `classic-self-drive-routes.v1.json`（318/211/青甘大环线/219/317/独库/滇藏）；按 regions 叠加子 Pack。
6. **按日骨架**：`classic-self-drive-day-skeletons.v1.json`；按「N日」选 variant，对齐过夜地与长距日。
7. **RouteTemplate**：`CN_CLASSIC_*`（`scripts/import-china-classic-self-drive-templates.ts`）。
7b. **Catalog**：`GET /countries/CN/classic-self-drive-routes` → `POST /trips/bootstrap` + `classicRouteId`；模板物化 seed 自驾 metadata 与段距离阈值。
7c. **Driving context**：`GET /countries/CN/driving-context`；摘要进 `metadata.drivingContext`。
7d. **路况**：CN → `ChinaRoadStatusAdapter`（季节窗顾问）；`roadStatus` CLOSED/LIMITED/UNKNOWN，非假安全。
7e. **Overall readiness**：`CHINA_SELF_DRIVE_*` + 中国合规 Pack；禁止回退冰岛合规结构。
8. **Place 补齐**：`scripts/seed-china-classic-route-places.ts` + `bind-china-classic-template-places.ts`。
9. **高原**：涉藏用 `pack.cn.xizang`；川西用 `pack.cn.sichuan`。
10. **Destination Pack**：`data/destination-packs/cn/`（G318 ontology + 道路/高原规则）。
11. **资料缺口清单**：`data/country-packs/CN/MATERIALS_G318.md`。

## ⚠️ 执行注意
- ReadinessPack：`pack.cn.china` / `pack.cn.xizang` / `pack.cn.sichuan`
- Profile：`data/country-profiles/CN.v2.json`
- 文件包：`data/country-packs/CN/`
- Destination Pack：`destination.cn`（`data/destination-packs/cn/`）
- RouteDirection：`CN_CLASSIC_G318` / `G211` / `QINGGAN_LOOP` / `G219` / `G317` / `DUKU` / `DIANZANG`
- Place seed：`classic-route-places.seed.v1.json`（近似坐标）
- 资料清单：`MATERIALS_G318.md`
