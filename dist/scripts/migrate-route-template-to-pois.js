"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function isOldFormat(dayPlans) {
    if (!dayPlans || !Array.isArray(dayPlans))
        return false;
    return dayPlans.some((plan) => {
        const hasRequiredNodes = plan.requiredNodes && Array.isArray(plan.requiredNodes) && plan.requiredNodes.length > 0;
        const hasPois = plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0;
        return hasRequiredNodes && !hasPois;
    });
}
function normalizeNodeIds(requiredNodes) {
    return requiredNodes
        .map(id => {
        if (typeof id === 'number')
            return id;
        if (typeof id === 'string') {
            const numId = parseInt(id, 10);
            return isNaN(numId) ? null : numId;
        }
        return null;
    })
        .filter((id) => id !== null);
}
async function migrateTemplate(templateId, dryRun = false) {
    const errors = [];
    let migratedDays = 0;
    let migratedPois = 0;
    try {
        const template = await prisma.routeTemplate.findUnique({
            where: { id: templateId },
            include: { routeDirection: true },
        });
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }
        const dayPlans = template.dayPlans;
        if (!dayPlans || !Array.isArray(dayPlans)) {
            throw new Error(`Invalid dayPlans format for template ${templateId}`);
        }
        if (!isOldFormat(dayPlans)) {
            console.log(`✓ Template ${templateId} already uses new format, skipping`);
            return {
                success: true,
                templateId,
                migratedDays: 0,
                migratedPois: 0,
                errors: [],
            };
        }
        console.log(`\n📋 Migrating template ${templateId}: ${template.nameCN || template.name || 'Unnamed'}`);
        const updatedDayPlans = await Promise.all(dayPlans.map(async (plan, index) => {
            const day = plan.day || index + 1;
            const requiredNodes = plan.requiredNodes || [];
            const existingPois = plan.pois || [];
            if (existingPois.length > 0) {
                console.log(`  Day ${day}: Already has ${existingPois.length} POIs, skipping`);
                return plan;
            }
            if (!Array.isArray(requiredNodes) || requiredNodes.length === 0) {
                console.log(`  Day ${day}: No requiredNodes, skipping`);
                return plan;
            }
            console.log(`  Day ${day}: Converting ${requiredNodes.length} requiredNodes to pois...`);
            const nodeIds = normalizeNodeIds(requiredNodes);
            if (nodeIds.length === 0) {
                errors.push(`Template ${templateId}, Day ${day}: No valid node IDs found`);
                return plan;
            }
            const places = await prisma.place.findMany({
                where: {
                    id: { in: nodeIds },
                },
                select: {
                    id: true,
                    uuid: true,
                    nameCN: true,
                    nameEN: true,
                    category: true,
                    address: true,
                    rating: true,
                    description: true,
                },
            });
            const placeMap = new Map(places.map(p => [p.id, p]));
            const pois = [];
            for (let i = 0; i < nodeIds.length; i++) {
                const nodeId = nodeIds[i];
                const place = placeMap.get(nodeId);
                if (!place) {
                    errors.push(`Template ${templateId}, Day ${day}: Place ID ${nodeId} not found in database`);
                    continue;
                }
                pois.push({
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN || undefined,
                    category: place.category || undefined,
                    required: true,
                    priority: 'MUST_SEE',
                    order: i + 1,
                    ...(place.address && { address: place.address }),
                    ...(place.rating && { rating: place.rating }),
                    ...(place.description && { description: place.description }),
                });
            }
            if (pois.length > 0) {
                migratedPois += pois.length;
                migratedDays++;
                console.log(`    ✓ Converted ${pois.length} POIs`);
            }
            return {
                ...plan,
                day,
                pois,
                requiredNodes: requiredNodes,
                _migrated: true,
            };
        }));
        if (!dryRun && migratedPois > 0) {
            await prisma.routeTemplate.update({
                where: { id: templateId },
                data: {
                    dayPlans: updatedDayPlans,
                    updatedAt: new Date(),
                },
            });
            console.log(`✓ Template ${templateId} updated successfully`);
        }
        else if (dryRun) {
            console.log(`[DRY RUN] Would update template ${templateId} with ${migratedPois} POIs`);
        }
        return {
            success: errors.length === 0,
            templateId,
            migratedDays,
            migratedPois,
            errors,
        };
    }
    catch (error) {
        errors.push(`Template ${templateId}: ${error.message}`);
        console.error(`✗ Error migrating template ${templateId}:`, error.message);
        return {
            success: false,
            templateId,
            migratedDays,
            migratedPois,
            errors,
        };
    }
}
async function main() {
    const args = process.argv.slice(2);
    const templateIdArg = args.find(arg => !arg.startsWith('--'));
    const dryRun = args.includes('--dry-run');
    const templateId = templateIdArg ? parseInt(templateIdArg, 10) : null;
    console.log('🚀 Route Template Migration Script');
    console.log('=====================================\n');
    if (dryRun) {
        console.log('⚠️  DRY RUN MODE - No changes will be saved\n');
    }
    try {
        if (templateId) {
            console.log(`Migrating template ${templateId}...\n`);
            const result = await migrateTemplate(templateId, dryRun);
            console.log('\n📊 Migration Summary:');
            console.log(`  Template ID: ${result.templateId}`);
            console.log(`  Migrated Days: ${result.migratedDays}`);
            console.log(`  Migrated POIs: ${result.migratedPois}`);
            if (result.errors.length > 0) {
                console.log(`  Errors: ${result.errors.length}`);
                result.errors.forEach(err => console.log(`    - ${err}`));
            }
        }
        else {
            console.log('Finding templates with old format...\n');
            const templates = await prisma.routeTemplate.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    nameCN: true,
                    dayPlans: true,
                },
            });
            const templatesToMigrate = templates.filter(t => isOldFormat(t.dayPlans));
            console.log(`Found ${templatesToMigrate.length} templates to migrate:\n`);
            templatesToMigrate.forEach(t => {
                console.log(`  - Template ${t.id}: ${t.nameCN || t.name || 'Unnamed'}`);
            });
            if (templatesToMigrate.length === 0) {
                console.log('\n✓ No templates need migration');
                return;
            }
            console.log(`\nStarting migration of ${templatesToMigrate.length} templates...\n`);
            const results = await Promise.all(templatesToMigrate.map(t => migrateTemplate(t.id, dryRun)));
            const totalMigratedDays = results.reduce((sum, r) => sum + r.migratedDays, 0);
            const totalMigratedPois = results.reduce((sum, r) => sum + r.migratedPois, 0);
            const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
            const successCount = results.filter(r => r.success).length;
            console.log('\n📊 Migration Summary:');
            console.log(`  Total Templates: ${templatesToMigrate.length}`);
            console.log(`  Successfully Migrated: ${successCount}`);
            console.log(`  Total Migrated Days: ${totalMigratedDays}`);
            console.log(`  Total Migrated POIs: ${totalMigratedPois}`);
            console.log(`  Total Errors: ${totalErrors}`);
            if (totalErrors > 0) {
                console.log('\n⚠️  Errors:');
                results.forEach(r => {
                    if (r.errors.length > 0) {
                        r.errors.forEach(err => console.log(`    - ${err}`));
                    }
                });
            }
        }
    }
    catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch(console.error);
//# sourceMappingURL=migrate-route-template-to-pois.js.map