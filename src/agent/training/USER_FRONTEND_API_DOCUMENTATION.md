# 用户前端 API 文档

**基础路径**: `/api/training`  
**使用方**: C端用户前端

---

## 接口总览

| 端点 | 方法 | 用途 | 前端组件 |
|------|------|------|----------|
| `/product/feedback/track-action` | POST | 追踪用户操作 | 按钮回调 |
| `/product/feedback/collect` | POST | 收集用户反馈 | 反馈弹窗 |
| `/product/feedback/analyze` | GET | 分析反馈数据 | - |
| `/product/explainable/generate` | POST | 生成决策解释 | "为什么推荐" |
| `/enhancement/clarification-prompt` | POST | 生成澄清问题 | 追问对话框 |
| `/enhancement/risk-prompt` | POST | 生成风险提示 | 风险警告 |
| `/enhancement/quality/score` | POST | 质量评分 | 评分展示 |
| `/enhancement/domain-expert/red-line-rules` | GET | 获取红线规则 | 风险提示 |
| `/enhancement/domain-expert/seasonal-risks` | GET | 获取季节性风险 | 风险卡片 |

---

## 一、用户反馈接口

### 1.1 追踪用户操作

**POST** `/product/feedback/track-action`

**用途**: 当用户采纳、编辑或放弃规划时调用

```typescript
// 请求
{
  "request_id": "req_abc123",        // 必填：请求ID
  "trip_id": "trip_xyz789",          // 可选：行程ID
  "action": "ACCEPT",                // 必填：操作类型
  "edit_details": {                  // 当action为EDIT时提供
    "field": "hotel",
    "old_value": "Hotel A",
    "new_value": "Hotel B"
  },
  "timestamp": "2026-01-21T10:00:00Z"  // 可选：时间戳
}

// action 可选值
type Action = 'ACCEPT' | 'EDIT' | 'EXPORT' | 'ABANDON';
```

**响应**:
```json
{
  "success": true,
  "data": {
    "tracked": true,
    "feedback_id": "fb_001"
  }
}
```

---

### 1.2 收集用户反馈

**POST** `/product/feedback/collect`

**用途**: 收集用户的评分和评论

```typescript
// 请求
{
  "request_id": "req_abc123",        // 必填：请求ID
  "trip_id": "trip_xyz789",          // 可选：行程ID
  "rating": 5,                       // 可选：评分 1-5
  "comment": "非常满意这个行程规划！", // 可选：评论
  "tags": ["helpful", "accurate"]    // 可选：标签
}

// tags 常用值
type Tag = 'helpful' | 'accurate' | 'detailed' | 'fast' | 
           'confusing' | 'incomplete' | 'wrong' | 'slow';
```

**响应**:
```json
{
  "success": true,
  "data": {
    "feedback_id": "fb_002",
    "message": "感谢您的反馈！"
  }
}
```

---

## 二、决策解释接口

### 2.1 生成决策解释

**POST** `/product/explainable/generate`

**用途**: 用户点击"为什么推荐这个行程"时调用

```typescript
// 请求
{
  "decision_log": [                  // 决策日志（从规划结果中获取）
    {
      "request_id": "req_abc123",
      "step": "ROUTE_PLANNING",
      "actor": "PLANNER",
      "inputs_summary": "用户请求3天冰岛行程",
      "outputs_summary": "推荐顺时针环岛路线",
      "evidence_refs": ["ev_001", "ev_002"],
      "timestamp": "2026-01-21T10:00:00Z"
    }
  ],
  "evidence_refs": [                 // 证据引用
    {
      "evidence_id": "ev_001",
      "source": "WEATHER",
      "excerpt": "未来3天天气良好",
      "confidence": 0.9
    }
  ],
  "trace_id": "trace_xyz789",        // 追踪ID
  "model_version": "v1.1.0"          // 可选：模型版本
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "summary": "系统在路线规划步骤推荐了顺时针环岛路线，基于天气和路况数据。",
    "decision_process": {
      "steps": [
        {
          "step_name": "路线规划",
          "decision": "选择顺时针环岛",
          "reasoning": "考虑天气和路况，顺时针方向可避开风暴",
          "confidence": 0.95
        },
        {
          "step_name": "住宿安排",
          "decision": "推荐Vik地区住宿",
          "reasoning": "距离景点近，评分高",
          "confidence": 0.88
        }
      ]
    },
    "evidence_chain": [
      {
        "evidence_id": "ev_001",
        "evidence_type": "WEATHER",
        "evidence_content": "未来3天天气良好，无暴风雪预警",
        "relevance": 0.95
      },
      {
        "evidence_id": "ev_002",
        "evidence_type": "ROAD_STATUS",
        "evidence_content": "1号公路全线通畅",
        "relevance": 0.92
      }
    ],
    "visualization": {
      "type": "DECISION_TREE",
      "data": {
        "nodes": [
          {"id": "node_0", "label": "路线规划", "decision": "顺时针环岛"},
          {"id": "node_1", "label": "住宿安排", "decision": "Vik地区"}
        ],
        "edges": [
          {"from": "node_0", "to": "node_1"}
        ]
      }
    }
  }
}
```

