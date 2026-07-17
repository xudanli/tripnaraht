import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import {
  mapMicroPlanScheduleToCommitDrafts,
  productIdNameHints,
} from './same-day-commit-map.util';
import type { MicroPlanScheduleSlot } from '../types/contextual-recommendations.types';

describe('same-day-commit-map.util', () => {
  const schedule: MicroPlanScheduleSlot[] = [
    {
      type: 'HOTEL_CHECK_IN',
      startTime: '18:15',
      endTime: '18:45',
      title: '办理入住、放置行李',
    },
    {
      type: 'DINING',
      startTime: '19:00',
      endTime: '20:00',
      title: '酒店附近晚餐',
    },
    {
      type: 'LIGHT_ACTIVITY',
      startTime: '20:10',
      endTime: '20:30',
      title: '太阳航海者',
      productId: 'poi_sun_voyager',
    },
    {
      type: 'TRANSFER',
      startTime: '20:30',
      endTime: '21:00',
      title: '返回酒店',
    },
  ];

  it('maps schedule to commit drafts and skips TRANSFER', () => {
    const drafts = mapMicroPlanScheduleToCommitDrafts(schedule);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].type).toBe(ItemType.REST);
    expect(drafts[1].type).toBe(ItemType.MEAL_FLOATING);
    expect(drafts[2].type).toBe(ItemType.ACTIVITY);
    expect(drafts[2].note).toContain('productId=poi_sun_voyager');
    expect(productIdNameHints('poi_sun_voyager')).toContain('Sun Voyager');
  });
});
