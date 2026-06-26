export type PoiQueryIntent = {
  queryId: string;
  destinationScope: {
    countryCode?: string;
    regionIds?: string[];
    routeCorridorId?: string;
  };
  requiredExperienceAtoms: Array<{
    atom: string;
    weight: number;
  }>;
  preferredPoiTypes: string[];
  audienceRequirements: {
    elderlyFriendly?: boolean;
    childFriendly?: boolean;
  };
  loadLimits: {
    maxWalkingMinutes?: number;
    maxPhysicalEffort?: number;
  };
  contextualConstraints: {
    dateRange?: string[];
    maxDetourMinutes?: number;
    vehicleType?: string;
  };
};

export type ExperienceCandidate = {
  candidateId: string;
  source: 'POI_DATABASE' | 'ACTIVITY_DATABASE' | 'ROUTE_TEMPLATE';
  poiId?: string;
  activityId?: string;
  routeTemplateId?: string;
  proposedExperienceAtoms: Array<{
    atom: string;
    expectedStrength: number;
  }>;
  intendedParticipants: string[];
  proposedTimeWindow?: {
    start: string;
    end: string;
  };
  expectedDwellMinutes?: number;
  itineraryRole: 'ANCHOR' | 'RECOMMENDED' | 'FLEXIBLE';
  retrievalContext: {
    queryId: string;
    matchedFields: string[];
    retrievalScore: number;
  };
  evidenceRefs: string[];
};

export type RepairContract = {
  targetPoiId: string;
  violation: string;
  preserveGoals: string[];
  replacementSearchSpace: {
    routeCorridorId?: string;
    vehicleAccess?: string[];
    maxDetourMinutes?: number;
    excludedPoiIds?: string[];
  };
};
