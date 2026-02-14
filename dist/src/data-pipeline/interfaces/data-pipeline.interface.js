"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQualityException = void 0;
class DataQualityException extends Error {
    constructor(message, qualityAssessment) {
        super(message);
        this.qualityAssessment = qualityAssessment;
        this.name = 'DataQualityException';
    }
}
exports.DataQualityException = DataQualityException;
//# sourceMappingURL=data-pipeline.interface.js.map