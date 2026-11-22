/**
 * Reports & Analytics Routes
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

// GET /api/reports/dashboard - Complete dashboard metrics
router.get('/dashboard', (req, res) => {
  const db = getDb();

  const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
  const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
  const totalGuests = db.prepare('SELECT COUNT(*) as count FROM guests').get().count;
  
  const totalScheduledReminders = db.prepare(`
    SELECT COUNT(*) as count FROM reminders WHERE status IN ('Scheduled', 'Pending', 'Ready to Send', 'Awaiting WhatsApp')
  `).get().count;

  const totalSentMessages = db.prepare(`
    SELECT COUNT(*) as count FROM reminders WHERE status = 'Sent'
  `).get().count;

  const totalDeliveredMessages = db.prepare(`
    SELECT COUNT(*) as count FROM reminders WHERE status = 'Delivered'
  `).get().count;

  const totalFailedMessages = db.prepare(`
    SELECT COUNT(*) as count FROM reminders WHERE status = 'Failed'
  `).get().count;

  // Upcoming Events (next 5)
  const upcomingEvents = db.prepare(`
    SELECT e.*, c.full_name as customer_name,
           (SELECT COUNT(*) FROM event_guests eg WHERE eg.event_id = e.id) as guest_count
    FROM events e
    JOIN customers c ON e.customer_id = c.id
    WHERE e.event_date >= DATE('now') AND e.status = 'Active'
    ORDER BY e.event_date ASC
    LIMIT 6
  `).all();

  // Upcoming Reminders due soon
  const upcomingReminders = db.prepare(`
    SELECT r.*, g.full_name as guest_name, g.mobile as guest_phone,
           e.event_name, e.host_name, e.event_date
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    JOIN events e ON r.event_id = e.id
    WHERE r.status IN ('Scheduled', 'Ready to Send', 'Awaiting WhatsApp')
    ORDER BY r.scheduled_date ASC, r.scheduled_time ASC
    LIMIT 8
  `).all();

  // Reminder status breakdown
  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM reminders
    GROUP BY status
  `).all();

  res.json({
    success: true,
    metrics: {
      totalCustomers,
      totalEvents,
      totalGuests,
      totalScheduledReminders,
      totalSentMessages,
      totalDeliveredMessages,
      totalFailedMessages
    },
    upcomingEvents,
    upcomingReminders,
    statusBreakdown
  });
});

// GET /api/reports/events - Event-wise detailed reminder report
router.get('/events', (req, res) => {
  const db = getDb();

  const eventStats = db.prepare(`
    SELECT 
      e.id, e.event_name, e.event_category, e.host_name, e.event_date, e.status as event_status,
      c.full_name as customer_name,
      c.customer_code,
      COUNT(DISTINCT eg.guest_id) as total_guests,
      SUM(CASE WHEN r.status = 'Sent' THEN 1 ELSE 0 END) as sent_count,
      SUM(CASE WHEN r.status = 'Delivered' THEN 1 ELSE 0 END) as delivered_count,
      SUM(CASE WHEN r.status IN ('Scheduled', 'Ready to Send', 'Awaiting WhatsApp') THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN r.status = 'Failed' THEN 1 ELSE 0 END) as failed_count,
      COUNT(r.id) as total_reminders
    FROM events e
    JOIN customers c ON e.customer_id = c.id
    LEFT JOIN event_guests eg ON eg.event_id = e.id
    LEFT JOIN reminders r ON r.event_id = e.id
    GROUP BY e.id
    ORDER BY e.event_date DESC
  `).all();

  res.json({ success: true, eventStats });
});

// GET /api/reports/customers - Customer-wise report
router.get('/customers', (req, res) => {
  const db = getDb();

  const customerStats = db.prepare(`
    SELECT 
      c.id, c.customer_code, c.full_name, c.mobile, c.status, c.registration_date,
      COUNT(DISTINCT e.id) as total_events,
      COUNT(DISTINCT eg.guest_id) as total_guests,
      COUNT(DISTINCT r.id) as total_reminders,
      SUM(CASE WHEN r.status = 'Sent' THEN 1 ELSE 0 END) as sent_reminders
    FROM customers c
    LEFT JOIN events e ON e.customer_id = c.id
    LEFT JOIN event_guests eg ON eg.event_id = e.id
    LEFT JOIN reminders r ON r.event_id = e.id
    GROUP BY c.id
    ORDER BY c.id DESC
  `).all();

  res.json({ success: true, customerStats });
});

// GET /api/reports/history - Message history records
router.get('/history', (req, res) => {
  const db = getDb();
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;

  let query = `
    SELECT mh.*, e.event_name
    FROM message_history mh
    LEFT JOIN events e ON mh.event_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (mh.recipient_name LIKE ? OR mh.recipient_phone LIKE ? OR mh.message_text LIKE ?)`;
    params.push(search, search, search);
  }

  query += ` ORDER BY mh.created_at DESC LIMIT 200`;

  const history = db.prepare(query).all(...params);
  res.json({ success: true, history });
});

// Helper to escape CSV cell value
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// GET /api/reports/export-csv - Export any report as CSV
router.get('/export-csv', (req, res) => {
  const db = getDb();
  const type = req.query.type || 'events';

  let csvContent = '';
  let filename = '';

  if (type === 'events') {
    filename = 'Events_Reminder_Report.csv';
    csvContent = 'Event ID,Event Name,Category,Host Name,Customer,Date,Status,Total Guests,Sent,Delivered,Pending,Failed,Total Reminders\n';

    const events = db.prepare(`
      SELECT 
        e.id, e.event_name, e.event_category, e.host_name, e.event_date, e.status,
        c.full_name as customer_name,
        COUNT(DISTINCT eg.guest_id) as total_guests,
        SUM(CASE WHEN r.status = 'Sent' THEN 1 ELSE 0 END) as sent_count,
        SUM(CASE WHEN r.status = 'Delivered' THEN 1 ELSE 0 END) as delivered_count,
        SUM(CASE WHEN r.status IN ('Scheduled', 'Ready to Send', 'Awaiting WhatsApp') THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN r.status = 'Failed' THEN 1 ELSE 0 END) as failed_count,
        COUNT(r.id) as total_reminders
      FROM events e
      JOIN customers c ON e.customer_id = c.id
      LEFT JOIN event_guests eg ON eg.event_id = e.id
      LEFT JOIN reminders r ON r.event_id = e.id
      GROUP BY e.id
      ORDER BY e.event_date DESC
    `).all();

    events.forEach(r => {
      csvContent += [
        escapeCsv(r.id),
        escapeCsv(r.event_name),
        escapeCsv(r.event_category),
        escapeCsv(r.host_name),
        escapeCsv(r.customer_name),
        escapeCsv(r.event_date),
        escapeCsv(r.status),
        escapeCsv(r.total_guests),
        escapeCsv(r.sent_count || 0),
        escapeCsv(r.delivered_count || 0),
        escapeCsv(r.pending_count || 0),
        escapeCsv(r.failed_count || 0),
        escapeCsv(r.total_reminders || 0)
      ].join(',') + '\n';
    });
  } else if (type === 'customers') {
    filename = 'Customers_Report.csv';
    csvContent = 'Customer Code,Full Name,Mobile,Email,Status,Registration Date,Total Events,Total Guests,Sent Reminders\n';

    const customers = db.prepare(`
      SELECT 
        c.customer_code, c.full_name, c.mobile, c.email, c.status, c.registration_date,
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT eg.guest_id) as total_guests,
        SUM(CASE WHEN r.status = 'Sent' THEN 1 ELSE 0 END) as sent_reminders
      FROM customers c
      LEFT JOIN events e ON e.customer_id = c.id
      LEFT JOIN event_guests eg ON eg.event_id = e.id
      LEFT JOIN reminders r ON r.event_id = e.id
      GROUP BY c.id
      ORDER BY c.id DESC
    `).all();

    customers.forEach(r => {
      csvContent += [
        escapeCsv(r.customer_code),
        escapeCsv(r.full_name),
        escapeCsv(r.mobile),
        escapeCsv(r.email || ''),
        escapeCsv(r.status),
        escapeCsv(r.registration_date),
        escapeCsv(r.total_events),
        escapeCsv(r.total_guests),
        escapeCsv(r.sent_reminders || 0)
      ].join(',') + '\n';
    });
  } else if (type === 'history') {
    filename = 'Message_History_Report.csv';
    csvContent = 'ID,Date,Recipient Name,Phone,Event,Send Method,Status,Message Text\n';

    const history = db.prepare(`
      SELECT mh.*, e.event_name
      FROM message_history mh
      LEFT JOIN events e ON mh.event_id = e.id
      ORDER BY mh.created_at DESC
    `).all();

    history.forEach(r => {
      csvContent += [
        escapeCsv(r.id),
        escapeCsv(r.created_at),
        escapeCsv(r.recipient_name),
        escapeCsv(r.recipient_phone),
        escapeCsv(r.event_name || ''),
        escapeCsv(r.send_method),
        escapeCsv(r.status),
        escapeCsv(r.message_text)
      ].join(',') + '\n';
    });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

module.exports = router;
