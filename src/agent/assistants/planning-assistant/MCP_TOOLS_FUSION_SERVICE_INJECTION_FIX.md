# MCP 工具融合 - 服务注入修复

## 问题诊断

从日志分析发现：

### ✅ 工具选择正常工作
- 工具选择逻辑成功执行
- 正确识别工具（如 `airbnb.listingDetails`, `weather.getWeatherByDatetimeRange`, `exa.webSearch`）
- 置信度正常（0.9-1.0）

### ❌ MCP 服务未注入
日志显示：
- `AirbnbService 不可用`
- `WeatherDirectService 不可用`
- `ExaService 不可用`

### 根本原因

`McpToolDispatcherService` 构造函数中使用 `@Optional()` 和 `any` 类型，导致 NestJS 无法正确注入服务。

## 修复方案

### 1. 添加正确的类型导入
```typescript
import { AirbnbService } from '../../../mcp/airbnb.service';
import { WeatherDirectService } from '../../../mcp/weather-direct.service';
import { ExaService } from '../../../mcp/exa.service';
import { GoogleCalendarService } from '../../../mcp/google-calendar.service';
```

### 2. 使用 `@Inject()` 装饰器
```typescript
constructor(
  @Optional() @Inject(AirbnbService) private readonly airbnbService?: AirbnbService,
  @Optional() @Inject(WeatherDirectService) private readonly weatherDirectService?: WeatherDirectService,
  @Optional() @Inject(ExaService) private readonly exaService?: ExaService,
  @Optional() @Inject(GoogleCalendarService) private readonly googleCalendarService?: GoogleCalendarService,
)
```

### 3. 添加警告日志
在构造函数中添加警告日志，如果服务未注入会显示警告。

## 验证

修复后，服务器启动日志应该显示：
```
🚀 MCP Tool Dispatcher Service 初始化
服务注入状态: Airbnb=true, Weather=true, Exa=true, GoogleCalendar=true
```

如果服务未注入，会显示：
```
⚠️ AirbnbService 未注入！
⚠️ WeatherDirectService 未注入！
⚠️ ExaService 未注入！
⚠️ GoogleCalendarService 未注入！
```

## 下一步

1. 等待服务器重新编译
2. 检查启动日志确认服务注入状态
3. 重新运行测试脚本验证工具调用是否成功
