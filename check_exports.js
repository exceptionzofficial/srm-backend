
try {
    const lib = require('@aws-sdk/lib-dynamodb');
    console.log('Exports:', Object.keys(lib));
    console.log('ScanCommand type:', typeof lib.ScanCommand);
    if (lib.ScanCommand) {
        try {
            const cmd = new lib.ScanCommand({});
            console.log('ScanCommand instantiated successfully');
        } catch (e) {
            console.error('Error instantiating ScanCommand:', e.message);
        }
    }
} catch (e) {
    console.error('Error requiring lib-dynamodb:', e);
}
