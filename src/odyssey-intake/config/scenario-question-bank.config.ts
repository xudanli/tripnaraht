import type { OdysseyScenarioQuestion, ScoreDelta, ScenarioId } from '../types/odyssey-intake.types';

/** 选项 → 后台埋点分值（PRD 模块一） */
export const ODYSSEY_OPTION_SCORE_DELTAS: Record<
  ScenarioId,
  Record<'A' | 'B' | 'C', ScoreDelta>
> = {
  budget_financial_tolerance: {
    A: { financial_flexibility: 2, planning_index: -1 },
    B: { financial_flexibility: -2, mbti_j_score: 2, mbti_t_score: 1 },
    C: { mbti_f_score: 1, compromise_index: 2 },
  },
  ambiguity_tolerance: {
    A: { ambiguity_tolerance: 2, mbti_p_score: 2 },
    B: { ambiguity_tolerance: -2, mbti_j_score: 2, mbti_t_score: 1 },
    C: { ambiguity_tolerance: -2, stress_anxiety_index: 2, mbti_j_score: 1 },
  },
  energy_pace: {
    A: { energy_capacity: 2, travel_pace: 2, mbti_e_score: 1 },
    B: { energy_capacity: -2, travel_pace: -2, mbti_i_score: 2 },
    C: { energy_capacity: 0, travel_pace: 0 },
  },
  social_recharge: {
    A: { mbti_e_score: 2, social_drive: 2 },
    B: { mbti_i_score: 1, social_drive: 0 },
    C: { mbti_i_score: 2, social_drive: -2 },
  },
  aesthetic_meaning: {
    A: { mbti_n_score: 2, aesthetic_preference: 2 },
    B: { mbti_s_score: 2, aesthetic_preference: -2 },
    C: { mbti_s_score: 1, aesthetic_preference: 0 },
  },
};

/** 固定 5 道场景题（前端展示，不含埋点） */
export const ODYSSEY_SCENARIO_QUESTIONS: OdysseyScenarioQuestion[] = [
  {
    id: 'budget_financial_tolerance',
    order: 1,
    title: '预算与财务容忍度',
    scenario:
      '在长途公路旅行的第 4 天傍晚，你们偶然经过一家极其种草、推开窗就是雪山的黑珍珠景观餐厅。但它的人均消费高出你们原本单餐预算 400 元，你会？',
    wallpaperKey: 'snow_mountain_restaurant',
    options: [
      {
        id: 'A',
        label: '体验至上：「出来玩开心最重要，果断进！预算后面几天的住宿上省出来。」',
      },
      {
        id: 'B',
        label: '预算至上：「严格执行原计划。拍照打卡留念，然后去旁边吃原定的人均 50 元小吃。」',
      },
      {
        id: 'C',
        label: '折中务实：「和搭子商量：如果对方强烈想去，那就进去只点招牌，AA 后尽量不超支。」',
      },
    ],
  },
  {
    id: 'ambiguity_tolerance',
    order: 2,
    title: '不确定性容忍度',
    scenario:
      '由于强风暴雪，去往核心景区的道路被交警临时封闭，所有车辆禁止通行。你唯一的 Plan B 是原路返回酒店躺着，或者多花 3 小时绕行一条未知的泥泞山路，你会？',
    wallpaperKey: 'blizzard_road_closure',
    options: [
      {
        id: 'A',
        label: '冒险探索：「无所谓，未知才是旅行的意义！绕道走，说不定能看到不一样的风景。」',
      },
      {
        id: 'B',
        label: '安全保守：「安全第一。回酒店躺着，或者在附近镇上喝咖啡，绝对不冒未知的风险。」',
      },
      {
        id: 'C',
        label: '焦虑折返：「感到极其烦躁和遗憾，但没办法，只能原路返回，并一路上不断刷新路况希望它复通。」',
      },
    ],
  },
  {
    id: 'energy_pace',
    order: 3,
    title: '精力密度曲线',
    scenario:
      '已经连续特种兵式暴走和高频 social 了 3 天，今天还有 4 个打卡点。早上 8 点闹钟响起，你现在的真实状态和想法是？',
    wallpaperKey: 'early_morning_alarm',
    options: [
      {
        id: 'A',
        label: '满血复活：「特种兵从不认输！按时起床，高歌猛进，必须把所有景点打卡完。」',
      },
      {
        id: 'B',
        label: '拒绝营业：「放过我吧…和搭子商量今天取消 2 个景点，睡到中午再出门，找个咖啡馆发呆。」',
      },
      {
        id: 'C',
        label: '折中调整：「少去 1 个景点，晚一点出门，但今天的核心打卡不能丢。」',
      },
    ],
  },
  {
    id: 'social_recharge',
    order: 4,
    title: '社交开销与独处回血',
    scenario:
      '行程当晚入住了一家非常有氛围的青年旅舍/民宿，公共区域正在举办热闹的当地民谣弹唱会和围炉煮茶，此时你会？',
    wallpaperKey: 'hostel_communal_fire',
    options: [
      {
        id: 'A',
        label: '社交中心：「太棒了！立刻拉上搭子过去拿瓶啤酒坐下，主动和来自各地的人聊天、组局。」',
      },
      {
        id: 'B',
        label: '边缘观察：「拉着搭子在角落悄悄看会儿，不主动说话，只享受热闹的背景音。」',
      },
      {
        id: 'C',
        label: '物理逃离：「对不起，太吵了。我只想拿上耳机回房间反锁房门，刷手机躺尸，这是我的回血时间。」',
      },
    ],
  },
  {
    id: 'aesthetic_meaning',
    order: 5,
    title: '内容审美与意义感偏好',
    scenario:
      '面对一座历史悠久但目前只剩残垣断壁、极其考验文化功底的古城遗址，你和搭子站在烈日下，你内心的真实独白是？',
    wallpaperKey: 'ancient_ruins_sun',
    options: [
      {
        id: 'A',
        label: '符号共鸣：「天呐，抚摸这些石块仿佛能听到千年前战马的嘶鸣。哪怕晒死我也要对着历史画册看三个小时。」',
      },
      {
        id: 'B',
        label: '感官体验：「看一堆石头确实有点无聊…拍照也不太出片，不如早点去市集吃烤肉。」',
      },
      {
        id: 'C',
        label: '折中打卡：「快速了解背景故事，拍几张有氛围感的照片，然后转战下一站。」',
      },
    ],
  },
];
