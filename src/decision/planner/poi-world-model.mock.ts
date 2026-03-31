export type PoiType = 'culture' | 'city' | 'relax' | 'landmark' | 'food';
export type BestTimeSlot = 'morning' | 'afternoon' | 'night';

export interface WorldPoiRecord {
  id: string;
  name: string;
  type: PoiType;
  best_time: BestTimeSlot;
  duration: number;
  rating: number;
  price_level: 1 | 2 | 3 | 4;
  opening_hours?: {
    start: string;
    end: string;
  };
  coordinates: { lat: number; lng: number };
}

const TOKYO_POI: WorldPoiRecord[] = [
  {
    id: 'tokyo-sensoji',
    name: '浅草寺',
    type: 'culture',
    best_time: 'morning',
    duration: 90,
    rating: 4.7,
    price_level: 1,
    opening_hours: { start: '06:00', end: '17:00' },
    coordinates: { lat: 35.7148, lng: 139.7967 },
  },
  {
    id: 'tokyo-shibuya-crossing',
    name: '涩谷十字路口',
    type: 'city',
    best_time: 'afternoon',
    duration: 60,
    rating: 4.6,
    price_level: 1,
    coordinates: { lat: 35.6595, lng: 139.7005 },
  },
  {
    id: 'tokyo-meiji-jingu',
    name: '明治神宫',
    type: 'relax',
    best_time: 'afternoon',
    duration: 90,
    rating: 4.8,
    price_level: 1,
    opening_hours: { start: '06:00', end: '18:00' },
    coordinates: { lat: 35.6764, lng: 139.6993 },
  },
  {
    id: 'tokyo-tower',
    name: '东京塔',
    type: 'landmark',
    best_time: 'night',
    duration: 60,
    rating: 4.5,
    price_level: 2,
    opening_hours: { start: '09:00', end: '22:30' },
    coordinates: { lat: 35.6586, lng: 139.7454 },
  },
  {
    id: 'tokyo-ginza-sushi',
    name: '银座午餐（推荐：寿司）',
    type: 'food',
    best_time: 'afternoon',
    duration: 75,
    rating: 4.7,
    price_level: 3,
    opening_hours: { start: '11:00', end: '15:00' },
    coordinates: { lat: 35.6717, lng: 139.765 },
  },
  {
    id: 'tokyo-imperial-east-garden',
    name: '皇居外苑',
    type: 'culture',
    best_time: 'afternoon',
    duration: 75,
    rating: 4.4,
    price_level: 1,
    coordinates: { lat: 35.6852, lng: 139.7528 },
  },
  {
    id: 'tokyo-omotesando',
    name: '原宿表参道步行街',
    type: 'city',
    best_time: 'afternoon',
    duration: 75,
    rating: 4.4,
    price_level: 2,
    coordinates: { lat: 35.6652, lng: 139.7123 },
  },
];

export function resolveMockPoiWorldModel(destination: string): WorldPoiRecord[] {
  const d = destination.toLowerCase();
  if (d.includes('东京') || d.includes('tokyo')) return TOKYO_POI;
  return [
    {
      id: 'generic-landmark',
      name: `${destination}城市地标`,
      type: 'landmark',
      best_time: 'morning',
      duration: 90,
      rating: 4.2,
      price_level: 2,
      coordinates: { lat: 0, lng: 0 },
    },
    {
      id: 'generic-city',
      name: `${destination}核心街区`,
      type: 'city',
      best_time: 'afternoon',
      duration: 90,
      rating: 4.1,
      price_level: 2,
      coordinates: { lat: 0, lng: 0 },
    },
    {
      id: 'generic-food',
      name: `${destination}本地午餐`,
      type: 'food',
      best_time: 'afternoon',
      duration: 75,
      rating: 4.0,
      price_level: 2,
      coordinates: { lat: 0, lng: 0 },
    },
    {
      id: 'generic-night',
      name: `${destination}夜景点`,
      type: 'landmark',
      best_time: 'night',
      duration: 60,
      rating: 4.1,
      price_level: 2,
      coordinates: { lat: 0, lng: 0 },
    },
  ];
}
