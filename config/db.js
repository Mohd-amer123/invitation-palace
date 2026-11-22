/**
 * Database Configuration & Initialization
 * Resilient SQLite Architecture
 * Supports better-sqlite3 with automatic fallback to built-in node:sqlite
 * THE INVITATION PALACE
 */

const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../utils/security');

const DB_DIR = path.join(__dirname, '..', 'database');
const DB_PATH = path.join(DB_DIR, 'invitation_palace.db');
const BACKUPS_DIR = path.join(DB_DIR, 'backups');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

let dbInstance = null;

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  let db = null;

  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    console.log('[Database] Connected via better-sqlite3.');
  } catch (err) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(DB_PATH);
      db.exec('PRAGMA foreign_keys = ON;');
      console.log('[Database] Connected via Node built-in node:sqlite.');
    } catch (builtinErr) {
      throw new Error('No SQLite driver available. Please run "npm install" to install better-sqlite3.');
    }
  }

  if (!db.transaction) {
    db.transaction = function (fn) {
      return function (...args) {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = fn(...args);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch (rbErr) {}
          throw error;
        }
      };
    };
  }

  if (!db.backup) {
    db.backup = function (backupFilePath) {
      return new Promise((resolve, reject) => {
        try {
          fs.copyFileSync(DB_PATH, backupFilePath);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    };
  }

  dbInstance = db;
  return dbInstance;
}

function initDb() {
  const db = getDb();

  const schemaQueries = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT,
      address TEXT,
      order_reference TEXT,
      registration_date DATE DEFAULT (DATE('now')),
      notes TEXT,
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      event_name TEXT NOT NULL,
      event_category TEXT NOT NULL,
      host_name TEXT NOT NULL,
      event_date DATE NOT NULL,
      event_time TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      venue_address TEXT NOT NULL,
      maps_link TEXT,
      description TEXT,
      reminder_days TEXT DEFAULT '7,3,1',
      reminder_time TEXT DEFAULT '10:00',
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT,
      mobile TEXT NOT NULL,
      email TEXT,
      preferred_language TEXT DEFAULT 'English',
      consent_status INTEGER DEFAULT 1,
      consent_date DATE DEFAULT (DATE('now')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
      rsvp_status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, guest_id)
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_days INTEGER NOT NULL UNIQUE,
      stage_name TEXT NOT NULL,
      template_text TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
      stage_days INTEGER NOT NULL,
      reminder_stage TEXT NOT NULL,
      scheduled_date DATE NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT DEFAULT 'Scheduled',
      rendered_message TEXT,
      sent_at DATETIME,
      failure_reason TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, guest_id, stage_days)
    );

    CREATE TABLE IF NOT EXISTS message_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      message_text TEXT NOT NULL,
      send_method TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS whatsapp_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL,
      phone_number TEXT,
      auth_folder TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'DISCONNECTED',
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS whatsapp_link_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      phone_number TEXT,
      pairing_code TEXT,
      status TEXT DEFAULT 'PENDING',
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT DEFAULT 'INFO',
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
    CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_id);
    CREATE INDEX IF NOT EXISTS idx_guests_mobile ON guests(mobile);
    CREATE INDEX IF NOT EXISTS idx_event_guests_event ON event_guests(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_guests_guest ON event_guests(guest_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_status_date ON reminders(status, scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_reminders_event ON reminders(event_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_guest ON reminders(guest_id);
    CREATE INDEX IF NOT EXISTS idx_history_date ON message_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_link_tokens_token ON whatsapp_link_tokens(token);
  `;

  db.exec(schemaQueries);

  // Seed Default Admin User if none exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const hash = hashPassword('admin123');
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
    `).run('admin', hash, 'Palace Administrator', 'admin');
    console.log('[Database] Default admin user initialized: username: admin / password: admin123');
  }

  // Seed Default Settings
  const defaultSettings = [
    { key: 'business_name', value: 'THE INVITATION PALACE', description: 'Business trading name' },
    { key: 'business_tagline', value: 'Luxury Wedding & Event Stationery', description: 'Business tagline' },
    { key: 'company_logo', value: '', description: 'Custom uploaded company logo URL' },
    { key: 'business_phone', value: '+919876543210', description: 'Business contact WhatsApp number' },
    { key: 'business_email', value: 'contact@theinvitationpalace.com', description: 'Business contact email' },
    { key: 'business_address', value: 'Royal Palace Road, M.G. Boulevard, Bangalore, Karnataka - 560001', description: 'Physical store address' },
    { key: 'default_country_code', value: '+91', description: 'Default international dial code' },
    { key: 'default_timezone', value: 'Asia/Kolkata', description: 'Application time zone' },
    { key: 'default_reminder_days', value: '7,3,1', description: 'Default reminder days before event' },
    { key: 'default_reminder_time', value: '10:00', description: 'Default reminder dispatch time (HH:MM 24h)' },
    { key: 'whatsapp_mode', value: 'manual_free', description: 'WhatsApp sending mode: manual_free (100% free) or meta_cloud_api' },
    { key: 'meta_api_enabled', value: '0', description: 'Whether automatic Meta Cloud API dispatch is enabled (0 = disabled, 1 = enabled)' },
    { key: 'meta_phone_number_id', value: '', description: 'WhatsApp Cloud API Phone Number ID' },
    { key: 'meta_waba_id', value: '', description: 'WhatsApp Business Account ID' },
    { key: 'meta_access_token', value: '', description: 'Meta Cloud API Permanent Access Token' },
    { key: 'meta_api_version', value: 'v21.0', description: 'Graph API version' },
    { key: 'meta_webhook_verify_token', value: 'palace_verify_token_secure_2026', description: 'Verification token for incoming Meta webhooks' },
    { key: 'auto_dispatch_enabled', value: '1', description: 'Automatically dispatch due reminders in batches via linked WhatsApp (1 = enabled, 0 = disabled)' },
    { key: 'batch_size', value: '10', description: 'Number of messages to send per automated batch' },
    { key: 'batch_interval_minutes', value: '30', description: 'Cooldown interval in minutes between batches when exceeding batch size' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, description)
    VALUES (?, ?, ?)
  `);

  const seedSettingsTx = db.transaction((settings) => {
    for (const s of settings) {
      insertSetting.run(s.key, s.value, s.description);
    }
  });
  seedSettingsTx(defaultSettings);

  // Seed / Update Default Templates: Starting with Universal Greeting {{time_greeting}},
  const defaultTemplates = [
    {
      stage_days: 7,
      stage_name: '7-Day Reminder',
      template_text: `{{time_greeting}},

We are delighted to remind you about the upcoming {{event_name}} hosted by {{host_name}}.

Date: {{event_date}}
Time: {{event_time}}
Venue: {{venue_name}}
Address: {{venue_address}}

We look forward to welcoming you and sharing this special occasion with you!

Regards,
THE INVITATION PALACE`
    },
    {
      stage_days: 3,
      stage_name: '3-Day Reminder',
      template_text: `{{time_greeting}},

Just 3 days to go!

A friendly reminder about {{host_name}}'s upcoming {{event_name}}.

Date: {{event_date}}
Time: {{event_time}}
Venue: {{venue_name}}

We look forward to seeing you!

Regards,
THE INVITATION PALACE`
    },
    {
      stage_days: 1,
      stage_name: '1-Day Reminder',
      template_text: `{{time_greeting}},

A gentle reminder that {{event_name}} hosted by {{host_name}} is happening tomorrow!

Time: {{event_time}}
Venue: {{venue_name}}
Address: {{venue_address}}

We hope to see you there!

Regards,
THE INVITATION PALACE`
    }
  ];

  const upsertTemplate = db.prepare(`
    INSERT INTO templates (stage_days, stage_name, template_text, is_active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(stage_days) DO UPDATE SET
      template_text = excluded.template_text
  `);

  const seedTemplatesTx = db.transaction((templates) => {
    for (const t of templates) {
      upsertTemplate.run(t.stage_days, t.stage_name, t.template_text);
    }
  });
  seedTemplatesTx(defaultTemplates);

  // Migration: Check and add whatsapp_account_id to events table if not exists
  try {
    const eventCols = db.prepare(`PRAGMA table_info(events)`).all();
    if (!eventCols.some(c => c.name === 'whatsapp_account_id')) {
      db.exec(`ALTER TABLE events ADD COLUMN whatsapp_account_id INTEGER REFERENCES whatsapp_accounts(id)`);
      console.log('[Database] Migrated events table: added whatsapp_account_id column.');
    }
  } catch (e) {
    console.error('[Database] Column migration error:', e.message);
  }

  // Seed default primary whatsapp account if none exists
  try {
    const waCount = db.prepare(`SELECT COUNT(*) as count FROM whatsapp_accounts`).get()?.count || 0;
    if (waCount === 0) {
      db.prepare(`
        INSERT INTO whatsapp_accounts (account_name, auth_folder, is_default, status)
        VALUES ('Primary Palace WhatsApp', 'default', 1, 'DISCONNECTED')
      `).run();
      console.log('[Database] Seeded default Primary WhatsApp Account.');
    }
  } catch (e) {
    console.error('[Database] WhatsApp account seed error:', e.message);
  }

  console.log('[Database] SQLite initialized successfully at:', DB_PATH);
}

module.exports = {
  getDb,
  initDb,
  DB_PATH,
  BACKUPS_DIR
};
