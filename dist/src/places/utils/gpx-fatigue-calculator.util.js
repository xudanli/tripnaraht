"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GPXFatigueCalculator = void 0;
class GPXFatigueCalculator {
    static analyzeGPX(points) {
        if (points.length < 2) {
            throw new Error('GPX 轨迹至少需要 2 个点');
        }
        let totalDistance = 0;
        let elevationGain = 0;
        let elevationLoss = 0;
        let maxElevation = points[0].elevation || 0;
        let minElevation = points[0].elevation || 0;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const distance = this.haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
            totalDistance += distance;
            if (prev.elevation !== undefined && curr.elevation !== undefined) {
                const elevationDiff = curr.elevation - prev.elevation;
                if (elevationDiff > 0) {
                    elevationGain += elevationDiff;
                }
                else {
                    elevationLoss += Math.abs(elevationDiff);
                }
                maxElevation = Math.max(maxElevation, curr.elevation);
                minElevation = Math.min(minElevation, curr.elevation);
            }
        }
        const averageSlope = totalDistance > 0
            ? (elevationGain / (totalDistance * 1000)) * 100
            : 0;
        const equivalentDistance = totalDistance + (elevationGain / 100);
        let fatigueScore = equivalentDistance;
        if (maxElevation >= 2000) {
            fatigueScore *= 1.3;
        }
        if (averageSlope >= 15) {
            fatigueScore *= 1.5;
        }
        return {
            totalDistance,
            elevationGain,
            elevationLoss,
            maxElevation,
            minElevation,
            averageSlope,
            equivalentDistance,
            fatigueScore,
        };
    }
    static generateFatigueMetadata(analysis) {
        let baseFatigueScore = 5;
        if (analysis.equivalentDistance <= 5) {
            baseFatigueScore = 3;
        }
        else if (analysis.equivalentDistance <= 10) {
            baseFatigueScore = 5;
        }
        else if (analysis.equivalentDistance <= 20) {
            baseFatigueScore = 7;
        }
        else {
            baseFatigueScore = 9;
        }
        let terrainType = 'FLAT';
        if (analysis.averageSlope >= 15) {
            terrainType = 'STAIRS_ONLY';
        }
        else if (analysis.averageSlope >= 5) {
            terrainType = 'HILLY';
        }
        const estimatedDurationMin = Math.round((analysis.equivalentDistance / 4) * 60);
        const intensityFactor = Math.min(analysis.fatigueScore / 10, 2.5);
        return {
            base_fatigue_score: baseFatigueScore,
            terrain_type: terrainType,
            seated_ratio: 0,
            intensity_factor: intensityFactor,
            estimated_duration_min: estimatedDurationMin,
        };
    }
    static haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance;
    }
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    static mapToFatigueLevel(equivalentDistance) {
        if (equivalentDistance <= 8) {
            return {
                level: 'LOW',
                description: '低强度：适合所有年龄和体力水平，路线平坦，时长短',
            };
        }
        else if (equivalentDistance <= 18) {
            return {
                level: 'MODERATE',
                description: '中等强度：需要一定体力，有坡度或中等长度',
            };
        }
        else if (equivalentDistance <= 30) {
            return {
                level: 'HIGH',
                description: '高强度：对体力有较高要求，涉及长距离、大爬升或陡峭地形',
            };
        }
        else {
            return {
                level: 'EXTREME',
                description: '极高强度：仅限经验丰富的户外人士，通常是全天行程、高海拔、极端爬升',
            };
        }
    }
}
exports.GPXFatigueCalculator = GPXFatigueCalculator;
//# sourceMappingURL=gpx-fatigue-calculator.util.js.map