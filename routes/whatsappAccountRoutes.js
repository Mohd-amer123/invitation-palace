/**
 * Multi-WhatsApp Accounts Management Routes
 * Allows registering, linking, and managing multiple WhatsApp accounts for different events.
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const os = require('os');
const { getDb } = require('../config/db');
const { requireAuth } = require('../middlewares/auth');
const {
  initializeAccountSession,
  getAccountSessionStatus,
  requestAccountPairingCode,
  listAllAccountsWithStatus,
  logoutAccountSession
} = require('../services/baileysService');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ============================================================
// PUBLIC CLIENT LINK PORTAL ENDPOINTS (No Admin Auth Required)
// ============================================================

// GET /api/whatsapp/client-session/:token - Get client event info & session status
router.get('/client-session/:token', async (req, res) => {
  const { token } = req.params;
  const db = getDb();

  try {
    const tokenRecord = db.prepare(`
      SELECT 
        wlt.*,
        wa.account_name,
        wa.status as account_status,
        wa.phone_number as account_phone,
        e.event_name,
        e.event_category,
        e.host_name,
        e.event_date,
        e.event_time,
        e.venue_name,
        c.full_name as customer_name,
        c.mobile as customer_mobile
      FROM whatsapp_link_tokens wlt
      JOIN whatsapp_accounts wa ON wa.id = wlt.account_id
      LEFT JOIN events e ON e.id = wlt.event_id
      LEFT JOIN customers c ON c.id = e.customer_id OR c.id = wlt.customer_id
      WHERE wlt.token = ?
    `).get(token);

    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired client linking link. Please request a new link from the Palace Administrator.'
      });
    }

    let sessionStatus = getAccountSessionStatus(tokenRecord.account_id);
    let isConnected = tokenRecord.status === 'CONNECTED' && sessionStatus.status === 'CONNECTED';

    // If token is PENDING but the assigned account is already connected to another number (e.g. admin primary),
    // automatically provision a dedicated WhatsApp account for this event/client!
    if (!isConnected && tokenRecord.status === 'PENDING') {
      const currentAcc = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(tokenRecord.account_id);
      if (currentAcc && (currentAcc.status === 'CONNECTED' || currentAcc.is_default)) {
        const folderName = `session_client_${tokenRecord.event_id || 'evt'}_${Date.now()}`;
        const accName = tokenRecord.event_name 
          ? `${tokenRecord.event_name} (${tokenRecord.host_name || 'Client'})`
          : `Client WhatsApp (${Date.now()})`;

        const newAcc = db.prepare(`
          INSERT INTO whatsapp_accounts (account_name, auth_folder, status, is_default)
          VALUES (?, ?, 'DISCONNECTED', 0)
        `).run(accName, folderName);

        const newAccountId = newAcc.lastInsertRowid;
        tokenRecord.account_id = newAccountId;

        db.prepare('UPDATE whatsapp_link_tokens SET account_id = ? WHERE id = ?')
          .run(newAccountId, tokenRecord.id);

        if (tokenRecord.event_id) {
          db.prepare('UPDATE events SET whatsapp_account_id = ? WHERE id = ?')
            .run(newAccountId, tokenRecord.event_id);
        }

        // Initialize fresh socket session
        await initializeAccountSession(newAccountId, true);
        sessionStatus = getAccountSessionStatus(newAccountId);
      } else if (!sessionStatus.qrDataUrl || sessionStatus.status === 'DISCONNECTED') {
        initializeAccountSession(tokenRecord.account_id).catch(() => {});
      }
    }

    // Wait for QR code to be generated so client gets it on initial page load
    if (!isConnected && !sessionStatus.qrDataUrl) {
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 400));
        sessionStatus = getAccountSessionStatus(tokenRecord.account_id);
        if (sessionStatus.qrDataUrl || sessionStatus.status === 'CONNECTED') break;
      }
    }

    res.json({
      success: true,
      token: tokenRecord.token,
      account_id: tokenRecord.account_id,
      account_name: tokenRecord.account_name,
      event_name: tokenRecord.event_name || 'Event Invitation Reminders',
      event_category: tokenRecord.event_category || 'Event',
      host_name: tokenRecord.host_name || tokenRecord.customer_name || 'Valued Host',
      default_phone: tokenRecord.phone_number || tokenRecord.customer_mobile || '',
      event_date: tokenRecord.event_date,
      venue_name: tokenRecord.venue_name,
      status: sessionStatus.status,
      qrDataUrl: sessionStatus.qrDataUrl,
      pairingCode: sessionStatus.pairingCode || tokenRecord.pairing_code,
      isConnected,
      userPhone: sessionStatus.userPhone
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/client-session/:token/refresh-qr - Force generate fresh QR code
router.post('/client-session/:token/refresh-qr', async (req, res) => {
  const { token } = req.params;
  const db = getDb();

  try {
    const tokenRecord = db.prepare('SELECT * FROM whatsapp_link_tokens WHERE token = ?').get(token);
    if (!tokenRecord) {
      return res.status(404).json({ success: false, error: 'Invalid or expired client link.' });
    }

    await initializeAccountSession(tokenRecord.account_id, true);

    // Wait for fresh QR code
    let sessionStatus = getAccountSessionStatus(tokenRecord.account_id);
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 400));
      sessionStatus = getAccountSessionStatus(tokenRecord.account_id);
      if (sessionStatus.qrDataUrl) break;
    }

    res.json({
      success: true,
      status: sessionStatus.status,
      qrDataUrl: sessionStatus.qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/client-session/:token/request-code - Request 8-digit pairing code
router.post('/client-session/:token/request-code', async (req, res) => {
  const { token } = req.params;
  const { phoneNumber } = req.body;
  const db = getDb();

  try {
    const tokenRecord = db.prepare('SELECT * FROM whatsapp_link_tokens WHERE token = ?').get(token);
    if (!tokenRecord) {
      return res.status(404).json({ success: false, error: 'Invalid or expired client link.' });
    }

    let phoneToUse = phoneNumber || tokenRecord.phone_number;
    if (!phoneToUse || !phoneToUse.trim()) {
      return res.status(400).json({ success: false, error: 'Mobile phone number with country code is required (e.g. 919876543210).' });
    }

    let cleanPhone = String(phoneToUse).replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone; // Default India dial code for 10 digits
    }

    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Please enter a valid mobile number with country code.' });
    }

    let targetAccountId = tokenRecord.account_id;
    const currentAccount = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(targetAccountId);

    // If target account is ALREADY CONNECTED or is primary default:
    // Create a new dedicated, isolated WhatsApp account specifically for this client/event!
    const sessionStatus = getAccountSessionStatus(targetAccountId);
    const isDifferentUser = sessionStatus.status === 'CONNECTED' && sessionStatus.userPhone && sessionStatus.userPhone !== cleanPhone;
    const isPrimaryAccount = currentAccount && currentAccount.is_default;

    if (isDifferentUser || isPrimaryAccount || sessionStatus.status === 'CONNECTED') {
      const folderName = `session_client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const accName = tokenRecord.event_id 
        ? `Event #${tokenRecord.event_id} (+${cleanPhone})`
        : `Client WhatsApp (+${cleanPhone})`;

      const newAcc = db.prepare(`
        INSERT INTO whatsapp_accounts (account_name, auth_folder, status, is_default)
        VALUES (?, ?, 'DISCONNECTED', 0)
      `).run(accName, folderName);

      targetAccountId = newAcc.lastInsertRowid;

      // Point token to the new dedicated account
      db.prepare(`
        UPDATE whatsapp_link_tokens 
        SET account_id = ?, phone_number = ?, status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(targetAccountId, cleanPhone, tokenRecord.id);

      // If tied to an event, attach this new WhatsApp account to the event
      if (tokenRecord.event_id) {
        db.prepare('UPDATE events SET whatsapp_account_id = ? WHERE id = ?')
          .run(targetAccountId, tokenRecord.event_id);
      }

      console.log(`[WhatsApp Remote Link] Created new dedicated Account #${targetAccountId} for phone +${cleanPhone}`);
    } else {
      // Update phone number on token record
      db.prepare(`
        UPDATE whatsapp_link_tokens 
        SET phone_number = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(cleanPhone, tokenRecord.id);
    }

    // Now request pairing code from Baileys socket
    const result = await requestAccountPairingCode(targetAccountId, cleanPhone);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[WhatsApp Remote Link] request-code error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/whatsapp/client-session/:token/poll-status - Real-time polling for connection state
router.get('/client-session/:token/poll-status', (req, res) => {
  const { token } = req.params;
  const db = getDb();

  try {
    const tokenRecord = db.prepare('SELECT * FROM whatsapp_link_tokens WHERE token = ?').get(token);
    if (!tokenRecord) {
      return res.status(404).json({ success: false, error: 'Invalid token.' });
    }

    const sessionStatus = getAccountSessionStatus(tokenRecord.account_id);
    const isConnected = sessionStatus.status === 'CONNECTED';

    // If connected and token still pending, update token status
    if (isConnected && tokenRecord.status === 'PENDING') {
      db.prepare(`
        UPDATE whatsapp_link_tokens 
        SET status = 'CONNECTED', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(tokenRecord.id);
    }

    res.json({
      success: true,
      status: sessionStatus.status,
      qrDataUrl: sessionStatus.qrDataUrl,
      pairingCode: sessionStatus.pairingCode || tokenRecord.pairing_code,
      isConnected,
      userPhone: sessionStatus.userPhone
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// PROTECTED ADMIN ENDPOINTS (Requires Session Auth)
// ============================================================
router.use(requireAuth);

// POST /api/whatsapp/create-client-link - Generate a shareable customer link
router.post('/create-client-link', (req, res) => {
  const { event_id, account_id, phone } = req.body;
  const db = getDb();

  try {
    let targetAccountId = account_id ? parseInt(account_id, 10) : null;
    let targetEventId = event_id ? parseInt(event_id, 10) : null;
    let targetCustomerId = null;
    let targetPhone = phone ? String(phone).trim() : '';
    let eventName = 'Event Reminders';
    let hostName = 'Host';

    if (targetEventId) {
      const event = db.prepare(`
        SELECT e.*, c.id as cid, c.full_name as customer_name, c.mobile as customer_mobile
        FROM events e
        JOIN customers c ON c.id = e.customer_id
        WHERE e.id = ?
      `).get(targetEventId);

      if (!event) {
        return res.status(404).json({ success: false, error: 'Event not found.' });
      }

      targetCustomerId = event.cid;
      eventName = event.event_name;
      hostName = event.host_name || event.customer_name;
      if (!targetPhone && event.customer_mobile) {
        targetPhone = event.customer_mobile;
      }

      // If event does not yet have an assigned WhatsApp account, auto-create a dedicated one
      if (!targetAccountId && event.whatsapp_account_id) {
        targetAccountId = event.whatsapp_account_id;
      } else if (!targetAccountId) {
        const folderName = `session_event_${event.id}_${Date.now()}`;
        const newAcc = db.prepare(`
          INSERT INTO whatsapp_accounts (account_name, auth_folder, status, is_default)
          VALUES (?, ?, 'DISCONNECTED', 0)
        `).run(`${event.event_name} (${hostName})`, folderName);

        targetAccountId = newAcc.lastInsertRowid;
        db.prepare('UPDATE events SET whatsapp_account_id = ? WHERE id = ?').run(targetAccountId, event.id);
      }
    }

    if (!targetAccountId) {
      return res.status(400).json({ success: false, error: 'Please provide either a valid event_id or account_id.' });
    }

    const account = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(targetAccountId);
    if (!account) {
      return res.status(404).json({ success: false, error: 'WhatsApp account not found.' });
    }

    // Generate unique cryptographic token
    const token = crypto.randomBytes(20).toString('hex');

    db.prepare(`
      INSERT INTO whatsapp_link_tokens (token, account_id, event_id, customer_id, phone_number, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `).run(token, targetAccountId, targetEventId, targetCustomerId, targetPhone || null);

    // Build absolute URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const port = host.includes(':') ? host.split(':')[1] : '3000';
    const localIp = getLocalIpAddress();

    // Check if custom public tunnel/domain base URL is configured in settings
    let savedBaseUrl = '';
    try {
      const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'client_portal_base_url'").get();
      if (settingRow && settingRow.value) {
        savedBaseUrl = settingRow.value.trim().replace(/\/+$/, '');
      }
    } catch (e) {}

    const localhostLink = `${protocol}://${host}/link-whatsapp.html?token=${token}`;
    const wifiLink = `http://${localIp}:${port}/link-whatsapp.html?token=${token}`;
    const publicLink = savedBaseUrl ? `${savedBaseUrl}/link-whatsapp.html?token=${token}` : '';

    // Prefer public tunnel if configured, else Wi-Fi local network IP, else localhost
    const effectiveLink = publicLink || (localIp !== 'localhost' ? wifiLink : localhostLink);

    // Build WhatsApp pre-filled share URL
    const cleanPhone = targetPhone.replace(/\D/g, '');
    const shareMessage = `Namaste ${hostName}! 🙏\n\nPlease click this secure link to connect your WhatsApp with *THE INVITATION PALACE* so personalized invitation reminders can be dispatched to your guests on time:\n\n👉 ${effectiveLink}\n\n(You can link directly using your phone number or scan QR code)`;
    const waShareUrl = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

    // Prime the account session in background
    initializeAccountSession(targetAccountId).catch(() => {});

    res.json({
      success: true,
      token,
      clientLink: effectiveLink,
      wifiLink,
      localhostLink,
      publicLink,
      localIp,
      port,
      savedBaseUrl,
      waShareUrl,
      shareMessage,
      targetPhone: cleanPhone,
      eventName,
      hostName,
      accountName: account.account_name
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/settings/base-url - Save public tunnel or domain URL
router.post('/settings/base-url', (req, res) => {
  const { baseUrl } = req.body;
  const db = getDb();
  const cleanUrl = baseUrl ? String(baseUrl).trim().replace(/\/+$/, '') : '';

  try {
    db.prepare(`
      INSERT INTO settings (key, value, description)
      VALUES ('client_portal_base_url', ?, 'Public Internet Base URL for remote client links (ngrok/Cloudflare tunnel)')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(cleanUrl);

    res.json({
      success: true,
      message: 'Client portal base URL updated successfully.',
      baseUrl: cleanUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/whatsapp/accounts - List all accounts with real-time status
router.get('/accounts', (req, res) => {
  try {
    const accounts = listAllAccountsWithStatus();
    res.json({
      success: true,
      accounts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/accounts - Add a new WhatsApp account entry
router.post('/accounts', (req, res) => {
  const { account_name } = req.body;
  if (!account_name || !account_name.trim()) {
    return res.status(400).json({ success: false, error: 'Account name is required (e.g., Jenny Wedding Number).' });
  }

  const db = getDb();
  const folderName = `session_${Date.now()}`;

  try {
    const result = db.prepare(`
      INSERT INTO whatsapp_accounts (account_name, auth_folder, status, is_default)
      VALUES (?, ?, 'DISCONNECTED', 0)
    `).run(account_name.trim(), folderName);

    res.status(201).json({
      success: true,
      message: 'WhatsApp account profile created. Scan the QR code to link it.',
      accountId: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/whatsapp/accounts/:id/status - Get status and current QR code
router.get('/accounts/:id/status', (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  try {
    const status = getAccountSessionStatus(accountId);
    res.json({
      success: true,
      ...status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/accounts/:id/connect - Generate QR code & start connection
router.post('/accounts/:id/connect', async (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  const force = req.body.force === true;

  try {
    const result = await initializeAccountSession(accountId, force);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/accounts/:id/disconnect - Logout and disconnect account
router.post('/accounts/:id/disconnect', async (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  try {
    const result = await logoutAccountSession(accountId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/accounts/:id/set-default - Set as default sender
router.post('/accounts/:id/set-default', (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  const db = getDb();

  try {
    db.prepare('UPDATE whatsapp_accounts SET is_default = 0').run();
    db.prepare('UPDATE whatsapp_accounts SET is_default = 1 WHERE id = ?').run(accountId);
    res.json({ success: true, message: 'Default sender account updated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/whatsapp/accounts/:id - Remove account
router.delete('/accounts/:id', async (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  const db = getDb();

  try {
    const acc = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(accountId);
    if (!acc) return res.status(404).json({ success: false, error: 'Account not found.' });

    if (acc.is_default) {
      return res.status(400).json({ success: false, error: 'Cannot delete the primary default WhatsApp account.' });
    }

    await logoutAccountSession(accountId);
    db.prepare('UPDATE events SET whatsapp_account_id = NULL WHERE whatsapp_account_id = ?').run(accountId);
    db.prepare('DELETE FROM whatsapp_accounts WHERE id = ?').run(accountId);

    res.json({ success: true, message: 'Account removed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
