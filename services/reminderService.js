/**
 * Reminder Management Service
 * Calculates reminder schedules, manages stage dates, handles event reschedules and cancellations.
 * THE INVITATION PALACE
 */

const { getDb } = require('../config/db');
const { renderTemplate } = require('./templateEngine');
const { REMINDER_STATUSES } = require('../config/constants');

/**
 * Calculate scheduled date given an event date (YYYY-MM-DD) and days before.
 * e.g., '2026-12-20' minus 7 days -> '2026-12-13'
 */
function calculateScheduledDate(eventDateStr, daysBefore) {
  const [year, month, day] = eventDateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - parseInt(daysBefore, 10));
  return d.toISOString().split('T')[0];
}

/**
 * Generate reminders for a specific event and all its consenting guests.
 * 
 * @param {number} eventId 
 */
function generateRemindersForEvent(eventId) {
  const db = getDb();

  // Fetch event details
  const event = db.prepare(`
    SELECT e.*, c.full_name as customer_name
    FROM events e
    JOIN customers c ON e.customer_id = c.id
    WHERE e.id = ?
  `).get(eventId);

  if (!event || event.status === 'Cancelled') {
    return { count: 0 };
  }

  // Parse reminder stages, e.g. "7,3,1"
  const stageDaysList = (event.reminder_days || '7,3,1')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  // Fetch all templates
  const templates = db.prepare(`
    SELECT stage_days, stage_name, template_text
    FROM templates
    WHERE is_active = 1
  `).all();

  const templateMap = {};
  templates.forEach(t => {
    templateMap[t.stage_days] = t;
  });

  // Fetch all guests linked to this event who have consent
  const guests = db.prepare(`
    SELECT g.*
    FROM guests g
    JOIN event_guests eg ON eg.guest_id = g.id
    WHERE eg.event_id = ? AND g.consent_status = 1
  `).all(eventId);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO reminders (
      event_id, guest_id, stage_days, reminder_stage,
      scheduled_date, scheduled_time, status, rendered_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const businessNameSetting = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
  const defaultTimezone = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';

  let createdCount = 0;

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: defaultTimezone }).format(new Date());

  const tx = db.transaction(() => {
    for (const guest of guests) {
      for (const days of stageDaysList) {
        const scheduledDate = calculateScheduledDate(event.event_date, days);
        const scheduledTime = event.reminder_time || '10:00';
        const stageName = `${days}-Day Reminder`;

        // If scheduled date is today or already passed, but event is today or future, queue it immediately!
        let effectiveDate = scheduledDate;
        let effectiveTime = scheduledTime;
        let initialStatus = REMINDER_STATUSES.SCHEDULED;

        if (scheduledDate <= todayStr && event.event_date >= todayStr) {
          effectiveDate = todayStr;
          initialStatus = REMINDER_STATUSES.READY_TO_SEND;
        }

        // Check if reminder already exists
        const existing = db.prepare(`
          SELECT id, status FROM reminders
          WHERE event_id = ? AND guest_id = ? AND stage_days = ?
        `).get(eventId, guest.id, days);

        if (existing) {
          // If already sent or cancelled, don't overwrite
          continue;
        }

        // Get matching template or fallback
        const template = templateMap[days] || templateMap[7] || {
          template_text: `{{time_greeting}} {{guest_name}},\n\nFriendly reminder regarding {{event_name}} on {{event_date}} at {{venue_name}}.\n\nRegards,\n{{business_name}}`
        };

        const context = {
          guest_name: guest.full_name,
          event_name: event.event_name,
          host_name: event.host_name,
          event_date: event.event_date,
          event_time: event.event_time,
          venue_name: event.venue_name,
          venue_address: event.venue_address,
          maps_link: event.maps_link,
          digital_card_link: event.digital_card_link,
          business_name: businessNameSetting,
          timeZone: defaultTimezone
        };

        const rendered = renderTemplate(template.template_text, context);

        const res = insertStmt.run(
          eventId,
          guest.id,
          days,
          stageName,
          effectiveDate,
          effectiveTime,
          initialStatus,
          rendered
        );

        if (res.changes > 0) createdCount++;
      }
    }
  });

  tx();

  return { count: createdCount };
}

/**
 * Handle event date or time changes:
 * Automatically recalculate pending / scheduled reminders without touching sent ones!
 */
function handleEventReschedule(eventId, newEventDate, newEventTime) {
  const db = getDb();
  
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return;

  const pendingReminders = db.prepare(`
    SELECT r.*, g.full_name as guest_name
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    WHERE r.event_id = ? AND r.status IN ('Scheduled', 'Pending', 'Ready to Send', 'Awaiting WhatsApp')
  `).all(eventId);

  const businessNameSetting = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
  const defaultTimezone = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';

  // Fetch templates
  const templates = db.prepare('SELECT stage_days, template_text FROM templates WHERE is_active = 1').all();
  const templateMap = {};
  templates.forEach(t => { templateMap[t.stage_days] = t.template_text; });

  const updateStmt = db.prepare(`
    UPDATE reminders
    SET scheduled_date = ?,
        scheduled_time = ?,
        rendered_message = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const rem of pendingReminders) {
      const newScheduledDate = calculateScheduledDate(newEventDate, rem.stage_days);
      const scheduledTime = newEventTime || event.reminder_time || '10:00';

      const templateText = templateMap[rem.stage_days] || rem.rendered_message;

      const context = {
        guest_name: rem.guest_name,
        event_name: event.event_name,
        host_name: event.host_name,
        event_date: newEventDate,
        event_time: newEventTime || event.event_time,
        venue_name: event.venue_name,
        venue_address: event.venue_address,
        maps_link: event.maps_link,
        digital_card_link: event.digital_card_link,
        business_name: businessNameSetting,
        timeZone: defaultTimezone
      };

      const updatedRendered = renderTemplate(templateText, context);

      updateStmt.run(newScheduledDate, scheduledTime, updatedRendered, rem.id);
    }
  });

  tx();
}

/**
 * Handle event cancellation:
 * Mark all pending reminders as Cancelled.
 */
function handleEventCancellation(eventId) {
  const db = getDb();
  db.prepare(`
    UPDATE reminders
    SET status = 'Cancelled',
        notes = 'Event was cancelled by administrator',
        updated_at = CURRENT_TIMESTAMP
    WHERE event_id = ? AND status IN ('Scheduled', 'Pending', 'Ready to Send', 'Awaiting WhatsApp')
  `).run(eventId);
}

module.exports = {
  calculateScheduledDate,
  generateRemindersForEvent,
  handleEventReschedule,
  handleEventCancellation
};
