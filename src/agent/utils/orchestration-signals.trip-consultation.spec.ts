import {
  isFactualMacroStatQuery,
  isLocalClockOrTimezoneFactQuery,
  isTripStatusOverviewQuery,
  isWeatherRoadConditionFocusedQuery,
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

  it('有 trip_id + recommend hotels (EN) → DATA_LOOKUP', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: 'recommend hotels near Vik',
      }),
    );
    expect(s.taskType).toBe('DATA_LOOKUP');
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

  it('options.intent_mode=TRIP_PLANNING 覆盖咨询句 → 仍为 TRIP_PLANNING', () => {
    const s = signalsFromRequest(
      base({
        trip_id: 't1',
        message: '冰岛旅行预算指南',
        options: { intent_mode: 'TRIP_PLANNING' },
      }),
    );
    expect(s.taskType).toBe('TRIP_PLANNING');
    expect(s.intent_mode_requested).toBe('TRIP_PLANNING');
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
