"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AdvancedConstraintsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedConstraintsService = void 0;
const common_1 = require("@nestjs/common");
let AdvancedConstraintsService = AdvancedConstraintsService_1 = class AdvancedConstraintsService {
    constructor() {
        this.logger = new common_1.Logger(AdvancedConstraintsService_1.name);
    }
    checkMutexGroups(plan, constraints) {
        const violations = [];
        const activityByGroup = new Map();
        for (const day of plan.days) {
            for (const slot of day.timeSlots) {
                if (!slot.poiId)
                    continue;
                const groupId = this.getGroupId(slot.poiId);
                if (groupId) {
                    if (!activityByGroup.has(groupId)) {
                        activityByGroup.set(groupId, []);
                    }
                    activityByGroup.get(groupId).push(slot.poiId);
                }
            }
        }
        for (const group of constraints.mutexGroups) {
            const activities = activityByGroup.get(group.groupId) || [];
            const maxSelect = group.maxSelect || 1;
            if (activities.length > maxSelect) {
                violations.push({
                    groupId: group.groupId,
                    violations: activities,
                    message: `互斥组 "${group.groupId}" 最多只能选择 ${maxSelect} 个，但选择了 ${activities.length} 个`,
                });
            }
        }
        return violations;
    }
    checkDependencies(plan, constraints) {
        const violations = [];
        const activityMap = new Map();
        for (let dayIdx = 0; dayIdx < plan.days.length; dayIdx++) {
            const day = plan.days[dayIdx];
            for (let slotIdx = 0; slotIdx < day.timeSlots.length; slotIdx++) {
                const slot = day.timeSlots[slotIdx];
                if (slot.poiId) {
                    activityMap.set(slot.poiId, {
                        dayIndex: dayIdx,
                        slotIndex: slotIdx,
                        time: slot.time,
                    });
                }
            }
        }
        for (const dep of constraints.dependencies) {
            const from = activityMap.get(dep.from);
            const to = activityMap.get(dep.to);
            if (!from || !to) {
                continue;
            }
            let violated = false;
            let message = '';
            switch (dep.type) {
                case 'before':
                    if (from.dayIndex > to.dayIndex) {
                        violated = true;
                        message = `${dep.from} 必须在 ${dep.to} 之前`;
                    }
                    else if (from.dayIndex === to.dayIndex &&
                        this.timeToMinutes(from.time) >= this.timeToMinutes(to.time)) {
                        violated = true;
                        message = `${dep.from} 必须在 ${dep.to} 之前（同一天）`;
                    }
                    break;
                case 'after':
                    if (from.dayIndex < to.dayIndex) {
                        violated = true;
                        message = `${dep.from} 必须在 ${dep.to} 之后`;
                    }
                    else if (from.dayIndex === to.dayIndex &&
                        this.timeToMinutes(from.time) <= this.timeToMinutes(to.time)) {
                        violated = true;
                        message = `${dep.from} 必须在 ${dep.to} 之后（同一天）`;
                    }
                    break;
                case 'same_day':
                    if (from.dayIndex !== to.dayIndex) {
                        violated = true;
                        message = `${dep.from} 和 ${dep.to} 必须在同一天`;
                    }
                    break;
                case 'adjacent':
                    const dayDiff = Math.abs(from.dayIndex - to.dayIndex);
                    if (dayDiff > 1) {
                        violated = true;
                        message = `${dep.from} 和 ${dep.to} 必须相邻（相差不超过1天）`;
                    }
                    else if (dep.minGapMinutes) {
                        const timeDiff = Math.abs(this.timeToMinutes(from.time) - this.timeToMinutes(to.time));
                        if (timeDiff < dep.minGapMinutes) {
                            violated = true;
                            message = `${dep.from} 和 ${dep.to} 之间至少需要 ${dep.minGapMinutes} 分钟间隔`;
                        }
                    }
                    break;
            }
            if (violated) {
                violations.push({
                    dependency: dep,
                    message,
                });
            }
        }
        return violations;
    }
    applyConstraintsToCandidates(candidates, constraints) {
        const filtered = this.applyMutexGroups(candidates, constraints);
        return filtered;
    }
    applyMutexGroups(candidates, constraints) {
        const groupCounts = new Map();
        const result = [];
        for (const candidate of candidates) {
            const groupId = candidate.alternativeGroupId;
            if (!groupId) {
                result.push(candidate);
                continue;
            }
            const group = constraints.mutexGroups.find(g => g.groupId === groupId);
            if (!group) {
                result.push(candidate);
                continue;
            }
            const maxSelect = group.maxSelect || 1;
            const currentCount = groupCounts.get(groupId) || 0;
            if (currentCount < maxSelect) {
                result.push(candidate);
                groupCounts.set(groupId, currentCount + 1);
            }
        }
        return result;
    }
    getGroupId(activityId) {
        return null;
    }
    timeToMinutes(time) {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }
};
exports.AdvancedConstraintsService = AdvancedConstraintsService;
exports.AdvancedConstraintsService = AdvancedConstraintsService = AdvancedConstraintsService_1 = __decorate([
    (0, common_1.Injectable)()
], AdvancedConstraintsService);
//# sourceMappingURL=advanced-constraints.service.js.map