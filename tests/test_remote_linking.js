/**
 * Verification Test: Remote Client WhatsApp Linking Flow
 * Tests against live running server on port 3000
 * THE INVITATION PALACE
 */

const { initDb, getDb } = require('../config/db');

async function runTests() {
  console.log('--- Starting Remote Client WhatsApp Linking Tests ---');

  initDb();
  const db = getDb();

  // Find or create test customer & event
  let event = db.prepare('SELECT e.*, c.mobile as cust_mobile FROM events e JOIN customers c ON c.id = e.customer_id LIMIT 1').get();
  if (!event) {
    const custRes = db.prepare(`
      INSERT INTO customers (customer_code, full_name, mobile)
      VALUES ('CUST-TEST-01', 'Test Host User', '919876543210')
    `).run();
    const evRes = db.prepare(`
      INSERT INTO events (customer_id, event_name, event_category, host_name, event_date, event_time, venue_name, venue_address)
      VALUES (?, 'Test Grand Reception', 'Wedding', 'Rajesh Sharma', '2026-12-25', '18:00', 'Palace Grand Ballroom', 'MG Road')
    `).run(custRes.lastInsertRowid);
    event = { id: evRes.lastInsertRowid, event_name: 'Test Grand Reception', host_name: 'Rajesh Sharma', cust_mobile: '919876543210' };
  }

  console.log(`Using Event #${event.id} ("${event.event_name}") for remote linking test.`);

  // 1. Test Generating Client Link Token
  const crypto = require('crypto');
  const token = crypto.randomBytes(20).toString('hex');
  
  let account = db.prepare('SELECT * FROM whatsapp_accounts WHERE is_default = 1').get() ||
                db.prepare('SELECT * FROM whatsapp_accounts LIMIT 1').get();

  console.log(`Using WhatsApp Account #${account.id} (${account.account_name})`);

  db.prepare(`
    INSERT INTO whatsapp_link_tokens (token, account_id, event_id, customer_id, phone_number, status)
    VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(token, account.id, event.id, event.customer_id || null, '919876543210');

  console.log(`✓ Inserted test token: ${token}`);

  const baseUrl = `http://localhost:3000`;

  try {
    // 2. Test GET /api/whatsapp/client-session/:token (Public - no cookies)
    console.log('\nTesting Public Session Retrieval...');
    const sessionRes = await fetch(`${baseUrl}/api/whatsapp/client-session/${token}`);
    const sessionData = await sessionRes.json();

    if (!sessionRes.ok || !sessionData.success) {
      throw new Error(`Public session failed: ${JSON.stringify(sessionData)}`);
    }
    console.log('✓ Public session endpoint returned 200 OK without admin auth:');
    console.log(`  Event: ${sessionData.event_name}`);
    console.log(`  Host:  ${sessionData.host_name}`);
    console.log(`  Status: ${sessionData.status}`);
    console.log(`  Pre-filled Phone: ${sessionData.default_phone}`);

    // 3. Test GET /api/whatsapp/client-session/:token/poll-status
    console.log('\nTesting Real-Time Poll Status Endpoint...');
    const pollRes = await fetch(`${baseUrl}/api/whatsapp/client-session/${token}/poll-status`);
    const pollData = await pollRes.json();

    if (!pollRes.ok || !pollData.success) {
      throw new Error(`Poll status failed: ${JSON.stringify(pollData)}`);
    }
    console.log('✓ Poll status returned 200 OK:');
    console.log(`  Status: ${pollData.status}`);
    console.log(`  Connected: ${pollData.isConnected}`);

    // 4. Test Invalid Token
    console.log('\nTesting Invalid Token Error Handling...');
    const invalidRes = await fetch(`${baseUrl}/api/whatsapp/client-session/invalid-token-xyz-12345`);
    const invalidData = await invalidRes.json();
    if (invalidRes.status === 404 && !invalidData.success) {
      console.log('✓ Invalid token properly rejected with 404 Not Found.');
    } else {
      throw new Error('Expected 404 for invalid token.');
    }

    // 5. Test Static Client Linking Page Exists
    console.log('\nTesting Static Page Availability (/link-whatsapp.html)...');
    const pageRes = await fetch(`${baseUrl}/link-whatsapp.html?token=${token}`);
    if (pageRes.ok) {
      const html = await pageRes.text();
      const hasPhoneTab = html.includes('Phone Number Code');
      const hasQrTab = html.includes('Scan QR Code');
      const hasPalace = html.includes('THE INVITATION PALACE');
      if (hasPhoneTab && hasQrTab && hasPalace) {
        console.log('✓ /link-whatsapp.html is served and contains both Phone Code and QR Code linking views.');
      } else {
        throw new Error('Missing elements in link-whatsapp.html');
      }
    } else {
      throw new Error(`Failed to fetch link-whatsapp.html: ${pageRes.status}`);
    }

    // Clean up test token
    db.prepare('DELETE FROM whatsapp_link_tokens WHERE token = ?').run(token);
    console.log('\n✓ Cleaned up test token.');

    console.log('\n======================================================');
    console.log('🎉 ALL REMOTE CLIENT LINKING TESTS PASSED PERFECTLY!');
    console.log('======================================================');
  } catch (err) {
    throw err;
  }
}

runTests().catch(err => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});
