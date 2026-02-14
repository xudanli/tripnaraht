# 冰岛 F-road 沿线服务设施清单

> **更新时间**: 2026-02-13
> **数据状态**: P0 优先级 - 必须补充
> **目标**: 至少 50+ 个关键服务设施

---

## 📋 数据缺口总结（基于分析结果）

**当前状态**:
- 冰岛 POI 总数: **159 个**
- 加油站 (GAS_STATION): **0 个** ❌ P0
- 露营地 (CAMPING): **0 个** ⚠️ P1
- 停车场 (PARKING): **0 个** ⚠️ P1
- 住宿 (ACCOMMODATION): **0 个** ⚠️ P1
- 餐厅 (RESTAURANT): **5 个** ⚠️ P1
- 地理位置覆盖率: **83.6%** (需要 90%+)
- 开放时间覆盖率: **33.3%** (需要 50%+)

---

## 🚨 P0 必须补充（阻塞 F-road 行程生成）

### 1. 加油站 (GAS_STATION)

F-road 沿线关键加油站（优先级排序）:

| 名称 | 位置 | F-road 距离 | GPS 坐标 | 营业时间 | 状态 |
|------|------|------------|---------|---------|------|
| **Selfoss N1** | Selfoss | F208 起点 | 63.9330, -21.0023 | 07:00-23:00 | ❌ 待添加 |
| **Hella N1** | Hella | F208/F210 | 63.8383, -20.4042 | 07:00-23:00 | ❌ 待添加 |
| **Kirkjubæjarklaustur Orkan** | Kirkjubæjarklaustur | F206/F210 | 63.7933, -18.0558 | 08:00-22:00 | ❌ 待添加 |
| **Akureyri N1** | Akureyri | F26/F821 北端 | 65.6830, -18.1059 | 24小时 | ❌ 待添加 |
| **Blönduós Olís** | Blönduós | F26 北端 | 65.6642, -20.2883 | 07:00-23:00 | ❌ 待添加 |
| **Mývatn N1** | Reykjahlíð | F88/F910 Askja | 65.6378, -16.9086 | 07:00-23:00 | ❌ 待添加 |
| **Egilsstaðir Orkan** | Egilsstaðir | F910 东端 | 65.2638, -14.3940 | 24小时 | ❌ 待添加 |
| **Hveragerði N1** | Hveragerði | F35 南端 | 64.0020, -21.1880 | 07:00-23:00 | ❌ 待添加 |
| **Varmahlíð Olís** | Varmahlíð | F35 北端 | 65.5523, -19.4150 | 07:00-22:00 | ❌ 待添加 |
| **Vík Orkan** | Vík | F208 南端 | 63.4183, -19.0059 | 08:00-22:00 | ❌ 待添加 |

**数据来源建议**:
- N1 官网: https://www.n1.is/stodvar/
- Orkan 官网: https://www.orkan.is/stodvar/
- Olís 官网: https://www.olis.is/stodvar/

---

### 2. 高地小屋 (MOUNTAIN_HUT)

冰岛高地关键小屋（Ferðafélag Íslands 管理）:

| 名称 | 位置 | F-road | GPS 坐标 | 床位 | 预订 | 状态 |
|------|------|--------|---------|------|------|------|
| **Landmannalaugar Hut** | Landmannalaugar | F208 | 63.9833, -19.0667 | 78 | ✅ | ❌ 待添加 |
| **Þórsmörk (Básar) Hut** | Þórsmörk | F249 | 63.6833, -19.4833 | 75 | ✅ | ❌ 待添加 |
| **Þórsmörk (Volcano Huts)** | Þórsmörk | F249 | 63.6900, -19.4800 | 100 | ✅ | ❌ 待添加 |
| **Hveravellir Hut** | Hveravellir | F35/F337 | 64.8667, -19.5500 | 50 | ✅ | ❌ 待添加 |
| **Kerlingarfjöll Hut** | Kerlingarfjöll | F35/F347 | 64.6333, -19.3167 | 60 | ✅ | ❌ 待添加 |
| **Askja (Dreki) Hut** | Dreki | F910 | 65.0500, -16.4167 | 30 | ✅ | ❌ 待添加 |
| **Nýidalur Hut** | Nýidalur | F26 | 64.7167, -18.0833 | 38 | ✅ | ❌ 待添加 |
| **Mælifellssandur Hut** | Mælifellssandur | F210 | 63.9167, -18.7500 | 12 | ✅ | ❌ 待添加 |
| **Strútur Hut** | Strútur | F225 | 63.9000, -19.3000 | 15 | ✅ | ❌ 待添加 |
| **Álftavatn Hut** | Álftavatn | Laugavegur | 64.0833, -19.1333 | 32 | ✅ | ❌ 待添加 |

