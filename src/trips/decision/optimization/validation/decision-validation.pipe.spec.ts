import {
  RequiredValidator,
  StringValidator,
  NumberValidator,
  ArrayValidator,
  EnumValidator,
  DSOValidator,
  CompositeValidator,
  DecisionValidationPipe,
} from './decision-validation.pipe';

describe('RequiredValidator', () => {
  let validator: RequiredValidator;

  beforeEach(() => {
    validator = new RequiredValidator('testField');
  });

  it('should pass for non-empty value', () => {
    expect(validator.validate('value').valid).toBe(true);
    expect(validator.validate(0).valid).toBe(true);
    expect(validator.validate(false).valid).toBe(true);
  });

  it('should fail for undefined', () => {
    const result = validator.validate(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('REQUIRED');
  });

  it('should fail for null', () => {
    const result = validator.validate(null);
    expect(result.valid).toBe(false);
  });

  it('should fail for empty string', () => {
    const result = validator.validate('');
    expect(result.valid).toBe(false);
  });
});

describe('StringValidator', () => {
  it('should validate string type', () => {
    const validator = new StringValidator('field');

    expect(validator.validate('test').valid).toBe(true);
    expect(validator.validate(123 as any).valid).toBe(false);
  });

  it('should validate min length', () => {
    const validator = new StringValidator('field', { minLength: 3 });

    expect(validator.validate('abc').valid).toBe(true);
    expect(validator.validate('ab').valid).toBe(false);
  });

  it('should validate max length', () => {
    const validator = new StringValidator('field', { maxLength: 5 });

    expect(validator.validate('abc').valid).toBe(true);
    expect(validator.validate('abcdef').valid).toBe(false);
  });

  it('should validate pattern', () => {
    const validator = new StringValidator('field', { pattern: /^[a-z]+$/ });

    expect(validator.validate('abc').valid).toBe(true);
    expect(validator.validate('ABC').valid).toBe(false);
    expect(validator.validate('123').valid).toBe(false);
  });

  it('should combine multiple constraints', () => {
    const validator = new StringValidator('field', {
      minLength: 2,
      maxLength: 5,
      pattern: /^[a-z]+$/,
    });

    expect(validator.validate('abc').valid).toBe(true);
    expect(validator.validate('a').valid).toBe(false);
    expect(validator.validate('abcdef').valid).toBe(false);
    expect(validator.validate('ABC').valid).toBe(false);
  });
});

describe('NumberValidator', () => {
  it('should validate number type', () => {
    const validator = new NumberValidator('field');

    expect(validator.validate(42).valid).toBe(true);
    expect(validator.validate(3.14).valid).toBe(true);
    expect(validator.validate('42' as any).valid).toBe(false);
    expect(validator.validate(NaN).valid).toBe(false);
  });

  it('should validate min value', () => {
    const validator = new NumberValidator('field', { min: 0 });

    expect(validator.validate(0).valid).toBe(true);
    expect(validator.validate(10).valid).toBe(true);
    expect(validator.validate(-1).valid).toBe(false);
  });

  it('should validate max value', () => {
    const validator = new NumberValidator('field', { max: 100 });

    expect(validator.validate(50).valid).toBe(true);
    expect(validator.validate(100).valid).toBe(true);
    expect(validator.validate(101).valid).toBe(false);
  });

  it('should validate integer', () => {
    const validator = new NumberValidator('field', { integer: true });

    expect(validator.validate(42).valid).toBe(true);
    expect(validator.validate(3.14).valid).toBe(false);
  });

  it('should combine constraints', () => {
    const validator = new NumberValidator('field', {
      min: 1,
      max: 10,
      integer: true,
    });

    expect(validator.validate(5).valid).toBe(true);
    expect(validator.validate(0).valid).toBe(false);
    expect(validator.validate(11).valid).toBe(false);
    expect(validator.validate(5.5).valid).toBe(false);
  });
});

describe('ArrayValidator', () => {
  it('should validate array type', () => {
    const validator = new ArrayValidator('field');

    expect(validator.validate([1, 2, 3]).valid).toBe(true);
    expect(validator.validate('not array' as any).valid).toBe(false);
  });

  it('should validate min items', () => {
    const validator = new ArrayValidator('field', { minItems: 2 });

    expect(validator.validate([1, 2]).valid).toBe(true);
    expect(validator.validate([1]).valid).toBe(false);
  });

  it('should validate max items', () => {
    const validator = new ArrayValidator('field', { maxItems: 3 });

    expect(validator.validate([1, 2]).valid).toBe(true);
    expect(validator.validate([1, 2, 3, 4]).valid).toBe(false);
  });

  it('should validate items with item validator', () => {
    const validator = new ArrayValidator<number>('field', {
      itemValidator: new NumberValidator('item', { min: 0 }),
    });

    expect(validator.validate([1, 2, 3]).valid).toBe(true);
    expect(validator.validate([1, -1, 3]).valid).toBe(false);
  });
});

describe('EnumValidator', () => {
  it('should validate allowed values', () => {
    const validator = new EnumValidator<'a' | 'b' | 'c'>('field', ['a', 'b', 'c']);

    expect(validator.validate('a').valid).toBe(true);
    expect(validator.validate('b').valid).toBe(true);
    expect(validator.validate('d' as any).valid).toBe(false);
  });

  it('should include allowed values in error message', () => {
    const validator = new EnumValidator('field', ['x', 'y']);

    const result = validator.validate('z' as any);
    expect(result.errors[0].message).toContain('x');
    expect(result.errors[0].message).toContain('y');
  });
});

describe('DSOValidator', () => {
  it('should require requestId', () => {
    const validator = new DSOValidator();

    expect(validator.validate({ requestId: 'req-1' }).valid).toBe(true);
    expect(validator.validate({}).valid).toBe(false);
  });

  it('should validate object type', () => {
    const validator = new DSOValidator();

    expect(validator.validate(null as any).valid).toBe(false);
    expect(validator.validate('string' as any).valid).toBe(false);
  });

  it('should require user preferences when configured', () => {
    const validator = new DSOValidator({ requireUserPreferences: true });

    const result = validator.validate({ requestId: 'req-1' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field.includes('userPreferences'))).toBe(true);
  });

  it('should require constraints when configured', () => {
    const validator = new DSOValidator({ requireConstraints: true });

    const result = validator.validate({ requestId: 'req-1' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field.includes('constraints'))).toBe(true);
  });

  it('should limit candidates count', () => {
    const validator = new DSOValidator({ maxCandidates: 5 });

    const result = validator.validate({
      requestId: 'req-1',
      candidates: [1, 2, 3, 4, 5, 6, 7],
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MAX_ITEMS');
  });
});

describe('CompositeValidator', () => {
  it('should run all validators', () => {
    const validator = new CompositeValidator()
      .addValidator('name', new RequiredValidator('name'))
      .addValidator('age', new NumberValidator('age', { min: 0 }));

    const result = validator.validate({ name: 'John', age: 25 });
    expect(result.valid).toBe(true);
  });

  it('should collect errors from all validators', () => {
    const validator = new CompositeValidator()
      .addValidator('name', new RequiredValidator('name'))
      .addValidator('age', new NumberValidator('age', { min: 0 }));

    const result = validator.validate({ age: -5 });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it('should handle nested fields', () => {
    const validator = new CompositeValidator()
      .addValidator('user.name', new RequiredValidator('user.name'));

    expect(validator.validate({ user: { name: 'John' } }).valid).toBe(true);
    expect(validator.validate({ user: {} }).valid).toBe(false);
  });
});

describe('DecisionValidationPipe', () => {
  let pipe: DecisionValidationPipe;

  beforeEach(() => {
    pipe = new DecisionValidationPipe();
  });

  it('should pass through non-body values', () => {
    const value = { test: 'data' };
    const result = pipe.transform(value, { type: 'query', metatype: undefined, data: undefined });
    expect(result).toBe(value);
  });

  it('should pass through null values', () => {
    const result = pipe.transform(null, { type: 'body', metatype: undefined, data: undefined });
    expect(result).toBe(null);
  });

  it('should allow custom validator registration', () => {
    class TestDto {}
    const compositeValidator = new CompositeValidator()
      .addValidator('name', new RequiredValidator('name'));
    pipe.registerValidator('testdto', compositeValidator);

    expect(() => pipe.transform(
      { age: 25 },
      { type: 'body', metatype: TestDto, data: undefined },
    )).toThrow();
  });

  it('should pass value without registered validator', () => {
    const value = { data: 'test' };
    class UnknownDto {}

    const result = pipe.transform(value, {
      type: 'body',
      metatype: UnknownDto,
      data: undefined,
    });

    expect(result).toBe(value);
  });
});
