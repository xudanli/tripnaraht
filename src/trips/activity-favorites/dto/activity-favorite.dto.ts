export interface ActivityFavoriteItemDto {
  targetKey: string;
  itineraryItemId?: string | null;
  placeId?: number | null;
  favoritedAt: string;
}

export interface ActivityFavoritesListResponse {
  tripId: string;
  userId: string;
  favorites: ActivityFavoriteItemDto[];
  itineraryItemIds: string[];
  placeIds: number[];
  total: number;
}

export interface SetActivityFavoriteDto {
  /** 行程内活动项 ID（与 placeId 二选一） */
  itineraryItemId?: string;
  /** POI Place ID（与 itineraryItemId 二选一） */
  placeId?: number;
  /** true 收藏，false 取消收藏 */
  favorited: boolean;
}

export interface SetActivityFavoriteResponse {
  tripId: string;
  userId: string;
  favorited: boolean;
  targetKey: string;
  itineraryItemId?: string | null;
  placeId?: number | null;
  favorites: ActivityFavoriteItemDto[];
  itineraryItemIds: string[];
  placeIds: number[];
  total: number;
}
