# 多日自动切分器技术策略标准件

## 1. 目标与边界

### 目标

将用户选定的 POI 自动分配到 N 天（clusters），满足：

1. **区域化**：同一天 POI 地理上更聚集，减少跨区折返
2. **均衡化**：每天负载接近（点数/游玩时长/预计总耗时）
3. **可执行**：每一天内再跑 VRPTW/PC-TSPTW 得到可行时间表

### 非目标（MVP 可不做）

- 复杂交通网络的全局最优跨日联动（先区域拆分，再日内优化即可）
- "某天必须去某个点"的强约束跨日全局最优（先支持锁定/偏好）

## 2. 输入输出（建议数据结构）

### Input

```typescript
interface MultiDayClusteringInput {
  pois: Array<{
    id: number;
    geo: { lat: number; lng: number };
    service_duration_min: number;
    time_windows?: Array<[string, string]>;
    must_day?: number; // 可选：锁定在某天
    priority?: number; // 1-5，用于跨天修复时选择
  }>;
  
  N: number; // 天数
  
  day_boundaries: Array<{
    date: string; // ISO 8601 date
    start: string; // "09:00"
    end: string;   // "22:00"
  }>;
  
  constraints?: {
    max_pois_per_day?: number; // M，可选
    target_service_per_day?: number; // 可选：总游玩时长均衡
    hard_assignments?: Array<{
      poi_id: number;
      day: number;
    }>; // 可选：锁定某 POI 必须在某天
  };
}
```

### Output

```typescript
interface MultiDayClusteringResult {
  day_clusters: Array<{
    day: number;
    date: string;
    poi_ids: number[];
  }>;
  
  diagnostics: {
    compactness_by_day: Array<{
      day: number;
      radius_90th_percentile: number; // 米
      intra_day_distance_sum: number; // 米
      centroid: { lat: number; lng: number };
    }>;
    
    load_by_day: Array<{
      day: number;
      poi_count: number;
      total_service_min: number;
      estimated_total_min: number; // 包含交通缓冲
    }>;
    
    variance_metrics: {
      count_std: number;
      count_cv: number; // coefficient of variation
      service_std: number;
      service_cv: number;
      balance_score: number; // 0-1，越高越均衡
    };
    
    moves?: Array<{
      poi_id: number;
      from_day: number;
      to_day: number;
      reason: string;
    }>;
  };
}
```

## 3. 核心算法：两阶段（聚类 → 修复/均衡）

### Step 0：负载估计（用于"均衡"）

为每个 POI 计算一个近似负载 w_i：

```
w_i = service_duration_min + avg_travel_buffer_min
```

- `avg_travel_buffer_min` 可用常数（如 15）或基于 POI 密度估算
- 每天目标负载：`W_target = sum(w_i) / N`

### Step 1：地理聚类（区域化优先）

**方案 A（推荐，稳定）：Balanced Assignment**

1. 用 K-Means / K-Medoids 得到 N 个中心（只管地理，不管均衡）
2. 做一个"带容量/负载约束的分配"：
   - 目标：最小化 `distance(poi, center_day)` 的总和
   - 约束：每天 `count <= M`（可选）且 `sum(w_i)` 接近 `W_target`
3. 这一步本质是一个带约束的分配问题，工程上比"在 K-Means 内部硬塞约束"更好控、也更容易调参

**方案 B：Constrained K-Means（迭代中就考虑容量）**

- 在每轮 assignment 时，如果某天超容量/超负载，就把边界点溢出到次近的天
- 需要额外 repair，否则容易出现局部卡死

### Step 2：均衡修复（Repair / Swap）

做 10–50 轮"局部交换"，每轮尝试：

1. 从负载最高的 day A 挑一个"对 compactness 影响最小"的点
2. 移到负载最低的 day B（或与 B 的某点 swap）
3. 接受条件：均衡指标改善显著，且区域化指标不恶化过多

**停止条件**：
- `variance(load)` 达到阈值
- 或迭代次数上限
- 或提升不足（early stop）

## 4. 与 VRPTW/PC-TSPTW 的衔接（关键）

对每个 `day_cluster` 独立跑日内优化：

1. 若某天日内求解 INFEASIBLE：
   - 优先触发"跨天修复"：把该天最低优先级 soft 点移出到相邻天（或放入 unassigned）
   - 再重跑该天求解
2. 形成"切分—求解—修复"的闭环（最多 K 次，防止无限循环）

## 5. 可量化指标（为 PRD 验收提供口径）

### 区域化（Compactness）

每一天定义：

- `radius_day = 90th_percentile_distance(poi, centroid_day)`
- 或 `intra_day_distance_sum`（日内点到中心距离和）

**目标**：
- `max(radius_day)` 不超过某阈值（按城市尺度配置，如 5km）
- 或"日内半径明显小于跨日中心距离"（如 `max(radius_day) < 0.5 * min(inter_center_distance)`）

### 均衡（Balance）

负载可用两套并行指标（取其一或同时）：

- **点数均衡**：`std(count_day) / mean(count_day) < 0.25`
- **时长均衡**：`std(sum_w_day) / mean(sum_w_day) < 0.20`

**平衡分数**（0-1，越高越均衡）：
```
balance_score = 1 - min(
  std(count_day) / mean(count_day) / 0.25,
  std(sum_w_day) / mean(sum_w_day) / 0.20,
  1.0
)
```

## 6. 实现建议

### 算法选择

- **K-Means 初始化**：使用 K-Means++ 或随机初始化
- **分配算法**：匈牙利算法（Hungarian Algorithm）或贪心分配
- **修复策略**：模拟退火或局部搜索

### 性能考虑

- 对于 30-50 个 POI，算法应在 1-3 秒内完成
- 对于 100+ 个 POI，考虑分批处理或降采样

### 参数配置

```typescript
interface ClusteringConfig {
  // K-Means 参数
  kmeans_iterations?: number; // 默认 100
  kmeans_tolerance?: number;   // 默认 1e-4
  
  // 均衡修复参数
  repair_iterations?: number;  // 默认 30
  balance_threshold?: number;  // 默认 0.25 (CV)
  
  // 区域化参数
  max_radius_km?: number;      // 默认 5km
  compactness_weight?: number;  // 默认 0.6
  balance_weight?: number;     // 默认 0.4
}
```

## 7. 错误处理

### 不可行情况

1. **硬约束冲突**：必去点 + 锁定天 + 时间窗导致某天不可行
   - 返回错误，提示调整天数/日界/移除锁定

2. **负载过高**：所有点总负载 > N × 每天可用时间
   - 返回警告，建议增加天数或减少 POI

3. **区域过于分散**：POI 分布跨多个城市/区域
   - 返回警告，建议分多个行程或调整区域范围

