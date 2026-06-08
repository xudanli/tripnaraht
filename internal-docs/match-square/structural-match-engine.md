# Decision OS · 双层 Match Engine（Graph Clustering + CSP）

算法 ID：`graph_cluster_csp_v2`  
适用画像：**v2 Premium Intake**（自选 MBTI + 硬核背书 + 3 道行中博弈题）

---

## 0. 破圈级化学反应（Cross-Circle Chemistry）

实现：`src/match-square/engine/cross-circle-chemistry.engine.ts`

| 剧本 ID | 标题 | 队长 × 队员 | 加分 |
|---------|------|-------------|------|
| `wall_break_flywheel` | 破壁飞轮 | INTJ/ENTJ × ENFP/ESFP | +18 |
| `intellect_wild_fusion` | 智力与物理的野性融合 | INTP/ISTJ × ISTP/ESTP | +18 |
| `narrative_sensory_awakening` | 宏大叙事与感官觉醒 | INFJ/ENFJ × ESFJ/ISFP | +18 |

**Hard Gate 不变**：学历/职级/芝麻信用 tier 仍对齐；破圈发生在 **Soft Weights** 层。

### Industry Anti-Clustering（行业负相关加分）

| 条件 | 修正 |
|------|------|
| 队长 ∈ 互联网白领（tech/consulting/finance）且队员 **同行业** | **-10**（同质化「开周会式旅行」） |
| 队长 ∈ 互联网白领，队员 ∈ 文化/艺术/实业/消费 **且** 高能量高弹性（P/E/博弈题） | **+20** |
| 命中破圈剧本 | **+18**（不再重复 +20） |

最终公式：

```
Score = clamp(50 + TeamworkFit + StressFit + MbtiSynergy + ChemistryScript + IndustryAntiCluster, 50, 100)
```

---

## 1. 特征向量 U

实现：`src/match-square/engine/user-feature-vector.engine.ts`

| 维度 | 字段 | 来源 |
|------|------|------|
| M₁₋₄ | `mbtiOneHot` | 自选 MBTI 四维 0/1 |
| E₁ | `e1EducationLevel` | 学历：未认证≈1，本科=3，硕士=5，博士=6 |
| E₂ | `e2SchoolTier` | 档次：普通=1，985=4，QS50/海归=5 |
| P₁ | `p1IndustryCode` | 行业圈层码 1–5 |
| P₂ | `p2RoleWeight` | 职级：基层=1，资深=3，总监=5 |
| C | `cControl` | 场景2：全托管≈10，一起策划≈5，随便≈1 |
| A | `aQualityAmbiguity` | 场景1：品质底线≈10，安全优先≈1 |
| F | `fFinancialIndependence` | 场景3：悦己≈10，妥协≈1 |

**沟通带宽复合分：** `socialScore = E₁ × E₂ × P₂`（未认证用户回退 1×1×1）

---

## 2. Layer 1 — Hard Gates

实现：`src/match-square/engine/structural-match.engine.ts`

1. **时空错位熔断**  
   - 双方均有行程时：目的地必须一致，且日期交集 **≥ 3 天**  
   - 函数：`failsTimeLocationHardGate` / `computeTripOverlapDays`

2. **沟通带宽熔断（Social Bandwidth Gate）**  
   - `|tier(A) - tier(B)| >= 3` → 隐性过滤  
   - 或高背书用户与未认证用户相对差距 > 85%  
   - 函数：`failsSocialBandwidthGate` / `socialScoreToTier`

3. **保留既有熔断**（在 `recruitment-compatibility.util.ts` 入口）  
   - 履约背书 Hard Gate（芝麻极低 / 放鸽子）  
   - 组队风格 Hard Gate（随便玩 × 强 J 人）

---

## 3. Layer 2 — Soft Weights（团队结构稳定性）

```
Compatibility = clamp(50 + TeamworkFit + StressFit + MbtiSynergy, 50, 100)
```

| 分量 | 权重逻辑 | 典型分值 |
|------|----------|----------|
| **TeamworkFit** | 契约互补矩阵 | 全托管队长+跟随者 +25；双主导 -20；一起策划对齐 +20 |
| **StressFit** | A/F 欧氏距离 | `max(-15, -1.5 × distance)` |
| **MbtiSynergy** | 职场公路片矩阵 | INTJ 队长 + ENFP/ESFP +15；+ ISTP/ESTP +12 |

矩阵配置：`src/match-square/config/mbti-synergy-matrix.config.ts`

---

## 4. 工程接入点

| 场景 | 入口 |
|------|------|
| 搭子广场列表契合度 | `computeRecruitmentCompatibility()` |
| 申请预览 / 提交 | `buildApplicationMatchInsights()` |
| Match Flash / Captain Radar | 同上（经 `recruitment-compatibility.util`） |
| Odyssey 旅伴推荐 | `rankCompanionMatches()` → structural |

**前端抽屉数据：**

- `matchInsightDrawer.headline` + `lines[]`（status: ok | warn | neutral）
- `structuralMatch`：baseScore / teamworkFitPoints / stressFitPoints / mbtiSynergyPoints

---

## 5. 与车队拼图联动

`team-puzzle-deficit.engine.ts` 在队长 `control_desire ≥ 2` 且 `teamworkStyle = full_managed` 时，优先输出：

- `🛡️ 乐意接受全托管的靠谱执行者`
- `minEducationTier: bachelor_plus`

与 Layer 2 的 TeamworkFit 互补矩阵一致。

---

## 6. 回退策略

- structural 硬熔断 → `recommendationHidden: true`，不算 cosine
- structural 不可用（缺 snapshot）→ legacy `companion-matching.engine` 加权

---

## 7. 测试

```bash
npm test -- --testPathPatterns='structural-match|user-feature-vector|companion-matching|recruitment-compatibility'
```
