export interface TransportModeRequirement {
    mode: 'ferry' | 'flight' | 'rail' | 'bus' | 'drive';
    required: boolean;
    optional: boolean;
    hints?: {
        operator?: string;
        bookingLink?: string;
        frequency?: string;
        duration?: string;
    };
}
export interface BookingHint {
    type: 'official' | 'reliable' | 'alternative';
    category: 'permit' | 'guide' | 'transport' | 'accommodation' | 'activity';
    linkType: string;
    description?: string;
    priority?: number;
}
export interface ComplianceCapabilities {
    canBookRailPass?: boolean;
    needsPermit?: boolean;
    needsGuide?: boolean;
    restrictedAreas?: string[];
    permitProviders?: BookingHint[];
    guideProviders?: BookingHint[];
}
export interface RouteDirectionExtensions {
    transport?: {
        requiredModes?: TransportModeRequirement[];
        optionalModes?: TransportModeRequirement[];
        entryPoints?: Array<{
            type: 'airport' | 'station' | 'port' | 'city';
            name: string;
            code?: string;
            coordinates?: {
                lat: number;
                lng: number;
            };
        }>;
    };
    booking?: {
        hints?: BookingHint[];
        recommendedProviders?: BookingHint[];
    };
    compliance?: ComplianceCapabilities;
    estimatedDuration?: number;
    estimatedCost?: number;
}
