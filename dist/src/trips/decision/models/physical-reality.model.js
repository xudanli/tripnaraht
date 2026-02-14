"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePhysicalRealityModel = validatePhysicalRealityModel;
function validatePhysicalRealityModel(model) {
    const missingFields = [];
    if (!model) {
        return {
            valid: false,
            missingFields: ['model'],
        };
    }
    if (!model.demEvidence || model.demEvidence.length === 0) {
        missingFields.push('demEvidence');
    }
    if (!model.roadStates) {
        missingFields.push('roadStates');
    }
    if (!model.hazardZones) {
        missingFields.push('hazardZones');
    }
    if (!model.ferryStates) {
        missingFields.push('ferryStates');
    }
    if (!model.countryCode) {
        missingFields.push('countryCode');
    }
    if (!model.month || model.month < 1 || model.month > 12) {
        missingFields.push('month');
    }
    return {
        valid: missingFields.length === 0,
        missingFields,
    };
}
//# sourceMappingURL=physical-reality.model.js.map