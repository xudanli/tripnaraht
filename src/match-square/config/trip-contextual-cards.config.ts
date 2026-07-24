/**
 * PRD 3.12/3.13 — Active Trip 动态卡片与 Vault 里程碑 UI 定义（配置驱动）
 */

export interface TripContextualCardDefinition {
  cardId: string;
  titleZh: string;
  descriptionZh: string;
  /** 前端路由或工具 deep link */
  toolRoute: string | null;
  vaultLinked: boolean;
  priority: 'critical' | 'high' | 'normal';
}

export const TRIP_CONTEXTUAL_CARD_DEFINITIONS: Record<string, TripContextualCardDefinition> = {
  offline_dem_pace_corridor: {
    cardId: 'offline_dem_pace_corridor',
    titleZh: '离线 DEM 配速安全线',
    descriptionZh: '12.5m 等高线 · 内陆断网盲导 · GPS 配速走廊',
    toolRoute: '/trips/tools/offline-dem',
    vaultLinked: false,
    priority: 'critical',
  },
  ford_window_planner: {
    cardId: 'ford_window_planner',
    titleZh: '冰川融水涉水时间窗',
    descriptionZh: '清晨低温、流量最小时通过 Fjórðungakvísl 等节点',
    toolRoute: '/trips/tools/ford-planner',
    vaultLinked: false,
    priority: 'critical',
  },
  dyl_canvas_evening: {
    cardId: 'dyl_canvas_evening',
    titleZh: '营地夜间 DYL 画布',
    descriptionZh: '围炉人生复盘 · 电子画布离线素材',
    toolRoute: '/trips/tools/dyl-canvas',
    vaultLinked: false,
    priority: 'normal',
  },
  trip_vault_ledger: {
    cardId: 'trip_vault_ledger',
    titleZh: 'Trip Vault 轧差账本',
    descriptionZh: '炊事/公摊装备费用轧差（Phase 3 授权后解锁）',
    toolRoute: '/trips/tools/vault-ledger',
    vaultLinked: true,
    priority: 'high',
  },
  geek_quiet_dashboard: {
    cardId: 'geek_quiet_dashboard',
    titleZh: '极客静谧看板',
    descriptionZh: '入网窗口 · 静默时段契约',
    toolRoute: '/trips/tools/quiet-dashboard',
    vaultLinked: false,
    priority: 'normal',
  },
  shared_gear_checklist: {
    cardId: 'shared_gear_checklist',
    titleZh: '公摊装备清单',
    descriptionZh: '帐篷/炉具/急救包责任到人',
    toolRoute: null,
    vaultLinked: false,
    priority: 'high',
  },
};

/** Phase 3 — Route Contract Lock 里程碑展示文案 */
export const VAULT_MILESTONE_LABELS: Record<string, string> = {
  hut_landmannalaugar: 'Landmannalaugar  hut · 起点',
  fjordungakvisl_ford: 'Fjórðungakvísl 强涉水节点',
  hut_thorsmork: 'Þórsmörk 终点 hut',
  anji_dna_base: '安吉 DNA 公社基地',
  valley_camp_evening: '山谷星空营地',
  dyl_canvas_night: 'DYL 围炉复盘夜',
};

export function resolveContextualCardDefinitions(cardIds: string[]): TripContextualCardDefinition[] {
  const seen = new Set<string>();
  const out: TripContextualCardDefinition[] = [];
  for (const id of cardIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const def = TRIP_CONTEXTUAL_CARD_DEFINITIONS[id];
    if (def) out.push(def);
  }
  return out.sort((a, b) => {
    const rank = { critical: 0, high: 1, normal: 2 };
    return rank[a.priority] - rank[b.priority];
  });
}

export function resolveVaultMilestoneLabels(ids: string[]): Array<{ id: string; labelZh: string }> {
  return ids.map((id) => ({
    id,
    labelZh: VAULT_MILESTONE_LABELS[id] ?? id,
  }));
}
