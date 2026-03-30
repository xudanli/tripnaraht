// src/trips/readiness/utils/pack-serializer.util.ts

/**
 * Pack Serializer Utility
 * 
 * 为管理界面提供友好的序列化格式
 */

import { ReadinessPack, Rule, Action, LocalizedString, Condition } from '../types/readiness-pack.types';
import { getLocalizedText } from './i18n.utils';

/**
 * 序列化 Pack 用于管理界面显示
 * 
 * @param pack Pack 对象
 * @param lang 目标语言
 * @returns 序列化后的 Pack 对象
 */
export function serializePackForAdmin(
  pack: ReadinessPack,
  lang: 'zh' | 'en' = 'zh'
): any {
  return {
    ...pack,
    displayName: getLocalizedText(pack.displayName, lang),
    displayNameRaw: pack.displayName,
    // 🆕 序列化 geo 字段（支持多语言）
    geo: {
      ...pack.geo,
      region: typeof pack.geo.region === 'string' 
        ? pack.geo.region 
        : getLocalizedText(pack.geo.region, lang),
      regionRaw: pack.geo.region,
      city: typeof pack.geo.city === 'string'
        ? pack.geo.city
        : getLocalizedText(pack.geo.city, lang),
      cityRaw: pack.geo.city,
    },
    rules: pack.rules.map(rule => serializeRuleForAdmin(rule, lang)),
    checklists: pack.checklists?.map(checklist => serializeChecklistForAdmin(checklist, lang)),
    hazards: pack.hazards?.map(hazard => serializeHazardForAdmin(hazard, lang)),
  };
}

/**
 * 序列化 Rule 用于管理界面显示
 */
function serializeRuleForAdmin(rule: Rule, lang: 'zh' | 'en' = 'zh'): any {
  // 🆕 处理根级别的 message、seasons、tasks（前端文档兼容）
  const rootMessage = rule.message || rule.then?.message;
  const rootSeasons = rule.seasons || rule.appliesTo?.seasons;
  const rootTasks = rule.tasks || rule.then?.tasks;
  
  return {
    ...rule,
    // 🆕 序列化根级别字段
    title: rule.title ? getLocalizedText(rule.title, lang) : undefined,
    titleRaw: rule.title,
    description: rule.description ? getLocalizedText(rule.description, lang) : undefined,
    descriptionRaw: rule.description,
    message: rootMessage ? getLocalizedText(rootMessage, lang) : undefined,
    messageRaw: rootMessage,
    seasons: rootSeasons,
    required: rule.required,
    tasks: rootTasks?.map(task => ({
      ...task,
      title: getLocalizedText(task.title, lang),
      titleRaw: task.title,
    })),
    notes: rule.notes ? getLocalizedText(rule.notes, lang) : undefined,
    notesRaw: rule.notes,
    then: serializeActionForAdmin(rule.then, lang),
    whenDisplay: formatConditionForDisplay(rule.when, lang),
    // 保留原始 when 对象供编辑使用
    when: rule.when,
    // 🆕 用户决策（根级别）
    userDecision: rule.userDecision ? serializeUserDecisionForAdmin(rule.userDecision, lang) : undefined,
  };
}

/**
 * 序列化 Action 用于管理界面显示
 */
function serializeActionForAdmin(action: Action, lang: 'zh' | 'en' = 'zh'): any {
  return {
    level: action.level,
    message: getLocalizedText(action.message, lang),
    messageRaw: action.message, // 保留原始 LocalizedString 供编辑使用
    tasks: action.tasks?.map(task => ({
      ...task,
      title: getLocalizedText(task.title, lang),
      titleRaw: task.title, // 保留原始 LocalizedString 供编辑使用
    })),
    askUser: action.askUser?.map(q => getLocalizedText(q, lang)),
    userDecision: action.userDecision ? serializeUserDecisionForAdmin(action.userDecision, lang) : undefined,
  };
}

/**
 * 序列化 Checklist 用于管理界面显示
 */
