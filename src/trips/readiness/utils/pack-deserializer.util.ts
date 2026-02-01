// src/trips/readiness/utils/pack-deserializer.util.ts

/**
 * Pack Deserializer Utility
 * 
 * 将前端传来的序列化数据转换回标准的 Pack 格式
 * 处理 messageRaw、titleRaw 等字段，转换为标准的 LocalizedString
 */

import { ReadinessPack, Rule, Action, LocalizedString } from '../types/readiness-pack.types';

/**
 * 将前端传来的 Pack 数据反序列化为标准格式
 * 
 * @param packData 前端传来的 Pack 数据（可能包含 *Raw 字段）
 * @returns 标准格式的 Pack 对象
 */
export function deserializePackFromAdmin(packData: any): ReadinessPack {
  // 如果有 _raw 字段，优先使用它（这是最可靠的原始数据）
  if (packData._raw) {
    return mergePackUpdates(packData._raw, packData);
  }

  // 否则，从序列化数据中重建
  const checklists = packData.checklists?.map((checklist: any) => ({
    ...checklist,
    items: (checklist.items?.map((item: any) => {
      // 将字符串转换为 LocalizedString
      return typeof item === 'string' ? { en: item, zh: item } : item;
    }) || []) as LocalizedString[],
  })) || [];

  const hazards = packData.hazards?.map((hazard: any) => ({
    ...hazard,
    summary: deserializeLocalizedString(hazard.summary, hazard.summaryRaw),
    mitigations: (hazard.mitigations?.map((m: any) => {
      // 将字符串转换为 LocalizedString
      return typeof m === 'string' ? { en: m, zh: m } : m;
    }) || []) as LocalizedString[],
  })) || [];

  return {
    ...packData,
    displayName: deserializeLocalizedString(packData.displayName, packData.displayNameRaw) || packData.displayName,
    // 🆕 反序列化 geo 字段（支持多语言）
    geo: {
      ...packData.geo,
      region: deserializeLocalizedString(packData.geo?.region, packData.geo?.regionRaw) || packData.geo?.region,
      city: deserializeLocalizedString(packData.geo?.city, packData.geo?.cityRaw) || packData.geo?.city,
    },
    rules: packData.rules?.map((rule: any) => deserializeRule(rule)) || [],
    checklists,
    hazards,
  };
}

/**
 * 合并 Pack 更新（保留原始数据，只更新修改的字段）
 */
function mergePackUpdates(originalPack: ReadinessPack, updatedData: any): ReadinessPack {
  return {
    ...originalPack,
    displayName: deserializeLocalizedString(updatedData.displayName, updatedData.displayNameRaw) || originalPack.displayName,
    version: updatedData.version || originalPack.version,
    lastReviewedAt: updatedData.lastReviewedAt || originalPack.lastReviewedAt,
    // 🆕 合并 geo 字段（支持多语言）
    geo: {
      ...originalPack.geo,
      region: deserializeLocalizedString(updatedData.geo?.region, updatedData.geo?.regionRaw) || originalPack.geo.region,
      city: deserializeLocalizedString(updatedData.geo?.city, updatedData.geo?.cityRaw) || originalPack.geo.city,
      lat: updatedData.geo?.lat !== undefined ? updatedData.geo.lat : originalPack.geo.lat,
      lng: updatedData.geo?.lng !== undefined ? updatedData.geo.lng : originalPack.geo.lng,
    },
    rules: updatedData.rules?.map((rule: any) => {
      const originalRule = originalPack.rules.find((r) => r.id === rule.id);
      return originalRule ? mergeRuleUpdates(originalRule, rule) : deserializeRule(rule);
    }) || originalPack.rules,
    checklists: updatedData.checklists?.map((checklist: any) => {
      const originalChecklist = originalPack.checklists.find((c) => c.id === checklist.id);
      return originalChecklist ? mergeChecklistUpdates(originalChecklist, checklist) : deserializeChecklist(checklist);
    }) || originalPack.checklists,
    hazards: updatedData.hazards?.map((hazard: any) => {
      const originalHazard = originalPack.hazards?.find((h) => h.type === hazard.type);
      return originalHazard ? mergeHazardUpdates(originalHazard, hazard) : deserializeHazard(hazard);
    }) || originalPack.hazards,
  };
}

/**
 * 反序列化 Rule
 */
