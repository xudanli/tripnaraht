"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineRebuilder = void 0;
const time_utils_1 = require("../../planning-policy/utils/time-utils");
const MORNING_START_MIN = 360;
const MORNING_END_MIN = 720;
class TimelineRebuilder {
    constructor() {
        this.config = {
            morningStartMin: MORNING_START_MIN,
            morningEndMin: MORNING_END_MIN,
            defaultTransitMin: 30,
            defaultBufferMin: 10,
        };
    }
    rebuildTimeline(stops, targetPoi, targetStopIndex, dayStartMin = 540, dayEndMin = 1200) {
        if (!targetPoi) {
            return null;
        }
        const newStops = [...stops];
        const targetStop = newStops[targetStopIndex];
        const visitMin = targetPoi.avgVisitMin || 120;
        let suggestedStartMin = this.findAvailableMorningSlot(newStops, targetStopIndex, visitMin, targetPoi, dayStartMin);
        if (suggestedStartMin === null) {
            return null;
        }
        let transitMin = this.config.defaultTransitMin;
        if (targetStopIndex > 0) {
            const prevStop = newStops[targetStopIndex - 1];
            if (typeof prevStop.lat === 'number' &&
                typeof prevStop.lng === 'number' &&
                typeof targetPoi.lat === 'number' &&
                typeof targetPoi.lng === 'number') {
                const distanceM = (0, time_utils_1.calculateDistance)(prevStop.lat, prevStop.lng, targetPoi.lat, targetPoi.lng);
                const distanceKm = distanceM / 1000;
                transitMin = Math.max(this.config.defaultTransitMin, Math.round((distanceKm / 5) * 60));
            }
        }
        const arriveMin = suggestedStartMin - transitMin;
        if (targetPoi.openingHours) {
            const earliestArrival = this.getEarliestArrivalTime(targetPoi, dayStartMin);
            if (earliestArrival !== null && arriveMin < earliestArrival) {
                suggestedStartMin = earliestArrival + transitMin;
                if (suggestedStartMin + visitMin > this.config.morningEndMin) {
                    return null;
                }
            }
        }
        if (suggestedStartMin + visitMin > dayEndMin) {
            return null;
        }
        const newTargetStop = {
            ...targetStop,
            startMin: suggestedStartMin,
            endMin: suggestedStartMin + visitMin,
        };
        newStops[targetStopIndex] = newTargetStop;
        let currentTime = suggestedStartMin + visitMin + this.config.defaultBufferMin;
        for (let i = targetStopIndex + 1; i < newStops.length; i++) {
            const stop = newStops[i];
            const stopVisitMin = stop.endMin - stop.startMin;
            const prevStop = newStops[i - 1];
            let stopTransitMin = this.config.defaultTransitMin;
            if (typeof prevStop.lat === 'number' &&
                typeof prevStop.lng === 'number' &&
                typeof stop.lat === 'number' &&
                typeof stop.lng === 'number') {
                const distanceM = (0, time_utils_1.calculateDistance)(prevStop.lat, prevStop.lng, stop.lat, stop.lng);
                const distanceKm = distanceM / 1000;
                stopTransitMin = Math.max(this.config.defaultTransitMin, Math.round((distanceKm / 5) * 60));
            }
            const stopArriveMin = currentTime + stopTransitMin;
            const stopStartMin = stopArriveMin;
            const stopEndMin = stopStartMin + stopVisitMin;
            if (stopEndMin > dayEndMin) {
                return null;
            }
            newStops[i] = {
                ...stop,
                startMin: stopStartMin,
                endMin: stopEndMin,
            };
            currentTime = stopEndMin + this.config.defaultBufferMin;
        }
        return newStops;
    }
    findAvailableMorningSlot(stops, targetIndex, visitMin, targetPoi, dayStartMin) {
        const morningStops = stops
            .map((s, i) => ({ stop: s, index: i }))
            .filter(({ stop, index }) => index !== targetIndex &&
            stop.kind === 'POI' &&
            stop.startMin >= this.config.morningStartMin &&
            stop.startMin < this.config.morningEndMin)
            .sort((a, b) => a.stop.startMin - b.stop.startMin);
        let candidateStart = Math.max(dayStartMin, this.config.morningStartMin);
        for (const { stop } of morningStops) {
            const gap = stop.startMin - candidateStart;
            if (gap >= visitMin + this.config.defaultTransitMin * 2 + this.config.defaultBufferMin) {
                return candidateStart + this.config.defaultTransitMin;
            }
            candidateStart = stop.endMin + this.config.defaultTransitMin + this.config.defaultBufferMin;
        }
        if (morningStops.length > 0) {
            const lastMorningStop = morningStops[morningStops.length - 1].stop;
            candidateStart = lastMorningStop.endMin + this.config.defaultTransitMin + this.config.defaultBufferMin;
        }
        if (candidateStart + visitMin <= this.config.morningEndMin) {
            return candidateStart;
        }
        return null;
    }
    getEarliestArrivalTime(poi, dayStartMin) {
        if (!poi.openingHours) {
            return null;
        }
        const hours = poi.openingHours;
        if (hours.windows && hours.windows.length > 0) {
            const firstWindow = hours.windows[0];
            if (firstWindow.start) {
                const [h, m] = firstWindow.start.split(':').map(Number);
                return h * 60 + m;
            }
        }
        return null;
    }
}
exports.TimelineRebuilder = TimelineRebuilder;
//# sourceMappingURL=timeline-rebuilder.util.js.map