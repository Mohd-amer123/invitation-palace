/**
 * Comprehensive Database & Business Lifecycle Integration Test
 * THE INVITATION PALACE
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDb, initDb, DB_PATH, BACKUPS_DIR } = require('../config/db');
const { generateRemindersForEvent, handleEventReschedule, handleEventCancellation } = require('../services/reminderService');
const { renderTemplate } = require('../services/templateEngine');

console.log('====================================================');
console.log(' RUNNING DATABASE INTEGRATION TEST SUITE');
console.log('====================================================\n');

// 1. Initialize SQLite Database
initDb();
const db = getDb();

// Clean up any previous test records
db.prepare("DELETE FROM events WHERE customer_id IN (SELECT id FROM customers WHERE customer_code LIKE 'TEST-%')").run();
db.prepare("DELETE FROM customers WHERE customer_code LIKE 'TEST-%'").run();
db.prepare("DELETE FROM guests WHERE email = 'tariq@test.com'").run();

// 2. Test Customer Creation
console.log('1. Testing Customer Creation...');
const custInsert = db.prepare(`
  INSERT INTO customers (customer_code, full_name, mobile, email, status)
  VALUES ('TEST-CUST-001', 'Farhan Ali', '+919876543210', 'farhan@test.com', 'Active')
`).run();
const customerId = custInsert.lastInsertRowid;
assert.ok(customerId > 0, 'Customer should be inserted with valid ID');
console.log('   Customer created successfully with ID:', customerId);

// 3. Test Multiple Events for Same Customer
console.log('2. Testing Multiple Events for One Customer...');
const event1Insert = db.prepare(`
  INSERT INTO events (
    customer_id, event_name, event_category, host_name,
    event_date, event_time, venue_name, venue_address, reminder_days, reminder_time
  ) VALUES (?, 'Amina & Farhan Grand Nikah', 'Nikah', 'Farhan & Amina', '2026-12-20', '07:00 PM', 'Grand Ballroom', 'MG Road', '7,3,1', '10:00')
`).run(customerId);
const event1Id = event1Insert.lastInsertRowid;

const event2Insert = db.prepare(`
  INSERT INTO events (
    customer_id, event_name, event_category, host_name,
    event_date, event_time, venue_name, venue_address, reminder_days, reminder_time
  ) VALUES (?, 'Farhan & Amina Walima Reception', 'Walima', 'Farhan & Amina', '2026-12-22', '08:00 PM', 'Royal Palace Hall', 'Palace Road', '7,3,1', '10:00')
`).run(customerId);
const event2Id = event2Insert.lastInsertRowid;

assert.ok(event1Id > 0 && event2Id > 0, 'Both events created');
const customerEventCount = db.prepare('SELECT COUNT(*) as count FROM events WHERE customer_id = ?').get(customerId).count;
assert.strictEqual(customerEventCount, 2, 'Customer should have exactly 2 events');
console.log('   Customer successfully has multiple events:', customerEventCount);

// 4. Test Manual Guest Entry & Event Association
console.log('3. Testing Guest Association...');
const guest1Insert = db.prepare(`
  INSERT INTO guests (full_name, mobile, email, consent_status)
  VALUES ('Mohammad Tariq', '+919888877777', 'tariq@test.com', 1)
`).run();
const guest1Id = guest1Insert.lastInsertRowid;

// Link guest to event1
db.prepare('INSERT INTO event_guests (event_id, guest_id) VALUES (?, ?)').run(event1Id, guest1Id);
console.log('   Guest linked to Event 1.');

// 5. Test Reminder Generation (7, 3, 1 days)
console.log('4. Testing Automated Reminder Scheduling...');
const remResult = generateRemindersForEvent(event1Id);
assert.strictEqual(remResult.count, 3, 'Should generate 3 reminders for 7, 3 and 1 days before');

const generatedReminders = db.prepare(`
  SELECT stage_days, scheduled_date, reminder_stage, status, rendered_message
  FROM reminders WHERE event_id = ? AND guest_id = ?
  ORDER BY stage_days DESC
`).all(event1Id, guest1Id);

assert.strictEqual(generatedReminders.length, 3);
assert.strictEqual(generatedReminders[0].stage_days, 7);
assert.strictEqual(generatedReminders[0].scheduled_date, '2026-12-13');
assert.strictEqual(generatedReminders[1].stage_days, 3);
assert.strictEqual(generatedReminders[1].scheduled_date, '2026-12-17');
assert.strictEqual(generatedReminders[2].stage_days, 1);
assert.strictEqual(generatedReminders[2].scheduled_date, '2026-12-19');

// Verify Host Name is in the rendered template
assert.strictEqual(generatedReminders[0].rendered_message.includes('Farhan & Amina'), true, 'Rendered message must contain host name');
console.log('   Reminders scheduled correctly for 2026-12-13, 2026-12-17, and 2026-12-19.');

// 6. Test Duplicate Reminder Prevention
console.log('5. Testing Duplicate Reminder Prevention...');
const dupResult = generateRemindersForEvent(event1Id);
assert.strictEqual(dupResult.count, 0, 'Re-generating reminders should not create duplicates');
console.log('   Duplicate prevention verified: 0 duplicate reminders created.');

// 7. Test Event Reschedule (Date Change)
console.log('6. Testing Event Date Change & Automatic Recalculation...');
// Move event date from 2026-12-20 to 2026-12-25
handleEventReschedule(event1Id, '2026-12-25', '07:30 PM');

const updatedReminders = db.prepare(`
  SELECT stage_days, scheduled_date
  FROM reminders WHERE event_id = ? AND guest_id = ?
  ORDER BY stage_days DESC
`).all(event1Id, guest1Id);

assert.strictEqual(updatedReminders[0].scheduled_date, '2026-12-18', '7-day reminder should now be 2026-12-18');
assert.strictEqual(updatedReminders[1].scheduled_date, '2026-12-22', '3-day reminder should now be 2026-12-22');
assert.strictEqual(updatedReminders[2].scheduled_date, '2026-12-24', '1-day reminder should now be 2026-12-24');
console.log('   Recalculation verified: dates updated to 2026-12-18, 2026-12-22, 2026-12-24.');

// 8. Test Event Cancellation
console.log('7. Testing Event Cancellation & Pending Reminder Cancellation...');
handleEventCancellation(event1Id);
const cancelledReminders = db.prepare(`
  SELECT status FROM reminders WHERE event_id = ?
`).all(event1Id);
cancelledReminders.forEach(r => {
  assert.strictEqual(r.status, 'Cancelled');
});
console.log('   Event cancellation verified: all pending reminders marked Cancelled.');

// 9. Test Database Backup
console.log('8. Testing SQLite Database Backup...');
const backupPath = path.join(BACKUPS_DIR, 'test_integration_backup.db');
db.backup(backupPath).then(() => {
  assert.ok(fs.existsSync(backupPath), 'Backup file must exist on disk');
  fs.unlinkSync(backupPath); // clean up test backup
  console.log('   Database backup verified and cleaned up.');

  // Clean up test records (events first to respect foreign key constraint)
  db.prepare("DELETE FROM events WHERE customer_id IN (SELECT id FROM customers WHERE customer_code LIKE 'TEST-%')").run();
  db.prepare("DELETE FROM customers WHERE customer_code LIKE 'TEST-%'").run();
  db.prepare("DELETE FROM guests WHERE email = 'tariq@test.com'").run();

  console.log('\n====================================================');
  console.log(' ALL INTEGRATION TESTS PASSED PERFECTLY!');
  console.log('====================================================\n');
  process.exit(0);
}).catch(err => {
  console.error('Backup test failed:', err);
  process.exit(1);
});
