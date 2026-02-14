"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeValueCalculator = void 0;
class TimeValueCalculator {
    static calculateTimeValue(context) {
        const baseValue = this.calculateBaseValue(context);
        const travelerMultiplier = this.getTravelerMultiplier(context.travelers);
        const densityMultiplier = this.getDensityMultiplier(context.avgPlacesPerDay);
        const sensitivityMultiplier = this.getSensitivityMultiplier(context.timeSensitivity);
        const tripTypeMultiplier = this.getTripTypeMultiplier(context.tripType);
        const timeValue = baseValue * travelerMultiplier * densityMultiplier * sensitivityMultiplier * tripTypeMultiplier;
        return Math.max(20, Math.min(200, Math.round(timeValue * 10) / 10));
    }
    static calculateBaseValue(context) {
        if (!context.totalBudget || !context.tripDays || !context.travelerCount) {
            return 50;
        }
        const dailyBudget = context.totalBudget / context.tripDays;
        const perPersonDailyBudget = dailyBudget / context.travelerCount;
        const baseValue = perPersonDailyBudget / 8;
        if (baseValue < 20 || baseValue > 200) {
            return 50;
        }
        return baseValue;
    }
    static getTravelerMultiplier(travelers) {
        if (!travelers || travelers.length === 0) {
            return 1.0;
        }
        let totalWeight = 0;
        let weightedSum = 0;
        for (const traveler of travelers) {
            let weight = 1.0;
            switch (traveler.type) {
                case 'ADULT':
                    weight = 1.0;
                    break;
                case 'ELDERLY':
                    weight = 0.8;
                    break;
                case 'CHILD':
                    weight = 0.6;
                    break;
            }
            totalWeight += weight;
            weightedSum += weight * weight;
        }
        if (totalWeight === travelers.length) {
            return 1.0;
        }
        const avgMultiplier = weightedSum / totalWeight;
        return Math.max(0.6, Math.min(1.0, avgMultiplier));
    }
    static getDensityMultiplier(avgPlacesPerDay) {
        if (!avgPlacesPerDay || avgPlacesPerDay === 0) {
            return 1.0;
        }
        if (avgPlacesPerDay >= 4) {
            return 1.3;
        }
        else if (avgPlacesPerDay >= 2) {
            return 1.0;
        }
        else {
            return 0.7;
        }
    }
    static getSensitivityMultiplier(timeSensitivity) {
        switch (timeSensitivity) {
            case 'HIGH':
                return 1.5;
            case 'LOW':
                return 0.7;
            case 'MEDIUM':
            default:
                return 1.0;
        }
    }
    static getTripTypeMultiplier(tripType) {
        switch (tripType) {
            case 'BUSINESS':
                return 1.4;
            case 'FAMILY':
                return 0.8;
            case 'BACKPACKING':
                return 0.6;
            case 'LEISURE':
            default:
                return 1.0;
        }
    }
    static async calculateFromTrip(tripId, prisma) {
        const trip = await prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                days: {
                    include: {
                        items: {
                            include: {
                                place: {
                                    where: {
                                        category: 'ATTRACTION',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            return 50;
        }
        const start = new Date(trip.startDate);
        const end = new Date(trip.endDate);
        const tripDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const seenAttractionIds = new Set();
        for (const day of trip.days) {
            for (const item of day.items) {
                if (item.place && item.place.category === 'ATTRACTION') {
                    seenAttractionIds.add(item.place.id);
                }
            }
        }
        const totalAttractions = seenAttractionIds.size;
        const avgPlacesPerDay = tripDays > 0 ? totalAttractions / tripDays : 0;
        const budgetConfig = trip.budgetConfig;
        const totalBudget = (budgetConfig === null || budgetConfig === void 0 ? void 0 : budgetConfig.totalBudget) || (budgetConfig === null || budgetConfig === void 0 ? void 0 : budgetConfig.total);
        const travelers = (budgetConfig === null || budgetConfig === void 0 ? void 0 : budgetConfig.travelers) || [];
        const context = {
            totalBudget,
            tripDays,
            travelerCount: travelers.length,
            travelers: travelers.map((t) => ({
                type: t.type,
                mobilityTag: t.mobilityTag,
            })),
            avgPlacesPerDay,
            timeSensitivity: this.inferTimeSensitivity(avgPlacesPerDay, budgetConfig),
            tripType: this.inferTripType(budgetConfig),
        };
        return this.calculateTimeValue(context);
    }
    static inferTimeSensitivity(avgPlacesPerDay, budgetConfig) {
        if (avgPlacesPerDay >= 4) {
            return 'HIGH';
        }
        else if (avgPlacesPerDay >= 2) {
            return 'MEDIUM';
        }
        else {
            return 'LOW';
        }
    }
    static inferTripType(budgetConfig) {
        return 'LEISURE';
    }
}
exports.TimeValueCalculator = TimeValueCalculator;
//# sourceMappingURL=time-value-calculator.util.js.map