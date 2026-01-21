# 测试用例库

本目录包含RL Infrastructure的测试用例文件。

## 文件结构

- `router_test_cases.json` - Router组件测试用例
- `gate_test_cases.json` - Gate组件测试用例
- `itinerary_test_cases.json` - Itinerary组件测试用例

## 测试用例格式

每个测试用例包含以下字段：

```json
{
  "id": "test_case_id",
  "component": "ROUTER | GATE | ITINERARY",
  "input": {
    "user_request": "用户请求文本",
    "origin": "起点（可选）",
    "destination": "终点（可选）",
    // 其他输入字段...
  },
  "metadata": {
    "country_code": "国家代码（可选）",
    "complexity": "复杂度（可选）",
    "risk_level": "风险级别（可选）"
  },
  "expected_output": {
    "action": "期望的动作（可选）"
  }
}
```

## 使用方法

测试用例由 `TestCaseManagerService` 自动加载。可以通过环境变量 `TEST_CASES_DIR` 指定测试用例目录，默认为 `./data/test-cases`。

## 扩展测试用例

1. 编辑对应的JSON文件
2. 添加新的测试用例对象
3. 确保格式正确
4. 重启服务以加载新用例（或调用 `TestCaseManagerService.clearCache()`）

## 目标

- Router测试用例：100+用例
- Gate测试用例：100+用例
- Itinerary测试用例：100+用例

当前为示例用例，需要根据实际业务场景扩展。
