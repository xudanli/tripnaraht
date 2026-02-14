"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fnv1a32 = fnv1a32;
exports.buildSuggestionId = buildSuggestionId;
exports.generateVoiceSuggestionId = generateVoiceSuggestionId;
exports.generateVisionSuggestionId = generateVisionSuggestionId;
exports.generateClarificationSuggestionId = generateClarificationSuggestionId;
function fnv1a32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
function buildSuggestionId(prefix, stableKey) {
    const normalizedKey = stableKey.trim().toLowerCase();
    const hash = fnv1a32(normalizedKey);
    return `${prefix}:${hash}`;
}
function generateVoiceSuggestionId(actionType, poiId, transcript) {
    const parts = [actionType];
    if (poiId)
        parts.push(poiId);
    if (transcript)
        parts.push(transcript);
    const stableKey = parts.join('|');
    return buildSuggestionId('voice', stableKey);
}
function generateVisionSuggestionId(poiId, ocrText) {
    let stableKey = poiId;
    if (ocrText) {
        const normalized = ocrText
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        stableKey = `${poiId}|${normalized}`;
    }
    return buildSuggestionId('vision', stableKey);
}
function generateClarificationSuggestionId(actionType) {
    return buildSuggestionId('voice', `${actionType}:clarify`);
}
//# sourceMappingURL=suggestion-id.util.js.map