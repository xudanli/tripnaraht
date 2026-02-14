"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresSchengenVisa = requiresSchengenVisa;
function requiresSchengenVisa(nationality) {
    const schengenCountries = [
        'AT', 'BE', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
        'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
        'PT', 'SK', 'SI', 'ES', 'SE', 'CH'
    ];
    if (!nationality)
        return false;
    return !schengenCountries.includes(nationality.toUpperCase());
}
//# sourceMappingURL=trip-context.types.js.map