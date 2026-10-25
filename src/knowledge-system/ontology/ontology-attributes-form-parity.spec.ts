import {
  filterOntologyAttributes,
  enrichOntologyAttribute,
  validateEntityProperties,
  normalizeDomainFilter,
} from './ontology-attribute-query.util';
import { ONTOLOGY_ATTRIBUTES, ONTOLOGY_TYPES } from './ontology-catalog';
import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import { KnowledgeOntologyService } from './knowledge-ontology.service';

describe('ontology attributes form ↔ list同源', () => {
  let ontology: KnowledgeOntologyService;
  let registry: EntityIdentityRegistryService;

  beforeAll(async () => {
    registry = new EntityIdentityRegistryService();
    await registry.onModuleInit();
    ontology = new KnowledgeOntologyService(registry);
    await ontology.onModuleInit();
  });

  it('domain Place / PLACE 过滤规则一致', () => {
    const a = filterOntologyAttributes(ONTOLOGY_ATTRIBUTES, ONTOLOGY_TYPES, {
      domain: 'Place',
      status: 'enabled',
    });
    const b = filterOntologyAttributes(ONTOLOGY_ATTRIBUTES, ONTOLOGY_TYPES, {
      domain: 'PLACE',
      status: 'enabled',
    });
    expect(normalizeDomainFilter('Place', ONTOLOGY_TYPES)).toBe('PLACE');
    expect(a.map((x) => x.attributeId)).toEqual(b.map((x) => x.attributeId));
    expect(a.length).toBeGreaterThan(0);
  });

  it('ownerTypeId=Place + limit=200 与属性管理同集合', () => {
    const listed = ontology.listAttributes({ ownerTypeId: 'Place', limit: 200 });
    expect(listed.pageSize).toBe(200);
    expect(listed.statusFilter).toBe('enabled');
    expect(listed.total).toBeGreaterThanOrEqual(8);
    expect(listed.items.length).toBe(listed.total);

    const ids = listed.items.map((i) => i.attributeId).sort();
    const fromType = ontology
      .getType('Place')
      .attributes.map((a: { attributeId: string }) => a.attributeId)
      .sort();
    expect(ids).toEqual(fromType);

    const sample = listed.items[0]!;
    expect(sample.displayName).toBeTruthy();
    expect(sample.fieldKey).toBeTruthy();
    expect(sample.valueKindDisplayName).toBeTruthy();
    expect(sample.status).toBe('enabled');
    expect(sample.applicableEntityTypes).toEqual(['Place']);
    expect(sample.ownerTypeId).toBe('Place');
  });

  it('枚举属性 enumValues 与详情一致', () => {
    const listed = ontology.listAttributes({
      ownerTypeId: 'RouteSegment',
      limit: 200,
    });
    const road = listed.items.find((a) => a.fieldKey === 'currentRoadStatus');
    expect(road).toBeTruthy();
    const detail = ontology.getAttribute('RouteSegment.currentRoadStatus');
    expect(road!.enumValues?.map((e) => e.value)).toEqual(
      detail.enumValues?.map((e) => e.value),
    );
    expect(road!.enumValues?.find((e) => e.value === 'CLOSED')?.displayName).toBe('封闭');
  });

  it('enrich 含表单所需字段', () => {
    const raw = ONTOLOGY_ATTRIBUTES.find((a) => a.attributeId === 'RouteSegment.currentRoadStatus')!;
    const e = enrichOntologyAttribute(raw, ONTOLOGY_TYPES);
    expect(e.attributeId).toBe('RouteSegment.currentRoadStatus');
    expect(e.displayName).toBe('当前道路状态');
    expect(e.valueKind).toBe('enum');
    expect(e.valueKindDisplayName).toBe('枚举');
    expect(typeof e.required).toBe('boolean');
    expect(e.valueSchemaName).toBe('enum');
    expect(e.valueSchema.enum).toContain('CLOSED');
  });

  it('properties 校验：未知 key / 非法枚举 / 合法回读', () => {
    const attrs = ontology.attributesForOwnerType('RouteSegment');
    const bad = validateEntityProperties({
      ownerTypeId: 'RouteSegment',
      properties: { unknownFoo: 1 },
      attributes: attrs,
      mode: 'patch',
    });
    expect(bad.ok).toBe(false);

    const badEnum = validateEntityProperties({
      ownerTypeId: 'RouteSegment',
      properties: { currentRoadStatus: 'NOT_A_STATUS' },
      attributes: attrs,
      mode: 'patch',
    });
    expect(badEnum.ok).toBe(false);

    const ok = validateEntityProperties({
      ownerTypeId: 'RouteSegment',
      properties: {
        'RouteSegment.currentRoadStatus': 'CLOSED',
      },
      attributes: attrs,
      mode: 'patch',
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.properties.currentRoadStatus).toBe('CLOSED');
    }

    const created = registry.createCanonical({
      name: 'F208 test seg',
      type: 'RouteSegment',
      canonicalEntityId: 'segment:is:test_attr_form',
      properties: {
        segmentId: 'segment:is:test_attr_form',
        roadId: 'road:is:f208',
        roadClass: 'F_ROAD',
        currentRoadStatus: 'OPEN',
      },
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.entity.properties?.currentRoadStatus).toBe('OPEN');
      expect(created.entity.properties?.roadClass).toBe('F_ROAD');
    }
  });
});
