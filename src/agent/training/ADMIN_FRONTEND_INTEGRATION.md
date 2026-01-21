# 管理后台前端对接示例

## 零、枚举选项（下拉框数据源）

### 统一枚举接口

```typescript
// 枚举选项通用类型
interface EnumOption<T = string> {
  value: T;
  label: string;      // 英文标签
  labelZh?: string;   // 中文标签
  description?: string;
  descriptionZh?: string;
  color?: string;     // 状态颜色
  icon?: string;      // 图标名
  [key: string]: any; // 其他属性
}

// 所有枚举键名
type EnumKey = 
  | 'modelType'       // 模型类型
  | 'baseModel'       // 基础模型
  | 'trainingStatus'  // 训练状态
  | 'trainingType'    // 训练类型
  | 'sevLevel'        // SEV级别
  | 'riskCategory'    // 风险类别
  | 'riskHandleAction'// 风险处理动作
  | 'constraintType'  // 约束类型
  | 'constraintSeverity' // 约束严重程度
  | 'userActionType'  // 用户行为类型
  | 'decisionType'    // 决策类型
  | 'evidenceType'    // 证据类型
  | 'language'        // 语言
  | 'season'          // 季节
  | 'timeRange'       // 时间范围
  | 'dangerLevel'     // 危险等级
  | 'executability';  // 可执行性

// 获取所有枚举选项
async function fetchAllEnumOptions(): Promise<Record<EnumKey, EnumOption[]>> {
  const res = await fetch('/api/training/options/all');
  const { data } = await res.json();
  return data;
}

// 获取指定枚举选项
async function fetchEnumOptions(enumKey: EnumKey): Promise<EnumOption[]> {
  const res = await fetch(`/api/training/options/${enumKey}`);
  const { data } = await res.json();
  return data;
}
```

### 枚举选项缓存 Hook

```tsx
import { useState, useEffect, createContext, useContext } from 'react';

// 枚举上下文
const EnumContext = createContext<Record<EnumKey, EnumOption[]> | null>(null);

// 枚举 Provider
export function EnumProvider({ children }: { children: React.ReactNode }) {
  const [enums, setEnums] = useState<Record<EnumKey, EnumOption[]> | null>(null);

  useEffect(() => {
    fetchAllEnumOptions().then(setEnums);
  }, []);

  if (!enums) return <div>Loading...</div>;
  return <EnumContext.Provider value={enums}>{children}</EnumContext.Provider>;
}

// 使用枚举 Hook
export function useEnums() {
  const enums = useContext(EnumContext);
  if (!enums) throw new Error('useEnums must be used within EnumProvider');
  return enums;
}

// 获取单个枚举的 Hook
export function useEnum(key: EnumKey) {
  const enums = useEnums();
  return enums[key] || [];
}
```

### 通用下拉组件

```tsx
interface EnumSelectProps {
  enumKey: EnumKey;
  value: string;
  onChange: (value: string) => void;
  language?: 'en' | 'zh';
  placeholder?: string;
  disabled?: boolean;
}

export function EnumSelect({ enumKey, value, onChange, language = 'zh', placeholder, disabled }: EnumSelectProps) {
  const options = useEnum(enumKey);

  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {language === 'zh' && opt.labelZh ? opt.labelZh : opt.label}
        </option>
      ))}
    </select>
  );
}
```

### 创建训练任务表单（使用枚举组件）

```tsx
export function CreateTrainingJobForm() {
  const [form, setForm] = useState({
    dataset_version: 'v1.0.0',
    model_type: 'SFT',
    base_model: 'claude-3-opus',
    batch_size: 32,
    learning_rate: 0.0001,
    num_epochs: 3,
  });

  return (
    <EnumProvider>
      <form>
        <div className="form-group">
          <label>模型类型 *</label>
          <EnumSelect
            enumKey="modelType"
            value={form.model_type}
            onChange={v => setForm({ ...form, model_type: v })}
          />
        </div>

        <div className="form-group">
          <label>基础模型 *</label>
          <EnumSelect
            enumKey="baseModel"
            value={form.base_model}
            onChange={v => setForm({ ...form, base_model: v })}
          />
        </div>

        {/* 其他字段... */}
      </form>
    </EnumProvider>
  );
}
```

