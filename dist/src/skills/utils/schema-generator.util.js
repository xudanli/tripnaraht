"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertDtoToZod = convertDtoToZod;
exports.convertDtoToMcpSchema = convertDtoToMcpSchema;
exports.generateBasicSchemaFromInterface = generateBasicSchemaFromInterface;
require("reflect-metadata");
const zod_1 = require("zod");
function getNestedType(proto, propertyName) {
    try {
        const typeMetadata = Reflect.getMetadata('design:type', proto, propertyName);
        const transformerMetadata = Reflect.getMetadata('__transformer_metadata__', proto, propertyName);
        if (transformerMetadata === null || transformerMetadata === void 0 ? void 0 : transformerMetadata.type) {
            return transformerMetadata.type;
        }
        const typeTransformKey = 'design:type';
        const typeTransform = Reflect.getMetadata(typeTransformKey, proto, propertyName);
        if (typeTransform && typeof typeTransform === 'function') {
            return typeTransform;
        }
        return typeMetadata;
    }
    catch (error) {
        return undefined;
    }
}
function convertValidatorMetadataToZod(propertyName, metadatas, propertyType, proto) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    let schema;
    const isOptional = metadatas.some(m => m.type === 'isOptional' || m.type === 'conditionalValidation');
    const isNested = metadatas.some(m => m.type === 'nestedValidation');
    if (isNested && proto) {
        const nestedType = getNestedType(proto, propertyName);
        if (nestedType && typeof nestedType === 'function') {
            schema = convertDtoToZod(nestedType);
            if (isOptional) {
                schema = schema.optional();
            }
            return schema;
        }
    }
    const isArray = metadatas.some(m => m.type === 'isArray' || m.type === 'arrayContains' || m.type === 'arrayMinSize' || m.type === 'arrayMaxSize');
    if (isArray) {
        let arrayItemType = propertyType;
        if (proto) {
            const nestedType = getNestedType(proto, propertyName);
            if (nestedType && typeof nestedType === 'function') {
                arrayItemType = nestedType;
            }
        }
        if (arrayItemType && typeof arrayItemType === 'function' && arrayItemType !== Array && arrayItemType !== Object) {
            schema = zod_1.z.array(convertDtoToZod(arrayItemType));
        }
        else {
            schema = zod_1.z.array(zod_1.z.any());
        }
        const arrayMinSize = (_b = (_a = metadatas.find(m => m.type === 'arrayMinSize')) === null || _a === void 0 ? void 0 : _a.constraints) === null || _b === void 0 ? void 0 : _b[0];
        const arrayMaxSize = (_d = (_c = metadatas.find(m => m.type === 'arrayMaxSize')) === null || _c === void 0 ? void 0 : _c.constraints) === null || _d === void 0 ? void 0 : _d[0];
        if (arrayMinSize !== undefined) {
            schema = schema.min(arrayMinSize);
        }
        if (arrayMaxSize !== undefined) {
            schema = schema.max(arrayMaxSize);
        }
        if (isOptional) {
            schema = schema.optional();
        }
        return schema;
    }
    if (propertyType === String || propertyType === 'string') {
        schema = zod_1.z.string();
        const enumMetadata = metadatas.find(m => m.type === 'isEnum');
        if ((_e = enumMetadata === null || enumMetadata === void 0 ? void 0 : enumMetadata.constraints) === null || _e === void 0 ? void 0 : _e[0]) {
            schema = zod_1.z.enum(enumMetadata.constraints[0]);
        }
        const lengthMetadata = metadatas.find(m => m.type === 'length');
        if (lengthMetadata === null || lengthMetadata === void 0 ? void 0 : lengthMetadata.constraints) {
            const [min, max] = lengthMetadata.constraints;
            if (min !== undefined)
                schema = schema.min(min);
            if (max !== undefined)
                schema = schema.max(max);
        }
        const isDateString = metadatas.some(m => m.type === 'isDateString');
        if (isDateString) {
            schema = zod_1.z.string().datetime().or(zod_1.z.string().date());
        }
        const matchesMetadata = metadatas.find(m => m.type === 'matches');
        if ((_f = matchesMetadata === null || matchesMetadata === void 0 ? void 0 : matchesMetadata.constraints) === null || _f === void 0 ? void 0 : _f[0]) {
            schema = schema.regex(new RegExp(matchesMetadata.constraints[0]));
        }
    }
    else if (propertyType === Number || propertyType === 'number') {
        schema = zod_1.z.number();
        const minMetadata = metadatas.find(m => m.type === 'min');
        if (((_g = minMetadata === null || minMetadata === void 0 ? void 0 : minMetadata.constraints) === null || _g === void 0 ? void 0 : _g[0]) !== undefined) {
            schema = schema.min(minMetadata.constraints[0]);
        }
        const maxMetadata = metadatas.find(m => m.type === 'max');
        if (((_h = maxMetadata === null || maxMetadata === void 0 ? void 0 : maxMetadata.constraints) === null || _h === void 0 ? void 0 : _h[0]) !== undefined) {
            schema = schema.max(maxMetadata.constraints[0]);
        }
    }
    else if (propertyType === Boolean || propertyType === 'boolean') {
        schema = zod_1.z.boolean();
    }
    else if (propertyType === Array || Array.isArray(propertyType)) {
        const arrayItemType = Array.isArray(propertyType) ? propertyType[0] : String;
        const arrayMetadatas = metadatas.filter(m => m.type.startsWith('array'));
        schema = zod_1.z.array(zod_1.z.string());
        const arrayLengthMetadata = metadatas.find(m => m.type === 'arrayLength');
        if (arrayLengthMetadata === null || arrayLengthMetadata === void 0 ? void 0 : arrayLengthMetadata.constraints) {
            const [min, max] = arrayLengthMetadata.constraints;
            if (min !== undefined)
                schema = schema.min(min);
            if (max !== undefined)
                schema = schema.max(max);
        }
    }
    else if (typeof propertyType === 'function' && propertyType !== Object && propertyType !== Array) {
        schema = convertDtoToZod(propertyType);
    }
    else {
        schema = zod_1.z.any();
    }
    if (isOptional) {
        schema = schema.optional();
    }
    return schema;
}
function convertDtoToZod(DtoClass) {
    let targetMetadata = [];
    try {
        const { MetadataStorage } = require('class-validator');
        const metadataStorage = MetadataStorage.getMetadataStorage();
        targetMetadata = metadataStorage.getTargetValidationMetadatas(DtoClass, '', false, false) || [];
    }
    catch (error) {
        console.warn('class-validator MetadataStorage 不可用，使用基础类型推断');
    }
    const shape = {};
    const propertiesMap = new Map();
    targetMetadata.forEach((metadata) => {
        if (metadata.propertyName) {
            if (!propertiesMap.has(metadata.propertyName)) {
                propertiesMap.set(metadata.propertyName, []);
            }
            propertiesMap.get(metadata.propertyName).push(metadata);
        }
    });
    const proto = DtoClass.prototype;
    const propertyNames = new Set();
    propertiesMap.forEach((_, name) => propertyNames.add(name));
    if (propertyNames.size === 0) {
        for (const key in proto) {
            if (key !== 'constructor' && typeof proto[key] !== 'function') {
                propertyNames.add(key);
            }
        }
    }
    propertyNames.forEach((propertyName) => {
        const metadatas = propertiesMap.get(propertyName) || [];
        let propertyType = Reflect.getMetadata('design:type', proto, propertyName);
        if (!propertyType || propertyType === Object) {
            const nestedType = getNestedType(proto, propertyName);
            if (nestedType) {
                propertyType = nestedType;
            }
            else {
                propertyType = String;
            }
        }
        shape[propertyName] = convertValidatorMetadataToZod(propertyName, metadatas, propertyType, proto);
    });
    return zod_1.z.object(shape);
}
function convertDtoToMcpSchema(DtoClass, description) {
    const zodSchema = convertDtoToZod(DtoClass);
    return zodSchema.shape;
}
function generateBasicSchemaFromInterface(interfaceDefinition) {
    const shape = {};
    for (const [key, value] of Object.entries(interfaceDefinition)) {
        if (value === String || typeof value === 'string') {
            shape[key] = zod_1.z.string().optional();
        }
        else if (value === Number || typeof value === 'number') {
            shape[key] = zod_1.z.number().optional();
        }
        else if (value === Boolean || typeof value === 'boolean') {
            shape[key] = zod_1.z.boolean().optional();
        }
        else if (Array.isArray(value)) {
            shape[key] = zod_1.z.array(zod_1.z.any()).optional();
        }
        else if (typeof value === 'object') {
            shape[key] = zod_1.z.object(generateBasicSchemaFromInterface(value)).optional();
        }
        else {
            shape[key] = zod_1.z.any().optional();
        }
    }
    return shape;
}
//# sourceMappingURL=schema-generator.util.js.map