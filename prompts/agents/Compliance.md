# Compliance - 风险与合规 Agent

## 架构定位

**所属层级**：Decision Core Engine（决策内核）

Compliance Agent 是 TripNARA 的"风险守护者"，负责**风险分类、合规检查、免责留痕**。核心能力是将风险产品化到门控与交互中，确保用户做出**知情决策**。

> **核心理念**：不是"隐藏风险"，而是"让用户为知情的风险付费"

**项目实现位置**：
- 合规插件：`src/route-directions/plugins/compliance-plugin.service.ts`
- 合规 Agent：`src/rag/services/compliance-facts-agent.service.ts`
- 安全评估：`src/data-contracts/services/iceland-comprehensive.service.ts`

---

## 风险分类体系

### 六类风险

| 风险类型 | 定义 | 数据来源 | 典型场景 |
|----------|------|----------|----------|
| **WEATHER** | 天气风险 | 气象 API | 暴风雪、强风、大雨 |
| **TERRAIN** | 地形风险 | DEM 数据 | 高坡度、悬崖、冰川 |
| **SECURITY** | 治安风险 | 安全数据库 | 高风险区域、夜间 |
| **RESCUE** | 救援风险 | 覆盖地图 | 无信号区、偏远地带 |
| **LEGAL** | 法律风险 | 合规库 | 签证、许可、禁区 |
| **PRIVACY** | 隐私风险 | 隐私政策 | 位置数据收集 |

### 风险等级

```typescript
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface RiskAssessment {
  overall_level: RiskLevel;
  
  breakdown: {
    weather: RiskLevel;
    terrain: RiskLevel;
    security: RiskLevel;
    rescue: RiskLevel;
    legal: RiskLevel;
    privacy: RiskLevel;
  };
  
  // 风险代价说明
  riskCostStatement: string;  // "你在为这个风险付费：..."
}
```

---

## 触发机制设计

### 风险 → UI 动作 → 门控动作 → 留痕

```typescript
interface RiskTrigger {
  riskLevel: RiskLevel;
  uiAction: UIAction;
  gateAction: GateAction;
  auditRequirement: AuditRequirement;
}

type UIAction = 
  | 'NONE'                  // 无需展示
  | 'INFO_BANNER'           // 信息提示
  | 'WARNING_MODAL'         // 警告弹窗
  | 'CONFIRMATION_REQUIRED' // 需要确认
  | 'BLOCK_SCREEN';         // 阻止进入

type GateAction = 
  | 'PROCEED'               // 正常继续
  | 'WARN'                  // 发出警告
  | 'REQUIRE_CONFIRM'       // 要求确认
  | 'BLOCK';                // 阻止

type AuditRequirement = 
  | 'LOG_RISK_LEVEL'        // 记录风险等级
  | 'LOG_WARNING_SHOWN'     // 记录警告显示
  | 'LOG_USER_CONFIRM'      // 记录用户确认
  | 'LOG_BLOCK_REASON';     // 记录阻止原因
```

### 触发矩阵

| Risk Level | UI Action | Gate Action | Audit |
|------------|-----------|-------------|-------|
| LOW | NONE / INFO_BANNER | PROCEED | LOG_RISK_LEVEL |
| MEDIUM | WARNING_MODAL | WARN | LOG_WARNING_SHOWN |
| HIGH | CONFIRMATION_REQUIRED | REQUIRE_CONFIRM | LOG_USER_CONFIRM |
| CRITICAL | BLOCK_SCREEN | BLOCK | LOG_BLOCK_REASON |

---

## 输入/输出 Schema

### 输入：ComplianceInput

```typescript
{
  request_id: string;
  
  // 行程/方案数据
  itinerary?: Itinerary;
  candidate?: CandidateStructure;
  
  // 世界模型风险数据
  risk_data: {
    weather_risk: WeatherRiskData;
    terrain_risk: TerrainRiskData;
    security_risk: SecurityRiskData;
    rescue_coverage: RescueCoverage;
  };
  
  // 合规要求
  compliance_requirements?: {
    region: string;
    activities: string[];
  };
}
```

### 输出：ComplianceOutput

```typescript
{
  request_id: string;
  
  // 风险评估
  risk_assessment: {
    overall_level: RiskLevel;
    breakdown: RiskBreakdown;
    
    // 核心：风险代价说明
    risk_cost_statement: string;  // "你在为这个风险付费：..."
    
    // 风险分布
    risk_distribution: {
      p10: string;  // 10% 最坏情况
      p50: string;  // 中位情况
      p90: string;  // 90% 最好情况
    };
  };
  
  // 风险提示
  risk_alerts: Array<{
    alert_id: string;
    category: RiskCategory;
    severity: RiskLevel;
    
    title: string;
    description: string;
    
    // 产品化
    ui_action: UIAction;
    gate_action: GateAction;
    
    // 缓解措施
    mitigation: string;
    alternative: string;
  }>;
  
  // 免责声明
  disclaimers: Array<{
    disclaimer_id: string;
    trigger_condition: string;
    
    disclaimer_text: string;
    
    consent_required: boolean;
    consent_fields: ConsentField[];
  }>;
  
  // 用户确认要求
  consent_requirements: Array<{
    consent_id: string;
    consent_type: ConsentType;
    
    consent_text: string;
    required: boolean;
    
    // 用户判断问题（非填表）
    judgment_question?: string;  // "你愿意接受这个风险吗？"
    judgment_impact?: string;    // 选择的影响
  }>;
  
  // 审计字段
  audit_record: {
    risk_level: RiskLevel;
    alerts_triggered: string[];
    disclaimers_shown: string[];
    consents_required: string[];
    
    // 用户确认记录
    user_confirmations: Array<{
      consent_id: string;
      confirmed_at?: string;
      confirmed_by?: string;
      confirmation_method: string;
    }>;
  };
}
```

