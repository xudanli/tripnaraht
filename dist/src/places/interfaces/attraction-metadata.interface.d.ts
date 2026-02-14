export interface BasicMetadata {
    type?: 'NATURAL' | 'CULTURAL' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'OTHER';
    openingHours?: {
        weekday?: {
            open: string;
            close: string;
        };
        weekend?: {
            open: string;
            close: string;
        };
        special?: Array<{
            date: string;
            open: string;
            close: string;
        }>;
        timezone?: string;
        note?: string;
    };
    ticketPrice?: {
        adult?: number;
        child?: number;
        senior?: number;
        student?: number;
        currency?: string;
        free?: boolean;
        note?: string;
    };
    contact?: {
        phone?: string;
        email?: string;
        website?: string;
        wechat?: string;
        weibo?: string;
    };
    officialWebsite?: string;
}
export interface ExperienceMetadata {
    highlights?: Array<{
        keyword: string;
        weight: number;
        category?: 'SCENERY' | 'CULTURE' | 'ACTIVITY' | 'FOOD' | 'PHOTO';
    }>;
    atmosphere?: Array<'ROMANTIC' | 'QUIET' | 'LIVELY' | 'SERENE' | 'URBAN' | 'NATURAL'>;
    suitableFor?: Array<'FAMILY' | 'COUPLE' | 'SENIOR' | 'SOLO' | 'FRIENDS' | 'BUSINESS'>;
    interestVector?: {
        history?: number;
        nature?: number;
        photography?: number;
        food?: number;
        shopping?: number;
        adventure?: number;
        culture?: number;
        relaxation?: number;
    };
    walkingIntensity?: 1 | 2 | 3 | 4 | 5;
    physicalRequirement?: 'LOW' | 'MEDIUM' | 'HIGH';
    terrain?: {
        type?: 'FLAT' | 'SLOPE' | 'STAIRS' | 'MIXED';
        wheelchairAccessible?: boolean;
        strollerFriendly?: boolean;
        difficulty?: 'EASY' | 'MODERATE' | 'HARD';
    };
    estimatedCost?: {
        min?: number;
        max?: number;
        currency?: string;
        includes?: string[];
    };
    hasPaidActivities?: boolean;
    paidActivities?: Array<{
        name: string;
        price: number;
        currency?: string;
    }>;
}
export interface ConstraintMetadata {
    crowdLevel?: {
        current?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
        predicted?: {
            weekday?: 'LOW' | 'MEDIUM' | 'HIGH';
            weekend?: 'LOW' | 'MEDIUM' | 'HIGH';
            peakHours?: string[];
        };
        lastUpdated?: string;
    };
    queueTime?: {
        average?: number;
        peak?: number;
        prediction?: {
            weekday?: number;
            weekend?: number;
            peakHours?: number;
        };
    };
    weatherSensitivity?: {
        heat?: 'LOW' | 'MEDIUM' | 'HIGH';
        rain?: 'LOW' | 'MEDIUM' | 'HIGH';
        wind?: 'LOW' | 'MEDIUM' | 'HIGH';
        indoor?: boolean;
        covered?: boolean;
    };
    safety?: {
        index?: number;
        nightSafe?: boolean;
        remote?: boolean;
        lighting?: 'GOOD' | 'MODERATE' | 'POOR';
        security?: 'GOOD' | 'MODERATE' | 'POOR';
    };
    capacity?: {
        maxVisitors?: number;
        requiresReservation?: boolean;
        reservationUrl?: string;
        reservationPhone?: string;
        walkInAllowed?: boolean;
    };
    risks?: Array<{
        type: 'CONSTRUCTION' | 'CLOSED_AREA' | 'WEATHER' | 'CROWD' | 'OTHER';
        description: string;
        severity?: 'LOW' | 'MEDIUM' | 'HIGH';
        startDate?: string;
        endDate?: string;
        affectedAreas?: string[];
    }>;
}
export interface TimeMetadata {
    recommendedDuration?: {
        min?: number;
        max?: number;
        typical?: number;
        byActivity?: Array<{
            activity: string;
            duration: number;
        }>;
    };
    areaDurations?: Array<{
        area: string;
        minDuration: number;
        maxDuration: number;
        mustSee?: boolean;
    }>;
    bestVisitTime?: {
        timeOfDay?: Array<'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT'>;
        specificTime?: string;
        reason?: string;
        seasonal?: Array<{
            season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
            bestTime: string;
        }>;
    };
    schedule?: Array<{
        name: string;
        type: 'SHOW' | 'ACTIVITY' | 'EVENT' | 'GUIDED_TOUR';
        times: Array<{
            weekday?: string[];
            weekend?: string[];
            special?: Array<{
                date: string;
                times: string[];
            }>;
        }>;
        duration?: number;
        requiresBooking?: boolean;
    }>;
    peakHours?: {
        weekday?: string[];
        weekend?: string[];
        holiday?: string[];
    };
}
export interface TransportMetadata {
    nearestStations?: Array<{
        type: 'SUBWAY' | 'BUS' | 'TRAIN' | 'TAXI' | 'PARKING';
        name: string;
        distance?: number;
        walkTime?: number;
        coordinates?: {
            lat: number;
            lng: number;
        };
    }>;
    walkTime?: {
        fromSubway?: number;
        fromBus?: number;
        fromParking?: number;
    };
    driveTime?: {
        fromCityCenter?: number;
        fromAirport?: number;
        fromTrainStation?: number;
    };
    publicTransport?: {
        accessible?: boolean;
        lines?: Array<{
            type: 'SUBWAY' | 'BUS';
            line: string;
            station: string;
            walkTime?: number;
        }>;
        frequency?: 'HIGH' | 'MEDIUM' | 'LOW';
    };
    parking?: {
        available?: boolean;
        type?: 'FREE' | 'PAID' | 'STREET' | 'GARAGE';
        price?: {
            perHour?: number;
            perDay?: number;
            currency?: string;
        };
        capacity?: number;
        note?: string;
    };
    transitTimeCache?: Record<string, {
        walkTime?: number;
        driveTime?: number;
        publicTransportTime?: number;
        lastUpdated?: string;
    }>;
}
export interface AIMetadata {
    userProfileScores?: Record<string, number>;
    embedding?: number[];
    embeddingModel?: string;
    scenarioFit?: {
        halfDay?: number;
        fullDay?: number;
        familyTrip?: number;
        coupleTrip?: number;
        soloTrip?: number;
        businessTrip?: number;
    };
    recommendationReasons?: Array<{
        profile: string;
        reason: string;
        score: number;
    }>;
}
export interface AttractionMetadata {
    basic?: BasicMetadata;
    experience?: ExperienceMetadata;
    constraints?: ConstraintMetadata;
    time?: TimeMetadata;
    transport?: TransportMetadata;
    ai?: AIMetadata;
}
