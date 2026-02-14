"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PIIAnonymizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIIAnonymizerService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let PIIAnonymizerService = PIIAnonymizerService_1 = class PIIAnonymizerService {
    constructor() {
        this.logger = new common_1.Logger(PIIAnonymizerService_1.name);
        this.defaultConfig = {
            anonymize_user_ids: true,
            anonymize_emails: true,
            anonymize_phones: true,
            anonymize_coordinates: true,
            anonymize_timestamps: true,
            hash_salt: 'tripnara-pii-salt-2025',
        };
    }
    async anonymizeTrajectory(trajectory, config = {}) {
        this.logger.debug(`[PIIAnonymizer] 脱敏轨迹: trajectoryId=${trajectory.trajectory_id}`);
        const finalConfig = { ...this.defaultConfig, ...config };
        const anonymizedFields = [];
        const anonymizedMetadata = { ...trajectory.metadata };
        if (finalConfig.anonymize_timestamps) {
            anonymizedMetadata.created_at = this.anonymizeTimestamp(anonymizedMetadata.created_at);
            anonymizedMetadata.updated_at = this.anonymizeTimestamp(anonymizedMetadata.updated_at);
            anonymizedFields.push('metadata.created_at', 'metadata.updated_at');
        }
        const anonymizedSteps = trajectory.steps.map((step, index) => {
            const anonymizedStep = { ...step };
            anonymizedStep.state = this.anonymizeState(step.state, finalConfig, anonymizedFields);
            anonymizedStep.action = this.anonymizeAction(step.action, finalConfig, anonymizedFields);
            anonymizedStep.reward = step.reward;
            if (step.next_state) {
                anonymizedStep.next_state = this.anonymizeState(step.next_state, finalConfig, anonymizedFields);
            }
            if (finalConfig.anonymize_timestamps) {
                anonymizedStep.timestamp = this.anonymizeTimestamp(step.timestamp);
                anonymizedFields.push(`steps[${index}].timestamp`);
            }
            return anonymizedStep;
        });
        const anonymizedTrajectory = {
            ...trajectory,
            metadata: anonymizedMetadata,
            steps: anonymizedSteps,
            anonymization_metadata: {
                anonymized_at: new Date().toISOString(),
                config: finalConfig,
                anonymized_fields: [...new Set(anonymizedFields)],
            },
        };
        this.logger.log(`[PIIAnonymizer] 轨迹脱敏完成: trajectoryId=${trajectory.trajectory_id}, anonymizedFields=${anonymizedFields.length}`);
        return anonymizedTrajectory;
    }
    anonymizeField(fieldName, fieldValue, config = {}) {
        const finalConfig = { ...this.defaultConfig, ...config };
        const fieldLower = fieldName.toLowerCase();
        if (fieldLower.includes('user') && fieldLower.includes('id') && finalConfig.anonymize_user_ids) {
            return this.hashValue(fieldValue, 'user', finalConfig.hash_salt);
        }
        if (fieldLower.includes('email') && finalConfig.anonymize_emails) {
            return this.hashValue(fieldValue, 'email', finalConfig.hash_salt);
        }
        if ((fieldLower.includes('phone') || fieldLower.includes('tel')) &&
            finalConfig.anonymize_phones) {
            return this.hashValue(fieldValue, 'phone', finalConfig.hash_salt);
        }
        if ((fieldLower.includes('lat') || fieldLower.includes('lng') || fieldLower.includes('coord')) &&
            finalConfig.anonymize_coordinates) {
            return fieldValue;
        }
        if (fieldLower.includes('timestamp') || fieldLower.includes('time') || fieldLower.includes('date')) {
            if (finalConfig.anonymize_timestamps) {
                return this.anonymizeTimestamp(fieldValue);
            }
        }
        return fieldValue;
    }
    anonymizeState(state, config, anonymizedFields) {
        var _a;
        const anonymized = { ...state };
        if (config.anonymize_user_ids && state.request_id) {
            anonymized.request_id = this.hashValue(state.request_id, 'req', config.hash_salt);
            anonymizedFields.push('state.request_id');
        }
        if (config.anonymize_user_ids && state.trip_id) {
            anonymized.trip_id = this.hashValue(state.trip_id, 'trip', config.hash_salt);
            anonymizedFields.push('state.trip_id');
        }
        if (state.user_request) {
            anonymized.user_request = this.anonymizeUserRequest(state.user_request, config);
            anonymizedFields.push('state.user_request');
        }
        if (config.anonymize_coordinates) {
            if (state.origin && typeof state.origin === 'object' && 'lat' in state.origin) {
                const anonymizedCoords = this.anonymizeCoordinates(state.origin);
                let anonymizedOrigin = '[location_redacted]';
                if (anonymizedCoords.city_name && anonymizedCoords.country_code) {
                    anonymizedOrigin = `${anonymizedCoords.city_name}, ${anonymizedCoords.country_code}`;
                }
                else if (anonymizedCoords.city_name) {
                    anonymizedOrigin = anonymizedCoords.city_name;
                }
                else if (anonymizedCoords.country_code) {
                    anonymizedOrigin = anonymizedCoords.country_code;
                }
                anonymized.origin = anonymizedOrigin;
                anonymizedFields.push('state.origin');
            }
            if (state.destination &&
                typeof state.destination === 'object' &&
                'lat' in state.destination) {
                const anonymizedCoords = this.anonymizeCoordinates(state.destination);
                let anonymizedDestination = '[location_redacted]';
                if (anonymizedCoords.city_name && anonymizedCoords.country_code) {
                    anonymizedDestination = `${anonymizedCoords.city_name}, ${anonymizedCoords.country_code}`;
                }
                else if (anonymizedCoords.city_name) {
                    anonymizedDestination = anonymizedCoords.city_name;
                }
                else if (anonymizedCoords.country_code) {
                    anonymizedDestination = anonymizedCoords.country_code;
                }
                anonymized.destination = anonymizedDestination;
                anonymizedFields.push('state.destination');
            }
            if (state.current_itinerary) {
                anonymized.current_itinerary = this.anonymizeItinerary(state.current_itinerary, config);
                anonymizedFields.push('state.current_itinerary');
            }
        }
        if (config.anonymize_timestamps && ((_a = state.metadata) === null || _a === void 0 ? void 0 : _a.timestamp)) {
            anonymized.metadata = {
                ...state.metadata,
                timestamp: this.anonymizeTimestamp(state.metadata.timestamp),
            };
            anonymizedFields.push('state.metadata.timestamp');
        }
        return anonymized;
    }
    anonymizeAction(action, config, anonymizedFields) {
        if (action.action_params) {
            const anonymizedParams = { ...action.action_params };
            if (config.anonymize_coordinates) {
                for (const [key, value] of Object.entries(anonymizedParams)) {
                    if (value &&
                        typeof value === 'object' &&
                        ('lat' in value || 'lng' in value || 'coordinates' in value)) {
                        anonymizedParams[key] = this.anonymizeCoordinates(value);
                        anonymizedFields.push(`action.action_params.${key}`);
                    }
                }
            }
            return {
                ...action,
                action_params: anonymizedParams,
            };
        }
        return action;
    }
    anonymizeUserRequest(request, config) {
        let anonymized = request;
        if (config.anonymize_emails) {
            anonymized = anonymized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email_redacted]');
        }
        if (config.anonymize_phones) {
            anonymized = anonymized.replace(/\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone_redacted]');
        }
        return anonymized;
    }
    anonymizeCoordinates(coords) {
        return {
            country_code: 'UNKNOWN',
            city_name: 'UNKNOWN',
        };
    }
    anonymizeItinerary(itinerary, config) {
        if (!itinerary || !itinerary.days) {
            return itinerary;
        }
        const anonymized = { ...itinerary };
        anonymized.days = itinerary.days.map((day) => {
            const anonymizedDay = { ...day };
            if (anonymizedDay.items) {
                anonymizedDay.items = anonymizedDay.items.map((item) => {
                    var _a;
                    if ((_a = item.location_ref) === null || _a === void 0 ? void 0 : _a.coordinates) {
                        return {
                            ...item,
                            location_ref: {
                                ...item.location_ref,
                                coordinates: undefined,
                            },
                        };
                    }
                    return item;
                });
            }
            return anonymizedDay;
        });
        return anonymized;
    }
    anonymizeTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toISOString().split('T')[0];
        }
        catch (error) {
            this.logger.warn(`[PIIAnonymizer] 无法解析时间戳: ${timestamp}`);
            return timestamp;
        }
    }
    hashValue(value, prefix, salt) {
        const valueStr = String(value);
        const hashInput = salt ? `${salt}:${valueStr}` : valueStr;
        const hash = (0, crypto_1.createHash)('sha256').update(hashInput).digest('hex');
        return `${prefix}_${hash.substring(0, 16)}`;
    }
};
exports.PIIAnonymizerService = PIIAnonymizerService;
exports.PIIAnonymizerService = PIIAnonymizerService = PIIAnonymizerService_1 = __decorate([
    (0, common_1.Injectable)()
], PIIAnonymizerService);
//# sourceMappingURL=pii-anonymizer.service.js.map