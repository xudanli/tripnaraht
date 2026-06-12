/** 意图识别单测共享话术（顾问式整段重规划 vs 单日改排边界） */

export const TRIP_RANGE_6D_ICELAND = {
  start_date: '2026-11-01',
  end_date: '2026-11-06',
} as const;

export const AURORA_DAY_DESIGNATION_MSG = '我应该把那几天定为极光观测日';

export const CONSULTANT_FULL_TRIP_REPLAN_MSG =
  '请根据顾问建议，重新规划我的6天冰岛行程。要求：1）每日车程不超过6小时；' +
  '2）更改路线/目的地为：雷克雅未克→维克→Kirkjubæjarklaustur→返回雷克雅未克；' +
  '3）每天12:00-13:00安排午餐/补给；4）第6天改为返程日，不安排观光活动。';

export const CONSULTANT_FULL_TRIP_REPLAN_DAILY_ONLY_MSG =
  '请重新规划6天行程，每日车程不超过6小时，第6天改为返程日，不安排观光。';

export const WEATHER_FULL_TRIP_REPLAN_MSG =
  '根据你刚才分析的天气风险，请为我调整2026年6月1日至7日的冰岛行程，如果某天预报有强风，请优先安排室内活动或替换到风小的景点，并确保每日车程不超过4小时。';

export const FULL_TRIP_REPLAN_WITH_HOTEL_MSG =
  '请基于当前已确认POI，帮我出一份更合理的6天草案（2026-11-01到11-06），' +
  '包含雷克雅未克和Vik住宿安排、每日适合自驾途中解决的午餐计划。' +
  '假设使用4WD租车从雷克雅未克出发，按逆时针方向组织。请输出待确认行程草案。';

export const SINGLE_DAY_REPLAN_DAY2_MSG = '重新规划一下第二天的行程，现在明显不合理';

export const SINGLE_DAY_DELETE_POI_MSG = '删除第3天的斯科加瀑布poi';
