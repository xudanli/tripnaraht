import { KnowledgeEntityCreateFormService } from './knowledge-entity-create-form.service';

describe('KnowledgeEntityCreateFormService', () => {
  let form: KnowledgeEntityCreateFormService;

  beforeEach(() => {
    form = new KnowledgeEntityCreateFormService();
  });

  it('lists all ontology types with cascade linkables', () => {
    const { items, total } = form.listCreatableTypes();
    expect(total).toBeGreaterThanOrEqual(15);
    expect(items.some((t) => t.typeId === 'Place' && t.displayName === '地点')).toBe(true);
    const place = items.find((t) => t.typeId === 'Place');
    expect(place?.cascade.country).toBe(true);
    expect(place?.cascade.poi).toBe(true);
    expect(place?.cascade.linkableTypes.length).toBeGreaterThan(0);

    const vehicle = items.find((t) => t.typeId === 'RentalVehicle');
    expect(vehicle?.cascade.country).toBe(true);
    expect(vehicle?.cascade.linkableTypes).toEqual(
      expect.arrayContaining(['RentalContract', 'InsurancePolicy', 'Driver']),
    );

    const driver = items.find((t) => t.typeId === 'Driver');
    expect(driver?.cascade.linkableTypes).toEqual(
      expect.arrayContaining(['TravelerIdentity', 'RentalVehicle']),
    );
  });

  it('every creatable type has country or linkable cascade', () => {
    for (const t of form.listCreatableTypes().items) {
      const hasCascade =
        t.cascade.country ||
        t.cascade.poi ||
        t.cascade.linkableTypes.length > 0 ||
        t.cascade.existingEntities;
      expect(hasCascade).toBe(true);
    }
  });

  it('RouteSegment cascade links Road/Place and has no poi', () => {
    const segment = form.listCreatableTypes().items.find((t) => t.typeId === 'RouteSegment');
    expect(segment?.cascade.poi).toBe(false);
    expect(segment?.cascade.linkableTypes).toEqual(
      expect.arrayContaining(['Road', 'Place', 'WeatherRegion']),
    );
  });
});
