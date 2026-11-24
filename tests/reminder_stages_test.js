/**
 * Unit Test: Multi-Stage Targeted Reminder Scheduling & Dispatch Verification
 * THE INVITATION PALACE
 */

const assert = require('assert');
const { getDb, initDb } = require('../config/db');
const { generateRemindersForEvent, calculateScheduledDate } = require('../services/reminderService');
const { getCurrentTimeInfo } = require('../services/scheduler');

console.log('====================================================');
console.log(' RUNNING MULTI-STAGE REMINDER TARGETING TEST');
console.log('====================================================\n');

initDb();
const db = getDb();

const { currentDate, currentTime } = getCurrentTimeInfo('Asia/Kolkata');
console.log(`Current Date in Asia/Kolkata: ${currentDate}, Current Time: ${currentTime}`);

// Helper to add days to YYYY-MM-DD
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

// 1. Create a customer
const custCode = 'STAGE-TEST-' + Date.now();
const custRes = db.prepare(`
  INSERT INTO customers (customer_code, full_name, mobile, status)
  VALUES (?, 'Stage Test Customer', '+919111122222', 'Active')
`).run(custCode);
const customerId = custRes.lastInsertRowid;

// 2. Create guest with consent
const guestRes = db.prepare(`
  INSERT INTO guests (full_name, mobile, consent_status)
  VALUES ('Targeted Test Guest', '+919888877777', 1)
`).run();
const guestId = guestRes.lastInsertRowid;

// TEST CASE 1: Event 10 days in future with stages 7, 3, 1
console.log('Test Case 1: Future event (10 days away) with 7,3,1 reminder stages...');
const futureDate = addDays(currentDate, 10);
const expected7 = addDays(futureDate, -7); // 3 days in future
const expected3 = addDays(futureDate, -3); // 7 days in future
const expected1 = addDays(futureDate, -1); // 9 days in future

const event1Res = db.prepare(`
  INSERT INTO events (
    customer_id, event_name, event_category, host_name,
    event_date, event_time, venue_name, venue_address,
    reminder_days, reminder_time, status
  ) VALUES (?, 'Future Grand Wedding', 'Wedding', 'Host 1', ?, '07:00 PM', 'Grand Palace', 'City Center', '7,3,1', '10:00', 'Active')
`).run(customerId, futureDate);
const event1Id = event1Res.lastInsertRowid;

// Link guest
db.prepare('INSERT INTO event_guests (event_id, guest_id) VALUES (?, ?)').run(event1Id, guestId);

// Generate reminders
const res1 = generateRemindersForEvent(event1Id);
assert.strictEqual(res1.count, 3, 'Should generate 3 reminder stages');

const reminders1 = db.prepare(`
  SELECT stage_days, reminder_stage, scheduled_date, scheduled_time, status, failure_reason
  FROM reminders
  WHERE event_id = ? AND guest_id = ?
  ORDER BY stage_days DESC
`).all(event1Id, guestId);

assert.strictEqual(reminders1[0].stage_days, 7);
assert.strictEqual(reminders1[0].scheduled_date, expected7, '7-day date must match event_date - 7');
assert.strictEqual(reminders1[0].status, 'Scheduled', '7-day reminder must be Scheduled for the future');

assert.strictEqual(reminders1[1].stage_days, 3);
assert.strictEqual(reminders1[1].scheduled_date, expected3, '3-day date must match event_date - 3');
assert.strictEqual(reminders1[1].status, 'Scheduled', '3-day reminder must be Scheduled for the future');

assert.strictEqual(reminders1[2].stage_days, 1);
assert.strictEqual(reminders1[2].scheduled_date, expected1, '1-day date must match event_date - 1');
assert.strictEqual(reminders1[2].status, 'Scheduled', '1-day reminder must be Scheduled for the future');

console.log('[PASS] Future event reminders properly scheduled for their respective target dates without premature activation.');

// TEST CASE 2: Near-term event (2 days away) with 7,3,1 reminder stages
console.log('Test Case 2: Near-term event (2 days away) - verify past stages are safely Skipped, not dumped...');
const nearDate = addDays(currentDate, 2);
const event2Res = db.prepare(`
  INSERT INTO events (
    customer_id, event_name, event_category, host_name,
    event_date, event_time, venue_name, venue_address,
    reminder_days, reminder_time, status
  ) VALUES (?, 'Near Term Reception', 'Reception', 'Host 2', ?, '08:00 PM', 'Imperial Hall', 'City Center', '7,3,1', '10:00', 'Active')
`).run(customerId, nearDate);
const event2Id = event2Res.lastInsertRowid;

db.prepare('INSERT INTO event_guests (event_id, guest_id) VALUES (?, ?)').run(event2Id, guestId);
generateRemindersForEvent(event2Id);

const reminders2 = db.prepare(`
  SELECT stage_days, reminder_stage, scheduled_date, status, failure_reason
  FROM reminders
  WHERE event_id = ? AND guest_id = ?
  ORDER BY stage_days DESC
`).all(event2Id, guestId);

assert.strictEqual(reminders2[0].stage_days, 7);
assert.strictEqual(reminders2[0].status, 'Skipped', '7-day reminder must be Skipped because 7 days before was 5 days ago');
assert.ok(reminders2[0].failure_reason.includes('passed'), 'Reason must note passed prior to registration');

assert.strictEqual(reminders2[1].stage_days, 3);
assert.strictEqual(reminders2[1].status, 'Skipped', '3-day reminder must be Skipped because 3 days before was 1 day ago');

assert.strictEqual(reminders2[2].stage_days, 1);
assert.strictEqual(reminders2[2].status, 'Scheduled', '1-day reminder is tomorrow, so it must be Scheduled for tomorrow');

console.log('[PASS] Past stages correctly marked as Skipped; obsolete reminders are not spammed.');

// Cleanup test records
db.prepare('DELETE FROM reminders WHERE event_id IN (?, ?)').run(event1Id, event2Id);
db.prepare('DELETE FROM event_guests WHERE event_id IN (?, ?)').run(event1Id, event2Id);
db.prepare('DELETE FROM events WHERE id IN (?, ?)').run(event1Id, event2Id);
db.prepare('DELETE FROM guests WHERE id = ?').run(guestId);
db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);

console.log('\n====================================================');
console.log(' ALL MULTI-STAGE REMINDER TARGETING TESTS PASSED!');
console.log('====================================================\n');
