# Algo Spec — Itinerary Optimization & Planning v1.0
**算法版：聚类/VRPTW/鲁棒/输出字段与 reason_code**  
**Audience:** Algorithm Engineers, Backend Engineers implementing solver pipeline  
**Scope:** Multi-day clustering, day-level VRPTW/PC-TSPTW, robust travel time, lunch anchor, explainability outputs, reason codes.

---

## 0. Summary

优化分为两个阶段，兼顾可扩展性与真实性：
1. **多日拆分**（balanced clustering / constrained assignment）
2. **日内路由优化**（VRPTW with soft nodes / prize-collecting behavior）

我们始终使用**鲁棒交通时间**（缓冲时长）进行优化，并强制执行生活方式约束如**午餐**和**禁止闭馆时段到达**。

---

## 1. Inputs & Node Schema

### 1.1 Node schema (solver-facing)
```json
{
  "id": 101,
  "name": "Tsukiji Outer Market",
  "type": "poi|meal|hotel|transfer|break",
  "service_duration": 90,
  "time_windows": [["05:00","14:00"]],
  "constraints": {
    "is_hard_node": false,
    "priority_level": 3,
    "drop_penalty": 1200
  },
  "geo": {"lat": 35.6654, "lng": 139.7706}
}
```

### 1.2 Required matrices
- `time_matrix_api[i][j]`：原始地图时长（分钟）
- `time_matrix_robust[i][j]`：鲁棒时长（分钟），由策略计算（见 §4）

---

## 2. Stage A — 多日拆分：Balanced Clustering（Story 4.7）

### 2.1 目标

给定 `N 个 POI` 和 `D 天`，生成 `D 个聚类`，使得：
- **区域化**：每天是区域状的（减少跨区域旅行）
- **均衡负载**：相似的工作量（数量或时长），避免"Day1=20 点，Day2=2 点"

### 2.2 负载模型

定义每个节点的负载：
- `w_i = service_duration_i + expected_transfer_buffer`

简单 v1：
- `expected_transfer_buffer = median(time_matrix_robust[i][*]) * 0.15`（或固定 15–25 min）

每日负载：
- `Load(day_k) = sum(w_i for i in cluster_k)`

### 2.3 算法（推荐 v1）

1. **初始聚类**：按地理（K-Means / K-Medoids）得到 `D` 个中心
2. **带约束分配/平衡**：
   - 约束：`count <= M` 或 `Load 在目标范围内`
   - 使用贪心 + 局部搜索（swap/move）最小化：
     - 平衡目标：`CV = std(Load)/mean(Load)`
     - 紧凑性目标：簇内距离和
3. **Repair 循环**：
   - 如果降低 CV 且不破坏紧凑性，则跨簇交换两个节点
   - 如果改善两者，则将边界节点移动到相邻天

### 2.4 输出

```json
{
  "day_clusters": [{"day":1,"poi_ids":[...]}],
  "metrics": {
    "balance_cv": 0.18,
    "compactness": [123.4, 98.1, 110.2]
  }
}
```

验收标准：
- AC1：聚类显示区域化（定性 + 距离阈值）
- AC2：CV 低于可配置阈值（如 ≤ 0.25）

---

## 3. Stage B — 日内优化：PC-TSPTW / VRPTW（Story 4.3）

### 3.1 问题模型

我们将日规划视为：
- **VRPTW**，包含：
  - 每个节点的时间窗（可能多区间）
  - 服务时长
- 加上**可选节点**（soft nodes）带惩罚：
  - 等价于 **Prize-Collecting TSPTW** / orienteering 风格

### 3.2 Hard vs Soft nodes

- **Hard nodes** 必须出现在解中；如果不可行，返回显式错误：
  - `PLANNER_INFEASIBLE_HARD_NODES`
- **Soft nodes** 可以丢弃，带 `drop_penalty`：
  - 从 priority 映射惩罚（示例）：
    - `drop_penalty = base_penalty * (6 - priority_level)`
    - base_penalty ~ 1000（每个城市可调）

### 3.3 多段营业时间

支持多个时间窗：
- **方案 A**：solver 直接支持多个 windows（若支持）
- **方案 B**：**虚拟节点技术**
  - 创建 `A_Lunch` 和 `A_Dinner`
  - 将它们放在一个 disjunction 中（最多选一个，或两者都丢弃并带惩罚）

