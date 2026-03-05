
const axios = require('axios');

async function testBackend() {
    const userId = 'cluster-admin-1'; // A known cluster manager ID
    const url = `http://localhost:5000/api/chat/groups/${userId}`;

    try {
        console.log(`Testing group retrieval for user: ${userId}`);
        const response = await axios.get(url);

        if (response.data.success) {
            console.log('Success!');
            console.log(`Retrieved ${response.data.data.length} groups.`);
            // If it's working, it should return all groups, not just the ones the user is in.
            // We can compare this with a standard user if needed.
        } else {
            console.error('Failed to retrieve groups:', response.data.message);
        }
    } catch (error) {
        console.error('Error connecting to backend:', error.message);
        console.log('Make sure the backend is running on port 5000');
    }
}

testBackend();
