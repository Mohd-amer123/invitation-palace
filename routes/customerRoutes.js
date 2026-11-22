/**
 * Customer Management Routes
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { normalizePhoneNumber } = require('../config/constants');

router.use(requireAuth);

// Helper to generate next customer code (CUST-1001, CUST-1002, etc.)
function generateCustomerCode(db) {
  const row = db.prepare(`
    SELECT customer_code FROM customers 
    ORDER BY id DESC LIMIT 1
  `).get();

  if (!row || !row.customer_code) {
    return 'CUST-1001';
  }

  const match = row.customer_code.match(/CUST-(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10) + 1;
    return `CUST-${num}`;
  }
  return `CUST-${Date.now().toString().slice(-4)}`;
}

// GET /api/customers - List & search customers
router.get('/', (req, res) => {
  const db = getDb();
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;
  const status = req.query.status || null;

  let query = `
    SELECT c.*, 
           COUNT(DISTINCT e.id) as total_events
    FROM customers c
    LEFT JOIN events e ON e.customer_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (c.full_name LIKE ? OR c.mobile LIKE ? OR c.customer_code LIKE ? OR c.order_reference LIKE ?)`;
    params.push(search, search, search, search);
  }

  if (status && status !== 'All') {
    query += ` AND c.status = ?`;
    params.push(status);
  }

  query += ` GROUP BY c.id ORDER BY c.id DESC`;

  const customers = db.prepare(query).all(...params);
  res.json({ success: true, customers });
});

// GET /api/customers/:id/workspace - Complete 360-degree Customer Hub Workspace
router.get('/:id/workspace', (req, res) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    // All events for this customer
    const events = db.prepare(`
      SELECT e.*, 
             wa.account_name as whatsapp_sender_name,
             wa.phone_number as whatsapp_sender_phone,
             (SELECT COUNT(*) FROM event_guests eg WHERE eg.event_id = e.id) as total_guests,
             (SELECT COUNT(*) FROM reminders r WHERE r.event_id = e.id) as total_reminders,
             (SELECT COUNT(*) FROM reminders r WHERE r.event_id = e.id AND r.status = 'Sent') as sent_reminders,
             (SELECT COUNT(*) FROM reminders r WHERE r.event_id = e.id AND r.status IN ('Scheduled', 'Ready to Send')) as pending_reminders
      FROM events e
      LEFT JOIN whatsapp_accounts wa ON wa.id = e.whatsapp_account_id
      WHERE e.customer_id = ?
      ORDER BY e.event_date DESC
    `).all(customer.id);

    const eventIds = events.map(e => e.id);

    let guests = [];
    let reminders = [];
    let history = [];

    if (eventIds.length > 0) {
      const placeholders = eventIds.map(() => '?').join(',');

      // All guests linked to this customer's events
      guests = db.prepare(`
        SELECT DISTINCT 
          g.id, g.full_name, g.mobile, g.consent_status, g.notes,
          e.id as event_id, e.event_name, e.host_name, e.event_date,
          eg.created_at as linked_at
        FROM guests g
        JOIN event_guests eg ON eg.guest_id = g.id
        JOIN events e ON e.id = eg.event_id
        WHERE eg.event_id IN (${placeholders})
        ORDER BY g.id DESC
      `).all(...eventIds);

      // All reminders for this customer's events
      reminders = db.prepare(`
        SELECT 
          r.*, 
          e.event_name, e.host_name, e.event_date, e.event_time, e.venue_name,
          g.full_name as guest_name, g.mobile as guest_phone
        FROM reminders r
        JOIN events e ON e.id = r.event_id
        JOIN guests g ON g.id = r.guest_id
        WHERE r.event_id IN (${placeholders})
        ORDER BY r.scheduled_date ASC, r.scheduled_time ASC
      `).all(...eventIds);

      // Recent message logs for this customer's events (ORDER BY created_at)
      history = db.prepare(`
        SELECT mh.*, e.event_name
        FROM message_history mh
        JOIN events e ON e.id = mh.event_id
        WHERE mh.event_id IN (${placeholders})
        ORDER BY mh.created_at DESC
        LIMIT 100
      `).all(...eventIds);
    }

    const stats = {
      totalEvents: events.length,
      totalGuests: guests.length,
      totalReminders: reminders.length,
      sentReminders: reminders.filter(r => r.status === 'Sent').length,
      pendingReminders: reminders.filter(r => ['Scheduled', 'Ready to Send'].includes(r.status)).length,
      skippedReminders: reminders.filter(r => r.status === 'Skipped').length,
      failedReminders: reminders.filter(r => r.status === 'Failed').length
    };

    res.json({
      success: true,
      customer,
      events,
      guests,
      reminders,
      history,
      stats
    });
  } catch (err) {
    console.error('Customer workspace API error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/customers/:id - Customer details + all events
router.get('/:id', (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);

  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found.' });
  }

  // Fetch all events for this customer
  const events = db.prepare(`
    SELECT e.*, 
           (SELECT COUNT(*) FROM event_guests eg WHERE eg.event_id = e.id) as total_guests,
           (SELECT COUNT(*) FROM reminders r WHERE r.event_id = e.id) as total_reminders
    FROM events e
    WHERE e.customer_id = ?
    ORDER BY e.event_date DESC
  `).all(customer.id);

  res.json({
    success: true,
    customer,
    events
  });
});

// POST /api/customers - Create new customer
router.post('/', (req, res) => {
  const db = getDb();
  const { full_name, mobile, email, address, order_reference, notes, status } = req.body;

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ success: false, error: 'Customer full name is required.' });
  }

  const defaultCountryCode = db.prepare(`SELECT value FROM settings WHERE key = 'default_country_code'`).get()?.value || '+91';
  const normalizedMobile = normalizePhoneNumber(mobile, defaultCountryCode);

  if (!normalizedMobile) {
    return res.status(400).json({ success: false, error: 'A valid mobile number is required.' });
  }

  const customerCode = generateCustomerCode(db);

  try {
    const stmt = db.prepare(`
      INSERT INTO customers (
        customer_code, full_name, mobile, email, address, order_reference, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      customerCode,
      full_name.trim(),
      normalizedMobile,
      email ? email.trim() : null,
      address ? address.trim() : null,
      order_reference ? order_reference.trim() : null,
      notes ? notes.trim() : null,
      status || 'Active'
    );

    db.prepare(`
      INSERT INTO system_logs (level, action, details)
      VALUES ('INFO', 'Customer Created', ?)
    `).run(`Created customer ${full_name} (${customerCode})`);

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully.',
      customerId: result.lastInsertRowid,
      customerCode
    });
  } catch (err) {
    console.error('Customer insert error:', err);
    res.status(500).json({ success: false, error: 'Failed to create customer: ' + err.message });
  }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', (req, res) => {
  const db = getDb();
  const { full_name, mobile, email, address, order_reference, notes, status } = req.body;

  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Customer not found.' });
  }

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ success: false, error: 'Customer full name is required.' });
  }

  const defaultCountryCode = db.prepare(`SELECT value FROM settings WHERE key = 'default_country_code'`).get()?.value || '+91';
  const normalizedMobile = normalizePhoneNumber(mobile, defaultCountryCode);

  if (!normalizedMobile) {
    return res.status(400).json({ success: false, error: 'A valid mobile number is required.' });
  }

  try {
    db.prepare(`
      UPDATE customers
      SET full_name = ?,
          mobile = ?,
          email = ?,
          address = ?,
          order_reference = ?,
          notes = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      full_name.trim(),
      normalizedMobile,
      email ? email.trim() : null,
      address ? address.trim() : null,
      order_reference ? order_reference.trim() : null,
      notes ? notes.trim() : null,
      status || 'Active',
      req.params.id
    );

    res.json({ success: true, message: 'Customer updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update customer: ' + err.message });
  }
});

// DELETE /api/customers/:id - Delete or archive customer
router.delete('/:id', (req, res) => {
  const db = getDb();
  const customerId = req.params.id;

  // Check if customer has associated events
  const eventCount = db.prepare('SELECT COUNT(*) as count FROM events WHERE customer_id = ?').get(customerId).count;

  if (eventCount > 0) {
    // If events exist, archive instead of delete to protect integrity
    db.prepare(`UPDATE customers SET status = 'Archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(customerId);
    return res.json({
      success: true,
      message: `Customer has ${eventCount} associated event(s). Customer has been archived instead of deleted to protect historical data.`
    });
  }

  db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
  res.json({ success: true, message: 'Customer deleted successfully.' });
});

module.exports = router;
