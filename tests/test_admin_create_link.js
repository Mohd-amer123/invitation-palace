/**
 * Test Admin Create Client Link Endpoint
 */
async function testAdminCreateLink() {
  const baseUrl = 'http://localhost:3000';

  // 1. Login as Admin
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });

  const cookie = loginRes.headers.get('set-cookie');
  console.log('Admin login status:', loginRes.status, 'Cookie received:', !!cookie);

  // 2. Call POST /api/whatsapp/create-client-link
  const createRes = await fetch(`${baseUrl}/api/whatsapp/create-client-link`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': cookie
    },
    body: JSON.stringify({
      event_id: 12
    })
  });

  const createData = await createRes.json();
  console.log('\nCreate Link Result:');
  console.log('Success:', createData.success);
  console.log('Client Link:', createData.clientLink);
  console.log('Event Name:', createData.eventName);
  console.log('Host Name:', createData.hostName);
  console.log('WhatsApp Share URL:', createData.waShareUrl?.slice(0, 80) + '...');
  console.log('\nShare Message Preview:\n' + createData.shareMessage);

  if (!createData.success || !createData.clientLink) {
    throw new Error('Create client link failed');
  }

  // 3. Test opening that newly generated client link
  const clientCheckRes = await fetch(createData.clientLink);
  console.log('\nClient page HTTP status:', clientCheckRes.status);
  if (clientCheckRes.status !== 200) throw new Error('Client page not reachable');

  console.log('\n✓ End-to-End Link Generation and Verification Successful!');
}

testAdminCreateLink().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
