import {
  applyBoundTripReviewRouteAndRunOverrideInPlace,
  isBoundTripLightConsultQuery,
  isBoundTripLodgingDiningPlanQuery,
  isFactualMacroStatQuery,
  isHotelInventorySearchQuery,
  isLocalClockOrTimezoneFactQuery,
  isTripStatusOverviewQuery,
  isWeatherRoadConditionFocusedQuery,
  routingSignalsWithResolvedTaskType,
  shouldForceDataLookupForBoundTripReview,
  shouldRouteBoundTripAsItineraryAdjust,
  signalsFromRequest,
} from './orchestration-signals.util';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('signalsFromRequest — 行程内咨询分流', () => {
  const base = (overrides: Partial<RouteAndRunRequestDto>): RouteAndRunRequestDto => ({
    request_id: 'r1',
    user_id: 'u1',
    message: '',
    ...overrides,
  });

  it('有 trip_id + 搜索维克某日住宿 → DATA_LOOKUP（非瑕疵草案 SM）', () => {
    const msg = '搜索维克 7 月 26 日住宿';
    expect(isHotelInventorySearchQuery(msg, msg.toLowerCase())).toBe(true);
    expect(shouldForceDataLookupForBoundTripReview({ trip_id: 't1', message: msg })).toBe(true);
    const s = signalsFromRequest(
      base({
        trip_id: 'trip_15c50a69931845ca',
        message: msg,
        options: { intent_mode: 'TRIP_PLANNING', use_state_machine_orchestration: true },
        conversation_context: { context_type: 'active_trip_summary' },
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 西峡湾极地攻略咨询 → DATA_LOOKUP + Plan Studio 轻量咨询', () => {
    const msg = '帮我查查类似冰岛西峡湾那种冷门秘境的极地探险攻略';
    expect(isBoundTripLightConsultQuery(msg, msg.toLowerCase())).toBe(true);
    const s = signalsFromRequest(
      base({
        trip_id: '807b3c54-4793-4006-a66d-67e79faa6fc2',
        message: msg,
        conversation_context: { context_type: 'active_trip_summary' },
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 预算/指南类咨询 → DATA_LOOKUP 且不要求结构化输出', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '冰岛旅行预算指南',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id +「什么是申根签证」类定义问答 → DATA_LOOKUP（勿默认 TRIP_PLANNING/PLAN_GEN）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
        message: '什么是申根签证？',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id +「雷克雅未克现在几点」→ DATA_LOOKUP（事实时钟，勿叠 2026 行程/午夜太阳分析）', () => {
    expect(isLocalClockOrTimezoneFactQuery('雷克雅未克现在几点？')).toBe(true);
    const s = signalsFromRequest(
      base({
        trip_id: 't-iceland',
        message: '雷克雅未克现在几点？',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id +「冰岛人口大概多少」→ DATA_LOOKUP（统计事实，勿触发维度评分/行程优化壳）', () => {
    expect(isFactualMacroStatQuery('冰岛人口大概多少？')).toBe(true);
    const s = signalsFromRequest(
      base({
        trip_id: 't-iceland',
        message: '冰岛人口大概多少？',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id +「蓝湖门票提前多久订」→ DATA_LOOKUP（勿误判 TRIP_PLANNING 输出无关单日占位日程）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't-iceland',
        message: '蓝湖门票需要多久提前订',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 推荐酒店 → DATA_LOOKUP（不误入行程规划）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '推荐酒店',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 黄金圈附近餐厅推荐 → DATA_LOOKUP（勿误入 POI 通勤澄清）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '您好，推荐黄金圈附近的餐厅',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 维克超市能买什么 → DATA_LOOKUP（勿误入 POI 稀疏澄清）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '维克超市可以买到什么水果',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 附近能买苹果 → DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '附近有能买苹果的超市吗',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 口语好吃推荐 → DATA_LOOKUP（勿未命中餐饮分流误入 TRIP_PLANNING）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '推荐一些好吃的地方',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 租车/用车咨询 → DATA_LOOKUP（勿走全量 System2 编排）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '什么时候租车比较合适',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 开口程可订组合（无攻略类词根）→ DATA_LOOKUP（勿默认 TRIP_PLANNING 不出航班传感器）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
        message:
          '去程凯夫拉维克进、回程从赫尔辛基出，6月中一周窗口，给可订组合。',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 首日某时段能否徒步 → DATA_LOOKUP（勿误触发整轮 TRIP_PLANNING）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '第一天5点之后可以徒步吗',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 第N天餐厅是否顺路 → DATA_LOOKUP（勿误 TRIP_PLANNING 只晒 timeline）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '第2天去Sumac餐厅顺路吗',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 人群/适配咨询 → DATA_LOOKUP（勿误入行程规划卡片）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '什么类型的人适合去冰岛',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 全面分析当前行程 → DATA_LOOKUP（勿误入 CGUS 决策驾驶舱）', () => {
    const msg = '帮我全面分析下当前行程，看下是否存在问题和可以优化的地方';
    expect(isTripStatusOverviewQuery(msg, msg.toLowerCase())).toBe(true);
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: msg,
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 全面分析 + intent_mode=TRIP_PLANNING → 仍 DATA_LOOKUP（复盘勿走规划状态机）', () => {
    const msg = '帮我全面分析当前行程，看看还有什么问题或可以优化的地方';
    const req = base({
      trip_id: 't1',
      message: msg,
      options: { intent_mode: 'TRIP_PLANNING', use_state_machine_orchestration: true },
    });
    expect(shouldForceDataLookupForBoundTripReview(req)).toBe(true);
    expect(applyBoundTripReviewRouteAndRunOverrideInPlace(req)).toBe(true);
    expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
    expect(req.options?.use_state_machine_orchestration).toBe(false);
    const s = signalsFromRequest(req);
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 多日住宿餐饮方案 → DATA_LOOKUP（勿走 TRIP_PLANNING 深度推理）', () => {
    const msg =
      '请给出详细6天住宿和餐饮方案，黄金圈南岸到冰河湖，包括酒店推荐和每日用餐策略';
    expect(isBoundTripLodgingDiningPlanQuery(msg, msg.toLowerCase())).toBe(true);
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: msg,
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 住宿餐饮方案 + intent_mode=TRIP_PLANNING → 仍 DATA_LOOKUP', () => {
    const msg =
      '详细6天住宿和餐饮方案，黄金圈南岸到冰河湖，酒店推荐和每日用餐策略';
    const req = base({
      trip_id: 't1',
      message: msg,
      options: { intent_mode: 'TRIP_PLANNING', use_state_machine_orchestration: true },
    });
    expect(shouldForceDataLookupForBoundTripReview(req)).toBe(true);
    expect(applyBoundTripReviewRouteAndRunOverrideInPlace(req)).toBe(true);
    expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
    const s = signalsFromRequest(req);
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 显式改排第 N 天 → TRIP_PLANNING（与分析复盘区分）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '请将第3天行程优化为更轻松的节奏',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + recommend hotels (EN) → DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'recommend hotels near Vik',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 第三天轻松点改排 → TRIP_PLANNING（勿被 DATA_LOOKUP profile 误判轻量咨询）', () => {
    const msg = '第三天的行程可以轻松点吗';
    expect(shouldRouteBoundTripAsItineraryAdjust('t1', msg)).toBe(true);
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: msg,
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
    expect(s.intent_mode_resolved).toBe('TRIP_PLANNING');
  });

  it('options.intent_mode=GENERIC_QA + 第三天轻松点 → 钳回 TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '第三天的行程可以轻松点吗',
        options: { intent_mode: 'GENERIC_QA' },
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.intent_mode_resolved).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
  });

  it('intent.recognize 误传 DATA_LOOKUP + 第三天轻松点 → routingSignalsWithResolvedTaskType 钳回 TRIP_PLANNING', () => {
    const req = base({
      trip_id: 't1',
      message: '第三天的行程可以轻松点吗',
    });
    const s = routingSignalsWithResolvedTaskType(req, 'DATA_LOOKUP');
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
  });

  it('有 trip_id + 换酒店（改行程）→ 仍为 TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '换酒店到雷克雅未克市区',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 明确规划动词 → 仍为 TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '帮我规划冰岛7天行程',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
  });

  it('有 trip_id + 我想去… → 仍为 TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '我想去冰岛玩5天',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 英文 budget guide → DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'Iceland travel budget guide',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('options.intent_mode=TRIP_PLANNING 落在轻量咨询句 → DATA_LOOKUP（契约：咨询≠深规划状态机）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '冰岛旅行预算指南',
        options: { intent_mode: 'TRIP_PLANNING' },
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.intent_mode_requested).toBe('TRIP_PLANNING');
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('options.intent_mode=TRIP_PLANNING + 改排句 → 仍为 TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '请把第三天行程改轻松一点',
        options: { intent_mode: 'TRIP_PLANNING' },
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.intent_mode_resolved).toBe('TRIP_PLANNING');
  });

  it('options.intent_mode=GENERIC_QA 可覆盖推断', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '随便问问',
        options: { intent_mode: 'GENERIC_QA' },
      }),
    );
    expect(s.taskType).toBe('GENERIC_QA');
    expect(s.intent_mode_resolved).toBe('GENERIC_QA');
  });

  it('options.intent_mode=GENERIC_QA + trip_id + 明确改行程 → 钳回 TRIP_PLANNING（防深度思考误传 intent）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
        message:
          '我接受折中方案。请将原行程修改为：6月5日按原计划游览斯奈山，6月6日从斯奈山自驾前往西峡湾派特森峡湾游览丁坚地瀑布，6月7日自驾返回雷克雅未克。请为我生成新的行程JSON并评估具体驾驶时间。',
        options: { intent_mode: 'GENERIC_QA' },
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.intent_mode_resolved).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
  });

  it('混合「自驾 1 天 + 预算」→ 预算优先为 DATA_LOOKUP（避免规划链缺参）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '冰岛黄金圈自驾 1 天，预算',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 穿搭/必备清单类咨询 → DATA_LOOKUP（不应误判为规划行程）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '冰岛必备穿搭清单',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 元对话（你能做什么）→ DATA_LOOKUP，优先于 TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '您好，你能做什么',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 纯寒暄你好 → DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '你好',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 明确规划句 → 仍为 TRIP_PLANNING（元对话短路不误伤）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '你好，帮我规划冰岛7天行程',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 冰爪/装备行前问 → DATA_LOOKUP（避免 SYSTEM1 地点空窗）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '6月初需要带冰爪吗？',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 行前准备咨询 → DATA_LOOKUP（携带行程上下文）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '我需要做哪些准备呢',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 查看第 N 天行程 → DATA_LOOKUP（只读查看，不重规划）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '查看第三天的行程',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 查看行程规划情况 → DATA_LOOKUP（「规划」在规划情况中勿判成重规划）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '查看行程的规划情况',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 行程进度/状态问法 → DATA_LOOKUP（不误入规划卡片流）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '您好，行程目前是什么情况',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 目前安排 → DATA_LOOKUP（不被「安排」规划动词误杀）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '目前安排怎么样',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + trip status (EN) → DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: "What's the status of my itinerary?",
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 英文「修改/生成行程」→ TRIP_PLANNING（勿因咨询词根误判 DATA_LOOKUP）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message:
          'Please modify the original itinerary to visit Snæfellsnes on June 5, drive to Patreksfjörður on June 6 for Dynjandi, then Reykjavik on June 7. Generate a new itinerary JSON and estimate driving time.',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
  });

  it('有 trip_id + 英文 apply compromise + update itinerary → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'I accept the compromise. Please update the itinerary and apply the compromise plan.',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
  });

  it('有 trip_id + 中文改行程含「自驾」→ TRIP_PLANNING（勿被交通咨询「自驾」子串误判 DATA_LOOKUP）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
        message:
          '我接受折中方案。请将原行程修改为：6月5日按原计划游览斯奈山，6月6日从斯奈山自驾前往西峡湾派特森峡湾游览丁坚地瀑布，6月7日自驾返回雷克雅未克。请为我生成新的行程JSON并评估具体驾驶时间。',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.requiresStructuredOutput).toBe(true);
  });

  it('有 trip_id + 纯用车咨询（自驾租车）→ 仍为 DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '冰岛自驾怎么租车？需要国际驾照吗',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 西峡湾路段接驳意愿（不开车/小飞机/再租车）→ DATA_LOOKUP（行程内咨询；勿被 segment 信号误判 TRIP_PLANNING）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '雷克雅未克到西峡湾这段不开车了，想坐小飞机，后面再租车。',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
    expect(s.intent_mode_resolved).toBe('DATA_LOOKUP');
  });

  it('有 trip_id + 西峡湾路段显式改成小飞机 → TRIP_PLANNING（强改稿仍走规划）', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '雷克雅未克到西峡湾这段改成小飞机，后面租车。',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 路段改交通（无「这段」但含从 A 到 B + 不开车）→ TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '从雷克雅未克到西峡湾我不开车了，想改坐飞机过去。',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + EN Westfjords leg modal preference (won’t drive, small plane) → DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: "From Reykjavik to the Westfjords I won't drive; I want to take a small plane then rent a car later.",
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.requiresStructuredOutput).toBe(false);
  });

  it('有 trip_id + 这段改成坐渡轮（口语「改成」）→ TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '雷克雅未克到斯蒂基斯霍尔米这段改成坐渡轮，后面段再租车。',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 从 A 到 B 换乘火车 → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '从阿克雷里到雷克雅未克我想换乘火车，不开车了。',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + switch to ferry for this leg → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'For the Snæfellsnes leg please switch to the ferry; we will rent a car after that.',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 这段改乘地铁 → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '市区这段改乘地铁吧，不开车了。',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + switch to helicopter / metro → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'Please switch to a helicopter for the peninsula hop; next segment we can use the metro.',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 从机场我想换乘网约车 → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '从凯夫拉维克机场到雷克雅未克我想换乘网约车，不自驾了。',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 这段改乘接驳车 / 想坐缆车 → TRIP_PLANNING', () => {
    const s1 = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '景区门口到酒店这段改乘接驳车吧，不开车了。',
      }),
    );
    expect(s1.taskType).toBe('TRIP_PLANNING');
    const s2 = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '山顶这段想坐缆车上去，不开车了。',
      }),
    );
    expect(s2.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + switch to cable car / airport shuttle → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'Please switch to the cable car for the mountain segment; next day we can take the airport shuttle.',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + 磁悬浮 / 水上巴士 / 共享单车（锚点句）→ TRIP_PLANNING', () => {
    const s1 = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '进城这段改成磁悬浮吧，不开车了。',
      }),
    );
    expect(s1.taskType).toBe('TRIP_PLANNING');
    const s2 = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '从码头到对岸我想改乘水上巴士，不自驾了。',
      }),
    );
    expect(s2.taskType).toBe('TRIP_PLANNING');
    const s3 = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '市区这段换乘共享单车，不开车了。',
      }),
    );
    expect(s3.taskType).toBe('TRIP_PLANNING');
  });

  it('有 trip_id + switch to maglev / water taxi / e-scooter → TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'Please switch to maglev for the airport link; fjord hop switch to water taxi; last mile an e-scooter is fine.',
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
  });
});

