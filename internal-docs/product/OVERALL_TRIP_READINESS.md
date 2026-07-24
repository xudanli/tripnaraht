# TripNARA 整体准备度（Overall Trip Readiness）

> **版本**: 0.1.0  
> **状态**: Phase 1 MVP 已落地后端计算  
> **最后更新**: 2026-07-15  
> **API**: [`src/trips/overall-readiness/OVERALL_TRIP_READINESS_API.md`](../../src/trips/overall-readiness/OVERALL_TRIP_READINESS_API.md)

---

## 1. 核心调整

将原来的「规划进度」升级为 **整体准备度**：这趟旅行是否已经具备按计划出发并顺利执行的条件。

规划进度（pipeline 阶段占比）保留为内部指标，**不再作为用户主分数**。

```text
整体准备度
├── 五维度加权得分
├── 全局阻塞门禁
└── 证据可信度
```

分数与是否就绪必须分离：即使加权 90 分，存在关键阻塞时展示「已阻塞 / 尚未就绪」。

---

## 2. 与既有准备度模型的关系

见 [`PRODUCT_READINESS_MODEL.md`](./PRODUCT_READINESS_MODEL.md)。

Overall Trip Readiness **不是** 第四个并列 SSOT，而是：

> 面向首页的 **解释投影层**：把 Feasibility / 住宿预订 / 交通决策 / 活动预约 / 成员确认 投影到五维加权 + 门禁。

仍禁止用 Overall 反向写 feasibility 或替换 DepartureGate。

---

## 3. 默认权重

| 维度 | 默认 | 冰岛自驾单人 | 冰岛自驾多人 |
|------|-----:|------------:|------------:|
| 路线 | 25% | 30% | 28% |
| 住宿 | 20% | 20% | 20% |
| 交通 | 20% | 25% | 22% |
| 活动 | 20% | 15% | 15% |
| 成员 | 15% | 10% | 15% |

---

## 4. 状态

| 状态 | 条件要点 |
|------|----------|
| NOT_STARTED | 得分 < 30 |
| IN_PROGRESS | 30–69 |
| NEAR_READY | 70–84，无 blocker |
| READY | ≥85 且每维 ≥70 且无 blocker 且证据可信度 ≥80 |
| BLOCKED | 任意关键阻塞（不受总分影响） |
| NEEDS_REVALIDATION | 关键证据过期 |

---

## 5. MVP 分期

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | 五维权重、粗投影检查项、blocker、timeline 卡片、报告 API | ✅ |
| 2 | DecisionCase 交通壳、证据列表与过期、推荐动作分差、列表缓存 | ✅ |
| 2.1 | 成员偏好/硬限制分项、报告 homepage、displayLabelZh、apply 清缓存 | ✅ |
| 3 | 基于真实结果校准权重 | 待办 |

**前端改造清单：** [`OVERALL_TRIP_READINESS_FE_HANDOFF.md`](../../src/trips/overall-readiness/OVERALL_TRIP_READINESS_FE_HANDOFF.md)
