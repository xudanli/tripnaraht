"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkHardGate = checkHardGate;
const plan_request_interface_1 = require("../../../itinerary-optimization/interfaces/plan-request.interface");
const candidate_helper_1 = require("./candidate-helper");
const scoring_constants_1 = require("./scoring-constants");
function checkHardGate(world, plan, optimizationResult, planningPolicy) {
    var _a, _b, _c;
    const violations = [];
    const hardNodeIds = new Set();
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.locked || slot.priorityTag === 'anchor' || slot.priorityTag === 'core') {
                if (slot.poiId) {
                    hardNodeIds.add(slot.poiId);
                }
            }
        }
    }
    const anchors = world.context.anchors;
    if ((anchors === null || anchors === void 0 ? void 0 : anchors.fixedEvents) && anchors.fixedEvents.length > 0) {
        const fixedEventDates = new Set(anchors.fixedEvents.map(e => e.date));
        const planDates = new Set(plan.days.map(d => d.date));
        for (const date of fixedEventDates) {
            if (!planDates.has(date)) {
                violations.push(`MISSING_FIXED_EVENT: 日期 ${date} 缺少固定事件`);
            }
        }
    }
    if (optimizationResult) {
        const dropped = (_a = optimizationResult.dropped) !== null && _a !== void 0 ? _a : [];
        for (const node of dropped) {
            const isHardNode = hardNodeIds.has(node.node_id.toString()) ||
                node.penalty > 100 ||
                node.reason_code === plan_request_interface_1.DropReasonCode.HARD_NODE_PROTECTION;
            if (isHardNode) {
                if (node.reason_code === plan_request_interface_1.DropReasonCode.CLOSED_DAY) {
                    violations.push(`HARD_NODE_CLOSED: ${node.name} (${node.node_id})`);
                }
                if (node.reason_code === plan_request_interface_1.DropReasonCode.TIME_WINDOW_CONFLICT) {
                    violations.push(`HARD_NODE_TIME_WINDOW_CONFLICT: ${node.name} (${node.node_id})`);
                }
                if (node.reason_code === plan_request_interface_1.DropReasonCode.INSUFFICIENT_TOTAL_TIME) {
                    violations.push(`HARD_NODE_INSUFFICIENT_TIME: ${node.name} (${node.node_id})`);
                }
            }
        }
        const summary = optimizationResult.summary;
        const dayBoundary = world.policies;
        if (dayBoundary === null || dayBoundary === void 0 ? void 0 : dayBoundary.dayEnd) {
            const dayStart = (_b = dayBoundary.dayStart) !== null && _b !== void 0 ? _b : '08:00';
            const dayEnd = dayBoundary.dayEnd;
            const [startHour, startMin] = dayStart.split(':').map(Number);
            const [endHour, endMin] = dayEnd.split(':').map(Number);
            const expectedDayMin = (endHour * 60 + endMin) - (startHour * 60 + startMin);
            const dayMin = summary.total_day_min;
            const overTime = dayMin - expectedDayMin;
            if (overTime > scoring_constants_1.HARD_GATE_CONSTANTS.SEVERE_OVERTIME_THRESHOLD_MIN && hardNodeIds.size > 0) {
                violations.push(`INSUFFICIENT_TOTAL_TIME: 超出日界 ${overTime} 分钟，影响硬节点`);
            }
        }
    }
    if (planningPolicy) {
        const constraints = planningPolicy.constraints;
        const activityMap = (0, candidate_helper_1.extractActivityCandidatesFromPlan)(world, plan);
        if (constraints.requireWheelchairAccess) {
            for (const { candidate, slot } of activityMap.values()) {
            }
        }
        if (constraints.forbidStairs) {
            for (const day of plan.days) {
                for (const slot of day.timeSlots) {
                    if ((_c = day.terrainFacts) === null || _c === void 0 ? void 0 : _c.riskFlags) {
                        for (const flag of day.terrainFacts.riskFlags) {
                            if (flag.type === 'STAIRS' && flag.severity === 'HIGH') {
                                violations.push(`FORBID_STAIRS_VIOLATION: 第 ${day.day} 天检测到楼梯`);
                                break;
                            }
                        }
                    }
                }
            }
        }
        let maxTransfersInDay = 0;
        for (const day of plan.days) {
            let dayTransfers = 0;
            for (const slot of day.timeSlots) {
                if (slot.travelLegFromPrev) {
                }
            }
            maxTransfersInDay = Math.max(maxTransfersInDay, dayTransfers);
        }
        if (maxTransfersInDay > constraints.maxTransfers) {
            violations.push(`MAX_TRANSFERS_VIOLATION: 单日换乘次数 ${maxTransfersInDay} 超过限制 ${constraints.maxTransfers}`);
        }
        for (const day of plan.days) {
            for (const slot of day.timeSlots) {
                if (slot.travelLegFromPrev) {
                    const leg = slot.travelLegFromPrev;
                    if (leg.mode === 'walk' && leg.durationMin > constraints.maxSingleWalkMin) {
                        violations.push(`MAX_SINGLE_WALK_VIOLATION: 第 ${day.day} 天单段步行 ${leg.durationMin} 分钟超过限制 ${constraints.maxSingleWalkMin}`);
                    }
                }
            }
        }
        for (const day of plan.days) {
            let totalWalkMin = 0;
            for (const slot of day.timeSlots) {
                if (slot.travelLegFromPrev && slot.travelLegFromPrev.mode === 'walk') {
                    totalWalkMin += slot.travelLegFromPrev.durationMin;
                }
            }
            if (totalWalkMin > constraints.maxTotalWalkMinPerDay) {
                violations.push(`MAX_TOTAL_WALK_VIOLATION: 第 ${day.day} 天总步行 ${totalWalkMin} 分钟超过限制 ${constraints.maxTotalWalkMinPerDay}`);
            }
        }
        if (constraints.mustHaveRestroomEveryMin > 0) {
            for (const day of plan.days) {
                let lastRestroomMin = 0;
                let currentMin = 0;
                for (const slot of day.timeSlots) {
                    if (slot.type !== 'transport' && slot.type !== 'rest') {
                        const timeSinceLastRestroom = currentMin - lastRestroomMin;
                        if (timeSinceLastRestroom > constraints.mustHaveRestroomEveryMin) {
                            violations.push(`RESTROOM_INTERVAL_VIOLATION: 第 ${day.day} 天活动 "${slot.title}" 距离上次洗手间 ${timeSinceLastRestroom} 分钟，超过限制 ${constraints.mustHaveRestroomEveryMin}`);
                        }
                        lastRestroomMin = currentMin;
                    }
                    if (slot.travelLegFromPrev) {
                        currentMin += slot.travelLegFromPrev.durationMin;
                    }
                    currentMin += 60;
                }
            }
        }
    }
    let hasActivities = false;
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.type !== 'transport' && slot.type !== 'rest') {
                hasActivities = true;
                break;
            }
        }
        if (hasActivities)
            break;
    }
    if (!hasActivities) {
        violations.push('EMPTY_PLAN: 计划中没有活动');
    }
    return {
        allowed: violations.length === 0,
        violations,
    };
}
//# sourceMappingURL=hard-gate.js.map