**数据来源**:
- Ferðafélag Íslands: https://www.fi.is/en/mountain-huts
- Iceland Touring Association

---

### 3. 紧急救援站 / 紧急联系点

| 名称 | 类型 | F-road | GPS 坐标 | 联系方式 | 状态 |
|------|------|--------|---------|---------|------|
| **Selfoss Rescue Team** | 救援站 | F208 起点 | 63.9330, -21.0023 | 112 (紧急) | ❌ 待添加 |
| **Akureyri Rescue Team** | 救援站 | F26/F821 | 65.6830, -18.1059 | 112 (紧急) | ❌ 待添加 |
| **Mývatn Ranger Station** | 护林站 | F88/F910 | 65.6378, -16.9086 | +354 464 4460 | ❌ 待添加 |
| **Þórsmörk Ranger Station** | 护林站 | F249 | 63.6833, -19.4833 | +354 893 2910 | ❌ 待添加 |
| **Landmannalaugar Ranger** | 护林站 | F208 | 63.9833, -19.0667 | +354 893 8407 | ❌ 待添加 |

**通用紧急联系**:
- 冰岛搜救队 (ICE-SAR): 112
- 道路状况: https://www.road.is 或 +354 1777

---

### 4. 核心景点（Signature POIs）

确保这些景点在数据库中且数据完整：

| POI | F-road | GPS 坐标 | 开放时间 | 票价 | 状态 |
|-----|--------|---------|---------|------|------|
| **Landmannalaugar** | F208 | 63.9833, -19.0667 | 6月-9月 | 免费 | ❓ 需检查 |
| **Þórsmörk** | F249 | 63.6833, -19.4833 | 6月-9月 | 免费 | ❓ 需检查 |
| **Askja 火山口湖** | F910 | 65.0333, -16.7500 | 6月-8月 | 免费 | ❓ 需检查 |
| **Hveravellir 地热区** | F35 | 64.8667, -19.5500 | 全年（夏季F路） | 免费 | ❓ 需检查 |
| **Kerlingarfjöll** | F347 | 64.6333, -19.3167 | 6月-9月 | 免费 | ❓ 需检查 |
| **Eldgjá 火山峡谷** | F210 | 63.9667, -18.3667 | 6月-9月 | 免费 | ❓ 需检查 |

---

## ⚠️ P1 重要补充

### 5. 露营地 (CAMPING)

| 名称 | F-road | GPS 坐标 | 设施 | 开放时间 | 状态 |
|------|--------|---------|------|---------|------|
| **Landmannalaugar Campsite** | F208 | 63.9833, -19.0667 | 厕所/淋浴 | 6月-9月 | ❌ 待添加 |
| **Þórsmörk Campsite** | F249 | 63.6833, -19.4833 | 厕所/淋浴 | 6月-9月 | ❌ 待添加 |
| **Hveravellir Campsite** | F35 | 64.8667, -19.5500 | 厕所/温泉 | 6月-9月 | ❌ 待添加 |
| **Kerlingarfjöll Campsite** | F347 | 64.6333, -19.3167 | 厕所/淋浴 | 6月-9月 | ❌ 待添加 |
| **Dreki Campsite** | F910 | 65.0500, -16.4167 | 厕所 | 6月-8月 | ❌ 待添加 |
| （至少补充 15+ 个更多露营地） |

---

### 6. 河流穿越点 (RIVER_CROSSING)

**关键危险河流穿越点**（需详细标注）:

| 河流名称 | F-road | GPS 坐标 | 难度 | 最佳时间 | 水深 | 状态 |
|---------|--------|---------|------|---------|------|------|
| **Krossá** | F206 | 63.7800, -19.6000 | VERY_HIGH | 上午 | 0.5-1.5m | ❌ 待添加 |
| **Markarfljót** | F210 | 63.9000, -19.5000 | HIGH | 上午 | 0.3-1m | ❌ 待添加 |
| **Jökulsá á Fjöllum** | F88 | 65.3000, -16.5000 | HIGH | 上午 | 0.4-1.2m | ❌ 待添加 |
| **Þjórsá** | F347 | 64.1000, -19.7000 | HIGH | 上午 | 0.4-1m | ❌ 待添加 |
| （至少补充 10+ 个河流穿越点） |