function deserializeRule(rule: any): Rule {
  // 🆕 处理根级别的 message、seasons、tasks（前端文档兼容）
  const rootMessage = rule.messageRaw || rule.message || rule.then?.messageRaw || rule.then?.message;
  const rootSeasons = rule.seasons || rule.appliesTo?.seasons;
  const rootTasks = rule.tasks || rule.then?.tasks;
  
  return {
    ...rule,
    // 🆕 反序列化前端文档兼容字段
    title: deserializeLocalizedString(rule.title, rule.titleRaw),
    description: deserializeLocalizedString(rule.description, rule.descriptionRaw),
    message: rootMessage ? deserializeLocalizedString(
      typeof rootMessage === 'string' ? rootMessage : undefined,
      typeof rootMessage === 'object' ? rootMessage : undefined
    ) : undefined,
    seasons: rootSeasons,
    required: rule.required,
    tasks: rootTasks?.map((task: any) => ({
      ...task,
      title: deserializeLocalizedString(task.title, task.titleRaw),
    })),
    notes: deserializeLocalizedString(rule.notes, rule.notesRaw),
    then: deserializeAction(rule.then),
    // when 字段应该已经是对象，不需要反序列化
    when: rule.when,
    // 🆕 用户决策（根级别）
    userDecision: rule.userDecision ? deserializeUserDecision(rule.userDecision) : undefined,
  };
}

/**
 * 合并 Rule 更新
 */
function mergeRuleUpdates(originalRule: Rule, updatedRule: any): Rule {
  // 🆕 处理根级别的 message、seasons、tasks（前端文档兼容）
  const rootMessage = updatedRule.messageRaw || updatedRule.message;
  const rootSeasons = updatedRule.seasons;
  const rootTasks = updatedRule.tasks;
  
  return {
    ...originalRule,
    // 🆕 合并前端文档兼容字段
    title: updatedRule.titleRaw !== undefined 
      ? deserializeLocalizedString(updatedRule.title, updatedRule.titleRaw) 
      : originalRule.title,
    description: updatedRule.descriptionRaw !== undefined
      ? deserializeLocalizedString(updatedRule.description, updatedRule.descriptionRaw)
      : originalRule.description,
    message: rootMessage !== undefined
      ? deserializeLocalizedString(
          typeof rootMessage === 'string' ? rootMessage : undefined,
          typeof rootMessage === 'object' ? rootMessage : undefined
        )
      : originalRule.message,
    seasons: rootSeasons !== undefined ? rootSeasons : originalRule.seasons,
    required: updatedRule.required !== undefined ? updatedRule.required : originalRule.required,
    tasks: rootTasks !== undefined 
      ? rootTasks.map((task: any) => ({
          ...task,
          title: deserializeLocalizedString(task.title, task.titleRaw),
        }))
      : originalRule.tasks,
    category: updatedRule.category || originalRule.category,
    severity: updatedRule.severity || originalRule.severity,
    appliesTo: updatedRule.appliesTo || originalRule.appliesTo,
    notes: deserializeLocalizedString(updatedRule.notes, updatedRule.notesRaw) || originalRule.notes,
    then: updatedRule.then ? mergeActionUpdates(originalRule.then, updatedRule.then) : originalRule.then,
    when: updatedRule.when !== undefined ? updatedRule.when : originalRule.when,
    evidence: updatedRule.evidence !== undefined ? updatedRule.evidence : originalRule.evidence,
    userDecision: updatedRule.userDecision !== undefined
      ? (updatedRule.userDecision ? deserializeUserDecision(updatedRule.userDecision) : undefined)
      : originalRule.userDecision,
  };
}

/**
 * 反序列化 Action
 */
function deserializeAction(action: any): Action {
  // 如果没有 action，返回默认值（向后兼容）
  if (!action || !action.level) {
    return {
      level: 'should',
      message: { en: '', zh: '' },
    };
  }
  
  const message = deserializeLocalizedString(action.message, action.messageRaw);
  if (!message) {
    // 如果没有 message，使用默认值（向后兼容）
    return {
      level: action.level,
      message: { en: '', zh: '' },
      tasks: action.tasks?.map((task: any) => ({
        ...task,
        title: deserializeLocalizedString(task.title, task.titleRaw) || task.title,
      })),
      askUser: action.askUser?.map((q: any) => {
        return typeof q === 'string' ? { en: q, zh: q } : q;
      }),
      userDecision: action.userDecision ? deserializeUserDecision(action.userDecision) : undefined,
    };
  }
  
  return {
    level: action.level,
    message: message,
    tasks: action.tasks?.map((task: any) => ({
      ...task,
      title: deserializeLocalizedString(task.title, task.titleRaw) || task.title,
    })),
    askUser: action.askUser?.map((q: any) => {
      // askUser 可能是字符串数组，需要转换为 LocalizedString
      return typeof q === 'string' ? { en: q, zh: q } : q;
    }),
    userDecision: action.userDecision ? deserializeUserDecision(action.userDecision) : undefined,
  };
}

