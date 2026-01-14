# route_and_run 接口 - 澄清问题流程测试指南

**测试日期**: 2025-01-14  
**测试角色**: 后端工程师  
**测试范围**: `POST /agent/route_and_run` 接口的结构化澄清问题功能

---

## 📋 测试场景

### 场景 1：信息不足 - 需要澄清（NEED_MORE_INFO）

#### 测试用例 1.1：缺少目的地

**请求**：
```json
POST /agent/route_and_run
{
  "request_id": "test-001",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划行程",
  "conversation_context": {
    "recent_messages": []
  },
  "options": {
    "max_steps": 50
  }
}
```

**预期响应**：
```json
{
  "request_id": "test-001",
  "result": {
    "status": "NEED_MORE_INFO",
    "answer_text": "为了更好地规划您的行程，请回答以下问题。",
    "payload": {
      "clarificationQuestions": [
        {
          "id": "question-1",
          "question": "请选择您的目的地",
          "type": "text",
          "required": true,
          "placeholder": "例如：冰岛、日本、瑞士",
          "hint": "这将帮助我们为您推荐合适的景点和活动"
        }
      ],
      "clarificationMessage": "为了更好地规划您的行程，请回答以下问题：\n\n1. 请选择您的目的地\n   例如：冰岛、日本、瑞士\n   这将帮助我们为您推荐合适的景点和活动\n"
    }
  },
  "ui_state": {
    "phase": "INTAKE",
    "ui_status": "awaiting_user_input",
    "progress_percent": 12.5,
    "message": "需要您的确认",
    "requires_user_action": true
  }
}
```

**验证点**：
- ✅ `result.status` 为 `NEED_MORE_INFO`
- ✅ `payload.clarificationQuestions` 存在且不为空
- ✅ `payload.clarificationMessage` 存在（向后兼容）
- ✅ `ui_state.ui_status` 为 `awaiting_user_input`
- ✅ `ui_state.requires_user_action` 为 `true`

#### 测试用例 1.2：缺少日期

**请求**：
```json
{
  "request_id": "test-002",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划去冰岛的行程",
  "conversation_context": {
    "recent_messages": []
  }
}
```

**预期响应**：
```json
{
  "result": {
    "status": "NEED_MORE_INFO",
    "payload": {
      "clarificationQuestions": [
        {
          "id": "question-1",
          "question": "请选择您的出行日期",
          "type": "date",
          "required": true,
          "hint": "建议选择 1 个月后的日期，以便提前预订",
          "validation": {
            "min": 1705276800000,
            "max": 1736812800000
          }
        }
      ]
    }
  }
}
```

**验证点**：
- ✅ 问题类型为 `date`
- ✅ 验证规则包含 `min` 和 `max`（时间戳）

#### 测试用例 1.3：缺少多个信息（目的地 + 日期 + 预算）

**请求**：
```json
{
  "request_id": "test-003",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划行程",
  "conversation_context": {
    "recent_messages": []
  }
}
```

**预期响应**：
```json
{
  "result": {
    "status": "NEED_MORE_INFO",
    "payload": {
      "clarificationQuestions": [
        {
          "id": "question-1",
          "question": "请选择您的目的地",
          "type": "text",
          "required": true
        },
        {
          "id": "question-2",
          "question": "请选择您的出行日期",
          "type": "date",
          "required": true
        },
        {
          "id": "question-3",
          "question": "同行人数",
          "type": "single_choice",
          "required": true,
          "options": ["1人", "2人", "3-4人", "5人以上"]
        },
        {
          "id": "question-4",
          "question": "总预算（人民币）",
          "type": "number",
          "required": true,
          "validation": {
            "min": 100,
            "max": 1000000
          }
        }
      ]
    }
  }
}
```

**验证点**：
- ✅ 生成了多个澄清问题
- ✅ 问题类型多样（text、date、single_choice、number）
- ✅ 所有必填问题都有 `required: true`

### 场景 2：多轮澄清

#### 测试用例 2.1：第一轮澄清

**请求**（第一轮）：
```json
{
  "request_id": "test-004",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划去冰岛的行程",
  "conversation_context": {
    "recent_messages": []
  }
}
```

**响应**：返回日期相关的问题

#### 测试用例 2.2：第二轮澄清（回答第一轮问题后）

**请求**（第二轮）：
```json
{
  "request_id": "test-005",
  "user_id": "user-123",
  "trip_id": null,
  "message": "2026年2月1日出发，10天行程",
  "conversation_context": {
    "recent_messages": [
      "帮我规划去冰岛的行程",
      "2026年2月1日出发，10天行程"
    ]
  }
}
```

**预期行为**：
- ✅ 系统解析新的信息（日期、天数）
- ✅ 如果仍有缺失信息，继续生成澄清问题
- ✅ 如果信息充足，继续生成行程

