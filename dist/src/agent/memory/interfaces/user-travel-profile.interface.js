"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultUserTravelProfile = createDefaultUserTravelProfile;
function createDefaultUserTravelProfile(userId) {
    return {
        userId,
        pacePreference: 'MODERATE',
        altitudeTolerance: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        travelPhilosophy: 'SCENIC',
        preferredRouteTypes: [],
        confidence: 0.3,
        source: 'inferred',
        updatedAt: new Date(),
    };
}
//# sourceMappingURL=user-travel-profile.interface.js.map