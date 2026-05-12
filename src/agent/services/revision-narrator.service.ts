import { Injectable } from '@nestjs/common';

export type RevisionNarratorInput = {
  kind: string;
  resolutionType: string | null;
  resolutionPatchSummary: string | null;
  deltaTimeMinutes: number | null;
  deltaCostUsd: number | null;
  interruptedCount: number;
};

export type InterruptedItemRef = { item_id: string; field: string; display_name?: string };

function flattenSnapshotItems(snapshot: unknown): any[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const days = (snapshot as any).days;
  if (!Array.isArray(days)) return [];
  return days.flatMap((day: any) => (Array.isArray(day?.items) ? day.items : []));
}

function itemDisplayLabelFromRow(it: any): string | null {
  if (!it || typeof it !== 'object') return null;
  const n =
    it?.location_ref?.name ??
    it?.name ??
    it?.title ??
    it?.place?.name ??
    it?.context?.station ??
    it?.context?.place_name ??
    it?.location_ref?.place_id;
  if (n == null || String(n).trim() === '') return null;
  return String(n).trim();
}

function formatRollbackRestorePhrase(bracketed: string[]): string {
  if (bracketed.length === 1) return bracketed[0];
  if (bracketed.length === 2) return `${bracketed[0]} 和 ${bracketed[1]}`;
  return `${bracketed.slice(0, -1).join('、')} 和 ${bracketed[bracketed.length - 1]}`;
}

/**
 * Turns structured revision / audit columns into a short human-readable line (default zh).
 * Extend with locale keys or parallel narrative_en when product needs i18n.
 */
@Injectable()
export class RevisionNarratorService {
  /**
   * Resolves interrupted item_ids against revision snapshot for a short impact line (default zh).
   */
  summarizeImpactFromSnapshot(
    interrupted: Array<{ item_id: string; field: string }>,
    snapshot: unknown,
    options?: { locale?: 'zh' | 'en' },
  ): string {
    const locale = options?.locale ?? 'zh';
    if (!interrupted?.length) return '';
    if (locale !== 'zh') {
      return this.summarizeImpactFromSnapshotZh(interrupted, snapshot);
    }
    return this.summarizeImpactFromSnapshotZh(interrupted, snapshot);
  }

  /**
   * Per-revision impact copy for timeline / “决策地图”：ROLLBACK 用恢复准点话术，其余走通用摘要。
   */
  getImpactSummary(params: {
    kind: string;
    interrupted_items: Array<{ item_id: string; field: string }>;
    snapshot: unknown;
  }): string {
    const interrupted = params.interrupted_items ?? [];
    if (!interrupted.length) return '';

    const k = String(params.kind ?? '').toUpperCase();
    if (k === 'ROLLBACK') {
      const names = this.resolveInterruptedNames(interrupted, params.snapshot);
      if (names.length) {
        const bracketed = names.map((n) => `[${n}]`);
        return `此次回滚恢复了 ${formatRollbackRestorePhrase(bracketed)} 的准点状态。`;
      }
      return `此次回滚恢复了 ${interrupted.length} 处时间点或预约相关字段的准点状态。`;
    }

    return this.summarizeImpactFromSnapshotZh(interrupted, params.snapshot);
  }

  /** 为 interrupted_items 附加 display_name，便于前端高亮与地图映射。 */
  enrichInterruptedItems(interrupted: Array<{ item_id: string; field: string }>, snapshot: unknown): InterruptedItemRef[] {
    const items = flattenSnapshotItems(snapshot);
    return interrupted.map((inv) => {
      const id = String(inv?.item_id ?? '').trim();
      const it = id ? items.find((x) => String(x?.id ?? x?.item_id ?? '') === id) : null;
      const label = it ? itemDisplayLabelFromRow(it) : null;
      return label ? { ...inv, display_name: label } : { ...inv };
    });
  }

  private resolveInterruptedNames(
    interrupted: Array<{ item_id: string; field: string }>,
    snapshot: unknown,
  ): string[] {
    const items = flattenSnapshotItems(snapshot);
    const names: string[] = [];
    const seen = new Set<string>();
    for (const inv of interrupted) {
      const id = String(inv?.item_id ?? '').trim();
      if (!id) continue;
      const it = items.find((x) => String(x?.id ?? x?.item_id ?? '') === id);
      const label = it ? itemDisplayLabelFromRow(it) : null;
      if (label && !seen.has(label)) {
        seen.add(label);
        names.push(label);
      }
    }
    return names;
  }

  private summarizeImpactFromSnapshotZh(
    interrupted: Array<{ item_id: string; field: string }>,
    snapshot: unknown,
  ): string {
    const names = this.resolveInterruptedNames(interrupted, snapshot);
    if (!names.length) {
      return `此版本涉及 ${interrupted.length} 处时间点或预约相关字段调整。`;
    }
    return `受影响地点或可预订节点：${names.join('、')}。`;
  }

  narrate(input: RevisionNarratorInput, options?: { locale?: 'zh' | 'en' }): { text: string; locale: string } {
    const locale = options?.locale ?? 'zh';
    if (locale !== 'zh') {
      // Placeholder for future i18n; keep deterministic fallback.
      return { text: this.narrateZh(input), locale: 'zh' };
    }
    return { text: this.narrateZh(input), locale: 'zh' };
  }

  private narrateZh(input: RevisionNarratorInput): string {
    const k = String(input.kind ?? '').toUpperCase();
    if (k === 'BASELINE') {
      return '协商前行程基线（确认前快照），用于与后续确认版本对比。';
    }

    if (k === 'ROLLBACK' || String(input.resolutionType ?? '').toUpperCase() === 'ROLLBACK') {
      const dm = input.deltaTimeMinutes;
      if (dm != null && Number.isFinite(dm) && dm < 0) {
        return `一键回滚：相对回滚前版本，主时间轴补偿约 ${Math.abs(dm)} 分钟（审计 delta 为负表示向过去恢复）；已清除 resolution 标记，可重新发起规划。`;
      }
      return '一键回滚：已恢复到选定历史快照；行程状态重置为 PLANNED，可重新发起 route_and_run。';
    }

    const rt = String(input.resolutionType ?? '').toUpperCase();
    const dm = input.deltaTimeMinutes;
    const dc = input.deltaCostUsd;
    const n = Math.max(0, input.interruptedCount);
    const patch = String(input.resolutionPatchSummary ?? '').trim();

    if (rt === 'POSTPONE_SCHEDULE') {
      if (dm != null && Number.isFinite(dm)) {
        return `将全程日程推迟约 ${dm} 分钟，共 ${n} 处时间点或预约字段发生平移。`;
      }
      return patch ? `已应用推迟日程：${patch}` : '已应用推迟日程调整。';
    }

    if (rt === 'UPGRADE_TO_DRIVE') {
      const parts: string[] = ['通过 [打车升级] 完成决策确认'];
      if (dc != null && Number.isFinite(dc) && dc !== 0) {
        parts.push(`成本侧约 ${dc} USD`);
      }
      if (dm != null && Number.isFinite(dm) && dm !== 0) {
        parts.push(`行程时间偏移约 ${dm} 分钟`);
      }
      if (n > 0) {
        parts.push(`影响 ${n} 个行程点的时间字段`);
      }
      return `${parts.join('，')}。`;
    }

    if (patch) {
      return `行程版本已更新：${patch}`;
    }
    return '行程版本已更新（协商确认）。';
  }
}