function serializeChecklistForAdmin(checklist: any, lang: 'zh' | 'en' = 'zh'): any {
  const items = checklist.items ?? [];
  return {
    ...checklist,
    // 🆕 序列化前端文档兼容字段
    title: checklist.title ? getLocalizedText(checklist.title, lang) : undefined,
    titleRaw: checklist.title,
    description: checklist.description ? getLocalizedText(checklist.description, lang) : undefined,
    descriptionRaw: checklist.description,
    items: items.map((item: LocalizedString) => getLocalizedText(item, lang)),
    itemsRaw: items, // 保留原始 LocalizedString 数组
    required: checklist.required,
    priority: checklist.priority,
    checklistCategory: checklist.checklistCategory,
  };
}

/**
 * 序列化 Hazard 用于管理界面显示
 */
function serializeHazardForAdmin(hazard: any, lang: 'zh' | 'en' = 'zh'): any {
  // 🆕 处理前端文档兼容字段
  const level = hazard.level || hazard.severity;
  const description = hazard.metadata?.description || hazard.summary;
  const precautions = hazard.metadata?.precautions || hazard.mitigations;
  
  return {
    ...hazard,
    // 🆕 序列化前端文档兼容字段
    zoneId: hazard.zoneId,
    level: level,
    levelRaw: hazard.level,
    severity: hazard.severity,
    seasons: hazard.seasons,
    summary: getLocalizedText(hazard.summary, lang),
    summaryRaw: hazard.summary,
    mitigations: (hazard.mitigations ?? []).map((m: LocalizedString) => getLocalizedText(m, lang)),
    mitigationsRaw: hazard.mitigations ?? [], // 保留原始 LocalizedString 数组
    metadata: hazard.metadata ? {
      ...hazard.metadata,
      description: description ? getLocalizedText(description, lang) : undefined,
      descriptionRaw: description,
      precautions: precautions?.map((p: LocalizedString) => getLocalizedText(p, lang)),
      precautionsRaw: precautions,
    } : undefined,
  };
}

/**
 * 序列化 UserDecision 用于管理界面显示
 */
function serializeUserDecisionForAdmin(userDecision: any, lang: 'zh' | 'en' = 'zh'): any {
  return {
    questions: userDecision.questions?.map((q: any) => ({
      ...q,
      question: getLocalizedText(q.question, lang),
      questionRaw: q.question,
      description: q.description ? getLocalizedText(q.description, lang) : undefined,
      placeholder: q.placeholder ? getLocalizedText(q.placeholder, lang) : undefined,
      options: q.options?.map((opt: any) => ({
        ...opt,
        label: getLocalizedText(opt.label, lang),
        labelRaw: opt.label,
        description: opt.description ? getLocalizedText(opt.description, lang) : undefined,
      })),
    })),
    groups: userDecision.groups?.map((g: any) => ({
      ...g,
      title: getLocalizedText(g.title, lang),
      titleRaw: g.title,
      description: g.description ? getLocalizedText(g.description, lang) : undefined,
    })),
    branches: userDecision.branches,
    defaultBranch: userDecision.defaultBranch,
  };
}

/**
 * 格式化 Condition 为可读字符串
 */
