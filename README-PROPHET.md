# Prophet 价格预测设置指南

## 前置要求

### 1. 安装 Python

确保系统已安装 Python 3.7 或更高版本：

```bash
python3 --version
```

### 2. 安装 Prophet

使用 pip 安装 Prophet 及其依赖：

```bash
pip install prophet pandas numpy
```

或者使用 conda：

```bash
conda install -c conda-forge prophet
```

### 3. 验证安装

运行以下命令验证 Prophet 是否安装成功：

```bash
python3 -c "import prophet; print('Prophet 安装成功')"
```

## 使用方式

### 自动降级机制

系统会自动检测 Prophet 是否可用：

- **如果 Prophet 可用且历史数据 ≥ 30 条**：使用 Prophet 模型进行预测
- **如果 Prophet 不可用或数据不足**：自动降级到历史同期均值法（MVP 版本）

### 检查 Prophet 可用性

可以通过 API 检查 Prophet 是否可用（需要添加端点）：

```typescript
// 在服务中调用
const availability = await prophetService.checkAvailability();
console.log(availability); // { available: true/false, message: string }
```

## 故障排查

### 问题 1: Python 未找到

**错误信息**：`启动 Python 进程失败: spawn python3 ENOENT`

**解决方案**：
1. 确保 Python 已安装并在 PATH 中
2. 如果使用 `python` 而不是 `python3`，修改 `prophet-service.ts` 中的 `findPythonCommand()` 方法

### 问题 2: Prophet 未安装

**错误信息**：`Python 可用，但 Prophet 未安装`

**解决方案**：
```bash
pip install prophet
```

### 问题 3: 历史数据不足

**错误信息**：`历史数据不足，需要至少30条数据`

**解决方案**：
- 系统会自动降级到历史同期均值法
- 或确保有足够的历史数据（≥ 30 条）

### 问题 4: 脚本路径错误

**错误信息**：`Python 脚本执行失败`

**解决方案**：
- 确保 `scripts/prophet_predict.py` 文件存在
- 检查文件权限（需要可执行权限）

## 性能优化

### 缓存预测结果

建议对预测结果进行缓存（24 小时），因为价格不会频繁变化：

```typescript
// 在服务中添加缓存
const cacheKey = `price-forecast:${fromCity}:${toCity}:${date}`;
const cached = await cache.get(cacheKey);
if (cached) {
  return cached;
}
```

### 异步处理

对于大量预测请求，可以考虑异步处理：

```typescript
// 使用队列处理预测任务
await queue.add('price-prediction', { request });
```

## 进阶配置

### 调整 Prophet 参数

修改 `scripts/prophet_predict.py` 中的模型参数：

```python
model = Prophet(
    yearly_seasonality=True,
    weekly_seasonality=True,
    daily_seasonality=False,
    seasonality_mode='multiplicative',  # 或 'additive'
    changepoint_prior_scale=0.05,  # 调整趋势变化敏感度
    holidays=holidays_df,  # 添加节假日数据
)
```

### 添加节假日数据

在 Python 脚本中添加节假日：

```python
holidays = pd.DataFrame({
    'holiday': '春节',
    'ds': pd.to_datetime(['2024-02-10', '2025-01-29']),
    'lower_window': -2,
    'upper_window': 2,
})
model = Prophet(holidays=holidays)
```

## 测试

### 测试 Python 脚本

直接运行 Python 脚本进行测试：

```bash
echo '{"historical_data":[{"date":"2023-01-01","price":1000},{"date":"2023-01-02","price":1100}],"periods":30,"start_date":"2024-05-01"}' | python3 scripts/prophet_predict.py
```

### 测试 Node.js 服务

```typescript
// 在测试中
const result = await pricePredictionService.predictFlightPrice({
  from_city: '北京',
  to_city: '上海',
  departure_date: '2024-05-01',
});
```

