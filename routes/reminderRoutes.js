/**
 * Reminder Management Routes
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { generateWaLink } = require('../services/whatsappService');
const { renderTemplate } = require('../services/templateEngine');
const {
  initializeWhatsAppSession,
  getSessionStatus,
  sendDirectMessage,
  sendDirectMessageFromAccount,
  logoutWhatsApp
} = require('../services/baileysService');
const { getAutoRunnerStatus, runAutomatedBatchQueue } = require('../services/scheduler');

router.use(requireAuth);

// GET /api/reminders - List reminders with filters
router.get('/', (req, res) => {
  const db = getDb();
  const status = req.query.status || null;
  const eventId = req.query.eventId || null;
  const stage = req.query.stage || null;
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;
  const scheduledDate = req.query.date || null;

  let query = `
    SELECT 
      r.*,
      g.full_name as guest_name,
      g.mobile as guest_phone,
      g.consent_status,
      e.event_name,
      e.event_category,
      e.host_name,
      e.event_date,
      e.event_time,
      e.venue_name,
      e.venue_address,
      e.maps_link,
      c.full_name as customer_name,
      c.customer_code
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    JOIN events e ON r.event_id = e.id
    JOIN customers c ON e.customer_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'All') {
    query += ` AND r.status = ?`;
    params.push(status);
  }

  if (eventId) {
    query += ` AND r.event_id = ?`;
    params.push(eventId);
  }

  if (stage && stage !== 'All') {
    query += ` AND r.reminder_stage = ?`;
    params.push(stage);
  }

  if (scheduledDate) {
    query += ` AND r.scheduled_date = ?`;
    params.push(scheduledDate);
  }

  if (search) {
    query += ` AND (g.full_name LIKE ? OR g.mobile LIKE ? OR e.event_name LIKE ? OR e.host_name LIKE ?)`;
    params.push(search, search, search, search);
  }

  query += ` ORDER BY r.scheduled_date ASC, r.scheduled_time ASC, r.id ASC`;

  const reminders = db.prepare(query).all(...params);
  res.json({ success: true, reminders });
});

// GET /api/reminders/batch-queue - Fetch items for Batch Sender runner
router.get('/batch-queue', (req, res) => {
  const db = getDb();
  const eventId = req.query.eventId || null;
  const status = req.query.status || 'All';
  const includeSent = req.query.includeSent === '1' || status === 'include_sent';

  let query = `
    SELECT 
      r.*,
      g.full_name as guest_name,
      g.mobile as guest_phone,
      e.event_name,
      e.host_name,
      e.event_date,
      e.event_time,
      e.venue_name,
      e.venue_address,
      e.maps_link,
      t.template_text
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    JOIN events e ON r.event_id = e.id
    LEFT JOIN templates t ON t.stage_days = r.stage_days
    WHERE e.status = 'Active'
      AND g.consent_status = 1
  `;
  const params = [];

  if (eventId) {
    query += ` AND r.event_id = ?`;
    params.push(eventId);
  }

  if (includeSent) {
    // Include all active reminders even if marked Sent (for re-sending / testing)
    query += ` AND r.status != 'Cancelled'`;
  } else if (status === 'Ready to Send') {
    query += ` AND r.status IN ('Ready to Send', 'Awaiting WhatsApp', 'Scheduled')`;
  } else if (status && status !== 'All') {
    query += ` AND r.status = ?`;
    params.push(status);
  } else {
    // Default: exclude already sent and cancelled
    query += ` AND r.status NOT IN ('Sent', 'Delivered', 'Cancelled', 'Skipped')`;
  }

  query += ` ORDER BY r.scheduled_date ASC, r.id ASC`;

  const rows = db.prepare(query).all(...params);

  const businessName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
  const defaultTimezone = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';

  const batchQueue = rows.map(r => {
    const templateText = r.template_text || r.rendered_message;
    const context = {
      guest_name: r.guest_name,
      event_name: r.event_name,
      host_name: r.host_name,
      event_date: r.event_date,
      event_time: r.event_time,
      venue_name: r.venue_name,
      venue_address: r.venue_address,
      maps_link: r.maps_link,
      business_name: businessName,
      timeZone: defaultTimezone,
      sendDate: new Date()
    };
    const message = renderTemplate(templateText, context);
    const waLink = generateWaLink(r.guest_phone, message);
    return {
      reminderId: r.id,
      guestName: r.guest_name,
      guestPhone: r.guest_phone,
      eventName: r.event_name,
      hostName: r.host_name,
      reminderStage: r.reminder_stage,
      scheduledDate: r.scheduled_date,
      status: r.status,
      message,
      waLink
    };
  });

  res.json({ success: true, count: batchQueue.length, queue: batchQueue });
});

// POST /api/reminders/reset-status - Reset reminders back to Ready to Send
router.post('/reset-status', (req, res) => {
  const db = getDb();
  const eventId = req.body.event_id || null;

  if (eventId) {
    db.prepare(`
      UPDATE reminders
      SET status = 'Ready to Send',
          updated_at = CURRENT_TIMESTAMP
      WHERE event_id = ? AND status != 'Cancelled'
    `).run(eventId);
  } else {
    db.prepare(`
      UPDATE reminders
      SET status = 'Ready to Send',
          updated_at = CURRENT_TIMESTAMP
      WHERE status != 'Cancelled'
    `).run();
  }

  res.json({ success: true, message: 'Reminders reset to Ready to Send successfully!' });
});

// GET /api/reminders/whatsapp-status - Get live WhatsApp Web linking state
router.get('/whatsapp-status', (req, res) => {
  const statusInfo = getSessionStatus();
  res.json({ success: true, ...statusInfo });
});

// POST /api/reminders/whatsapp-connect - Request new QR code for device link
router.post('/whatsapp-connect', async (req, res) => {
  try {
    const result = await initializeWhatsAppSession(true);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reminders/whatsapp-disconnect - Unlink WhatsApp session
router.post('/whatsapp-disconnect', async (req, res) => {
  try {
    const result = await logoutWhatsApp();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reminders/send-direct-single - Send single reminder via linked WhatsApp directly
router.post('/:id/send-direct', async (req, res) => {
  const db = getDb();
  const reminderId = req.params.id;

  const reminder = db.prepare(`
    SELECT r.*, g.full_name as guest_name, g.mobile as guest_phone,
           e.event_name, e.host_name, e.event_date, e.event_time,
           e.venue_name, e.venue_address, e.maps_link, e.whatsapp_account_id, t.template_text
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    JOIN events e ON r.event_id = e.id
    LEFT JOIN templates t ON t.stage_days = r.stage_days
    WHERE r.id = ?
  `).get(reminderId);

  if (!reminder) {
    return res.status(404).json({ success: false, error: 'Reminder not found.' });
  }

  const businessName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
  const defaultTimezone = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';

  const templateText = reminder.template_text || reminder.rendered_message;
  const context = {
    guest_name: reminder.guest_name,
    event_name: reminder.event_name,
    host_name: reminder.host_name,
    event_date: reminder.event_date,
    event_time: reminder.event_time,
    venue_name: reminder.venue_name,
    venue_address: reminder.venue_address,
    maps_link: reminder.maps_link,
    business_name: businessName,
    timeZone: defaultTimezone,
    sendDate: new Date()
  };

  const messageText = renderTemplate(templateText, context);

  // Send via the event's assigned WhatsApp account
  const sendRes = await sendDirectMessageFromAccount(reminder.whatsapp_account_id, reminder.guest_phone, messageText);

  if (sendRes.success) {
    db.prepare(`
      UPDATE reminders
      SET status = 'Sent',
          rendered_message = ?,
          sent_at = CURRENT_TIMESTAMP,
          notes = 'Sent via Linked WhatsApp Engine',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(messageText, reminderId);

    db.prepare(`
      INSERT INTO message_history (
        reminder_id, event_id, guest_id, recipient_name, recipient_phone,
        message_text, send_method, status, provider_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'linked_whatsapp', 'Sent', ?)
    `).run(
      reminder.id,
      reminder.event_id,
      reminder.guest_id,
      reminder.guest_name || 'Guest',
      reminder.guest_phone,
      messageText,
      sendRes.messageId
    );

    return res.json({ success: true, message: 'Message sent directly via WhatsApp!' });
  } else {
    return res.status(400).json({ success: false, error: sendRes.error });
  }
});

// GET /api/reminders/:id - Get reminder details with freshly rendered message
router.get('/:id', (req, res) => {
  const db = getDb();
  const reminder = db.prepare(`
    SELECT 
      r.*,
      g.full_name as guest_name,
      g.mobile as guest_phone,
      g.consent_status,
      e.event_name,
      e.event_category,
      e.host_name,
      e.event_date,
      e.event_time,
      e.venue_name,
      e.venue_address,
      e.maps_link,
      c.full_name as customer_name,
      c.customer_code,
      t.template_text
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    JOIN events e ON r.event_id = e.id
    JOIN customers c ON e.customer_id = c.id
    LEFT JOIN templates t ON t.stage_days = r.stage_days
    WHERE r.id = ?
  `).get(req.params.id);

  if (!reminder) {
    return res.status(404).json({ success: false, error: 'Reminder schedule not found.' });
  }

  const businessName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
  const defaultTimezone = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';

  const templateText = reminder.template_text || reminder.rendered_message;
  const context = {
    guest_name: reminder.guest_name,
    event_name: reminder.event_name,
    host_name: reminder.host_name,
    event_date: reminder.event_date,
    event_time: reminder.event_time,
    venue_name: reminder.venue_name,
    venue_address: reminder.venue_address,
    maps_link: reminder.maps_link,
    business_name: businessName,
    timeZone: defaultTimezone,
    sendDate: new Date()
  };

  const freshMessage = renderTemplate(templateText, context);
  const waLink = generateWaLink(reminder.guest_phone, freshMessage);

  res.json({
    success: true,
    reminder,
    freshMessage,
    waLink
  });
});

// POST /api/reminders/:id/generate-link - Generate WhatsApp Click-to-Chat URL
router.post('/:id/generate-link', (req, res) => {
  const db = getDb();
  const reminder = db.prepare(`
    SELECT 
      r.*,
      g.full_name as guest_name,
      g.mobile as guest_phone,
      e.event_name,
      e.host_name,
      e.event_date,
      e.event_time,
      e.venue_name,
      e.venue_address,
      e.maps_link,
      t.template_text
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    JOIN events e ON r.event_id = e.id
    LEFT JOIN templates t ON t.stage_days = r.stage_days
    WHERE r.id = ?
  `).get(req.params.id);

  if (!reminder) {
    return res.status(404).json({ success: false, error: 'Reminder not found.' });
  }

  const businessName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
  const defaultTimezone = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';

  const templateText = reminder.template_text || reminder.rendered_message;
  const context = {
    guest_name: reminder.guest_name,
    event_name: reminder.event_name,
    host_name: reminder.host_name,
    event_date: reminder.event_date,
    event_time: reminder.event_time,
    venue_name: reminder.venue_name,
    venue_address: reminder.venue_address,
    maps_link: reminder.maps_link,
    business_name: businessName,
    timeZone: defaultTimezone,
    sendDate: new Date()
  };

  const messageText = renderTemplate(templateText, context);
  const link = generateWaLink(reminder.guest_phone, messageText);

  if (['Scheduled', 'Pending', 'Ready to Send'].includes(reminder.status)) {
    db.prepare(`
      UPDATE reminders
      SET status = 'Awaiting WhatsApp',
          rendered_message = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(messageText, reminder.id);
  }

  res.json({
    success: true,
    link,
    messageText,
    phone: reminder.guest_phone,
    guestName: reminder.guest_name
  });
});

// POST /api/reminders/:id/mark-sent - Record actual sent confirmation
router.post('/:id/mark-sent', (req, res) => {
  const db = getDb();
  const reminderId = req.params.id;
  const { notes, customMessage } = req.body;

  const reminder = db.prepare(`
    SELECT r.*, g.full_name as guest_name, g.mobile as guest_phone
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    WHERE r.id = ?
  `).get(reminderId);

  if (!reminder) {
    return res.status(404).json({ success: false, error: 'Reminder schedule not found.' });
  }

  const messageText = customMessage || reminder.rendered_message || 'Event Reminder';

  try {
    db.prepare(`
      UPDATE reminders
      SET status = 'Sent',
          sent_at = CURRENT_TIMESTAMP,
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(notes ? notes.trim() : 'Sent via Batch WhatsApp Dispatcher', reminderId);

    db.prepare(`
      INSERT INTO message_history (
        reminder_id, event_id, guest_id, recipient_name, recipient_phone,
        message_text, send_method, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'manual_whatsapp', 'Sent')
    `).run(
      reminder.id,
      reminder.event_id,
      reminder.guest_id,
      reminder.guest_name || 'Guest',
      reminder.guest_phone,
      messageText
    );

    res.json({
      success: true,
      message: 'Reminder marked as Sent.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database update failed: ' + err.message });
  }
});

// POST /api/reminders/bulk-mark-sent - Bulk mark array of reminders as sent
router.post('/bulk-mark-sent', (req, res) => {
  const db = getDb();
  const { reminder_ids } = req.body;

  if (!reminder_ids || !Array.isArray(reminder_ids) || reminder_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'No reminder IDs provided.' });
  }

  const updateStmt = db.prepare(`
    UPDATE reminders
    SET status = 'Sent',
        sent_at = CURRENT_TIMESTAMP,
        notes = 'Sent via Bulk Batch Dispatcher',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const historyStmt = db.prepare(`
    INSERT INTO message_history (
      reminder_id, event_id, guest_id, recipient_name, recipient_phone,
      message_text, send_method, status
    )
    SELECT r.id, r.event_id, r.guest_id, COALESCE(g.full_name, 'Guest'), g.mobile,
           r.rendered_message, 'manual_whatsapp', 'Sent'
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    WHERE r.id = ?
  `);

  let count = 0;
  const tx = db.transaction(() => {
    for (const id of reminder_ids) {
      updateStmt.run(id);
      historyStmt.run(id);
      count++;
    }
  });

  try {
    tx();
    res.json({ success: true, count, message: `${count} reminders marked as Sent.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reminders/:id/cancel - Cancel a single reminder
router.post('/:id/cancel', (req, res) => {
  const db = getDb();
  const reminderId = req.params.id;

  const reminder = db.prepare('SELECT status FROM reminders WHERE id = ?').get(reminderId);
  if (!reminder) {
    return res.status(404).json({ success: false, error: 'Reminder not found.' });
  }

  if (reminder.status === 'Sent' || reminder.status === 'Delivered') {
    return res.status(400).json({ success: false, error: 'Cannot cancel a reminder that has already been delivered.' });
  }

  db.prepare(`
    UPDATE reminders
    SET status = 'Cancelled',
        notes = 'Cancelled manually by administrator',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reminderId);

  res.json({ success: true, message: 'Reminder cancelled successfully.' });
});

// POST /api/reminders/:id/retry - Reset failed reminder
router.post('/:id/retry', (req, res) => {
  const db = getDb();
  const reminderId = req.params.id;

  db.prepare(`
    UPDATE reminders
    SET status = 'Ready to Send',
        failure_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reminderId);

  res.json({ success: true, message: 'Reminder reset to Ready to Send.' });
});

// GET /api/reminders/auto-runner-status
router.get('/auto-runner-status', (req, res) => {
  const db = getDb();
  const autoDispatchSetting = db.prepare(`SELECT value FROM settings WHERE key = 'auto_dispatch_enabled'`).get()?.value || '1';
  const batchSize = db.prepare(`SELECT value FROM settings WHERE key = 'batch_size'`).get()?.value || '10';
  const cooldownMinutes = db.prepare(`SELECT value FROM settings WHERE key = 'batch_interval_minutes'`).get()?.value || '30';
  
  const runnerStatus = getAutoRunnerStatus();
  const waSession = getSessionStatus();

  res.json({
    success: true,
    autoDispatchEnabled: autoDispatchSetting === '1',
    batchSize: parseInt(batchSize, 10),
    cooldownMinutes: parseInt(cooldownMinutes, 10),
    isWhatsAppConnected: waSession.status === 'CONNECTED',
    connectedPhone: waSession.userPhone,
    ...runnerStatus
  });
});

// POST /api/reminders/trigger-auto-batch - Manually trigger background auto-batch
router.post('/trigger-auto-batch', async (req, res) => {
  try {
    await runAutomatedBatchQueue();
    res.json({ success: true, message: 'Automated batch dispatch cycle executed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
