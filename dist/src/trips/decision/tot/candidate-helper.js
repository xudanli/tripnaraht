"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findActivityCandidate = findActivityCandidate;
exports.extractActivityCandidatesFromPlan = extractActivityCandidatesFromPlan;
exports.getAllActivityCandidates = getAllActivityCandidates;
function findActivityCandidate(world, poiId, date) {
    const candidates = world.candidatesByDate[date] || [];
    return candidates.find(c => c.id === poiId);
}
function extractActivityCandidatesFromPlan(world, plan) {
    const result = new Map();
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.poiId) {
                const candidate = findActivityCandidate(world, slot.poiId, day.date);
                if (candidate) {
                    result.set(slot.poiId, {
                        candidate,
                        slot,
                        date: day.date,
                    });
                }
            }
        }
    }
    return result;
}
function getAllActivityCandidates(world, plan) {
    const candidates = [];
    const seen = new Set();
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.poiId && !seen.has(slot.poiId)) {
                const candidate = findActivityCandidate(world, slot.poiId, day.date);
                if (candidate) {
                    candidates.push(candidate);
                    seen.add(slot.poiId);
                }
            }
        }
    }
    return candidates;
}
//# sourceMappingURL=candidate-helper.js.map