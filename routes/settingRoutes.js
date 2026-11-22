/**
 * Settings & System Management Routes
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb, DB_PATH, BACKUPS_DIR } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const { dbUpload, logoUpload } = require('../middlewares/upload');

// GET /api/settings/public - Public business details & logo (used on login page and public views)
router.get('/public', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('business_name', 'business_tagline', 'company_logo')").all();
    const publicSettings = {
      business_name: 'THE INVITATION PALACE',
      business_tagline: 'Luxury Wedding & Event Stationery',
      company_logo: ''
    };
    rows.forEach(r => {
      publicSettings[r.key] = r.value;
    });
    res.json({ success: true, settings: publicSettings });
  } catch (err) {
    res.json({ success: true, settings: { business_name: 'THE INVITATION PALACE', business_tagline: 'Luxury Wedding & Event Stationery', company_logo: '' } });
  }
});

router.use(requireAuth);

// GET /api/settings - Fetch all settings
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value, description FROM settings').all();
  
  const settingsObj = {};
  rows.forEach(r => {
    // Mask sensitive Meta token for frontend display
    if (r.key === 'meta_access_token' && r.value) {
      settingsObj[r.key] = r.value.substring(0, 8) + '****************' + r.value.slice(-6);
      settingsObj.has_meta_token = true;
    } else {
      settingsObj[r.key] = r.value;
    }
  });

  res.json({ success: true, settings: settingsObj });
});

// POST /api/settings - Update settings
router.post('/', (req, res) => {
  const db = getDb();
  const updates = req.body;

  const updateStmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      // If meta_access_token was submitted as masked, do not overwrite existing token
      if (key === 'meta_access_token' && value && value.includes('****')) {
        continue;
      }
      if (key !== 'has_meta_token') {
        updateStmt.run(key, String(value ?? ''));
      }
    }
  });

  try {
    tx();
    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update settings: ' + err.message });
  }
});

// GET /api/settings/backup - Create & download SQLite database backup
router.get('/backup', (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `invitation_palace_backup_${timestamp}.db`;
    const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

    // SQLite backup via vacuum or copy
    const db = getDb();
    db.backup(backupFilePath)
      .then(() => {
        res.download(backupFilePath, backupFileName, (err) => {
          if (err) {
            console.error('Backup download error:', err);
          }
        });
      })
      .catch((err) => {
        console.error('Database backup failed:', err);
        res.status(500).json({ success: false, error: 'Database backup failed: ' + err.message });
      });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Backup error: ' + err.message });
  }
});

// POST /api/settings/restore - Restore SQLite database from uploaded backup
router.post('/restore', dbUpload.single('backup_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Please choose a valid SQLite (.db) backup file.' });
  }

  const uploadedPath = req.file.path;

  try {
    // Verify file is a valid SQLite DB by opening it temporarily
    const Database = require('better-sqlite3');
    const testDb = new Database(uploadedPath);
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    testDb.close();

    const tableNames = tables.map(t => t.name);
    if (!tableNames.includes('customers') || !tableNames.includes('events')) {
      fs.unlinkSync(uploadedPath);
      return res.status(400).json({
        success: false,
        error: 'Uploaded file is not a valid THE INVITATION PALACE database backup.'
      });
    }

    // Close current db instance
    const currentDb = getDb();
    currentDb.close();

    // Overwrite DB_PATH with uploaded file
    fs.copyFileSync(uploadedPath, DB_PATH);
    fs.unlinkSync(uploadedPath);

    // Reopen connection
    require('../config/db').initDb();

    res.json({
      success: true,
      message: 'Database restored successfully! The application is running with the restored data.'
    });
  } catch (err) {
    console.error('Restore failed:', err);
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    res.status(500).json({ success: false, error: 'Database restore failed: ' + err.message });
  }
});

// GET /api/settings/export-data - Full system JSON export
router.get('/export-data', (req, res) => {
  const db = getDb();

  const customers = db.prepare('SELECT * FROM customers').all();
  const events = db.prepare('SELECT * FROM events').all();
  const guests = db.prepare('SELECT * FROM guests').all();
  const eventGuests = db.prepare('SELECT * FROM event_guests').all();
  const templates = db.prepare('SELECT * FROM templates').all();
  const reminders = db.prepare('SELECT * FROM reminders').all();
  const messageHistory = db.prepare('SELECT * FROM message_history').all();
  const settings = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '%token%'").all();

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    application: 'THE INVITATION PALACE',
    version: '1.0.0',
    data: {
      customers,
      events,
      guests,
      eventGuests,
      templates,
      reminders,
      messageHistory,
      settings
    }
  };

  const filename = `invitation_palace_full_export_${new Date().toISOString().split('T')[0]}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(exportPayload, null, 2));
});

// Helper to save base64 dataURL to disk
function saveBase64Logo(base64Str) {
  const matches = base64Str.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  let ext = 'png';
  let buffer;
  if (matches) {
    ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    buffer = Buffer.from(base64Str, 'base64');
  }

  const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const LOGOS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'logos');
  if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
  }
  const filePath = path.join(LOGOS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/logos/${filename}`;
}

function processLogoUpdate(req, res, logoRelativeUrl) {
  const db = getDb();
  try {
    if (logoRelativeUrl) {
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('company_logo', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).run(logoRelativeUrl);
    }

    if (req.body.business_name && req.body.business_name.trim()) {
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('business_name', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).run(req.body.business_name.trim());
    }
    if (req.body.business_tagline && req.body.business_tagline.trim()) {
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('business_tagline', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).run(req.body.business_tagline.trim());
    }

    res.json({
      success: true,
      message: 'Company logo & branding updated successfully!',
      logoUrl: logoRelativeUrl || ''
    });
  } catch (err) {
    console.error('Logo upload error:', err);
    res.status(500).json({ success: false, error: 'Failed to save logo: ' + err.message });
  }
}

// POST /api/settings/logo - Upload and save company logo (handles both JSON Base64 & Multipart)
router.post('/logo', (req, res) => {
  // Check if JSON request with base64 logo
  if (req.is('json') || (req.body && req.body.logo_base64)) {
    let logoUrl = null;
    if (req.body.logo_base64) {
      try {
        logoUrl = saveBase64Logo(req.body.logo_base64);
      } catch (err) {
        return res.status(400).json({ success: false, error: 'Invalid image format: ' + err.message });
      }
    }
    return processLogoUpdate(req, res, logoUrl);
  }

  // Otherwise handle multipart file upload with multer
  logoUpload.single('logo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    let logoUrl = null;
    if (req.file) {
      logoUrl = `/uploads/logos/${req.file.filename}`;
    } else if (req.body && req.body.logo_base64) {
      try {
        logoUrl = saveBase64Logo(req.body.logo_base64);
      } catch (e) {}
    }
    processLogoUpdate(req, res, logoUrl);
  });
});

// DELETE /api/settings/logo - Reset company logo to default
router.delete('/logo', (req, res) => {
  const db = getDb();
  try {
    const existing = db.prepare("SELECT value FROM settings WHERE key = 'company_logo'").get();
    if (existing && existing.value) {
      const fullPath = path.join(__dirname, '..', 'public', existing.value);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (_) {}
      }
    }

    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('company_logo', '', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = '',
        updated_at = CURRENT_TIMESTAMP
    `).run();

    res.json({ success: true, message: 'Company logo reset to default royal monogram.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to reset logo: ' + err.message });
  }
});

module.exports = router;
