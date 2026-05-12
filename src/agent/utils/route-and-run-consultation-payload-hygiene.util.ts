import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';

/**
 * 咨询 / 轻量问答响应：最终再清一次「可渲染行程」字段，避免中间层或历史合并把
 * timeline / poi_cards 带进 Network 响应（前端若只认 payload 会误渲染旧草案）。
 */
export function shouldApplyConsultationItineraryPayloadHygiene(
  response: RouteAndRunResponseDto,
): boolean {
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  if (!payload) return false;
  const obs = response.observability as { lightweight_knowledge_qa?: boolean } | undefined;
  return (
    payload['ui_surface'] === 'consultation' ||
    payload['consultation_itinerary_payload_suppressed'] === true ||
    obs?.lightweight_knowledge_qa === true
  );
}

export function applyConsultationItineraryPayloadHygiene(response: RouteAndRunResponseDto): void {
  if (!shouldApplyConsultationItineraryPayloadHygiene(response)) return;
  const payload = response.result?.payload as Record<string, unknown> | undefined;
  if (!payload) return;

  payload['timeline'] = [];
  delete payload['poi_cards'];
  delete payload['poi_cards_by_day'];
  delete payload['poi_cards_meta'];

  const orch = payload['orchestrationResult'] as Record<string, unknown> | undefined;
  if (!orch || typeof orch !== 'object') return;
  const it = orch['itinerary'] as { days?: unknown[] } | undefined;
  if (it && typeof it === 'object') {
    it.days = [];
  }
}