### 场景 3：信息充足 - 成功生成行程（OK）

#### 测试用例 3.1：完整信息

**请求**：
```json
{
  "request_id": "test-006",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划26年春节去冰岛的10天行程，预算100000元",
  "conversation_context": {
    "recent_messages": []
  }
}
```

**预期响应**：
```json
{
  "result": {
    "status": "OK",
    "answer_text": "已为您生成 10 天的行程安排。",
    "payload": {
      "orchestrationResult": {
        "itinerary": { /* TripDetail */ },
        "gate_result": { /* GateResult */ },
        "decision_log": [ /* DecisionLogEntry[] */ ]
      }
    }
  }
}
```

**验证点**：
- ✅ `result.status` 为 `OK`
- ✅ `payload.clarificationQuestions` 不存在（或为空）
- ✅ `payload.orchestrationResult.itinerary` 存在
- ✅ `payload.orchestrationResult.gate_result` 存在

---

## 🔍 测试检查点

### 1. 数据结构检查

- ✅ `clarificationQuestions` 数组不为空
- ✅ 每个问题都有 `id`、`question`、`type`、`required` 字段
- ✅ `type` 为有效值（text/single_choice/multi_choice/date/number）
- ✅ `single_choice` 和 `multi_choice` 类型的问题有 `options` 字段
- ✅ `date` 和 `number` 类型的问题有 `validation` 字段（如果适用）

### 2. 验证规则检查

- ✅ `date` 类型的 `validation.min/max` 为时间戳（number）
- ✅ `number` 类型的 `validation.min/max` 为数值
- ✅ `text` 类型的 `validation.pattern` 为正则表达式字符串（如果存在）

### 3. 向后兼容检查

- ✅ `clarificationMessage` 字段存在（简单字符串格式）
- ✅ `clarificationMessage` 内容与 `clarificationQuestions` 一致
- ✅ 前端可以选择使用 `clarificationMessage` 或 `clarificationQuestions`

### 4. 状态机流程检查

- ✅ 检测到 HARD 缺口时，提前返回澄清结果
- ✅ 不继续执行 RESEARCH、GATE_EVAL 等步骤
- ✅ `ui_state.phase` 为 `INTAKE`
- ✅ `ui_state.ui_status` 为 `awaiting_user_input`

### 5. 错误处理检查

- ✅ 如果生成澄清问题失败，返回错误响应
- ✅ 错误响应中包含错误信息
- ✅ 不抛出未捕获的异常

---

## 🧪 测试命令

### 使用 curl 测试

```bash
# 测试用例 1.1：缺少目的地
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "trip_id": null,
    "message": "帮我规划行程",
    "conversation_context": {
      "recent_messages": []
    },
    "options": {
      "max_steps": 50
    }
  }'
```

### 使用 Postman 测试

1. **创建请求**
   - Method: `POST`
   - URL: `http://localhost:3000/api/agent/route_and_run`
   - Headers: `Content-Type: application/json`

2. **测试用例**
   - 使用上述测试用例的请求体

3. **验证响应**
   - 检查 `result.status` 是否为 `NEED_MORE_INFO`
   - 检查 `payload.clarificationQuestions` 是否存在
   - 检查问题类型和验证规则

---

## 📝 测试结果记录

### 测试用例 1.1：缺少目的地

- [ ] 测试时间：______
- [ ] 测试结果：✅ 通过 / ❌ 失败
- [ ] 问题描述：______

### 测试用例 1.2：缺少日期

- [ ] 测试时间：______
- [ ] 测试结果：✅ 通过 / ❌ 失败
- [ ] 问题描述：______

### 测试用例 1.3：缺少多个信息

- [ ] 测试时间：______
- [ ] 测试结果：✅ 通过 / ❌ 失败
- [ ] 问题描述：______

---

## 🔴 已知问题

### 问题 1：TypeScript 类型错误

**错误信息**：
```
Line 256:9 - 不能将类型"null"分配给类型"{ [key: string]: any; ... }"
```

**位置**：`src/agent/services/claude-orchestrator.service.ts:256`

**状态**：✅ 已修复（将 `result: null` 改为 `result: { errors: state.errors }`）

---

## ✅ 测试完成标准

- ✅ 所有测试用例通过
- ✅ 数据结构正确
- ✅ 验证规则正确
- ✅ 向后兼容正常
- ✅ 状态机流程正确
- ✅ 错误处理正确
- ✅ 无 TypeScript 类型错误
- ✅ 无运行时错误

---

**测试指南创建日期**: 2025-01-14  
**测试状态**: ⚠️ 待测试  
**下一步**: 执行测试用例并记录结果
