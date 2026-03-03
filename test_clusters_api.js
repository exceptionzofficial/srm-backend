require('dotenv').config();
const axios = require('axios');

const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}/api/clusters`;

async function runTests() {
    console.log('🧪 Starting Cluster API Smoke Tests...');

    try {
        // 1. Get initial clusters
        console.log('1. Fetching initial clusters...');
        const res1 = await axios.get(BASE_URL);
        console.log(`   Found ${res1.data.clusters.length} clusters.`);

        // 2. Create a cluster
        console.log('2. Creating a test cluster...');
        const newCluster = {
            name: 'Test Cluster ' + Date.now(),
            branchIds: ['branch-1', 'branch-2'],
            isActive: true
        };
        const res2 = await axios.post(BASE_URL, newCluster);
        const createdCluster = res2.data.cluster;
        console.log(`   Created: ${createdCluster.name} (ID: ${createdCluster.clusterId})`);

        // 3. Update the cluster
        console.log('3. Updating the test cluster...');
        const res3 = await axios.put(`${BASE_URL}/${createdCluster.clusterId}`, {
            name: createdCluster.name + ' - Updated'
        });
        console.log(`   Updated Name: ${res3.data.cluster.name}`);

        // 4. Delete the cluster
        console.log('4. Deleting the test cluster...');
        const res4 = await axios.delete(`${BASE_URL}/${createdCluster.clusterId}`);
        console.log(`   Delete Status: ${res4.data.success ? 'Success' : 'Failed'}`);

        console.log('\n✅ All smoke tests passed!');
    } catch (error) {
        console.error('\n❌ Test failed:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Message: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   Error: ${error.message}`);
        }
        process.exit(1);
    }
}

runTests();