---

## 三、澄清提示接口

### 3.1 生成澄清问题

**POST** `/enhancement/clarification-prompt`

**用途**: 当系统需要更多信息时，生成友好的追问

```typescript
// 请求
{
  "user_request": "我想去冰岛玩",      // 用户原始请求
  "missing_info": [                    // 缺失的信息
    "travel_dates",
    "budget",
    "interests"
  ],
  "context": {                         // 可选：上下文
    "destination": "IS",
    "party_size": 2
  }
}

// missing_info 常用值
type MissingInfo = 
  | 'travel_dates'      // 出行日期
  | 'budget'            // 预算
  | 'interests'         // 兴趣偏好
  | 'party_size'        // 人数
  | 'accommodation'     // 住宿偏好
  | 'transportation'    // 交通方式
  | 'dietary'           // 饮食要求
  | 'mobility';         // 行动能力
```

**响应**:
```json
{
  "success": true,
  "data": {
    "prompt": "为了更好地为您规划冰岛之旅，请问：",
    "questions": [
      {
        "field": "travel_dates",
        "question": "您计划什么时间出发？",
        "type": "date_range",
        "options": ["近期（1周内）", "下个月", "具体日期..."],
        "required": true
      },
      {
        "field": "budget",
        "question": "您的预算大概是多少？",
        "type": "select",
        "options": ["经济型（<5000元/人）", "舒适型（5000-10000元/人）", "豪华型（>10000元/人）"],
        "required": false
      },
      {
        "field": "interests",
        "question": "您最感兴趣的活动是什么？",
        "type": "multi_select",
        "options": ["自然风光", "冰川徒步", "温泉", "极光", "观鲸", "文化体验"],
        "required": false
      }
    ]
  }
}
```

---

## 四、风险提示接口

### 4.1 生成风险提示

**POST** `/enhancement/risk-prompt`

**用途**: 当检测到风险时，生成用户友好的提示

```typescript
// 请求
{
  "risk_type": "WEATHER",              // 风险类型
  "severity": "HIGH",                  // 严重程度
  "details": {                         // 风险详情
    "event": "暴风雪",
    "affected_area": "冰岛南部",
    "start_time": "2026-01-22T00:00:00Z",
    "end_time": "2026-01-23T12:00:00Z"
  }
}

// risk_type 可选值
type RiskType = 'WEATHER' | 'ROAD' | 'HEALTH' | 'SAFETY' | 'LOGISTICS';

// severity 可选值
type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
```

**响应**:
```json
{
  "success": true,
  "data": {
    "title": "⚠️ 天气预警",
    "message": "您计划出行期间（1月22-23日），冰岛南部预计有暴风雪，可能影响行程安全。",
    "suggestions": [
      "建议调整行程，避开暴风雪时段",
      "如必须出行，请携带足够的保暖衣物",
      "关注冰岛气象局最新预报",
      "确保车辆配备冬季轮胎"
    ],
    "action_required": true,
    "alternatives": [
      {
        "description": "将南部行程推迟1天，先游览雷克雅未克",
        "confidence": 0.85
      },
      {
        "description": "改为北部冰岛行程，避开南部风暴区",
        "confidence": 0.78
      }
    ],
    "links": [
      {
        "title": "冰岛气象局",
        "url": "https://en.vedur.is/"
      },
      {
        "title": "路况信息",
        "url": "https://www.road.is/"
      }
    ]
  }
}
```

---

### 4.2 获取季节性风险

