/**
 * Event Management Routes
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { EVENT_CATEGORIES } = require('../config/constants');
const { generateRemindersForEvent, handleEventReschedule, handleEventCancellation } = require('../services/reminderService');

router.use(requireAuth);

// GET /api/events - List events with filters
router.get('/', (req, res) => {
  const db = getDb();
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;
  const category = req.query.category || null;
  const status = req.query.status || null;
  const customerId = req.query.customerId || null;

  let query = `
    SELECT e.*, 
           c.full_name as customer_name,
           c.mobile as customer_mobile,
           c.customer_code,
           wa.account_name as whatsapp_account_name,
           wa.phone_number as whatsapp_sender_phone,
           (SELECT COUNT(*) FROM event_guests eg WHERE eg.event_id = e.id) as total_guests,
           (SELECT COUNT(*) FROM reminders r WHERE r.event_id = e.id AND r.status = 'Scheduled') as pending_reminders,
           (SELECT COUNT(*) FROM reminders r WHERE r.event_id = e.id AND r.status = 'Sent') as sent_reminders
    FROM events e
    JOIN customers c ON e.customer_id = c.id
    LEFT JOIN whatsapp_accounts wa ON wa.id = e.whatsapp_account_id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (e.event_name LIKE ? OR e.host_name LIKE ? OR e.venue_name LIKE ? OR c.full_name LIKE ?)`;
    params.push(search, search, search, search);
  }

  if (category && category !== 'All') {
    query += ` AND e.event_category = ?`;
    params.push(category);
  }

  if (status && status !== 'All') {
    query += ` AND e.status = ?`;
    params.push(status);
  }

  if (customerId) {
    query += ` AND e.customer_id = ?`;
    params.push(customerId);
  }

  query += ` ORDER BY e.event_date ASC`;

  const events = db.prepare(query).all(...params);
  res.json({ success: true, events, categories: EVENT_CATEGORIES });
});

// GET /api/events/:id - Event details + guests + reminders
router.get('/:id', (req, res) => {
  const db = getDb();
  const event = db.prepare(`
    SELECT e.*, 
           c.full_name as customer_name,
           c.mobile as customer_mobile,
           c.email as customer_email,
           c.customer_code,
           wa.account_name as whatsapp_account_name,
           wa.phone_number as whatsapp_sender_phone
    FROM events e
    JOIN customers c ON e.customer_id = c.id
    LEFT JOIN whatsapp_accounts wa ON wa.id = e.whatsapp_account_id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }

  // Fetch guests registered for this event
  const guests = db.prepare(`
    SELECT g.*, eg.rsvp_status, eg.created_at as registered_at
    FROM guests g
    JOIN event_guests eg ON eg.guest_id = g.id
    WHERE eg.event_id = ?
    ORDER BY g.full_name ASC
  `).all(event.id);

  // Fetch reminders for this event
  const reminders = db.prepare(`
    SELECT r.*, g.full_name as guest_name, g.mobile as guest_phone
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    WHERE r.event_id = ?
    ORDER BY r.scheduled_date ASC, r.id ASC
  `).all(event.id);

  res.json({
    success: true,
    event,
    guests,
    reminders
  });
});

// POST /api/events - Create new event
router.post('/', (req, res) => {
  const db = getDb();
  const {
    customer_id,
    event_name,
    event_category,
    host_name,
    event_date,
    event_time,
    venue_name,
    venue_address,
    maps_link,
    description,
    reminder_days,
    reminder_time,
    whatsapp_account_id
  } = req.body;

  if (!customer_id || !event_name || !host_name || !event_date || !event_time || !venue_name || !venue_address) {
    return res.status(400).json({
      success: false,
      error: 'Please fill all required fields: Customer, Event Name, Host Name, Event Date, Event Time, Venue Name and Venue Address.'
    });
  }

  // Verify customer exists
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customer_id);
  if (!customer) {
    return res.status(400).json({ success: false, error: 'Selected customer does not exist.' });
  }

  try {
    const defaultReminderDays = db.prepare(`SELECT value FROM settings WHERE key = 'default_reminder_days'`).get()?.value || '7,3,1';
    const defaultReminderTime = db.prepare(`SELECT value FROM settings WHERE key = 'default_reminder_time'`).get()?.value || '10:00';

    const stmt = db.prepare(`
      INSERT INTO events (
        customer_id, event_name, event_category, host_name,
        event_date, event_time, venue_name, venue_address,
        maps_link, description, reminder_days, reminder_time, whatsapp_account_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `);

    const result = stmt.run(
      customer_id,
      event_name.trim(),
      event_category || 'Wedding',
      host_name.trim(),
      event_date,
      event_time.trim(),
      venue_name.trim(),
      venue_address.trim(),
      maps_link ? maps_link.trim() : null,
      description ? description.trim() : null,
      reminder_days || defaultReminderDays,
      reminder_time || defaultReminderTime,
      whatsapp_account_id ? parseInt(whatsapp_account_id, 10) : null
    );

    const eventId = result.lastInsertRowid;

    // Trigger automated reminder calculations for any existing guests
    generateRemindersForEvent(eventId);

    db.prepare(`
      INSERT INTO system_logs (level, action, details)
      VALUES ('INFO', 'Event Created', ?)
    `).run(`Created event "${event_name}" for host "${host_name}" on ${event_date}`);

    res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      eventId
    });
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ success: false, error: 'Failed to create event: ' + err.message });
  }
});

// PUT /api/events/:id - Update event details & handle date changes
router.put('/:id', (req, res) => {
  const db = getDb();
  const eventId = req.params.id;
  const {
    event_name,
    event_category,
    host_name,
    event_date,
    event_time,
    venue_name,
    venue_address,
    maps_link,
    description,
    reminder_days,
    reminder_time,
    whatsapp_account_id,
    status
  } = req.body;

  const currentEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!currentEvent) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }

  const dateChanged = currentEvent.event_date !== event_date || currentEvent.event_time !== event_time;
  const statusChangedToCancelled = status === 'Cancelled' && currentEvent.status !== 'Cancelled';

  try {
    db.prepare(`
      UPDATE events
      SET event_name = ?,
          event_category = ?,
          host_name = ?,
          event_date = ?,
          event_time = ?,
          venue_name = ?,
          venue_address = ?,
          maps_link = ?,
          description = ?,
          reminder_days = ?,
          reminder_time = ?,
          whatsapp_account_id = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      event_name.trim(),
      event_category || currentEvent.event_category,
      host_name.trim(),
      event_date,
      event_time.trim(),
      venue_name.trim(),
      venue_address.trim(),
      maps_link ? maps_link.trim() : null,
      description ? description.trim() : null,
      reminder_days || currentEvent.reminder_days,
      reminder_time || currentEvent.reminder_time,
      whatsapp_account_id !== undefined ? (whatsapp_account_id ? parseInt(whatsapp_account_id, 10) : null) : currentEvent.whatsapp_account_id,
      status || currentEvent.status,
      eventId
    );

    // If event was cancelled, cancel pending reminders
    if (statusChangedToCancelled) {
      handleEventCancellation(eventId);
    } else if (dateChanged) {
      // If date/time changed, automatically update pending reminders schedule
      handleEventReschedule(eventId, event_date, event_time);
    }

    res.json({
      success: true,
      message: 'Event updated successfully.' + (dateChanged ? ' Pending reminder dates have been recalculated.' : '')
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update event: ' + err.message });
  }
});

// DELETE /api/events/:id - Delete event or cancel
router.delete('/:id', (req, res) => {
  const db = getDb();
  const eventId = req.params.id;

  // Check if sent messages exist for this event
  const sentCount = db.prepare(`
    SELECT COUNT(*) as count FROM message_history WHERE event_id = ?
  `).get(eventId).count;

  if (sentCount > 0) {
    // If messages have already been sent, cancel the event instead of hard-deleting
    db.prepare(`UPDATE events SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(eventId);
    handleEventCancellation(eventId);
    return res.json({
      success: true,
      message: `Event has ${sentCount} sent message records. It was marked as Cancelled and all pending reminders have been cancelled.`
    });
  }

  // Safe to delete if no sent message history
  handleEventCancellation(eventId);
  db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
  res.json({ success: true, message: 'Event deleted successfully.' });
});

// POST /api/events/:id/recalculate-reminders - Force recalculate reminders
router.post('/:id/recalculate-reminders', (req, res) => {
  const eventId = req.params.id;
  const result = generateRemindersForEvent(eventId);
  res.json({
    success: true,
    message: `Reminders generated: ${result.count} new reminder schedule(s) created.`
  });
});

// DELETE /api/events/:eventId/guests/:guestId - Remove a guest from a specific event
router.delete('/:eventId/guests/:guestId', (req, res) => {
  const db = getDb();
  const { eventId, guestId } = req.params;

  try {
    db.prepare('DELETE FROM event_guests WHERE event_id = ? AND guest_id = ?').run(eventId, guestId);
    // Remove pending un-sent reminders for this guest in this event
    db.prepare("DELETE FROM reminders WHERE event_id = ? AND guest_id = ? AND status != 'Sent'").run(eventId, guestId);

    res.json({ success: true, message: 'Guest removed from event successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to remove guest from event: ' + err.message });
  }
});

module.exports = router;
