import type { WishCategory } from '../types/trip-wish.types';

/** Rule-based category inference from voice transcript (no LLM). */
export function inferWishCategoryFromText(text: string): WishCategory {
  const hasBudgetSignal = /预算|花费|块钱|万元|元|别太贵|经济压力|省钱|超过.*万|压力/.test(text);
  const hasAccommodationSignal = /酒店|住宿|民宿|玻璃屋|旅馆|住一晚|房间/.test(text);

  if (/签证|申根|护照|入境|保险/.test(text)) {
    return 'insurance_visa';
  }
  if (/购物|买|羊毛|纪念品|免税店/.test(text)) {
    return 'shopping';
  }
  if (/航班|飞机|火车|高铁|轮渡|接驳|大交通|国际段/.test(text)) {
    return 'main_transport';
  }
  if (hasBudgetSignal && hasAccommodationSignal) {
    return 'accommodation';
  }
  if (
    /不要太赶|留时间|休息|发呆|松弛|轻松|不紧|慢下来|自然醒|路线|环岛|目的地/.test(text)
  ) {
    return 'destination_route';
  }
  if (hasAccommodationSignal) {
    return 'accommodation';
  }
  if (/吃|餐|热狗|海鲜|美食|餐厅|早餐/.test(text)) {
    return 'dining';
  }
  if (/自驾|驾驶|交通|租车|开车|单日|路程|当地交通/.test(text)) {
    return 'local_transport';
  }
  if (/同行|一起|大家|队友|兼顾|摩擦|摄影|出片|温泉|徒步|极光|活动/.test(text)) {
    return 'activities';
  }
  return 'activities';
}

/** Heuristic importance from phrasing intensity. */
export function inferWishImportanceFromText(text: string): number {
  if (/一定|必须|特别想|超级|最希望|千万/.test(text)) return 5;
  if (/很想|非常|一定想|务必/.test(text)) return 4;
  if (/最好|希望|想要/.test(text)) return 3;
  if (/可以|如果有|顺便/.test(text)) return 2;
  return 3;
}
