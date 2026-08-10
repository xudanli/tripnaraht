/**
 * Guide-to-Plan → route_and_run import_preview 适配（查已有 session，不新建意图）。
 */
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ImportPreviewCardV1 } from './conversation-turn-result.types';

export type GuideToPlanSessionAssemblePayload = {
  session_id: string;
  summary_zh: string;
  status: ImportPreviewCardV1['status'];
  matched_day_iso?: string;
  conflicts_zh?: string[];
  missing_zh?: string[];
  source_hint?: string;
};

function mapSessionStatus(status: string): ImportPreviewCardV1['status'] {
  const s = status.toLowerCase();
  if (s === 'draft_ready' || s === 'accepted') return 'ready_to_write';
  if (s === 'understanding' || s === 'awaiting_context') return 'matched';
  if (s === 'parsing' || s === 'collecting') return 'parsed';
  if (s === 'generating') return 'matched';
  return 'parsed';
}

/**
 * 按 trip / user 查找最近未放弃的 G2P session。
 */
export async function resolveGuideToPlanSessionForConversation(params: {
  prisma: PrismaService;
  tripId?: string | null;
  userId?: string | null;
}): Promise<GuideToPlanSessionAssemblePayload | null> {
  const tripId = params.tripId?.trim();
  const userId = params.userId?.trim();
  if (!tripId && !userId) return null;

  try {
    const session = await params.prisma.guideToPlanSession.findFirst({
      where: {
        status: { not: 'abandoned' },
        ...(tripId ? { tripId } : {}),
        ...(!tripId && userId ? { userId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        themeNarrative: true,
        understandingSummary: true,
        destination: true,
      },
    });
    if (!session) return null;

    const summaryJson = session.understandingSummary as
      | { potentialIssues?: string[]; placeCount?: number; unmatchedPlaceCount?: number }
      | null;
    const issues = Array.isArray(summaryJson?.potentialIssues)
      ? summaryJson!.potentialIssues!.map(String).slice(0, 5)
      : [];
    const missing: string[] = [];
    if ((summaryJson?.unmatchedPlaceCount ?? 0) > 0) {
      missing.push(`有 ${summaryJson!.unmatchedPlaceCount} 个地点尚未匹配行程`);
    }

    const summary =
      String(session.themeNarrative ?? '').trim() ||
      (session.destination
        ? `已导入与「${session.destination}」相关的攻略内容，请确认后写入。`
        : '已找到进行中的攻略导入会话，请确认匹配与冲突后写入。');

    return {
      session_id: session.id,
      summary_zh: summary,
      status: mapSessionStatus(session.status),
      ...(issues.length ? { conflicts_zh: issues } : {}),
      ...(missing.length ? { missing_zh: missing } : {}),
      source_hint: 'guide_to_plan_session',
    };
  } catch {
    return null;
  }
}
