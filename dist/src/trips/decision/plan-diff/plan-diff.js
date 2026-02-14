"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MINIMAL_EDIT_STRATEGY = void 0;
exports.computePlanDiff = computePlanDiff;
function computePlanDiff(oldPlan, newPlan) {
    const dayDiffs = [];
    const oldDayMap = new Map(oldPlan.days.map(d => [d.date, d]));
    const newDayMap = new Map(newPlan.days.map(d => [d.date, d]));
    const allDates = new Set([
        ...oldPlan.days.map(d => d.date),
        ...newPlan.days.map(d => d.date),
    ]);
    let totalChanged = 0;
    let moved = 0;
    let removed = 0;
    let added = 0;
    let swapped = 0;
    let unchanged = 0;
    for (const date of allDates) {
        const oldDay = oldDayMap.get(date);
        const newDay = newDayMap.get(date);
        if (!oldDay && !newDay)
            continue;
        const slotDiffs = [];
        if (!oldDay) {
            if (newDay) {
                for (const slot of newDay.timeSlots) {
                    slotDiffs.push({
                        slotId: slot.id,
                        changeType: 'added',
                        newSlot: slot,
                        reason: 'New day added',
                    });
                    added++;
                    totalChanged++;
                }
            }
        }
        else if (!newDay) {
            for (const slot of oldDay.timeSlots) {
                slotDiffs.push({
                    slotId: slot.id,
                    changeType: 'removed',
                    oldSlot: slot,
                    reason: 'Day removed',
                });
                removed++;
                totalChanged++;
            }
        }
        else {
            const oldSlotMap = new Map(oldDay.timeSlots.map(s => [s.id, s]));
            const newSlotMap = new Map(newDay.timeSlots.map(s => [s.id, s]));
            const allSlotIds = new Set([
                ...oldDay.timeSlots.map(s => s.id),
                ...newDay.timeSlots.map(s => s.id),
            ]);
            for (const slotId of allSlotIds) {
                const oldSlot = oldSlotMap.get(slotId);
                const newSlot = newSlotMap.get(slotId);
                if (!oldSlot && !newSlot)
                    continue;
                if (!oldSlot) {
                    slotDiffs.push({
                        slotId,
                        changeType: 'added',
                        newSlot,
                        reason: 'New slot added',
                    });
                    added++;
                    totalChanged++;
                }
                else if (!newSlot) {
                    slotDiffs.push({
                        slotId,
                        changeType: 'removed',
                        oldSlot,
                        reason: 'Slot removed',
                    });
                    removed++;
                    totalChanged++;
                }
                else {
                    const changed = isSlotChanged(oldSlot, newSlot);
                    if (changed) {
                        const changeType = detectChangeType(oldSlot, newSlot);
                        slotDiffs.push({
                            slotId,
                            changeType,
                            oldSlot,
                            newSlot,
                            reason: getChangeReason(oldSlot, newSlot, changeType),
                        });
                        if (changeType === 'moved')
                            moved++;
                        else if (changeType === 'swap')
                            swapped++;
                        totalChanged++;
                    }
                    else {
                        slotDiffs.push({
                            slotId,
                            changeType: 'unchanged',
                            oldSlot,
                            newSlot,
                        });
                        unchanged++;
                    }
                }
            }
        }
        if (slotDiffs.length > 0) {
            dayDiffs.push({
                date,
                slotDiffs,
            });
        }
    }
    const editDistanceScore = calculateEditDistance(totalChanged, moved, removed, added, swapped);
    return {
        days: dayDiffs,
        summary: {
            totalChanged,
            moved,
            removed,
            added,
            swapped,
            unchanged,
            editDistanceScore,
        },
    };
}
function isSlotChanged(oldSlot, newSlot) {
    return (oldSlot.time !== newSlot.time ||
        oldSlot.endTime !== newSlot.endTime ||
        oldSlot.title !== newSlot.title ||
        oldSlot.poiId !== newSlot.poiId ||
        oldSlot.type !== newSlot.type);
}
function detectChangeType(oldSlot, newSlot) {
    if (oldSlot.poiId && newSlot.poiId && oldSlot.poiId !== newSlot.poiId) {
        return 'swap';
    }
    if (oldSlot.time !== newSlot.time || oldSlot.endTime !== newSlot.endTime) {
        return 'moved';
    }
    return 'swap';
}
function getChangeReason(oldSlot, newSlot, changeType) {
    if (changeType === 'swap') {
        return `Activity swapped: "${oldSlot.title}" → "${newSlot.title}"`;
    }
    if (changeType === 'moved') {
        return `Time moved: ${oldSlot.time} → ${newSlot.time}`;
    }
    return 'Slot changed';
}
function calculateEditDistance(totalChanged, moved, removed, added, swapped) {
    return moved * 1 + removed * 2 + added * 2 + swapped * 1.5;
}
exports.DEFAULT_MINIMAL_EDIT_STRATEGY = {
    preserveLocked: true,
    preserveAnchors: true,
    maxReorderDistance: 120,
    preferSwap: true,
};
//# sourceMappingURL=plan-diff.js.map