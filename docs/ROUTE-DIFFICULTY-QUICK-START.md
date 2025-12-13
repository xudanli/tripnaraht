# 路线难度评估 - 快速开始清单

## ✅ 必做步骤

### 1. 环境准备

```bash
# 安装Python依赖
pip install requests pillow

# 配置API密钥（选择一个）
export GOOGLE_MAPS_API_KEY=your_key_here
# 或
export MAPBOX_ACCESS_TOKEN=your_token_here
```

### 2. 冒烟测试

#### Google 示例

```bash
python tools/end2end_difficulty_with_geojson.py \
  --provider google \
  --origin "39.9042,116.4074" \
  --destination "39.914,116.403" \
  --profile walking \
  --sample-m 30 \
  --category ATTRACTION \
  --accessType HIKING \
  --elevationMeters 2300 \
  --out test_google.geojson
```

**期望输出**：
- 控制台打印 metrics（distance_km, elevation_gain_m, label）
- 生成 `test_google.geojson` 文件

#### Mapbox 示例

```bash
python tools/end2end_difficulty_with_geojson.py \
  --provider mapbox \
  --origin "7.9904,46.5763" \
  --destination "7.985,46.577" \
  --profile walking \
  --sample-m 30 \
  --category ATTRACTION \
  --visitDuration "半天" \
  --out test_mapbox.geojson
```

### 3. API 测试

启动后端服务后，测试API端点：

```bash
curl -X POST http://localhost:3000/places/metrics/difficulty \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "origin": "39.9042,116.4074",
    "destination": "39.914,116.403",
    "profile": "walking",
    "category": "ATTRACTION",
    "accessType": "HIKING"
  }'
```

**期望响应**：
```json
{
  "distance_km": 10.8,
  "elevation_gain_m": 720,
  "slope_avg": 0.067,
  "label": "HARD",
  "S_km": 18.0,
  "notes": ["altitude: ×1.3"]
}
```

## 📋 文件清单

### Python 工具
- ✅ `tools/end2end_difficulty_with_geojson.py` - 端到端脚本（~1000行）
- ✅ `models/trail_difficulty.py` - 难度分级器（~300行）

### NestJS 服务
- ✅ `src/places/dto/route-difficulty.dto.ts` - DTO定义
- ✅ `src/places/services/route-difficulty.service.ts` - 服务实现
- ✅ `src/places/places.controller.ts` - API端点（已添加）
- ✅ `src/places/places.module.ts` - 模块注册（已更新）

### 文档
- ✅ `docs/ROUTE-DIFFICULTY-GUIDE.md` - 完整使用指南
- ✅ `docs/ROUTE-DIFFICULTY-QUICK-START.md` - 快速开始（本文件）

## 🔑 关键命令总结

### 命令行使用

```bash
# 基本用法
python tools/end2end_difficulty_with_geojson.py \
  --provider {google|mapbox} \
  --origin "lat,lon" \
  --destination "lat,lon" \
  --profile walking

# 完整参数示例
python tools/end2end_difficulty_with_geojson.py \
  --provider google \
  --origin "39.9042,116.4074" \
  --destination "39.914,116.403" \
  --profile walking \
  --sample-m 30 \
  --category ATTRACTION \
  --accessType HIKING \
  --visitDuration "半天" \
  --elevationMeters 2300 \
  --subCategory volcano \
  --trailDifficulty HARD \
  --out output.geojson
```

### API 使用

```bash
POST /places/metrics/difficulty

{
  "provider": "google",
  "origin": "39.9042,116.4074",
  "destination": "39.914,116.403",
  "profile": "walking",
  "sampleM": 30,
  "category": "ATTRACTION",
  "accessType": "HIKING",
  "elevationMeters": 2300,
  "includeGeoJson": false
}
```

## ⚠️ 常见问题

1. **Python脚本找不到**：确保在项目根目录执行
2. **API密钥未配置**：检查环境变量 `GOOGLE_MAPS_API_KEY` 或 `MAPBOX_ACCESS_TOKEN`
3. **PIL未安装**：`pip install pillow`
4. **坐标格式错误**：Google用`lat,lon`，Mapbox用`lon,lat`

## 📊 字段优先级（业务模型接入）

按优先级顺序：

1. **trailDifficulty**（若传入→直接用）
2. **accessType**（影响步速/坐席占比）
3. **visitDuration**（覆盖 typicalStay 推断距离）
4. **typicalStay**（备选推断）
5. **elevationMeters/max_elev_m**（≥2000m ×1.3）
6. **facilities**（只做无障碍标记，不改强度）
7. **subCategory**（小幅下限，如 glacier/volcano≥MODERATE）

## 🎯 下一步

- [ ] 集成到业务模型（将 distance_km 和 elevation_gain_m 传给分级器）
- [ ] 添加监控（请求时延、成功率、配额错误）
- [ ] 预热热门路线（离线预计算并缓存）
- [ ] 考虑离线DEM（SRTM/ALOS + OSRM）作为兜底

