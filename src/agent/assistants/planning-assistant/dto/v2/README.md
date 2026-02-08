# V2 DTO 目录

**说明**: 此目录包含规划助手智能体 V2 接口的所有 DTO 定义

**参考文档**: [API_REDESIGN_DTO_DEFINITIONS.md](../API_REDESIGN_DTO_DEFINITIONS.md)

---

## 📁 文件结构

```
dto/v2/
├── README.md (本文件)
├── create-session-request.dto.ts          # 创建会话请求
├── create-session-response.dto.ts         # 创建会话响应
├── session-state-response.dto.ts          # 会话状态响应
├── message-history-response.dto.ts        # 对话历史响应
├── recommendations-request.dto.ts         # 推荐请求
├── recommendations-response.dto.ts        # 推荐响应
├── generate-plan-request.dto.ts          # 生成方案请求
├── generate-plan-response.dto.ts         # 生成方案响应
├── async-task-response.dto.ts            # 异步任务响应
├── compare-plans-request.dto.ts          # 对比方案请求
├── compare-plans-response.dto.ts         # 对比方案响应
├── optimize-plan-request.dto.ts         # 优化方案请求
├── confirm-plan-request.dto.ts          # 确认方案请求
├── optimize-trip-request.dto.ts         # 优化行程请求
├── refine-trip-request.dto.ts           # 细化行程请求
├── trip-suggestions-response.dto.ts     # 优化建议响应
├── chat-request.dto.ts                  # 对话请求
├── chat-response.dto.ts                 # 对话响应
├── error-response.dto.ts                # 错误响应
└── shared/                               # 共享类型
    ├── destination-recommendation.dto.ts
    ├── plan-candidate.dto.ts
    └── suggested-action.dto.ts
```

---

## 📝 待创建文件

根据 [API_REDESIGN_DTO_DEFINITIONS.md](../API_REDESIGN_DTO_DEFINITIONS.md) 创建所有DTO文件。

**优先级**:
1. P0: error-response.dto.ts, create-session-request.dto.ts, create-session-response.dto.ts
2. P0: recommendations-request.dto.ts, recommendations-response.dto.ts
3. P0: generate-plan-request.dto.ts, generate-plan-response.dto.ts
4. P1: 其他DTO文件

---

**文档维护**: 后端开发团队  
**最后更新**: 2026-02-08
