import { writeFileSync } from 'fs';
import { exportConstraintTemplateCatalog } from '../src/trips/trip-constraint-solver/utils/constraint-template-registry.util';

const outPath = './src/trips/trip-constraint-solver/schemas/constraint-template-registry.json';
const catalog = exportConstraintTemplateCatalog();
writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.templates.length} templates to ${outPath}`);
