import {
  ROAD_STATUS_VALUES,
  VEHICLE_DRIVETRAIN_VALUES,
} from '../contracts/common-states.types';
import {
  assertTravelOntologyProjectionIntegrity,
  TRAVEL_ONTOLOGY_TYPE_PROJECTIONS,
} from './travel-ontology-type-projections';

describe('travel-ontology catalog projection', () => {
  it('has no enum fields missing enumRef', () => {
    expect(assertTravelOntologyProjectionIntegrity()).toEqual([]);
  });

  it('RouteSegment.currentRoadStatus uses ROAD_STATUS_VALUES contract const', () => {
    const seg = TRAVEL_ONTOLOGY_TYPE_PROJECTIONS.find((t) => t.typeId === 'RouteSegment');
    const field = seg?.fields.find((f) => f.name === 'currentRoadStatus');
    expect(field?.enumRef).toBe(ROAD_STATUS_VALUES);
  });

  it('RentalVehicle.drivetrain uses VEHICLE_DRIVETRAIN_VALUES', () => {
    const v = TRAVEL_ONTOLOGY_TYPE_PROJECTIONS.find((t) => t.typeId === 'RentalVehicle');
    const field = v?.fields.find((f) => f.name === 'drivetrain');
    expect(field?.enumRef).toBe(VEHICLE_DRIVETRAIN_VALUES);
  });
});