**数据字段要求**:
- GPS 精确坐标（误差 < 10m）
- 难度评级（LOW/MEDIUM/HIGH/VERY_HIGH）
- 最佳穿越时间（通常上午水位最低）
- 典型水深范围
- 河床类型（石头/沙地/泥泞）
- 历史事故记录（如有）

---

### 7. 停车场 (PARKING)

| 名称 | 位置 | GPS 坐标 | 容量 | 收费 | 状态 |
|------|------|---------|------|------|------|
| **Landmannalaugar Parking** | F208 终点 | 63.9833, -19.0667 | 50+ | 免费 | ❌ 待添加 |
| **Þórsmörk Parking** | F249 | 63.6833, -19.4833 | 30+ | 免费 | ❌ 待添加 |
| **Askja Parking** | F910 | 65.0333, -16.7500 | 20+ | 免费 | ❌ 待添加 |
| （至少补充 10+ 个停车场） |

---

## 📊 数据收集来源

### 推荐数据源（按优先级）

1. **官方数据** (最可靠)
   - road.is - 道路状态、服务设施
   - Vegagerðin (冰岛公路管理局) - 官方数据
   - Ferðafélag Íslands - 高地小屋、露营地
   - Icelandic Touring Association

2. **商业数据**
   - Google Maps Places API - POI 信息
   - N1 / Orkan / Olís 官网 - 加油站位置、营业时间
   - Booking.com / Airbnb - 住宿数据

3. **开放数据**
   - OpenStreetMap - 冰岛区域导出
   - WikiVoyage Iceland - 旅游信息

4. **社区数据**
   - Safetravel.is - 安全信息
   - r/VisitingIceland (Reddit) - 用户反馈
   - Facebook 冰岛旅游群组

---

## 🎯 数据导入流程

### Step 1: 数据收集（1 周）
- [ ] 从 N1/Orkan/Olís 官网爬取加油站数据
- [ ] 从 Ferðafélag Íslands 收集高地小屋数据
- [ ] 从 Google Maps API 搜索冰岛 F-road 沿线 POI
- [ ] 手动整理河流穿越点（参考地图和论坛）

### Step 2: 数据清洗（2-3 天）
- [ ] 统一 GPS 坐标格式（WGS84）
- [ ] 验证开放时间格式
- [ ] 补充缺失字段
- [ ] 去重和合并

### Step 3: 数据导入（1 天）
- [ ] 创建批量导入脚本（`scripts/import-iceland-service-facilities.ts`）
- [ ] 运行导入
- [ ] 验证导入结果

### Step 4: 数据验证（1-2 天）
- [ ] 检查地理位置准确性
- [ ] 验证开放时间逻辑
- [ ] 测试 POI 搜索功能
- [ ] 运行 `analyze-iceland-poi-coverage.ts` 确认覆盖率

---

## 📝 Schema 扩展建议

当前 `Place` 表可能需要扩展以支持更多字段：

```prisma
model Place {
  // ... 现有字段

  // 新增字段建议
  lastVerifiedAt       DateTime?  // P0: 数据最后验证时间
  dataSource           String?     // 数据来源 (official/google/osm/manual)
  sourceUrl            String?     // 来源 URL
  openingHours         Json?       // 结构化开放时间
  seasonalAvailability Json?       // 季节性可用性 (F-road 特有)
  facilities           Json?       // 设施列表 (露营地/小屋)
  emergencyContact     String?     // 紧急联系方式 (救援站)
  difficulty           String?     // 难度评级 (河流穿越点)
  waterDepth           Json?       // 水深范围 (河流穿越点)
}
```

---

## ✅ 完成标准

**P0 数据补充完成**时，需满足：
- ✅ 加油站数量 >= 10 个
- ✅ 高地小屋 >= 10 个
- ✅ 紧急救援站 >= 5 个
- ✅ 核心景点数据完整且有地理位置
- ✅ 地理位置覆盖率 >= 90%
- ✅ 开放时间覆盖率 >= 50%
- ✅ 所有数据有 `lastVerifiedAt` 时间戳

**P1 数据补充完成**时，需满足：
- ✅ 露营地 >= 20 个
- ✅ 河流穿越点 >= 10 个（含难度和水深）
- ✅ 停车场 >= 10 个
- ✅ 餐厅 >= 20 个
- ✅ 住宿 >= 20 个

---

**生成时间**: 2026-02-13
**负责人**: TripNARA 数据团队
**优先级**: P0（必须尽快完成）
