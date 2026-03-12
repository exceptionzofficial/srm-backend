const API_URL = 'http://localhost:3001/api';

async function verifyMultiBranchAndTAT() {
    try {
        console.log('--- Phase 1: Verify Multi-Branch Check-in ---');
        
        // 1. Get branches
        const branchesRes = await fetch(`${API_URL}/branches/active`);
        const { branches } = await branchesRes.json();
        if (branches.length < 2) {
            console.log('Not enough branches to test multi-branch. Need 2.');
            return;
        }
        
        const branchA = branches[0];
        const branchB = branches[1];
        
        // 2. Mock employee assigned to Branch A
        const empId = 'T-MULTI-' + Math.floor(Math.random() * 1000);
        await fetch(`${API_URL}/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employeeId: empId,
                name: 'Test Multi Branch User',
                branchId: branchA.branchId,
                status: 'active'
            })
        });
        
        // 3. Try Check-in at Branch B (The mismatched branch)
        console.log(`Attempting check-in for ${empId} at Branch B: ${branchB.name}...`);
        const checkInRes = await fetch(`${API_URL}/attendance/check-in`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expectedEmployeeId: empId,
                branchId: branchB.branchId,
                latitude: branchB.latitude,
                longitude: branchB.longitude,
                imageBase64: 'data:image/jpeg;base64,...' // Mock image
            })
        });
        
        const checkInData = await checkInRes.json();
        if (checkInRes.ok) {
            console.log('✅ SUCCESS: Check-in at different branch allowed!');
        } else {
            console.error('❌ FAILED: Check-in at different branch blocked.', checkInData.message);
        }

        console.log('\n--- Phase 2: Verify TAT for Requests ---');
        // This is primarily UI-based, but we can verify backend returned timestamps
        const requestsRes = await fetch(`${API_URL}/requests`);
        const { requests } = await requestsRes.json();
        const approvedReq = requests.find(r => r.status === 'APPROVED' || r.status === 'REJECTED');
        if (approvedReq && approvedReq.createdAt && approvedReq.updatedAt) {
            console.log('✅ SUCCESS: Request has both createdAt and updatedAt timestamps.');
        } else {
            console.warn('⚠️ WARNING: No approved/rejected requests found to verify timestamps.');
        }

        console.log('\n--- Phase 3: Verify Report Summary ---');
        const today = new Date().toISOString().split('T')[0];
        const reportRes = await fetch(`${API_URL}/attendance/report?date=${today}`);
        const reportData = await reportRes.json();
        const empRow = reportData.report.find(r => r.employeeId === empId);
        
        if (empRow && Array.isArray(empRow.visitedBranches)) {
            console.log('✅ SUCCESS: Report contains visitedBranches array!');
            console.log('Branches visited:', empRow.visitedBranches);
        } else {
            console.error('❌ FAILED: Report missing visitedBranches or employee not found.');
        }

        // Cleanup
        await fetch(`${API_URL}/employees/${empId}`, { method: 'DELETE' });

    } catch (err) {
        console.error('Verification script error:', err);
    }
}

verifyMultiBranchAndTAT();
