/**
 * Exported defaults for automation authorization reset / user templates.
 */

import type { AutomationPolicy } from '../types/travel-decision-contract.types';

export const DEFAULT_AUTOMATION_EXPORT: AutomationPolicy = {
  defaultLevel: 'SUGGEST',
  autoAllowed: [
    'refresh_road_weather_evidence',
    'shift_meal_within_30min',
    'add_activity_buffer_15min',
  ],
  confirmationRequired: [
    'remove_poi',
    'change_lodging',
    'increase_cost',
    'change_intercity_route',
  ],
};
