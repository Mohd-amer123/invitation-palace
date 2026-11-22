/**
 * Guest Management Routes
 * Manual Entry & Excel/CSV Bulk Import (Guest Name is Optional)
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { excelUpload } = require('../middlewares/upload');
const { normalizePhoneNumber } = require('../config/constants');
const { generateSampleTemplate, parseAndValidateFile } = require('../services/excelService');
const { generateRemindersForEvent } = require('../services/reminderService');

router.use(requireAuth);

// GET /api/guests - List & search guests
router.get('/', (req, res) => {
  const db = getDb();
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;
  const eventId = req.query.eventId || null;
  const consent = req.query.consent;

  let query = `
    SELECT g.*, 
           COUNT(DISTINCT eg.event_id) as total_events
    FROM guests g
    LEFT JOIN event_guests eg ON eg.guest_id = g.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (g.full_name LIKE ? OR g.mobile LIKE ? OR g.email LIKE ?)`;
    params.push(search, search, search);
  }

  if (eventId) {
    query += ` AND eg.event_id = ?`;
    params.push(eventId);
  }

  if (consent !== undefined && consent !== '' && consent !== 'All') {
    query += ` AND g.consent_status = ?`;
    params.push(parseInt(consent, 10));
  }

  query += ` GROUP BY g.id ORDER BY g.id DESC`;

  const guests = db.prepare(query).all(...params);
  res.json({ success: true, guests });
});

// GET /api/guests/sample-template - Download Excel template
router.get('/sample-template', (req, res) => {
  try {
    const buffer = generateSampleTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Guest_Import_Template_The_Invitation_Palace.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not generate template: ' + err.message });
  }
});

// GET /api/guests/:id - Guest details + events
router.get('/:id', (req, res) => {
  const db = getDb();
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);

  if (!guest) {
    return res.status(404).json({ success: false, error: 'Guest not found.' });
  }

  const events = db.prepare(`
    SELECT e.*, c.full_name as customer_name, eg.rsvp_status
    FROM events e
    JOIN event_guests eg ON eg.event_id = e.id
    JOIN customers c ON e.customer_id = c.id
    WHERE eg.guest_id = ?
    ORDER BY e.event_date DESC
  `).all(guest.id);

  const reminders = db.prepare(`
    SELECT r.*, e.event_name, e.event_date
    FROM reminders r
    JOIN events e ON r.event_id = e.id
    WHERE r.guest_id = ?
    ORDER BY r.scheduled_date DESC
  `).all(guest.id);

  res.json({
    success: true,
    guest,
    events,
    reminders
  });
});

// POST /api/guests - Manual guest entry (Guest name is optional!)
router.post('/', (req, res) => {
  const db = getDb();
  const { full_name, mobile, email, preferred_language, consent_status, notes, event_id } = req.body;

  const defaultCountryCode = db.prepare(`SELECT value FROM settings WHERE key = 'default_country_code'`).get()?.value || '+91';
  const normalizedMobile = normalizePhoneNumber(mobile, defaultCountryCode);

  if (!normalizedMobile) {
    return res.status(400).json({ success: false, error: 'Please provide a valid WhatsApp phone number (10-digit or international format).' });
  }

  // Name is optional, fallback to 'Guest' if empty
  const displayName = (full_name && full_name.trim()) ? full_name.trim() : 'Guest';

  // Check if guest already exists with this phone number
  let guest = db.prepare('SELECT * FROM guests WHERE mobile = ?').get(normalizedMobile);

  const consent = consent_status !== undefined ? (consent_status ? 1 : 0) : 1;

  try {
    let guestId;
    if (guest) {
      guestId = guest.id;
      db.prepare(`
        UPDATE guests
        SET full_name = COALESCE(NULLIF(?, 'Guest'), full_name),
            consent_status = ?,
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(displayName, consent, notes ? notes.trim() : null, guestId);
    } else {
      const result = db.prepare(`
        INSERT INTO guests (full_name, mobile, email, preferred_language, consent_status, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        displayName,
        normalizedMobile,
        email ? email.trim() : null,
        preferred_language || 'English',
        consent,
        notes ? notes.trim() : null
      );
      guestId = result.lastInsertRowid;
    }

    if (event_id) {
      const existingLink = db.prepare(`
        SELECT id FROM event_guests WHERE event_id = ? AND guest_id = ?
      `).get(event_id, guestId);

      if (!existingLink) {
        db.prepare(`
          INSERT INTO event_guests (event_id, guest_id)
          VALUES (?, ?)
        `).run(event_id, guestId);

        generateRemindersForEvent(event_id);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Guest saved successfully.',
      guestId
    });
  } catch (err) {
    console.error('Guest creation error:', err);
    res.status(500).json({ success: false, error: 'Failed to save guest: ' + err.message });
  }
});

// PUT /api/guests/:id - Update guest info
router.put('/:id', (req, res) => {
  const db = getDb();
  const guestId = req.params.id;
  const { full_name, mobile, email, preferred_language, consent_status, notes } = req.body;

  const defaultCountryCode = db.prepare(`SELECT value FROM settings WHERE key = 'default_country_code'`).get()?.value || '+91';
  const normalizedMobile = normalizePhoneNumber(mobile, defaultCountryCode);

  if (!normalizedMobile) {
    return res.status(400).json({ success: false, error: 'A valid WhatsApp mobile number is required.' });
  }

  const displayName = (full_name && full_name.trim()) ? full_name.trim() : 'Guest';

  try {
    db.prepare(`
      UPDATE guests
      SET full_name = ?,
          mobile = ?,
          email = ?,
          preferred_language = ?,
          consent_status = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      displayName,
      normalizedMobile,
      email ? email.trim() : null,
      preferred_language || 'English',
      consent_status ? 1 : 0,
      notes ? notes.trim() : null,
      guestId
    );

    res.json({ success: true, message: 'Guest updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update guest: ' + err.message });
  }
});

// DELETE /api/guests/:id - Delete guest
router.delete('/:id', (req, res) => {
  const db = getDb();
  const guestId = parseInt(req.params.id, 10);
  const force = req.query.force === 'true' || req.body?.force;

  if (force) {
    try {
      db.prepare('DELETE FROM message_history WHERE guest_id = ?').run(guestId);
      db.prepare('DELETE FROM reminders WHERE guest_id = ?').run(guestId);
      db.prepare('DELETE FROM event_guests WHERE guest_id = ?').run(guestId);
      db.prepare('DELETE FROM guests WHERE id = ?').run(guestId);
      return res.json({ success: true, message: 'Guest deleted permanently.' });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  const sentCount = db.prepare('SELECT COUNT(*) as count FROM message_history WHERE guest_id = ?').get(guestId)?.count || 0;

  if (sentCount > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete guest because ${sentCount} message(s) have already been sent. Use force delete to remove.`
    });
  }

  db.prepare('DELETE FROM reminders WHERE guest_id = ?').run(guestId);
  db.prepare('DELETE FROM event_guests WHERE guest_id = ?').run(guestId);
  db.prepare('DELETE FROM guests WHERE id = ?').run(guestId);
  res.json({ success: true, message: 'Guest deleted successfully.' });
});

// POST /api/guests/preview-import - Parse Excel/CSV and preview records
router.post('/preview-import', excelUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.' });
  }

  const eventId = req.body.event_id ? parseInt(req.body.event_id, 10) : null;
  const db = getDb();
  const defaultCountryCode = db.prepare(`SELECT value FROM settings WHERE key = 'default_country_code'`).get()?.value || '+91';

  try {
    const analysis = parseAndValidateFile(req.file.buffer, eventId, defaultCountryCode);
    res.json({
      success: true,
      analysis
    });
  } catch (err) {
    console.error('Import parse error:', err);
    res.status(500).json({ success: false, error: 'Could not read or parse file: ' + err.message });
  }
});

// POST /api/guests/confirm-import - Execute the bulk import
router.post('/confirm-import', (req, res) => {
  const { event_id, records } = req.body;

  if (!event_id) {
    return res.status(400).json({ success: false, error: 'Target Event is required for guest import.' });
  }

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid records provided for import.' });
  }

  const db = getDb();
  const defaultCountryCode = db.prepare(`SELECT value FROM settings WHERE key = 'default_country_code'`).get()?.value || '+91';

  let importedCount = 0;
  let skippedCount = 0;

  const findGuestStmt = db.prepare('SELECT id FROM guests WHERE mobile = ?');
  const insertGuestStmt = db.prepare(`
    INSERT INTO guests (full_name, mobile, email, preferred_language, consent_status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const linkStmt = db.prepare(`
    INSERT OR IGNORE INTO event_guests (event_id, guest_id)
    VALUES (?, ?)
  `);

  const tx = db.transaction(() => {
    for (const r of records) {
      const normalizedMobile = normalizePhoneNumber(r.mobile, defaultCountryCode);
      if (!normalizedMobile) {
        skippedCount++;
        continue;
      }

      const guestName = (r.name && r.name.trim()) ? r.name.trim() : 'Guest';

      let guest = findGuestStmt.get(normalizedMobile);
      let guestId;

      if (guest) {
        guestId = guest.id;
      } else {
        const insertRes = insertGuestStmt.run(
          guestName,
          normalizedMobile,
          r.email ? r.email.trim() : null,
          r.language || 'English',
          r.consentStatus !== undefined ? r.consentStatus : 1,
          r.notes ? r.notes.trim() : null
        );
        guestId = insertRes.lastInsertRowid;
      }

      const linkRes = linkStmt.run(event_id, guestId);
      if (linkRes.changes > 0) {
        importedCount++;
      } else {
        skippedCount++;
      }
    }
  });

  try {
    tx();

    const remResult = generateRemindersForEvent(event_id);

    db.prepare(`
      INSERT INTO system_logs (level, action, details)
      VALUES ('INFO', 'Bulk Guest Import', ?)
    `).run(`Imported ${importedCount} guests into Event ID ${event_id}`);

    res.json({
      success: true,
      message: `Successfully imported ${importedCount} guests into the event. (${skippedCount} already attached or skipped). Generated ${remResult.count} reminder schedules.`,
      importedCount,
      skippedCount
    });
  } catch (err) {
    console.error('Import execution error:', err);
    res.status(500).json({ success: false, error: 'Database error during import: ' + err.message });
  }
});

module.exports = router;