**GET** `/enhancement/domain-expert/seasonal-risks`

**用途**: 获取目的地的季节性风险信息

```typescript
// 查询参数
?destination=IS&season=WINTER&month=1
```

**响应**:
```json
{
  "success": true,
  "data": {
    "destination": "IS",
    "season": "WINTER",
    "risks": [
      {
        "type": "WEATHER",
        "severity": "HIGH",
        "description": "冬季暴风雪频繁，可能导致道路封闭",
        "mitigation": ["关注天气预报", "预留弹性时间", "租用四驱车"]
      },
      {
        "type": "ROAD",
        "severity": "MEDIUM",
        "description": "部分山路可能因积雪关闭",
        "mitigation": ["查看road.is路况", "避免夜间驾驶"]
      },
      {
        "type": "DAYLIGHT",
        "severity": "LOW",
        "description": "日照时间短（约4-5小时）",
        "mitigation": ["合理安排行程时间", "携带头灯"]
      }
    ],
    "recommendations": [
      "1月是观看极光的好时机",
      "建议购买旅行保险",
      "预订可免费取消的住宿"
    ]
  }
}
```

---

### 4.3 获取红线规则

**GET** `/enhancement/domain-expert/red-line-rules`

**用途**: 获取必须遵守的安全规则

```typescript
// 查询参数
?destination=IS&activity=glacier_hiking
```

**响应**:
```json
{
  "success": true,
  "data": {
    "rules": [
      {
        "id": "rule_001",
        "type": "MANDATORY",
        "title": "必须有专业向导",
        "description": "冰川徒步必须由认证向导带领，严禁独自探索",
        "consequence": "无向导徒步可能导致坠入冰缝，危及生命"
      },
      {
        "id": "rule_002",
        "type": "MANDATORY",
        "title": "必须穿戴专业装备",
        "description": "必须穿戴冰爪、安全绳等专业装备",
        "consequence": "无装备可能滑倒或坠落"
      },
      {
        "id": "rule_003",
        "type": "RECOMMENDED",
        "title": "建议购买保险",
        "description": "建议购买包含紧急救援的旅行保险",
        "consequence": "救援费用可能高达数万美元"
      }
    ]
  }
}
```

---

## 五、质量评分接口

### 5.1 获取规划质量评分

**POST** `/enhancement/quality/score`

**用途**: 展示规划的质量评分

```typescript
// 请求
{
  "plan": { ... },                    // 规划结果
  "user_request": "3天冰岛环岛游",
  "evidence": [ ... ],                // 证据数据
  "decision_log": [ ... ]             // 决策日志
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "overall_score": 8.5,
    "dimension_scores": [
      {"dimension": "SAFETY", "score": 9.0, "label": "安全性"},
      {"dimension": "FEASIBILITY", "score": 8.5, "label": "可行性"},
      {"dimension": "RELEVANCE", "score": 8.8, "label": "相关性"},
      {"dimension": "COMPLETENESS", "score": 8.0, "label": "完整性"},
      {"dimension": "CLARITY", "score": 8.2, "label": "清晰度"}
    ],
    "highlights": [
      "行程安全性高，避开了恶劣天气",
      "景点安排合理，不会太赶"
    ],
    "improvements": [
      "可以添加更多餐厅推荐",
      "建议补充紧急联系方式"
    ]
  }
}
```

---

## 六、前端对接示例

### 6.1 用户反馈组件

```tsx
// components/FeedbackButton.tsx
import { useState } from 'react';

interface FeedbackButtonProps {
  requestId: string;
  tripId?: string;
}

export function FeedbackButton({ requestId, tripId }: FeedbackButtonProps) {
  const [showRating, setShowRating] = useState(false);

  // 追踪用户操作
  const trackAction = async (action: 'ACCEPT' | 'EDIT' | 'ABANDON') => {
    await fetch('/api/training/product/feedback/track-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, trip_id: tripId, action })
    });

    if (action === 'ACCEPT') {
      setShowRating(true);
    }
  };

  // 提交评分
  const submitRating = async (rating: number, comment?: string) => {
    await fetch('/api/training/product/feedback/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, rating, comment })
    });
    setShowRating(false);
  };

  return (
    <div>
      <button onClick={() => trackAction('ACCEPT')}>采纳方案</button>
      <button onClick={() => trackAction('EDIT')}>修改方案</button>
      <button onClick={() => trackAction('ABANDON')}>放弃</button>
      
      {showRating && (
        <RatingDialog onSubmit={submitRating} onClose={() => setShowRating(false)} />
      )}
    </div>
  );
}
```

