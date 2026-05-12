/** P1：transport.search 降级时给编排/叙事用的用户向文案（避免暴露内部错误码） */
export const TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH =
  '为了帮您规划可靠路线，请补充出发地与目的地的具体地点或地图上的点（例如城市、车站或直接发送经纬度）。仅说「起点」「终点」等词时，系统无法唯一定位。';

export const TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY = 'clarify_origin_destination' as const;