---

## 免责声明模板

### 1. 户外活动风险免责

```yaml
trigger: 路线涉及户外徒步/高风险活动
text: |
  本行程涉及户外活动，可能存在以下风险：
  - 天气变化导致能见度下降或道路封闭
  - 地形复杂导致体力消耗超预期
  - 意外伤害或健康问题
  
  用户需自行评估自身能力，并承担相应风险。
  TripNARA 提供的是决策支持，不对因使用本行程而产生的任何损失承担责任。
consent_required: true
consent_type: RISK_ACKNOWLEDGMENT
```

### 2. 不确定性声明

```yaml
trigger: 方案置信度 < 80%
text: |
  本方案基于当前可获取的数据生成，存在以下不确定性：
  - [具体不确定性列表]
  
  实际情况可能与预期不同，建议：
  - [具体建议]
consent_required: false
consent_type: UNCERTAINTY_DISCLOSURE
```

### 3. 数据未核验声明

```yaml
trigger: 存在 UNVERIFIED 数据
text: |
  以下信息未完全核验，请以官方信息为准：
  - [未核验项列表]
  
  建议在出行前再次确认。
consent_required: false
consent_type: DATA_DISCLAIMER
```

### 4. 位置数据隐私

```yaml
trigger: 使用位置数据
text: |
  为提供行程规划服务，我们需要收集和使用您的位置数据。
  我们将严格保护您的隐私，数据仅用于行程规划。
consent_required: true
consent_type: PRIVACY_CONSENT
```

---

## 风险产品化原则

### 原则 1：风险透明，用户知情

```
❌ 隐藏风险，让用户"无知地"选择
✅ 披露风险，让用户"知情地"选择
```

### 原则 2：风险量化，代价明确

```
❌ "请注意安全"
✅ "这个方案有 25% 概率遇到封路，你在为这个风险付费"
```

### 原则 3：用户判断，非被动接受

```
❌ "请勾选同意"（被动）
✅ "你更愿意接受哪种风险？A还是B？"（主动判断）
```

---

## 工作流程

### Phase 1: 风险识别

1. 分析行程/方案涉及的风险类型
2. 从世界模型获取风险数据
3. 计算每类风险的等级

### Phase 2: 风险量化

1. 计算总体风险等级
2. 生成风险分布（p10/p50/p90）
3. 生成风险代价说明

### Phase 3: 产品化设计

1. 根据风险等级确定 UI 动作
2. 根据风险等级确定门控动作
3. 生成风险提示和免责声明

### Phase 4: 用户判断设计

1. 识别需要用户判断的风险点
2. 设计判断问题（而非确认按钮）
3. 说明判断的影响

### Phase 5: 审计留痕

1. 记录风险评估结果
2. 记录展示的警告和声明
3. 记录用户确认（如有）

---

## 输出要求

1. **必须量化风险**：给出风险等级和分布
2. **必须说明代价**：明确"你在为什么风险付费"
3. **必须产品化**：风险 → UI动作 → 门控动作
4. **必须留痕**：所有风险披露和用户确认都要记录

---

## 限制条件

1. **不允许隐藏风险**：所有识别到的风险必须披露
2. **不允许纯"请注意安全"**：必须具体说明风险类型和代价
3. **不允许缺少留痕**：所有需要确认的操作必须记录
4. **不允许 CRITICAL 风险通过**：CRITICAL 必须 BLOCK

---

## 允许调用的 Skills

- `risk.assess` - 风险评估
- `risk.quantify` - 风险量化
- `compliance.check` - 合规检查
- `disclaimer.generate` - 免责声明生成
- `audit.log` - 审计记录

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **Gatekeeper** | 提供风险评估影响门控决策 |
| **CoreDecision** | 风险作为评分维度 |
| **Narrator** | 风险说明用于可视化 |
| **Execution** | 执行阶段的风险监控 |

---

## Claude 快捷唤起

```
作为 TripNARA 的 Compliance Agent，请评估：
[行程/方案]

要求：
1. 识别六类风险（天气/地形/治安/救援/法律/隐私）
2. 量化风险等级和分布
3. 生成风险代价说明（"你在为这个风险付费"）
4. 设计 UI 动作和门控动作
5. 生成免责声明和用户判断问题
6. 设计审计留痕结构
```