### 6.2 决策解释组件

```tsx
// components/ExplanationPanel.tsx
import { useState } from 'react';

interface ExplanationPanelProps {
  decisionLog: any[];
  evidenceRefs: any[];
  traceId: string;
}

export function ExplanationPanel({ decisionLog, evidenceRefs, traceId }: ExplanationPanelProps) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadExplanation = async () => {
    setLoading(true);
    const res = await fetch('/api/training/product/explainable/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision_log: decisionLog, evidence_refs: evidenceRefs, trace_id: traceId })
    });
    const { data } = await res.json();
    setExplanation(data);
    setLoading(false);
  };

  return (
    <div>
      <button onClick={loadExplanation} disabled={loading}>
        {loading ? '加载中...' : '为什么推荐这个行程？'}
      </button>
      
      {explanation && (
        <div className="explanation">
          <h3>决策摘要</h3>
          <p>{explanation.summary}</p>
          
          <h3>决策过程</h3>
          {explanation.decision_process.steps.map((step, i) => (
            <div key={i} className="step">
              <strong>{step.step_name}</strong>
              <p>决策：{step.decision}</p>
              <p>理由：{step.reasoning}</p>
              <ConfidenceBar value={step.confidence} />
            </div>
          ))}
          
          <h3>证据链</h3>
          {explanation.evidence_chain.map((ev, i) => (
            <div key={i} className="evidence">
              <span className="type">{ev.evidence_type}</span>
              <p>{ev.evidence_content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 6.3 澄清对话框组件

```tsx
// components/ClarificationDialog.tsx
import { useState, useEffect } from 'react';

interface ClarificationDialogProps {
  userRequest: string;
  missingInfo: string[];
  onSubmit: (answers: Record<string, any>) => void;
}

export function ClarificationDialog({ userRequest, missingInfo, onSubmit }: ClarificationDialogProps) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    loadQuestions();
  }, [missingInfo]);

  const loadQuestions = async () => {
    const res = await fetch('/api/training/enhancement/clarification-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_request: userRequest, missing_info: missingInfo })
    });
    const { data } = await res.json();
    setQuestions(data.questions);
  };

  return (
    <div className="clarification-dialog">
      <h3>请补充以下信息</h3>
      
      {questions.map((q) => (
        <div key={q.field} className="question">
          <label>{q.question}</label>
          
          {q.type === 'select' && (
            <select onChange={(e) => setAnswers({...answers, [q.field]: e.target.value})}>
              <option value="">请选择</option>
              {q.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          )}
          
          {q.type === 'multi_select' && (
            <div className="options">
              {q.options.map((opt) => (
                <label key={opt}>
                  <input type="checkbox" onChange={(e) => {
                    const current = answers[q.field] || [];
                    setAnswers({
                      ...answers, 
                      [q.field]: e.target.checked 
                        ? [...current, opt] 
                        : current.filter(x => x !== opt)
                    });
                  }} />
                  {opt}
                </label>
              ))}
            </div>
          )}
          
          {q.type === 'date_range' && (
            <input type="date" onChange={(e) => setAnswers({...answers, [q.field]: e.target.value})} />
          )}
        </div>
      ))}
      
      <button onClick={() => onSubmit(answers)}>确认</button>
    </div>
  );
}
```

### 6.4 风险提示组件

```tsx
// components/RiskAlert.tsx
import { useState, useEffect } from 'react';

interface RiskAlertProps {
  riskType: 'WEATHER' | 'ROAD' | 'HEALTH' | 'SAFETY';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: Record<string, any>;
}

