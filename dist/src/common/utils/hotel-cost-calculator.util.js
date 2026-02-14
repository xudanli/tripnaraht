"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelCostCalculator = void 0;
class HotelCostCalculator {
    static calculateTotalCost(roomRate, transportCost, commuteTimeMinutes, timeValuePerHour = 50) {
        const roundTripTransportCost = transportCost * 2;
        const commuteTimeHours = commuteTimeMinutes / 60;
        const timeCost = commuteTimeHours * timeValuePerHour;
        const totalCost = roomRate + roundTripTransportCost + timeCost;
        return Math.round(totalCost * 100) / 100;
    }
    static calculateCostBreakdown(roomRate, transportCost, commuteTimeMinutes, timeValuePerHour = 50) {
        const roundTripTransportCost = transportCost * 2;
        const commuteTimeHours = commuteTimeMinutes / 60;
        const timeCost = commuteTimeHours * timeValuePerHour;
        const hiddenCost = roundTripTransportCost + timeCost;
        const totalCost = roomRate + hiddenCost;
        return {
            roomRate: Math.round(roomRate * 100) / 100,
            transportCost: Math.round(transportCost * 100) / 100,
            roundTripTransportCost: Math.round(roundTripTransportCost * 100) / 100,
            timeCost: Math.round(timeCost * 100) / 100,
            totalCost: Math.round(totalCost * 100) / 100,
            hiddenCost: Math.round(hiddenCost * 100) / 100,
        };
    }
    static estimateTransportCost(distanceKm, useTaxi = false) {
        if (useTaxi) {
            const baseFare = 15;
            const perKmFare = 3;
            return baseFare + distanceKm * perKmFare;
        }
        else {
            if (distanceKm <= 2) {
                return 10 + (distanceKm * 5);
            }
            else if (distanceKm <= 5) {
                return 20 + ((distanceKm - 2) * 7);
            }
            else if (distanceKm <= 10) {
                return 40 + ((distanceKm - 5) * 8);
            }
            else {
                return 80 + ((distanceKm - 10) * 5);
            }
        }
    }
    static estimateCommuteTime(distanceKm, transportMode = 'metro') {
        switch (transportMode) {
            case 'walk':
                return (distanceKm / 5) * 60;
            case 'metro':
                return (distanceKm / 30) * 60;
            case 'taxi':
                return (distanceKm / 25) * 60;
            case 'bus':
                return (distanceKm / 20) * 60;
            default:
                return (distanceKm / 30) * 60;
        }
    }
}
exports.HotelCostCalculator = HotelCostCalculator;
//# sourceMappingURL=hotel-cost-calculator.util.js.map