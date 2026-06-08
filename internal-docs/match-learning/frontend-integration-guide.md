# Match Learning 前端 / 运维集成说明

Decision OS · 撮合 Soft Weights 自迭代 · P3  
面向前端透明度展示与 Staging 验收；**正常运行依赖 Cron，无需前端调用**。

---

## 1. 机制（PRD 5.3）

每周从 [Reputation OS](./reputation-os/frontend-integration-guide.md) 互评样本中学习：

| 样本类型 | 条件 | 动作 |
|---------|------|------|
| 正向 | Q5≥4 且 Q1≥4 | 对应维度 Soft Weight +5% 增量 |
| 负向 | Q1≤2 且 Q3≤2 | 冲突维度权重 +15%（强化扣分） |

生效范围：

- Odyssey 旅伴推荐 `POST /api/odyssey-intake/match`
- 搭子广场列表契合度 `GET /api/match-square/posts`
- 申请卡片 `highlights/warnings` 底层分数

---

## 2. API

### 当前权重（可选展示给运营 / Debug）

```bash
curl "$API/api/match-learning/weights"
```

```json
{
  "success": true,
  "data": {
    "weights": { "ei": 0.25, "tf": 0.3, "energy": 0.25, "ambiguity": 0.2 },
    "version": 3,
    "lastRunAt": "2026-06-10T04:00:00.000Z",
    "updatedAt": "2026-06-10T04:00:01.000Z"
  }
}
```

### 审计记录

```bash
curl "$API/api/match-learning/weights/runs"
```

### 手动触发（Staging）

```bash
curl -X POST "$API/api/match-learning/weights/run-weekly"
```

生产可通过 `MATCH_LEARNING_MANUAL_RUN=false` 禁用。

---

## 3. 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `MATCH_LEARNING_CRON_ENABLED` | 启用 | 设为 `false` 关闭每周 Cron |
| `MATCH_LEARNING_MANUAL_RUN` | 启用 | 设为 `false` 禁止手动 POST |

---

## 4. Cron

- **每周一 04:00 UTC** — `match-learning-weekly-weights`
- 服务启动时从 DB 加载最新 weights 到内存

---

## 5. Swagger

`GET /api/docs` → 标签 **match-learning**