function formatConditionForDisplay(condition: Condition | undefined, lang: 'zh' | 'en' = 'zh'): string {
  if (!condition) {
    return lang === 'zh' ? '无条件（总是触发）' : 'No condition (always trigger)';
  }

  // 处理 all 条件
  if (condition.all && condition.all.length > 0) {
    const allParts = condition.all.map(c => formatConditionForDisplay(c, lang));
    return lang === 'zh' 
      ? `所有条件: ${allParts.join(' AND ')}`
      : `All conditions: ${allParts.join(' AND ')}`;
  }

  // 处理 any 条件
  if (condition.any && condition.any.length > 0) {
    const anyParts = condition.any.map(c => formatConditionForDisplay(c, lang));
    return lang === 'zh'
      ? `任一条件: ${anyParts.join(' OR ')}`
      : `Any condition: ${anyParts.join(' OR ')}`;
  }

  // 处理 not 条件
  if (condition.not) {
    const notPart = formatConditionForDisplay(condition.not, lang);
    return lang === 'zh' ? `NOT (${notPart})` : `NOT (${notPart})`;
  }

  // 处理具体条件
  if (condition.exists) {
    return lang === 'zh' ? `存在: ${condition.exists}` : `Exists: ${condition.exists}`;
  }

  if (condition.eq) {
    return lang === 'zh'
      ? `${condition.eq.path} = ${formatValue(condition.eq.value)}`
      : `${condition.eq.path} = ${formatValue(condition.eq.value)}`;
  }

  if (condition.ne) {
    return lang === 'zh'
      ? `${condition.ne.path} != ${formatValue(condition.ne.value)}`
      : `${condition.ne.path} != ${formatValue(condition.ne.value)}`;
  }

  if (condition.gt) {
    return lang === 'zh'
      ? `${condition.gt.path} > ${condition.gt.value}`
      : `${condition.gt.path} > ${condition.gt.value}`;
  }

  if (condition.gte) {
    return lang === 'zh'
      ? `${condition.gte.path} >= ${condition.gte.value}`
      : `${condition.gte.path} >= ${condition.gte.value}`;
  }

  if (condition.lt) {
    return lang === 'zh'
      ? `${condition.lt.path} < ${condition.lt.value}`
      : `${condition.lt.path} < ${condition.lt.value}`;
  }

  if (condition.lte) {
    return lang === 'zh'
      ? `${condition.lte.path} <= ${condition.lte.value}`
      : `${condition.lte.path} <= ${condition.lte.value}`;
  }

  if (condition.in) {
    return lang === 'zh'
      ? `${condition.in.path} IN [${condition.in.values.map(formatValue).join(', ')}]`
      : `${condition.in.path} IN [${condition.in.values.map(formatValue).join(', ')}]`;
  }

  if (condition.containsAny) {
    return lang === 'zh'
      ? `${condition.containsAny.path} 包含任一: [${condition.containsAny.values.join(', ')}]`
      : `${condition.containsAny.path} contains any: [${condition.containsAny.values.join(', ')}]`;
  }

  // 处理地理特征条件
  if (condition.geo) {
    const geoParts: string[] = [];
    
    if (condition.geo.mountains) {
      if (condition.geo.mountains.inMountain !== undefined) {
        geoParts.push(lang === 'zh' 
          ? `在山脉内: ${condition.geo.mountains.inMountain}`
          : `In mountain: ${condition.geo.mountains.inMountain}`);
      }
      if (condition.geo.mountains.mountainElevationAvg) {
        const elev = condition.geo.mountains.mountainElevationAvg;
        const elevStr = Object.entries(elev)
          .map(([op, val]) => `${op === 'gte' ? '>=' : op === 'gt' ? '>' : op === 'lte' ? '<=' : '<'} ${val}`)
          .join(' AND ');
        geoParts.push(lang === 'zh' ? `平均海拔: ${elevStr}` : `Avg elevation: ${elevStr}`);
      }
    }

    if (condition.geo.rivers) {
      if (condition.geo.rivers.nearRiver !== undefined) {
        geoParts.push(lang === 'zh'
          ? `靠近河流: ${condition.geo.rivers.nearRiver}`
          : `Near river: ${condition.geo.rivers.nearRiver}`);
      }
    }

    if (condition.geo.roads) {
      if (condition.geo.roads.nearRoad !== undefined) {
        geoParts.push(lang === 'zh'
          ? `靠近道路: ${condition.geo.roads.nearRoad}`
          : `Near road: ${condition.geo.roads.nearRoad}`);
      }
    }

    if (condition.geo.pois) {
      if (condition.geo.pois.hasEVCharger !== undefined) {
        geoParts.push(lang === 'zh'
          ? `有充电桩: ${condition.geo.pois.hasEVCharger}`
          : `Has EV charger: ${condition.geo.pois.hasEVCharger}`);
      }
    }

    if (geoParts.length > 0) {
      return lang === 'zh' ? `地理条件: ${geoParts.join(', ')}` : `Geo conditions: ${geoParts.join(', ')}`;
    }
  }

  // 默认：返回 JSON 字符串
  return JSON.stringify(condition, null, 2);
}

/**
 * 格式化值为字符串
 */
function formatValue(value: any): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  return String(value);
}