describe('isWeatherRoadConditionFocusedQuery', () => {
  it('行程内「天气与路况」汇总 → 天气路况聚焦（勿与纯租车咨询混淆）', () => {
    const msg = '结合当前行程，帮我汇总目的地近期需要注意的天气与路况';
    expect(isWeatherRoadConditionFocusedQuery(msg)).toBe(true);
    expect(isTripStatusOverviewQuery(msg, msg.toLowerCase())).toBe(true);
  });

  it('纯租车咨询 → 非天气路况聚焦', () => {
    expect(isWeatherRoadConditionFocusedQuery('什么时候租车比较合适')).toBe(false);
  });

  it('同时强调租车/自驾 → 非天气路况聚焦（保留租车主旨路径）', () => {
    expect(isWeatherRoadConditionFocusedQuery('租车自驾天气路况要注意什么')).toBe(false);
  });
});

describe('signalsFromRequest — route class golden 对齐', () => {
  const base = (overrides: Partial<RouteAndRunRequestDto>): RouteAndRunRequestDto => ({
    request_id: 'r-golden',
    user_id: 'u1',
    message: '',
    ...overrides,
  });

  it('无 trip 显式规划 → TRIP_PLANNING', () => {
    expect(
      signalsFromRequest(base({ message: '帮我规划东京 5 天亲子游，要浅草寺和迪士尼' })).taskType,
    ).toBe('TRIP_PLANNING');
  });

  it('英文 plan a N-day trip → TRIP_PLANNING', () => {
    expect(
      signalsFromRequest(
        base({ message: 'Plan a minimal 2-day trip to Reykjavik for one traveler.' }),
      ).taskType,
    ).toBe('TRIP_PLANNING');
  });

  it('绑定 trip 开放时间 → DATA_LOOKUP', () => {
    expect(
      signalsFromRequest(
        base({
          trip_id: '00000000-0000-4000-8000-000000000003',
          message: 'Dynjandi 瀑布周二开放吗',
        }),
      ).taskType,
    ).toBe('DATA_LOOKUP');
  });

  it('退款+支付凭证 → HIGH risk', () => {
    const s = signalsFromRequest(
      base({ message: '我要退款并投诉供应商，涉及支付凭证' }),
    );
    expect(s.taskType).toBe('CUSTOMER_SUPPORT');
    expect(s.risk).toBe('HIGH');
  });

  it('绑定 trip 不要改 → TRIP_PLANNING（非咨询）', () => {
    expect(
      signalsFromRequest(
        base({
          trip_id: '00000000-0000-4000-8000-000000000004',
          message: '暴风雪天仍按原计划走F路高地，不要改',
        }),
      ).taskType,
    ).toBe('TRIP_PLANNING');
  });
});