### 风险事件处理表单

```tsx
export function RiskEventForm() {
  const [form, setForm] = useState({
    sev_level: 'SEV-2',
    category: 'SAFETY',
    handle_action: '',
  });

  return (
    <EnumProvider>
      <form>
        <div className="form-group">
          <label>SEV级别</label>
          <EnumSelect enumKey="sevLevel" value={form.sev_level} onChange={v => setForm({...form, sev_level: v})} />
        </div>
        <div className="form-group">
          <label>风险类别</label>
          <EnumSelect enumKey="riskCategory" value={form.category} onChange={v => setForm({...form, category: v})} />
        </div>
        <div className="form-group">
          <label>处理动作</label>
          <EnumSelect enumKey="riskHandleAction" value={form.handle_action} onChange={v => setForm({...form, handle_action: v})} placeholder="请选择处理动作" />
        </div>
      </form>
    </EnumProvider>
  );
}
```

---

## 一、训练任务管理

```typescript
// 获取训练任务列表
async function fetchTrainingJobs() {
  const res = await fetch('/api/training/jobs');
  const { data } = await res.json();
  return data;
}

// 创建训练任务（使用枚举值）
async function createTrainingJob(config: {
  dataset_version: string;
  model_config: { 
    model_type: 'SFT' | 'RLHF' | 'RL' | 'DPO' | 'PPO';  // 枚举
    base_model: string;  // 枚举值
  };
  training_config: { batch_size: number; learning_rate: number; num_epochs: number };
}) {
  const res = await fetch('/api/training/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  return res.json();
}

// 启动训练
async function startTraining(jobId: string) {
  const res = await fetch(`/api/training/training/jobs/${jobId}/start`, { 
    method: 'POST' 
  });
  return res.json();
}

// 获取任务状态（轮询）
async function pollJobStatus(jobId: string) {
  const res = await fetch(`/api/training/training/jobs/${jobId}`);
  return res.json();
}
```

---

## 二、模型管理

```typescript
// 获取模型列表
async function fetchModels() {
  const res = await fetch('/api/training/models');
  return res.json();
}

// 注册新模型
async function registerModel(modelData: {
  version: string;
  path: string;
  metrics: { accuracy?: number; loss?: number };
  tags?: string[];
}) {
  const res = await fetch('/api/training/models/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(modelData)
  });
  return res.json();
}

// 回滚模型
async function rollbackModel(version: string, reason: string) {
  const res = await fetch(`/api/training/models/${version}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  return res.json();
}
```

---

## 三、监控仪表盘

```typescript
// 服务健康状态
async function fetchPolicyHealth() {
  const res = await fetch('/api/training/policy/health');
  return res.json();
}

// 收集统计
async function fetchCollectionStats() {
  const res = await fetch('/api/training/metrics/collection-stats');
  return res.json();
}

// 训练质量指标
async function fetchTrainingQuality() {
  const res = await fetch('/api/training/metrics/training-quality');
  return res.json();
}

// 坍塌风险监控
async function fetchCollapseRisk() {
  const res = await fetch('/api/training/monitoring/collapse-risk');
  return res.json();
}