### 3.4 午餐锚点（必需）

每天必须包含恰好一个午餐休息：
- duration：60 min
- window：[11:30, 13:30]

实现选项：
1. **Break interval** 在时间维度（若 solver 支持）
2. **虚拟 break 节点**，位置未定义（无旅行成本），作为强制任务插入

验收标准：
- 每天恰好一个午餐事件，在窗口内

### 3.5 等待惩罚与可见性

如果到达 < 开放时间：
- 允许等待但应最小化
- 如果 `wait_min > 15`，必须在时间轴中显示显式等待段

---

## 4. 鲁棒交通时间（Story 6.1）

### 4.1 统一服务端计算

公式（v1）：
```
T_robust = T_API * buffer_factor + fixed_buffer + switch_cost + cross_region_cost
```

默认值：
- `buffer_factor = 1.2`
- `fixed_buffer = 15 min`
- `switch_cost`：模式切换（如 transit->taxi +10）
- `cross_region_cost`：软聚类惩罚（+5–15）

### 4.2 稳健度指标输出

并输出稳健度指标：
- `total_buffer_minutes`：总缓冲分钟数
- `top3_min_slack_nodes`：最紧张节点余量（Top3 Min Slack Nodes）
- `total_wait_minutes`：总等待分钟数

验收标准：
- 所有可行性检查和优化必须使用 `T_robust`，永远不用原始 `T_API`

---

## 5. 解释所需的"理由码"（必须对齐前端）

Solver 输出必须包含：

### 5.1 dropped_items[]
```json
{
  "id": 202,
  "reason_code": "INSUFFICIENT_TOTAL_TIME",
  "facts": {"needed_min": 120, "left_min": 60}
}
```

### 5.2 wait_segments[]
```json
{
  "at_node_id": 101,
  "wait_min": 35,
  "open_time": "11:00"
}
```

### 5.3 violations[]
不可行时的具体冲突（哪一站、晚了多少、关门几点）

### 5.4 完整输出示例

```json
{
  "timeline": [
    {"type":"travel","from":0,"to":101,"start":"10:00","end":"10:25","minutes":25},
    {"type":"wait","at":101,"start":"10:25","end":"11:00","minutes":35},
    {"type":"service","at":101,"start":"11:00","end":"12:30","minutes":90},
    {"type":"lunch","start":"12:30","end":"13:30","minutes":60}
  ],
  "dropped_items": [
    {"id":202,"reason_code":"INSUFFICIENT_TOTAL_TIME","facts":{"needed_min":120,"left_min":60}}
  ],
  "wait_segments": [
    {"at_node_id":101,"wait_min":35,"open_time":"11:00"}
  ],
  "violations": [],
  "robustness": {
    "total_buffer_minutes": 85,
    "min_slack_minutes": 12,
    "top3_min_slack_nodes": [
      {"node_id": 101, "slack_min": 12},
      {"node_id": 105, "slack_min": 18},
      {"node_id": 108, "slack_min": 22}
    ],
    "total_wait_minutes": 35
  }
}
```

---

## 6. Reason Codes Dictionary（必须对齐前端与 LLM 解释）

### 6.1 Dropped item reason codes

- `TIME_WINDOW_CONFLICT`：时间窗冲突
- `INSUFFICIENT_TOTAL_TIME`：总时间不足
- `TOO_EARLY_DEPARTURE_CONSTRAINT`：出发时间太早约束
- `CROSS_DAY_MOVE_RECOMMENDED`：跨天移动建议（多日修复提示）
- `BUDGET_CONSTRAINT`：预算约束（若集成定价）
- `USER_PREFERENCE_PENALTY`：用户偏好惩罚（pacing / 早出发避免）

### 6.2 Facts 字段（每个 code 的最小集）

- **TIME_WINDOW_CONFLICT**：
  ```json
  {
    "poi_close": "14:00",
    "predicted_arrival": "14:20",
    "conflict_with": "TeamLab"
  }
  ```

- **INSUFFICIENT_TOTAL_TIME**：
  ```json
  {
    "needed_min": 120,
    "left_min": 60,
    "day_end": "22:00"
  }
  ```

