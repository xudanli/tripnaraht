/**
 * Chat 出卡类问法：有 trip 时强制 async_mode=OFF，并跳过重 ContextEnricher / Memory digest。
 * （FORCE 异步易卡在 INTAKE，酒店/租车已踩坑。）
 */

import { isHotelInventorySearchQuery } from '../utils/orchestration-signals.util';
import { isDayLodgingChoiceQuery } from '../utils/day-lodging-choice.util';
import { isCarRentalChatCardQuery } from './build-car-rental-chat-cards.util';
import { isFlightChatCardQuery } from './build-flight-chat-cards.util';
import { isRestaurantChatCardQuery } from './build-restaurant-chat-cards.util';
import { isActivityAdvanceBookingConsultQuery } from './build-activity-booking-chat-cards.util';
import { isXhsCommunityEvidenceConsultQuery } from './build-xhs-note-chat-cards.util';
import { isActivityRecommendationQuery } from '../../trips/wishlist/utils/wish-prompt-injection.util';

/** 活动/景点出卡：预订咨询 + wishlist 活动推荐 + 常见推荐话术 */
function isActivityInventoryCardQuery(message: string): boolean {
  if (isActivityAdvanceBookingConsultQuery(message)) return true;
  if (isActivityRecommendationQuery(message)) return true;
  const m = String(message ?? '').trim();
  if (!m) return false;
  return (
    /推荐(活动|景点|体验|玩法|项目)|活动推荐|景点推荐|体验推荐|隐藏景点|值得去的|有什么玩的|附近有什么(玩|看)|一日游|跟团|徒步推荐|观光推荐/i.test(
      m,
    ) ||
    (/(活动|景点|体验|门票)/.test(m) && /推荐|比价|预订|预约|订票|哪家|哪里/.test(m))
  );
}

export function isInventoryCardSyncQuery(message: string): boolean {
  const m = String(message ?? '').trim();
  if (!m) return false;
  return (
    isHotelInventorySearchQuery(m) ||
    isDayLodgingChoiceQuery(m) ||
    isCarRentalChatCardQuery(m) ||
    isFlightChatCardQuery(m) ||
    isRestaurantChatCardQuery(m) ||
    isActivityInventoryCardQuery(m) ||
    isXhsCommunityEvidenceConsultQuery(m) ||
    /住宿推荐|推荐住宿/.test(m)
  );
}