/**
 * 合并 Action 更新
 */
function mergeActionUpdates(originalAction: Action, updatedAction: any): Action {
  return {
    ...originalAction,
    level: updatedAction.level || originalAction.level,
    message: deserializeLocalizedString(updatedAction.message, updatedAction.messageRaw) || originalAction.message,
    tasks: updatedAction.tasks !== undefined 
      ? updatedAction.tasks.map((task: any) => ({
          ...task,
          title: deserializeLocalizedString(task.title, task.titleRaw),
        }))
      : originalAction.tasks,
    askUser: updatedAction.askUser !== undefined ? updatedAction.askUser : originalAction.askUser,
    userDecision: updatedAction.userDecision !== undefined 
      ? (updatedAction.userDecision ? deserializeUserDecision(updatedAction.userDecision) : undefined)
      : originalAction.userDecision,
  };
}

/**
 * 反序列化 UserDecision
 */
function deserializeUserDecision(userDecision: any): any {
  return {
    questions: userDecision.questions?.map((q: any) => ({
      ...q,
      question: deserializeLocalizedString(q.question, q.questionRaw),
      description: q.description ? deserializeLocalizedString(q.description, q.descriptionRaw) : undefined,
      placeholder: q.placeholder ? deserializeLocalizedString(q.placeholder, q.placeholderRaw) : undefined,
      options: q.options?.map((opt: any) => ({
        ...opt,
        label: deserializeLocalizedString(opt.label, opt.labelRaw),
        description: opt.description ? deserializeLocalizedString(opt.description, opt.descriptionRaw) : undefined,
      })),
    })),
    groups: userDecision.groups?.map((g: any) => ({
      ...g,
      title: deserializeLocalizedString(g.title, g.titleRaw),
      description: g.description ? deserializeLocalizedString(g.description, g.descriptionRaw) : undefined,
    })),
    branches: userDecision.branches,
    defaultBranch: userDecision.defaultBranch ? {
      ...userDecision.defaultBranch,
      message: userDecision.defaultBranch.message 
        ? deserializeLocalizedString(userDecision.defaultBranch.message, userDecision.defaultBranch.messageRaw)
        : undefined,
    } : undefined,
  };
}

/**
 * 反序列化 Checklist
 */
function deserializeChecklist(checklist: any): any {
  return {
    ...checklist,
    // 🆕 反序列化前端文档兼容字段
    title: deserializeLocalizedString(checklist.title, checklist.titleRaw),
    description: deserializeLocalizedString(checklist.description, checklist.descriptionRaw),
    required: checklist.required,
    priority: checklist.priority,
    items: (checklist.itemsRaw || checklist.items)?.map((item: any) => {
      // 如果已经是 LocalizedString，直接返回
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        return item;
      }
      // 否则，将字符串转换为 LocalizedString
      return typeof item === 'string' ? { en: item, zh: item } : item;
    }) || [],
  };
}

/**
 * 合并 Checklist 更新
 */
function mergeChecklistUpdates(originalChecklist: any, updatedChecklist: any): any {
  return {
    ...originalChecklist,
    // 🆕 合并前端文档兼容字段
    title: updatedChecklist.titleRaw !== undefined
      ? deserializeLocalizedString(updatedChecklist.title, updatedChecklist.titleRaw)
      : originalChecklist.title,
    description: updatedChecklist.descriptionRaw !== undefined
      ? deserializeLocalizedString(updatedChecklist.description, updatedChecklist.descriptionRaw)
      : originalChecklist.description,
    required: updatedChecklist.required !== undefined 
      ? updatedChecklist.required 
      : originalChecklist.required,
    priority: updatedChecklist.priority !== undefined
      ? updatedChecklist.priority
      : originalChecklist.priority,
    category: updatedChecklist.category || originalChecklist.category,
    appliesToSeasons: updatedChecklist.appliesToSeasons || originalChecklist.appliesToSeasons,
    items: (updatedChecklist.itemsRaw || updatedChecklist.items) !== undefined 
      ? (updatedChecklist.itemsRaw || updatedChecklist.items).map((item: any) => {
          // 如果已经是 LocalizedString，直接返回
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            return item;
          }
          // 否则，将字符串转换为 LocalizedString
          return typeof item === 'string' ? { en: item, zh: item } : item;
        })
      : originalChecklist.items,
  };
}

