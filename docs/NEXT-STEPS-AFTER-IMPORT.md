# 数据导入后的下一步操作

## 1. 验证数据导入 ✅

首先验证数据是否成功导入：

```bash
# 检查数据统计
npm run verify:flight-data

# 或直接运行验证脚本
npx ts-node --project tsconfig.backend.json scripts/verify-flight-data.ts
```

验证脚本会检查：
- 记录数量
- 新字段的数据完整性（distanceKm, monthFactor, airlineCount 等）
- 示例数据
- 周内因子
- 数据质量统计

## 2. 测试 API 接口 🧪

### 2.1 启动后端服务

```bash
npm run backend:dev
```

### 2.2 测试国内航班价格估算 API

```bash
# 运行测试脚本
./test-domestic-flight-api.sh

# 或手动测试
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=4"
```

### 2.3 验证新字段是否返回

API 响应应该包含以下新字段：
- `distanceKm` - 航线距离
- `monthFactor` - 月度因子
- `airlineCount` - 航司数量
- `isWeekend` - 是否周末
- `departureTime` - 起飞时间
- `arrivalTime` - 降落时间
- `timeOfDayFactor` - 时段因子

## 3. 数据质量检查 📊

### 3.1 检查数据完整性

运行验证脚本查看：
- 各字段的填充率
- 数据分布情况
- 异常值检测

### 3.2 检查数据准确性

- 验证价格范围是否合理
- 检查月度因子是否反映季节性（如春节月份因子应该较高）
- 验证周末标识是否正确
- 检查时段因子是否合理

## 4. 性能优化 ⚡

### 4.1 检查索引

确保以下索引已创建：
- `routeId, month` - 用于月度查询
- `routeId, month, dayOfWeek` - 用于精确查询
- `originCity, destinationCity` - 用于城市查询

### 4.2 查询性能测试

测试常见查询的响应时间：
- 单条航线查询
- 月度趋势查询
- 批量查询

## 5. 功能扩展建议 🚀

### 5.1 价格预测模型

利用新字段建立更精确的价格预测：
- 结合 `distanceKm` 和 `monthFactor` 预测基础价格
- 使用 `airlineCount` 评估市场竞争
- 利用 `timeOfDayFactor` 优化时段推荐

### 5.2 数据分析功能

- 航线热度分析（基于样本数）
- 季节性价格趋势分析（基于 monthFactor）
- 市场竞争分析（基于 airlineCount）
- 时段价格差异分析（基于 timeOfDayFactor）

### 5.3 API 增强

可以考虑添加：
- 批量查询接口
- 价格趋势分析接口
- 航线对比接口
- 最佳预订时间推荐接口

## 6. 文档更新 📝

更新以下文档：
- API 文档（包含新字段说明）
- 数据模型文档
- 使用示例

## 7. 监控和告警 🔔

设置监控：
- 数据导入状态
- API 响应时间
- 数据质量指标
- 错误率

## 快速检查清单

- [ ] 数据已成功导入（记录数 > 0）
- [ ] 新字段数据完整性 > 80%
- [ ] API 接口正常响应
- [ ] 新字段在 API 响应中正确返回
- [ ] 数据质量检查通过
- [ ] 性能测试通过
- [ ] 文档已更新

## 常见问题

### Q: 数据导入后表还是空的？

**A:** 检查：
1. 导入脚本是否成功完成（无错误）
2. 数据文件格式是否正确
3. 数据库连接是否正确
4. 运行验证脚本查看详细错误

### Q: 新字段都是 null？

**A:** 检查：
1. 原始数据是否包含相应字段（里程、航空公司、起飞时间等）
2. 导入脚本是否正确处理这些字段
3. 重新运行导入脚本

### Q: API 返回默认值？

**A:** 检查：
1. 查询的航线是否存在
2. 月份和星期几是否正确
3. 数据库中的数据是否完整
4. 查看后端日志中的警告信息

## 需要帮助？

如果遇到问题，可以：
1. 运行验证脚本查看详细错误
2. 检查后端服务日志
3. 查看数据库中的实际数据
4. 测试 API 接口响应