- **TOO_EARLY_DEPARTURE_CONSTRAINT**：
  ```json
  {
    "user_start": "10:00",
    "required_entry_before": "09:00",
    "poi": "X"
  }
  ```

---

## 7. Failure modes & repair strategies

### 7.1 因 soft nodes 不可行

修复顺序：
1. 丢弃最低优先级的 soft nodes
2. 交换顺序以减少等待/旅行
3. 将边界节点移动到相邻天（若多日）
4. 仅在用户允许时放宽 pacing 约束

### 7.2 因 hard nodes 不可行

返回：
- status: `INFEASIBLE`
- violations list，包含具体冲突（节点/时间）
- 面向用户的建议：更早开始、增加天数、移除 hard node

---

## 8. QA 最小验收集（必须全通过）

### 优化（算法）

- **A1**：必去紧窗 + 想去很多 → 保必去，丢部分想去，dropped 有理由码
- **A2**：双时段餐厅 → 只落一个时段，不出现闭馆到达
- **A3**：午餐保证 → 每天且仅一个，落在窗口内
- **A4**：等待显性化 → >15min 必须显示
- **A5**：鲁棒时间 → 用 robust 判定可行性，不能用 API 原始时间

---

## 9. 算法落地规范（算法工程师主责）

### 9.1 多日拆分：Balanced Clustering（Story 4.7）

**目标**：区域化 + 均衡负载

**流程**：
1. 估算每个 POI 负载 `w_i = service_duration + avg_transfer_buffer`
2. 地理聚类得到 N 个中心（K-Means/K-Medoids）
3. 做"带约束分配"（容量/负载均衡）
4. Repair：swap/move 迭代，降低 `std(load)/mean(load)` 与保持 compactness

**输出**：`day_clusters[N]` + `metrics(balance_cv, compactness)`

### 9.2 日内优化：PC-TSPTW / VRPTW（Story 4.3）

**节点分**：Hard（必去）/ Soft（想去）

**Soft 可丢弃**：disjunction penalty（按 priority 映射）

**多段营业时间**：
- 方案 A：多 time_windows 直接给 solver（若支持）
- 方案 B：虚拟节点 + 互斥/同 disjunction（午市/晚市二选一）

**午餐锚点**：用 break interval 或虚拟任务占位（不绑定 POI）

**目标函数**：最小 travel + wait + soft cost + dropped penalty（并可加 reward）

### 9.3 鲁棒交通时间（Story 6.1）

**统一服务端计算**：
```
T_robust = T_API * buffer_factor + fixed_buffer + switch_cost + cross_region_cost
```

**并输出稳健度指标**：
- Total Buffer Minutes
- Top3 Min Slack Nodes（最紧张节点余量）
- Total Wait Minutes

### 9.4 解释所需的"理由码"（必须对齐前端）

Solver 输出必须包含：
- `dropped_items[]`：`{id, reason_code, facts}`
- `wait_segments[]`：`{at_node_id, wait_min, open_time}`
- `violations[]`：不可行时的具体冲突（哪一站、晚了多少、关门几点）

---

## 10. 分工建议（避免互相等）

### 算法（Algo）
- 多日拆分（balanced clustering）+ 指标输出
- 日内优化（VRPTW/PC-TSPTW）+ dropped/wait/slack 输出
- 鲁棒时间策略 + 稳健度评分
- reason_code 字典（与前端/解释模块对齐）

### 研发（Platform/Backend）
- Action Registry 封装（各模块 tool 化）
- 状态管理与数据流
- API 接口与数据格式对齐

### 产品/前端（配合点）
- dropped_items/why 按 reason_code 展示
- pacing slider、作息偏好（映射到 policy 参数）

---

## 11. Definition of Done（最终完成标准）

- ✅ 优化输出可执行（午餐/时间窗/日界/鲁棒时间全部满足）
- ✅ dropped/wait/slack 可解释且 UI 可展示
- ✅ reason_code 字典完整且与前端对齐
- ✅ 多日拆分达到平衡与紧凑性指标
- ✅ 日内优化正确处理 Hard/Soft 节点与多时间窗
- ✅ 鲁棒时间策略在所有可行性检查中强制执行

---

*Document end.*