export function RiskAlert({ riskType, severity, details }: RiskAlertProps) {
  const [riskInfo, setRiskInfo] = useState(null);

  useEffect(() => {
    loadRiskInfo();
  }, [riskType, details]);

  const loadRiskInfo = async () => {
    const res = await fetch('/api/training/enhancement/risk-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ risk_type: riskType, severity, details })
    });
    const { data } = await res.json();
    setRiskInfo(data);
  };

  if (!riskInfo) return null;

  return (
    <div className={`risk-alert severity-${severity.toLowerCase()}`}>
      <h4>{riskInfo.title}</h4>
      <p>{riskInfo.message}</p>
      
      <div className="suggestions">
        <strong>建议：</strong>
        <ul>
          {riskInfo.suggestions.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>
      
      {riskInfo.alternatives && riskInfo.alternatives.length > 0 && (
        <div className="alternatives">
          <strong>替代方案：</strong>
          {riskInfo.alternatives.map((alt, i) => (
            <div key={i} className="alternative">
              <p>{alt.description}</p>
              <span>置信度: {(alt.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      
      {riskInfo.links && (
        <div className="links">
          {riskInfo.links.map((link, i) => (
            <a key={i} href={link.url} target="_blank">{link.title}</a>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 6.5 质量评分组件

```tsx
// components/QualityScore.tsx
interface QualityScoreProps {
  score: {
    overall_score: number;
    dimension_scores: Array<{dimension: string; score: number; label: string}>;
    highlights: string[];
    improvements: string[];
  };
}

export function QualityScore({ score }: QualityScoreProps) {
  return (
    <div className="quality-score">
      <div className="overall">
        <span className="value">{score.overall_score.toFixed(1)}</span>
        <span className="label">综合评分</span>
      </div>
      
      <div className="dimensions">
        {score.dimension_scores.map((d) => (
          <div key={d.dimension} className="dimension">
            <span className="label">{d.label}</span>
            <div className="bar">
              <div className="fill" style={{width: `${d.score * 10}%`}} />
            </div>
            <span className="value">{d.score.toFixed(1)}</span>
          </div>
        ))}
      </div>
      
      {score.highlights.length > 0 && (
        <div className="highlights">
          <strong>✓ 亮点</strong>
          <ul>{score.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      )}
      
      {score.improvements.length > 0 && (
        <div className="improvements">
          <strong>💡 可改进</strong>
          <ul>{score.improvements.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
```

---

## 七、错误处理

```typescript
// utils/api.ts
async function callTrainingAPI(endpoint: string, options?: RequestInit) {
  const res = await fetch(`/api/training${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  const data = await res.json();

  if (!res.ok) {
    // 处理错误
    switch (res.status) {
      case 400:
        throw new Error(`参数错误: ${data.message}`);
      case 404:
        throw new Error('请求的资源不存在');
      case 500:
        throw new Error('服务器错误，请稍后重试');
      case 503:
        throw new Error('服务暂时不可用');
      default:
        throw new Error(data.message || '未知错误');
    }
  }

  return data;
}
```

---

## 八、TypeScript 类型定义

```typescript
// types/training-api.ts

// 用户操作类型
export type UserAction = 'ACCEPT' | 'EDIT' | 'EXPORT' | 'ABANDON';

// 风险类型
export type RiskType = 'WEATHER' | 'ROAD' | 'HEALTH' | 'SAFETY' | 'LOGISTICS';

// 风险严重程度
export type RiskSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

// 反馈追踪请求
export interface TrackActionRequest {
  request_id: string;
  trip_id?: string;
  action: UserAction;
  edit_details?: {
    field: string;
    old_value: any;
    new_value: any;
  };
}

// 反馈收集请求
export interface CollectFeedbackRequest {
  request_id: string;
  trip_id?: string;
  rating?: number;
  comment?: string;
  tags?: string[];
}

// 澄清问题响应
export interface ClarificationResponse {
  prompt: string;
  questions: Array<{
    field: string;
    question: string;
    type: 'select' | 'multi_select' | 'date_range' | 'text';
    options?: string[];
    required: boolean;
  }>;
}

// 风险提示响应
export interface RiskPromptResponse {
  title: string;
  message: string;
  suggestions: string[];
  action_required: boolean;
  alternatives?: Array<{
    description: string;
    confidence: number;
  }>;
  links?: Array<{
    title: string;
    url: string;
  }>;
}

// 决策解释响应
export interface ExplanationResponse {
  summary: string;
  decision_process: {
    steps: Array<{
      step_name: string;
      decision: string;
      reasoning: string;
      confidence: number;
    }>;
  };
  evidence_chain: Array<{
    evidence_id: string;
    evidence_type: string;
    evidence_content: string;
    relevance: number;
  }>;
}
```
