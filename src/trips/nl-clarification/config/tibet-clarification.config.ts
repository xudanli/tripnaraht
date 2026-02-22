// src/trips/nl-clarification/config/tibet-clarification.config.ts
// 西藏目的地澄清配置
// ⚠️ Layer 1 红线警告：西藏高原反应风险极高，HACE和HAPE可能致命

import { DestinationClarificationConfig } from './destination-clarification.config';

/**
 * 西藏高原反应风险知识库
 */
export const TIBET_ALTITUDE_RISK_KNOWLEDGE = {
  risk_category: "altitude",
  risk_category_cn: "高原反应风险",
  severity_level: "extreme",
  priority: "Layer 1 - 红线",
  description: "西藏最严重的医学风险。高原反应可能在24小时内致命。",
  risks: [
    {
      risk_id: "alt-ams",
      risk_name: "急性高山病 (AMS - Acute Mountain Sickness)",
      risk_name_en: "Acute Mountain Sickness",
      severity: "medium",
      probability: 0.5,
      onset_time: "6-12小时",
      affected_altitudes: [3000, 4000, 5000, 6000, 7000, 8000],
      affected_routes: ["ct-lhasa-namtso", "ct-lhasa-yamdrok-lake", "ct-lhasa-everest", "wt-kailash-pilgrimage", "wt-manasarovar-circuit"],
      affected_seasons: ["spring", "summer", "autumn", "winter"],
      symptoms: [
        "头痛（最常见）",
        "疲劳、虚弱",
        "恶心、食欲不振",
        "失眠",
        "心悸、心跳加速",
        "头晕目眩"
      ],
      severity_indicators: {
        mild: [
          "轻度头痛",
          "轻微恶心",
          "可以行动和交谈"
        ],
        moderate: [
          "中等头痛（影响活动）",
          "明显恶心",
          "行动缓慢",
          "可能有短暂意识模糊"
        ],
        severe: [
          "剧烈头痛",
          "持续呕吐",
          "行动困难",
          "判断力下降（警告信号！）"
        ]
      },
      progression_to_serious: {
        HACE_risk: "严重AMS可能进展为HACE（24-48小时）",
        warning_signs: [
          "意识改变（说话不清、判断力差、行为异常）",
          "走路不稳（踉跄）",
          "严重头痛伴视觉改变"
        ]
      },
      mitigation_strategies: [
        "缓慢上升（每天不超过300-500m）",
        "充分休息（特别是第一天）",
        "多喝水（避免脱水）",
        "吃清淡食物",
        "深呼吸（帮助吸收氧气）",
        "避免剧烈运动第一天",
        "不要饮酒",
        "可选：Diamox（需医生处方）"
      ],
      medical_treatment: [
        "暂停上升，保持当前高度",
        "充分休息",
        "口服布洛芬（止痛）",
        "多喝水和电解质液体",
        "吃清淡食物",
        "症状通常在2-7天内缓解"
      ],
      when_to_descend: [
        "症状在24小时内不缓解",
        "症状恶化",
        "出现严重AMS症状（严重头痛、呕吐、判断力差）"
      ],
      recovery_time: "2-7天",
      real_time_indicators: [
        "头痛程度（0-10量表）",
        "是否能进食和保留食物",
        "精神状态和判断力",
        "心率和呼吸频率"
      ],
      risk_factors: {
        high_risk: [
          "年龄>45岁",
          "既往高原反应史",
          "心血管疾病",
          "肺部问题",
          "肥胖",
          "快速上升"
        ],
        low_risk: [
          "青年（20-35岁）",
          "良好体能",
          "缓慢上升"
        ]
      },
      prevalence_by_altitude: {
        "2000m": "5-10%",
        "3000m": "20-30%",
        "4000m": "40-50%",
        "5000m": "60-70%",
        "6000m": "80-90%"
      },
      data_source: "高原医学研究期刊",
      last_updated: "2026-02-01"
    },
    {
      risk_id: "alt-hace",
      risk_name: "高原脑水肿 (HACE - High Altitude Cerebral Edema)",
      risk_name_en: "High Altitude Cerebral Edema",
      severity: "extreme",
      mortality_rate: "if_untreated: 50%",
      probability: 0.02,
      onset_time: "12-48小时",
      affected_altitudes: [4000, 5000, 6000, 7000, 8000],
      affected_routes: ["wt-kailash-pilgrimage", "wt-manasarovar-circuit", "ct-lhasa-everest"],
      affected_seasons: ["spring", "summer", "autumn", "winter"],
      symptoms: [
        "剧烈头痛（无法缓解）",
        "意识改变（说话不清、判断力差）",
        "行为异常（兴奋、抑郁、攻击性）",
        "协调能力丧失（走路踉跄、摔倒）",
        "可能昏迷或昏睡",
        "可能出现幻觉"
      ],
      critical_warning_signs: [
        "说话含糊不清或无法理解他人",
        "判断力严重下降（例如不愿下降或否认危险）",
        "走路严重不稳或无法行走",
        "意识模糊或失去意识"
      ],
      progression: {
        stage1: "重度头痛 + 轻微意识改变",
        stage2: "协调力丧失 + 行为异常",
        stage3: "昏迷，可能死亡"
      },
      mitigation_strategies: [
        "预防：缓慢上升",
        "预防：监测自己的症状和行为",
        "预防：充分休息",
        "预防：多喝水",
        "预防：如有严重高原反应症状立即停止上升"
      ],
      medical_treatment_URGENT: [
        "❌ 立即停止一切活动",
        "✅ 立即给予氧气（如有）",
        "✅ 立即给予地塞米松（dexamethasone）注射（需要医生处方）",
        "✅ 立即下降至少500-1000m（这比任何其他治疗都重要）",
        "✅ 立即呼叫直升机救援",
        "✅ 不要等待，不要自我监测，立即行动"
      ],
      time_critical: "这是医学急救情况。每小时都很关键。延迟可能导致死亡。",
      when_to_descend: "立即。HACE是医学应急。",
      survival_factors: {
        if_descend_quickly: "90%存活率",
        if_descend_slowly: "50%存活率",
        if_no_descent: "50%死亡率"
      },
      cannot_wait_for: [
        "天气改善",
        "夜晚过去",
        "额外的医学评估",
        "患者同意（患者可能因为HACE无法同意）"
      ],
      real_time_monitoring: [
        "不清醒？HACE的迹象！",
        "走路不稳？HACE的迹象！",
        "说话困难？HACE的迹象！",
        "判断力差？HACE的迹象！"
      ],
      family_members_note: "HACE患者可能否认症状或拒绝下降（因为脑部水肿导致判断力丧失）。不要听患者的，立即下降。",
      cost_of_helicopter_rescue: 5000,
      insurance_critical: "必须有包括直升机救援的保险",
      data_source: "高原医学文献 - 致命风险",
      last_updated: "2026-02-01"
    },
    {
      risk_id: "alt-hape",
      risk_name: "高原肺水肿 (HAPE - High Altitude Pulmonary Edema)",
      risk_name_en: "High Altitude Pulmonary Edema",
      severity: "extreme",
      mortality_rate: "if_untreated: 50%",
      probability: 0.01,
      onset_time: "12-48小时",
      affected_altitudes: [3000, 4000, 5000, 6000, 7000, 8000],
      affected_routes: ["ct-lhasa-namtso", "ct-lhasa-everest", "wt-kailash-pilgrimage"],
      symptoms: [
        "严重呼吸困难（即使休息时）",
        "胸部紧绷感",
        "咳嗽（可能有血丝痰液）",
        "蓝色嘴唇（缺氧表现）",
        "心跳加速",
        "虚弱和疲劳",
        "可能失去意识"
      ],
      critical_warning_signs: [
        "呼吸困难在休息时不缓解",
        "咳嗽带血",
        "蓝色嘴唇或指甲",
        "严重心跳加速（>120 bpm）"
      ],
      mitigation_strategies: [
        "预防：缓慢上升",
        "预防：充分休息",
        "预防：避免过度活动（特别是第一天）",
        "预防：监测呼吸困难"
      ],
      medical_treatment_URGENT: [
        "❌ 立即停止活动",
        "✅ 给予氧气（最重要）",
        "✅ 给予地塞米松",
        "✅ 可能需要硝酸甘油（医生处方）",
        "✅ 立即下降至少500-1000m",
        "✅ 立即呼叫直升机"
      ],
      when_to_descend: "立即。HAPE是医学应急。",
      survival_factors: {
        if_oxygen_and_descend: "95%存活率",
        if_descend_no_oxygen: "60%存活率",
        if_no_descent: "50%死亡率"
      },
      oxygen_critical: "HAPE患者给予氧气后可能迅速改善。氧气是救命的。",
      insurance_critical: true,
      data_source: "高原医学文献 - 致命风险",
      last_updated: "2026-02-01"
    },
    {
      risk_id: "alt-severe-reaction",
      risk_name: "严重高原反应 - 需要紧急干预",
      risk_name_en: "Severe Altitude Sickness",
      severity: "high",
      probability: 0.05,
      onset_time: "6-24小时",
      symptoms: [
        "无法进食或进食后呕吐",
        "无法行动（腿软）",
        "严重头痛（即使有止痛药）",
        "意识模糊但不完全意识丧失",
        "判断力下降"
      ],
      mitigation_strategies: [
        "立即停止上升",
        "考虑下降",
        "寻求医疗帮助",
        "不要继续活动"
      ],
      decision_framework: {
        if_symptoms_improve_in_24h: "可以继续，但非常谨慎",
        if_symptoms_worsen: "必须下降",
        if_doubt: "下降是更安全的选择"
      },
      last_updated: "2026-02-01"
    }
  ],
  altitude_decision_algorithm: {
    input: [
      "当前高度",
      "是否有以下症状：头痛、呼吸困难、恶心、意识改变、走路不稳"
    ],
    decision_tree: {
      no_symptoms: "继续，但监测",
      mild_symptoms_ams: "暂停上升，休息，监测",
      worsening_ams: "下降",
      hace_warning_signs: "❌ 立即下降500-1000m，呼叫救援",
      hape_warning_signs: "❌ 立即下降，立即给氧，呼叫救援"
    }
  },
  key_rules: [
    "Rule 1: 任何意识改变 = 立即下降",
    "Rule 2: 走路不稳 = 立即下降",
    "Rule 3: 无法进食 = 至少停止上升",
    "Rule 4: 严重呼吸困难 = 立即下降 + 氧气 + 救援",
    "Rule 5: 怀疑HACE或HAPE = 立即下降，不要犹豫"
  ],
  summary_stats: {
    total_altitude_risks: 4,
    extreme_severity: 2,
    layer1_critical: true,
    insurance_mandatory: true,
    medical_support_critical: true
  },
  last_updated: "2026-02-01",
  data_source: "西藏知识库 v1.0 - 高原医学研究"
};

