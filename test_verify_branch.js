const API_URL = 'http://localhost:3001/api';

async function testVerification() {
    try {
        console.log('--- Testing Verify ID with Branch ---');

        // 1. Get an active branch
        console.log('Fetching branches...');
        const branchesRes = await fetch(`${API_URL}/branches/active`);
        const branchesData = await branchesRes.json();
        const branches = branchesData.branches;

        if (!branches || branches.length === 0) {
            console.error('No active branches found to test with.');
            return;
        }

        const testBranch = branches[0];
        console.log(`Using Branch: ${testBranch.name} (${testBranch.branchId})`);

        // 2. Create a temporary employee for this branch
        const empId = 'TEST' + Math.floor(Math.random() * 1000);
        console.log(`Creating test employee: ${empId}`);
        await fetch(`${API_URL}/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employeeId: empId,
                name: 'Test Verify User',
                branchId: testBranch.branchId
            })
        });

        // 3. Test Verify - SUCCESS CASE (Correct Branch)
        console.log('\nTest 1: Verify with CORRECT Branch ID...');
        const successRes = await fetch(`${API_URL}/employees/verify-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employeeId: empId,
                branchId: testBranch.branchId
            })
        });
        const successData = await successRes.json();

        if (successData.success) {
            console.log('✅ Success: Employee verified with correct branch.');
        } else {
            console.error('❌ Failed: Should have succeeded.', successData);
        }

        // 4. Test Verify - FAILURE CASE (Incorrect Branch)
        console.log('\nTest 2: Verify with WRONG Branch ID...');
        const wrongBranchId = 'wrong-branch-id-123';
        const failRes = await fetch(`${API_URL}/employees/verify-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employeeId: empId,
                branchId: wrongBranchId
            })
        });
        const failData = await failRes.json();

        if (failRes.status === 403) {
            console.log('✅ Success: Blocked access with wrong branch.');
        } else {
            console.error(`❌ Failed: Unexpected status ${failRes.status}.`, failData);
        }

        // 5. Cleanup
        console.log('\nCleaning up...');
        await fetch(`${API_URL}/employees/${empId}`, { method: 'DELETE' });
        console.log('Test complete.');

    } catch (error) {
        console.error('Test script error:', error);
    }
}

testVerification();
