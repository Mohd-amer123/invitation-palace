/**
 * Automated Scheduler & Overdue Handling Test
 * THE INVITATION PALACE
 */

const assert = require('assert');
const { getDb, initDb } = require('../config/db');
const { checkAndProcessReminders, getCurrentTimeInfo } = require('../services/scheduler');

console.log('====================================================');
console.log(' RUNNING SCHEDULER & OVERDUE POLICY TEST');
console.log('====================================================\n');

initDb();
const db = getDb();
const oldCusts = db.prepare("SELECT id FROM customers WHERE customer_code LIKE 'SCHED-TEST%'").all();
for (const c of oldCusts) {
  db.prepare("DELETE FROM reminders WHERE event_id IN (SELECT id FROM events WHERE customer_id = ?)").run(c.id);
  db.prepare("DELETE FROM events WHERE customer_id = ?").run(c.id);
  db.prepare("DELETE FROM customers WHERE id = ?").run(c.id);
}

// 1. Timezone test
const timeInfo = getCurrentTimeInfo('Asia/Kolkata');
assert.ok(timeInfo.currentDate, 'Should have current date in YYYY-MM-DD');
assert.ok(timeInfo.currentTime, 'Should have current time in HH:MM');
console.log(`[PASS] Asia/Kolkata Time: ${timeInfo.currentDate} at ${timeInfo.currentTime}`);

// 2. Overdue Reminders Policy Test:
// "Do not automatically send overdue reminders. Mark as Skipped so stale reminders are never sent."
console.log('Testing Overdue Policy...');

// Insert an overdue reminder with scheduled_date = '2020-01-01'
const testCode = 'SCHED-TEST-' + Date.now();
const testCust = db.prepare(`
  INSERT INTO customers (customer_code, full_name, mobile, status)
  VALUES (?, 'Scheduler Test Customer', '+919876543211', 'Active')
`).run(testCode);

const testEvent = db.prepare(`
  INSERT INTO events (
    customer_id, event_name, event_category, host_name,
    event_date, event_time, venue_name, venue_address
  ) VALUES (?, 'Test Event', 'Birthday', 'Host Test', '2020-01-10', '10:00 AM', 'Venue', 'Address')
`).run(testCust.lastInsertRowid);

const testGuest = db.prepare(`
  INSERT INTO guests (full_name, mobile, consent_status)
  VALUES ('Overdue Test Guest', '+919999988888', 1)
`).run();

const overdueReminder = db.prepare(`
  INSERT INTO reminders (
    event_id, guest_id, stage_days, reminder_stage,
    scheduled_date, scheduled_time, status
  ) VALUES (?, ?, 7, '7-Day Reminder', '2020-01-03', '10:00', 'Scheduled')
`).run(testEvent.lastInsertRowid, testGuest.lastInsertRowid);

const overdueId = overdueReminder.lastInsertRowid;

// Run scheduler cycle
checkAndProcessReminders();

const checkedReminder = db.prepare('SELECT status, failure_reason FROM reminders WHERE id = ?').get(overdueId);
assert.strictEqual(checkedReminder.status, 'Skipped', 'Overdue reminder must be marked as Skipped');
assert.strictEqual(checkedReminder.failure_reason.includes('Overdue'), true, 'Reason must state Overdue');
console.log('[PASS] Overdue reminder was safely marked as Skipped (not sent).');

// Clean up test records
db.prepare("DELETE FROM events WHERE customer_id = ?").run(testCust.lastInsertRowid);
db.prepare("DELETE FROM customers WHERE id = ?").run(testCust.lastInsertRowid);
db.prepare("DELETE FROM guests WHERE id = ?").run(testGuest.lastInsertRowid);

console.log('\n====================================================');
console.log(' ALL SCHEDULER TESTS PASSED PERFECTLY!');
console.log('====================================================\n');
