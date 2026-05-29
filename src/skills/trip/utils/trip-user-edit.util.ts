import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import type { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';

export type TripUserEditType = 'add' | 'update' | 'delete' | 'move';

export interface TripUserEdit {
  type: TripUserEditType;
  itemId?: string;
  placeId?: number;
  tripDayId?: string;
  startTime?: string;
  endTime?: string;
  updates?: Record<string, unknown>;
  newTripDayId?: string;
  newStartTime?: string;
  newEndTime?: string;
}

export interface TripUserEditResult {
  success: boolean;
  results: Array<{ type: string; success: boolean; error?: string }>;
  appliedCount: number;
  totalCount: number;
  error?: string;
}

export async function applyTripUserEdits(
  itineraryItemsService: ItineraryItemsService,
  edits: TripUserEdit[],
): Promise<TripUserEditResult> {
  const editsArray = Array.isArray(edits) ? edits : edits ? [edits] : [];
  if (editsArray.length === 0) {
    return {
      success: false,
      results: [],
      appliedCount: 0,
      totalCount: 0,
      error: 'edits array cannot be empty',
    };
  }

  const results: Array<{ type: string; success: boolean; error?: string }> = [];

  for (const edit of editsArray) {
    try {
      if (edit.type === 'delete' && edit.itemId) {
        await itineraryItemsService.remove(edit.itemId);
        results.push({ type: 'delete', success: true });
      } else if (edit.type === 'update' && edit.itemId && edit.updates) {
        await itineraryItemsService.update(edit.itemId, edit.updates);
        results.push({ type: 'update', success: true });
      } else if (edit.type === 'add' && edit.tripDayId && edit.startTime && edit.endTime) {
        await itineraryItemsService.create({
          tripDayId: edit.tripDayId,
          placeId: edit.placeId,
          type: ItemType.ACTIVITY,
          startTime: edit.startTime,
          endTime: edit.endTime,
          note: typeof edit.updates?.note === 'string' ? edit.updates.note : undefined,
        });
        results.push({ type: 'add', success: true });
      } else if (edit.type === 'move' && edit.itemId) {
        const updateData: Record<string, unknown> = {};
        if (edit.newTripDayId) updateData.tripDayId = edit.newTripDayId;
        if (edit.newStartTime) updateData.startTime = edit.newStartTime;
        if (edit.newEndTime) updateData.endTime = edit.newEndTime;
        if (Object.keys(updateData).length > 0) {
          await itineraryItemsService.update(edit.itemId, updateData);
          results.push({ type: 'move', success: true });
        } else {
          results.push({ type: 'move', success: false, error: 'No update data provided' });
        }
      } else {
        results.push({
          type: edit.type || 'unknown',
          success: false,
          error: 'Invalid edit format',
        });
      }
    } catch (error: unknown) {
      results.push({
        type: edit.type || 'unknown',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const appliedCount = results.filter((r) => r.success).length;
  return {
    success: results.every((r) => r.success),
    results,
    appliedCount,
    totalCount: results.length,
  };
}
