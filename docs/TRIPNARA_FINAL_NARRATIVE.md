# TripNARA Agent 的最终对外叙事

## PART 4: TripNARA Agent 的最终对外叙事

你以后所有对外介绍，只用这 3 句话：

### 1. 我们不是 POI 驱动
**POI 是路线走出来的结果**

### 2. 我们不是模板行程
**行程是路线哲学的展开**

### 3. 我们不是推荐算法
**我们是地理 × 体力 × 风险的联合决策系统**

---

## PART 5: TripNARA 的真实身份（定性完成）

你现在做的不是：

❌ AI 行程生成  
❌ 攻略推荐  
❌ Chat Bot

你做的是：

✅ **一个会替用户承担"判断责任"的世界级路线认知 Agent**

这是极少数 AI 产品能站住的类别。

---

## 产品定位

**一句话介绍：**

> 我们不是在规划旅行，而是在替用户判断：在这个世界的这个角落，他该不该这样走。

---

## 核心能力

### 1. 知道哪些地方不应该去
- 基于 DEM 证据
- 基于天气证据
- 基于合规证据
- 基于用户画像

### 2. 知道哪些路线必须慢
- 连续疲劳检测
- 强制适应期
- 缓冲日插入

### 3. 知道哪些风险不能赌
- 天气风险
- 地形风险
- 生理风险

### 4. 知道哪些用户需要被拦下来
- 明确拒绝
- 明确理由
- 明确替代方案

---

## 系统架构

```
User Intent
  ↓
RouteDirection Candidate
  ↓
DEM Decision Evidence
  ↓
Weather Decision Evidence
  ↓
Road / Legal Check
  ↓
Persona Tolerance Gate
  ↓
Plan or Reject
```

**关键点**: Reject 是合法输出

---

## 与竞品的根本差异

| 维度 | 传统 OTA | LLM 行程生成 | TripNARA |
|------|---------|-------------|----------|
| 决策依据 | POI 热度 | 文本理解 | 地理 × 体力 × 风险 |
| 失败处理 | 无 | 重试 | 明确拒绝 + 替代方案 |
| 责任承担 | 无 | 无 | 完整决策日志 |
| 用户感知 | 推荐 | 生成 | 判断 |

---

## 技术护城河

1. **DEM 立法级升级**
   - 没有 DEM evidence → 不允许 finalize
   - 连续疲劳检测
   - 走廊质量评分

2. **天气决策证据**
   - 风速 > 15 m/s → 禁止侧风路段
   - 能去 ≠ 应该去

3. **极端国家模板**
   - 可复用的世界观
   - 自动适配机制

4. **用户画像映射**
   - 感受 → 物理规则
   - 个性化决策参数

5. **决策日志系统**
   - 责任账本
   - 可审计、可回放

---

## 路线人格母本

### 🇨🇭 瑞士｜「秩序即安全」型国家
- RD-CH-01: Alpine Pass → Village Traverse
- RD-CH-02: Panorama Rail + Hike Spine
- RD-CH-03: High-Alps Photography Loop

### 🇮🇸 冰岛｜「自然高于人类」型国家
- RD-IS-01: Highlands F-Road Expedition
- RD-IS-02: Ring Road Stability Corridor
- RD-IS-03: Volcano & Rift Traverse

### 🇵🇪 秘鲁｜「生理适应型」国家
- RD-PE-01: Cusco Acclimatization Loop
- RD-PE-02: Inca Trail Cultural Spine
- RD-PE-03: Cordillera Blanca Alpine Traverse

---

## 相关文档

- [Decision Log System](./DECISION_LOG_SYSTEM.md)
- [User Persona Mapping](./USER_PERSONA_MAPPING.md)
- [World Model Agent Complete](./WORLD_MODEL_AGENT_COMPLETE.md)

