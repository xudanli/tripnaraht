# 尼泊尔 POI 导入优化说明

## 🔧 已优化的问题

### 1. 数据库连接池超时

**问题**：逐条插入导致连接池耗尽
```
Timed out fetching a new connection from the connection pool
(Current connection pool timeout: 10, connection limit: 5)
```

**解决方案**：
- ✅ 批量检查已存在的 POI（每批 1000 条）
- ✅ 批量插入（每批 50 条，使用事务）
- ✅ 批次间延迟 200ms，避免连接池耗尽
- ✅ 事务超时设置为 30 秒

### 2. Overpass API 504 超时

**问题**：Overpass API 返回 504 Gateway Timeout

**解决方案**：
- ✅ 自动重试机制（最多 3 次）
- ✅ 超时后递增等待时间（10s, 20s, 30s）
- ✅ Region 之间延迟 3-5 秒

## 📊 性能优化

### 批量处理

1. **批量检查已存在**：每批 1000 条 OSM ID
2. **批量插入**：每批 50 条，使用事务
3. **进度显示**：每 500 条显示一次进度

### 连接池管理

- 批次大小：50 条（减少连接占用时间）
- 批次延迟：200ms（释放连接）
- 事务超时：30 秒

### API 请求优化

- 重试次数：3 次
- 重试延迟：递增（10s, 20s, 30s）
- Region 间延迟：3-5 秒

## 🚀 使用建议

### 1. 首次导入（推荐）

```bash
# 先导入单个 region 测试
npm run import:nepal-poi -- --region NP_KTM

# 确认无误后导入所有
npm run import:nepal-poi -- --all
```

### 2. 如果遇到超时

- 脚本会自动重试（最多 3 次）
- 如果仍然失败，可以单独导入该 region：
  ```bash
  npm run import:nepal-poi -- --region NP_PKR --profile A
  ```

### 3. 监控导入进度

脚本会显示：
- 每个 region/profile 的处理状态
- 批量插入进度（每 500 条）
- 最终统计（创建/跳过/错误）

## 📈 预期性能

- **单个 Region (4 Profiles)**：约 5-10 分钟
- **所有 MVP Regions (7 regions × 4 profiles)**：约 30-60 分钟
- **数据库连接**：峰值约 2-3 个连接（批量处理）

## ⚠️ 注意事项

1. **不要同时运行多个导入脚本**：避免连接池耗尽
2. **网络不稳定时**：脚本会自动重试，但可能需要更长时间
3. **大量数据时**：建议分批导入，先测试单个 region

## 🔍 故障排除

### 连接池超时

如果仍然遇到连接池超时：
1. 检查是否有其他数据库连接占用
2. 减少批次大小（修改 `BATCH_SIZE = 30`）
3. 增加批次延迟（修改延迟为 500ms）

### Overpass API 504

如果 Overpass API 持续返回 504：
1. 等待一段时间后重试
2. 减少查询半径（修改 `radius_km`）
3. 使用不同的 Overpass 服务器

## 📝 代码变更

主要优化点：
- `fetchFromOverpass()`: 添加重试机制
- `importRegionProfile()`: 批量检查和批量插入
- 批次大小和延迟优化