// 定时刷新仪表盘
function startDashboardPolling(interval = 30000) {
  setInterval(async () => {
    const [health, stats, quality, risk] = await Promise.all([
      fetchPolicyHealth(),
      fetchCollectionStats(),
      fetchTrainingQuality(),
      fetchCollapseRisk()
    ]);
    updateDashboard({ health, stats, quality, risk });
  }, interval);
}
```

---

## 四、评测管理

```typescript
// 运行组件评测
async function runEvaluation(component: 'router' | 'gate' | 'itinerary') {
  const res = await fetch(`/api/training/evaluation/${component}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  return res.json();
}

// 生成OPE报告
async function generateOPEReport(modelVersion: string, baselineVersion?: string) {
  const res = await fetch('/api/training/evaluation/ope/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model_version: modelVersion, 
      baseline_version: baselineVersion 
    })
  });
  return res.json();
}

// 回归门检查
async function checkRegressionGate(modelVersion: string) {
  const res = await fetch('/api/training/evaluation/regression-gate/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_version: modelVersion })
  });
  return res.json();
}
```

---

## 五、A/B测试管理

```typescript
// 创建A/B测试
async function createABTest(config: {
  name: string;
  control_model: string;
  treatment_model: string;
  traffic_percentage: number;
  metrics: string[];
}) {
  const res = await fetch('/api/training/product/ab-test/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  return res.json();
}

// 分析测试结果
async function analyzeABTest(experimentId: string) {
  const res = await fetch('/api/training/product/ab-test/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ experiment_id: experimentId })
  });
  return res.json();
}
```

---

## 六、数据集管理

```typescript
// 获取数据集版本列表
async function fetchDatasetVersions() {
  const res = await fetch('/api/training/versions');
  return res.json();
}

// 创建新版本
async function createDatasetVersion(filter: {
  min_validation_score?: number;
  country_code?: string;
}) {
  const res = await fetch('/api/training/versions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter })
  });
  return res.json();
}

// 比较版本
async function compareVersions(v1: string, v2: string) {
  const res = await fetch(`/api/training/versions/${v1}/compare/${v2}`);
  return res.json();
}
```

---

## 七、数据导出

```typescript
// 准备训练批次
async function prepareTrainingBatch(options: {
  minScore?: number;
  batchSize?: number;
  countryCode?: string;
}) {
  const res = await fetch('/api/training/batches/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  return res.json();
}

// 导出JSONL
async function exportBatchAsJSONL(batchId: string) {
  const res = await fetch(`/api/training/batches/${batchId}/export/jsonl`);
  return res.blob();
}

// 提取轨迹数据
async function extractTrajectories(filter: {
  min_validation_score?: number;
  country_code?: string;
  limit?: number;
}) {
  const res = await fetch('/api/training/etl/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter)
  });
  return res.json();
}
```

---

## 八、React组件示例

### 训练任务列表组件

```tsx
function TrainingJobList() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrainingJobs().then(data => {
      setJobs(data.jobs);
      setLoading(false);
    });
  }, []);

  const handleStart = async (jobId) => {
    await startTraining(jobId);
    // 刷新列表
    const data = await fetchTrainingJobs();
    setJobs(data.jobs);
  };

  return (
    <Table>
      <thead>
        <tr><th>Job ID</th><th>状态</th><th>数据集</th><th>操作</th></tr>
      </thead>
      <tbody>
        {jobs.map(job => (
          <tr key={job.job_id}>
            <td>{job.job_id}</td>
            <td><StatusBadge status={job.status} /></td>
            <td>{job.dataset_version}</td>
            <td>
              {job.status === 'PENDING' && (
                <Button onClick={() => handleStart(job.job_id)}>启动</Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
```

### 健康状态仪表盘

```tsx
function HealthDashboard() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const data = await fetchPolicyHealth();
      setHealth(data.data);
    }, 10000);
    
    fetchPolicyHealth().then(data => setHealth(data.data));
    
    return () => clearInterval(interval);
  }, []);

  if (!health) return <Spinner />;

  return (
    <Dashboard>
      <StatusCard 
        title="服务状态" 
        value={health.status} 
        color={health.status === 'healthy' ? 'green' : 'red'}
      />
      <MetricCard title="QPS" value={health.qps} />
      <MetricCard title="P95延迟" value={`${health.p95_latency_ms}ms`} />
      <MetricCard title="错误率" value={`${(health.error_rate * 100).toFixed(2)}%`} />
      <MetricCard title="模型版本" value={health.current_model_version} />
    </Dashboard>
  );
}
```

---

## 九、权限要求

| 接口分类 | 所需角色 |
|----------|----------|
| 训练管理 | ML Engineer, Admin |
| 模型管理 | ML Engineer, Admin |
| 数据集管理 | Data Engineer, ML Engineer |
| 评测管理 | ML Engineer, QA |
| 监控指标 | All Admin Users |
| A/B测试 | Product Manager, ML Engineer |
| 安全审计 | Security, Compliance |
| ETL导出 | Data Engineer |