/**
 * 反序列化 Hazard
 */
function deserializeHazard(hazard: any): any {
  // 🆕 处理 metadata（前端文档兼容）
  const metadata = hazard.metadata ? {
    ...hazard.metadata,
    description: deserializeLocalizedString(
      hazard.metadata.description,
      hazard.metadata.descriptionRaw
    ) || hazard.summary, // 如果没有 metadata.description，使用 summary
    precautions: (hazard.metadata.precautionsRaw || hazard.metadata.precautions)?.map((p: any) => {
      if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
        return p;
      }
      return typeof p === 'string' ? { en: p, zh: p } : p;
    }) || hazard.mitigations, // 如果没有 metadata.precautions，使用 mitigations
  } : undefined;
  
  return {
    ...hazard,
    // 🆕 反序列化前端文档兼容字段
    zoneId: hazard.zoneId,
    level: hazard.level,
    seasons: hazard.seasons,
    summary: deserializeLocalizedString(hazard.summary, hazard.summaryRaw),
    mitigations: (hazard.mitigationsRaw || hazard.mitigations)?.map((m: any) => {
      // 如果已经是 LocalizedString，直接返回
      if (typeof m === 'object' && m !== null && !Array.isArray(m)) {
        return m;
      }
      // 否则，将字符串转换为 LocalizedString
      return typeof m === 'string' ? { en: m, zh: m } : m;
    }) || [],
    metadata,
  };
}

/**
 * 合并 Hazard 更新
 */
function mergeHazardUpdates(originalHazard: any, updatedHazard: any): any {
  // 🆕 处理 metadata（前端文档兼容）
  const metadata = updatedHazard.metadata !== undefined ? {
    ...(originalHazard.metadata || {}),
    ...updatedHazard.metadata,
    description: updatedHazard.metadata.descriptionRaw !== undefined
      ? deserializeLocalizedString(
          updatedHazard.metadata.description,
          updatedHazard.metadata.descriptionRaw
        )
      : updatedHazard.metadata.description || originalHazard.metadata?.description || originalHazard.summary,
    precautions: (updatedHazard.metadata.precautionsRaw || updatedHazard.metadata.precautions) !== undefined
      ? (updatedHazard.metadata.precautionsRaw || updatedHazard.metadata.precautions).map((p: any) => {
          if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
            return p;
          }
          return typeof p === 'string' ? { en: p, zh: p } : p;
        })
      : updatedHazard.metadata.precautions || originalHazard.metadata?.precautions || originalHazard.mitigations,
  } : originalHazard.metadata;
  
  return {
    ...originalHazard,
    // 🆕 合并前端文档兼容字段
    zoneId: updatedHazard.zoneId !== undefined ? updatedHazard.zoneId : originalHazard.zoneId,
    level: updatedHazard.level !== undefined ? updatedHazard.level : originalHazard.level,
    seasons: updatedHazard.seasons !== undefined ? updatedHazard.seasons : originalHazard.seasons,
    type: updatedHazard.type || originalHazard.type,
    severity: updatedHazard.severity || originalHazard.severity,
    summary: deserializeLocalizedString(updatedHazard.summary, updatedHazard.summaryRaw) || originalHazard.summary,
    mitigations: (updatedHazard.mitigationsRaw || updatedHazard.mitigations) !== undefined 
      ? (updatedHazard.mitigationsRaw || updatedHazard.mitigations).map((m: any) => {
          // 如果已经是 LocalizedString，直接返回
          if (typeof m === 'object' && m !== null && !Array.isArray(m)) {
            return m;
          }
          // 否则，将字符串转换为 LocalizedString
          return typeof m === 'string' ? { en: m, zh: m } : m;
        })
      : originalHazard.mitigations,
    metadata,
  };
}

/**
 * 反序列化 LocalizedString
 * 优先使用 *Raw 字段，如果没有则从字符串创建
 */
function deserializeLocalizedString(
  serializedValue: string | undefined,
  rawValue: LocalizedString | undefined
): LocalizedString | undefined {
  // 优先使用 rawValue（*Raw 字段）
  if (rawValue !== undefined) {
    return rawValue;
  }

  // 如果没有 rawValue，但有 serializedValue（字符串）
  if (serializedValue !== undefined) {
    // 如果 serializedValue 已经是对象，直接返回
    if (typeof serializedValue === 'object' && serializedValue !== null) {
      return serializedValue as LocalizedString;
    }
    // 否则，将字符串转换为 LocalizedString（中英文相同）
    return { en: serializedValue, zh: serializedValue };
  }

  return undefined;
}
