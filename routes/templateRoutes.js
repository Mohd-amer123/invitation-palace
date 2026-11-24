/**
 * Message Template Routes
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { renderTemplate, getSamplePreview } = require('../services/templateEngine');

router.use(requireAuth);

// GET /api/templates - Get all templates
router.get('/', (req, res) => {
  const db = getDb();
  const templates = db.prepare('SELECT * FROM templates ORDER BY stage_days DESC').all();

  // Attach dynamic sample previews
  const templatesWithPreview = templates.map(t => ({
    ...t,
    samplePreview: getSamplePreview(t.template_text, t.stage_days)
  }));

  res.json({ success: true, templates: templatesWithPreview });
});

// GET /api/templates/:id - Get single template
router.get('/:id', (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);

  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found.' });
  }

  res.json({
    success: true,
    template,
    samplePreview: getSamplePreview(template.template_text, template.stage_days)
  });
});

// PUT /api/templates/:id - Update template wording
router.put('/:id', (req, res) => {
  const db = getDb();
  const { template_text } = req.body;

  if (!template_text || !template_text.trim()) {
    return res.status(400).json({ success: false, error: 'Template text cannot be empty.' });
  }

  try {
    db.prepare(`
      UPDATE templates
      SET template_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(template_text.trim(), req.params.id);

    res.json({ success: true, message: 'Template updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update template: ' + err.message });
  }
});

// POST /api/templates/preview - Live preview helper
router.post('/preview', (req, res) => {
  const { template_text, sample_data } = req.body;

  if (!template_text) {
    return res.status(400).json({ success: false, error: 'Template text is required.' });
  }

  const db = getDb();
  const businessName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
  const defaultTimezone = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';

  const context = {
    guest_name: sample_data?.guest_name || 'Mohammad Tariq',
    event_name: sample_data?.event_name || 'Grand Wedding Reception',
    host_name: sample_data?.host_name || 'Farhan & Amina',
    event_date: sample_data?.event_date || '2026-12-25',
    event_time: sample_data?.event_time || '07:30 PM',
    venue_name: sample_data?.venue_name || 'Royal Heritage Palace, King’s Hall',
    venue_address: sample_data?.venue_address || 'No. 42, Palace Cross Road, Bengaluru',
    maps_link: sample_data?.maps_link || 'https://maps.google.com/?q=Royal+Heritage+Palace',
    digital_card_link: sample_data?.digital_card_link || 'https://theinvitationpalace.com/card/farhan-amina-wedding',
    business_name: businessName,
    timeZone: defaultTimezone,
    sendDate: new Date()
  };

  const preview = renderTemplate(template_text, context);
  res.json({ success: true, preview });
});

module.exports = router;
