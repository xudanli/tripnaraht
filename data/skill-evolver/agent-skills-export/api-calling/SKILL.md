---
name: api-calling
description: "API 调用规范. Use when: 需要调用外部 REST API; 需要处理 API 返回的错误码; 需要构造 HTTP 请求参数; api; http; error_handling."
license: Proprietary. TripNARA internal skill.
compatibility: TripNARA SkillEvolver markdown skill; loadable in Claude Code / Cursor Agent Skills.
metadata:
  tripnara-skill-id: api_calling
  tripnara-version: 1
  tripnara-artifact-type: markdown_skill
---

<!-- tripnara-skill-evolver: do not edit export copy; source under data/skill-evolver/ -->

# API 调用规范

## 原则
调用外部 API 前，必须先验证参数合法性，避免发送无效请求。

## 步骤
1. **参数检查**：检查所有必填参数是否已提供且类型正确
2. **URL 构建**：使用标准库构造查询参数，禁止手写未转义拼接
3. **重试策略**：对 5xx 错误使用指数退避，最多重试 3 次
4. **错误处理**：
   - 4xx 错误：记录详细错误信息，不再重试
   - 5xx 错误：按重试策略处理
   - 超时：视为 5xx 处理
5. **响应解析**：优先尝试 JSON 解析，失败则记录原始响应

## 注意事项
- 绝不要在日志中记录 api_key
- 对 429 (Rate Limit) 响应，读取 Retry-After 头部