/**
 * 西藏目的地澄清配置模板
 */
export const TIBET_CONFIG_TEMPLATE: DestinationClarificationConfig = {
  destinationCode: 'XZ', // 西藏（使用2字符代码）
  destinationName: '西藏',
  enabled: true,
  metadata: {
    description: '西藏目的地澄清配置 - 极高高原反应风险目的地',
    riskLevel: 'extreme',
    requiresExpertise: false, // 普通游客也可以去，但需要充分准备
    lastUpdated: '2026-02-01',
    credibilityScore: 0.95,
    dataSources: [
      '高原医学研究期刊',
      '西藏知识库 v1.0 - 高原医学研究',
      '高原医学文献 - 致命风险',
    ],
  },
  // 将风险知识库存储在metadata中
  riskKnowledgeBase: TIBET_ALTITUDE_RISK_KNOWLEDGE as any,
  clarificationRounds: [
    {
      roundId: 'round_1_basic',
      name: '基础信息',
      description: '收集基础旅行信息：目的地、日期、预算',
      triggerConditions: {},
      questions: [],
      completionConditions: {
        requiredFields: ['destination', 'startDate', 'endDate', 'totalBudget', 'currency'],
      },
      priority: 1,
    },
    {
      roundId: 'round_2_altitude_safety',
      name: '高原反应安全评估',
      description: '评估用户的高原反应风险和准备情况',
      triggerConditions: {
        requiredFields: ['destination'],
        previousRoundCompleted: 'round_1_basic',
      },
      questions: [
        {
          id: 'tibet_altitude_experience',
          question: '您是否有高原旅行经验？',
          type: 'single_choice',
          options: [
            { value: 'none', label: '没有，这是第一次' },
            { value: 'low_altitude', label: '有，但只在3000米以下' },
            { value: 'medium_altitude', label: '有，到过3000-4000米' },
            { value: 'high_altitude', label: '有，到过4000-5000米' },
            { value: 'very_high_altitude', label: '有，到过5000米以上' },
          ],
          required: true,
          metadata: {
            category: 'experience',
            priority: 'high',
            isCritical: true,
            fieldName: 'altitudeExperience',
          },
        },
        {
          id: 'tibet_previous_ams',
          question: '您之前是否有过高原反应（头痛、恶心、失眠等）？',
          type: 'single_choice',
          options: [
            { value: 'never', label: '从未有过' },
            { value: 'mild_once', label: '有过一次轻微反应' },
            { value: 'mild_multiple', label: '多次轻微反应' },
            { value: 'moderate', label: '有过中等程度反应' },
            { value: 'severe', label: '有过严重反应' },
          ],
          required: true,
          metadata: {
            category: 'health',
            priority: 'high',
            isCritical: true,
            fieldName: 'previousAMS',
          },
        },
        {
          id: 'tibet_physical_condition',
          question: '您的身体状况如何？',
          type: 'single_choice',
          options: [
            { value: 'excellent', label: '优秀（无健康问题）' },
            { value: 'good', label: '良好（轻微问题，已控制）' },
            { value: 'fair', label: '一般（有健康问题，需医生确认）' },
            { value: 'poor', label: '较差（有严重健康问题）' },
          ],
          required: true,
          metadata: {
            category: 'health',
            priority: 'high',
            isCritical: true,
            fieldName: 'physicalCondition',
          },
        },
        {
          id: 'tibet_cardiovascular',
          question: '您是否有心血管疾病（高血压、心脏病等）？',
          type: 'boolean',
          required: true,
          metadata: {
            category: 'health',
            priority: 'high',
            isCritical: true,
            fieldName: 'hasCardiovascularDisease',
          },
        },
        {
          id: 'tibet_respiratory',
          question: '您是否有呼吸系统疾病（哮喘、慢阻肺等）？',
          type: 'boolean',
          required: true,
          metadata: {
            category: 'health',
            priority: 'high',
            isCritical: true,
            fieldName: 'hasRespiratoryDisease',
          },
        },
        {
          id: 'tibet_insurance',
          question: '您是否购买了包含高原救援和直升机救援的保险？',
          type: 'boolean',
          required: true,
          metadata: {
            category: 'insurance',
            priority: 'high',
            isCritical: true,
            fieldName: 'hasAltitudeRescueInsurance',
          },
        },
        {
          id: 'tibet_ascent_plan',
          question: '您的上升计划是？',
          type: 'single_choice',
          options: [
            { value: 'rapid', label: '快速上升（1-2天到拉萨）' },
            { value: 'moderate', label: '中等速度（3-4天到拉萨）' },
            { value: 'slow', label: '缓慢上升（5天以上，有适应期）' },
            { value: 'gradual', label: '渐进式（从低海拔开始，每天不超过300-500米）' },
          ],
          required: true,
          metadata: {
            category: 'planning',
            priority: 'high',
            isCritical: true,
            fieldName: 'ascentPlan',
          },
        },
      ],
      completionConditions: {
        requiredFields: [
          'altitudeExperience',
          'previousAMS',
          'physicalCondition',
          'hasCardiovascularDisease',
          'hasRespiratoryDisease',
          'hasAltitudeRescueInsurance',
          'ascentPlan',
        ],
      },
      priority: 2,
    },
  ],
  gatePrechecks: [
    {
      checkId: 'tibet_altitude_gate_critical',
      name: '高原反应关键风险Gate',
      triggerConditions: {
        requiredFields: [
          'altitudeExperience',
          'previousAMS',
          'physicalCondition',
          'hasCardiovascularDisease',
          'hasRespiratoryDisease',
        ],
      },
      checkType: 'hard_gate',
      checkLogic: {
        useLLM: true,
        llmPrompt: `检查用户的高原反应风险因素。
如果 previousAMS='severe'，则强烈阻止（严重高原反应史）。
如果 hasCardiovascularDisease=true，则警告（必须医生许可）。
如果 hasRespiratoryDisease=true，则强烈警告（HAPE风险极高，必须医生许可）。
如果 physicalCondition='poor'，则警告（身体状况差）。
如果 ascentPlan='rapid'，则警告（快速上升风险高）。
如果 hasAltitudeRescueInsurance=false，则强烈警告（HACE/HAPE可能致命，必须保险）。
西藏高原反应可能致命，HACE和HAPE死亡率50%（如不治疗）。`,
      },
      failureResponse: {
        blockType: 'block',
        warningMessage: '⚠️ 根据您的健康状况和准备情况，西藏旅行存在极高风险。高原反应（特别是HACE和HAPE）可能致命，死亡率可达50%。强烈建议：1) 咨询医生获得许可；2) 购买包含直升机救援的保险；3) 选择缓慢上升计划；4) 或考虑其他目的地。',
        alternatives: [
          {
            label: '咨询医生并获得许可',
            description: '必须获得医生许可才能前往西藏',
            action: 'require_medical_clearance',
          },
          {
            label: '购买高原救援保险',
            description: '必须包含直升机救援（费用约5000美元）',
            action: 'require_rescue_insurance',
          },
          {
            label: '选择其他目的地',
            description: '推荐：云南、四川、青海（海拔较低）',
            action: 'suggest_alternative_destinations',
          },
        ],
      },
    },
  ],
  fieldExtractionRules: [
    {
      fieldName: 'altitudeExperience',
      fieldType: 'string',
      extractionPrompt: '用户提到的高原旅行经验，包括海拔高度',
    },
    {
      fieldName: 'previousAMS',
      fieldType: 'string',
      extractionPrompt: '用户之前是否有过高原反应症状',
    },
    {
      fieldName: 'physicalCondition',
      fieldType: 'string',
      extractionPrompt: '用户的身体健康状况',
    },
    {
      fieldName: 'hasCardiovascularDisease',
      fieldType: 'boolean',
      extractionPrompt: '是否有心血管疾病（高血压、心脏病等）',
    },
    {
      fieldName: 'hasRespiratoryDisease',
      fieldType: 'boolean',
      extractionPrompt: '是否有呼吸系统疾病（哮喘、慢阻肺等）',
    },
    {
      fieldName: 'hasAltitudeRescueInsurance',
      fieldType: 'boolean',
      extractionPrompt: '是否购买了包含高原救援的保险',
    },
    {
      fieldName: 'ascentPlan',
      fieldType: 'string',
      extractionPrompt: '用户的上升计划（快速/中等/缓慢）',
    },
  ],
};