describe('Route-and-Run capability matrix', () => {
  const base = (overrides: Partial<RouteAndRunRequestDto>): RouteAndRunRequestDto => ({
    request_id: 'cap-matrix',
    user_id: 'u1',
    message: '',
    ...overrides,
  });

  it.each([
    {
      name: '局部路线优化：已有行程第 N 天路线顺序',
      req: base({ trip_id: 't1', message: '帮我优化第5天的路线顺序，减少交通时间' }),
      taskType: 'TRIP_PLANNING',
      capability: 'PLANNING_AND_REVISION',
      actionKind: 'EXISTING_TRIP_ROUTE_OPTIMIZATION',
      structured: true,
    },
    {
      name: '咨询快答：绑定行程的门票事实',
      req: base({ trip_id: 't1', message: '蓝湖门票需要多久提前订' }),
      taskType: 'DATA_LOOKUP',
      capability: 'FAST_QA',
      actionKind: 'TRIP_SCOPED_CONSULTATION',
      structured: false,
    },
    {
      name: '行程小改：删除已有景点',
      req: base({ trip_id: 't1', message: '删除第3天的蓝湖景点' }),
      taskType: 'TRIP_PLANNING',
      capability: 'CRUD_EDIT',
      actionKind: 'LOCAL_ITINERARY_EDIT',
      structured: true,
    },
    {
      name: '安全节奏协商：三人格评估',
      req: base({ trip_id: 't1', message: '让 Abu、Dr.Dre、Neptune 看看这段行程有没有风险和节奏问题' }),
      taskType: 'DATA_LOOKUP',
      capability: 'SAFETY_NEGOTIATION',
      actionKind: 'SAFETY_OR_TRADEOFF_REVIEW',
      structured: false,
    },
    {
      name: '成功后交付：日历/PDF/分享',
      req: base({ trip_id: 't1', message: '把当前行程导出 PDF，并生成日历和分享链接' }),
      taskType: 'TRIP_PLANNING',
      capability: 'DELIVERY',
      actionKind: 'BOOKING_OR_DELIVERY_HANDOFF',
      structured: true,
    },
    {
      name: '缺信息澄清：用户提交澄清答案',
      req: base({
        trip_id: 't1',
        message: '选择冰岛南部',
        clarification_answers: [{ questionId: 'destination_scope_too_sparse', value: '冰岛 南部' }],
      }),
      taskType: 'TRIP_PLANNING',
      capability: 'CLARIFICATION',
      actionKind: 'CLARIFICATION_RESPONSE',
      structured: true,
    },
  ])('$name', ({ req, taskType, capability, actionKind, structured }) => {
    const s = signalsFromRequest(req);
    expect(s.taskType).toBe(taskType);
    expect(s.capability).toBe(capability);
    expect(s.actionKind).toBe(actionKind);
    expect(s.requiresStructuredOutput).toBe(structured);
  });

  it('Plan Studio intent_mode=TRIP_PLANNING + 团队结构化讨论 → DATA_LOOKUP / TEAM_STRUCTURED_DISCUSSION', () => {
    const s = signalsFromRequest(
      base({
        trip_id: '492ff5d0-8461-461a-b975-3f65474e8108',
        conversation_context: {
          recent_messages: ['用户: 住宿选公寓还是木屋？帮团队结构化讨论一下'],
        },
        options: { intent_mode: 'TRIP_PLANNING' },
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
    expect(s.actionKind).toBe('TEAM_STRUCTURED_DISCUSSION');
    expect(s.capability).toBe('SAFETY_NEGOTIATION');
  });
});
