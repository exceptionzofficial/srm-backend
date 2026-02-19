const PayGroup = require('../models/PayGroup');

const DEFAULT_PAY_GROUPS = [
    { name: 'Kottaiyasammy and co', description: 'Default Pay Group' },
    { name: 'SRM sweets and Cakes', description: 'Default Pay Group' },
    { name: 'SRM Sweets', description: 'Default Pay Group' }
];

async function seedPayGroups() {
    try {
        console.log('🌱 Checking default pay groups...');

        // Fetch existing groups
        const existingGroups = await PayGroup.getAllPayGroups();
        const existingNames = new Set(existingGroups.map(g => g.name.toLowerCase()));

        for (const group of DEFAULT_PAY_GROUPS) {
            if (!existingNames.has(group.name.toLowerCase())) {
                console.log(`Creating missing pay group: ${group.name}`);
                await PayGroup.createPayGroup({
                    name: group.name,
                    description: group.description,
                    isActive: true
                });
            }
        }
        console.log('✅ Pay groups seeding completed');
    } catch (error) {
        console.error('❌ Error seeding pay groups:', error);
    }
}

module.exports = { seedPayGroups };
