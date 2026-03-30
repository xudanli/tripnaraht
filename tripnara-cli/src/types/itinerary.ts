export interface ItineraryItem {
  day: number;
  activity: string;
}

export interface ItineraryPlan {
  query: string;
  days: number;
  plan: ItineraryItem[];
}
