/**
 * Multi-Device WhatsApp Engine
 * Built with @whiskeysockets/baileys and qrcode
 * Connects directly to WhatsApp servers via WebSockets.
 * Supports MULTIPLE simultaneous WhatsApp accounts assigned per event or customer!
 * THE INVITATION PALACE
 */

const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { getDb } = require('../config/db');

const BASE_AUTH_DIR = path.join(__dirname, '..', 'database', 'whatsapp_auth');
if (!fs.existsSync(BASE_AUTH_DIR)) {
  fs.mkdirSync(BASE_AUTH_DIR, { recursive: true });
}

// Map of in-memory active sessions: accountId -> sessionState
const activeSessions = new Map();

// Pino-compatible silent logger
const pinoLogger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => pinoLogger
};

/**
 * Resolve disk directory for a WhatsApp account
 */
function getAccountFolder(authFolder) {
  if (!authFolder || authFolder === 'default' || authFolder === 'session_primary') {
    return BASE_AUTH_DIR;
  }
  const folder = path.join(BASE_AUTH_DIR, authFolder);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

/**
 * Get or initialize in-memory session object
 */
function getOrCreateSessionState(accountId) {
  if (!activeSessions.has(accountId)) {
    activeSessions.set(accountId, {
      sock: null,
      currentQR: null,
      qrDataUrl: null,
      pairingCode: null,
      connectionStatus: 'DISCONNECTED',
      connectedUser: null,
      isInitializing: false
    });
  }
  return activeSessions.get(accountId);
}

/**
 * Initialize / Connect a specific WhatsApp Account
 */
async function initializeAccountSession(accountId, forceRestart = false) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(accountId);
  if (!account) {
    return { success: false, error: 'Account not found in database' };
  }

  const session = getOrCreateSessionState(accountId);

  if (session.connectionStatus === 'CONNECTED' && !forceRestart) {
    return { status: session.connectionStatus, user: session.connectedUser };
  }

  if (session.isInitializing && !forceRestart) {
    return { status: session.connectionStatus, qr: session.qrDataUrl };
  }

  session.isInitializing = true;
  session.connectionStatus = 'CONNECTING';

  const folderPath = getAccountFolder(account.auth_folder);

  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
    const { state, saveCreds } = await useMultiFileAuthState(folderPath);

    session.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pinoLogger,
      browser: Browsers.ubuntu('Chrome')
    });

    session.sock.ev.on('creds.update', saveCreds);

    session.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.currentQR = qr;
        try {
          session.qrDataUrl = await QRCode.toDataURL(qr);
          session.connectionStatus = 'SCAN_QR';
          db.prepare(`UPDATE whatsapp_accounts SET status = 'SCAN_QR', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(accountId);
          console.log(`[WhatsApp Multi-Device] Account #${accountId} (${account.account_name}): New QR code ready.`);
        } catch (e) {
          console.error(`[WhatsApp Multi-Device] Account #${accountId} QR generation error:`, e);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 408 && statusCode !== 401;

        console.log(`[WhatsApp Multi-Device] Account #${accountId} (${account.account_name}) closed. Code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        session.connectionStatus = 'DISCONNECTED';
        session.currentQR = null;
        session.qrDataUrl = null;
        session.connectedUser = null;
        session.sock = null;

        db.prepare(`UPDATE whatsapp_accounts SET status = 'DISCONNECTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(accountId);

        if (statusCode === DisconnectReason.loggedOut) {
          try {
            if (account.auth_folder !== 'default') {
              fs.rmSync(folderPath, { recursive: true, force: true });
            } else {
              // Delete session files in root folder
              const files = fs.readdirSync(folderPath);
              for (const f of files) {
                if (f.endsWith('.json')) {
                  fs.unlinkSync(path.join(folderPath, f));
                }
              }
            }
          } catch (e) {}
        } else if (shouldReconnect) {
          setTimeout(() => initializeAccountSession(accountId, true), 3000);
        }
      } else if (connection === 'open') {
        session.connectionStatus = 'CONNECTED';
        session.currentQR = null;
        session.qrDataUrl = null;

        if (session.sock?.user) {
          session.connectedUser = session.sock.user.id.split(':')[0] || session.sock.user.id.split('@')[0];
        }

        db.prepare(`
          UPDATE whatsapp_accounts 
          SET status = 'CONNECTED', phone_number = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(session.connectedUser, accountId);

        try {
          db.prepare(`
            UPDATE whatsapp_link_tokens 
            SET status = 'CONNECTED', phone_number = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE account_id = ? AND status = 'PENDING'
          `).run(session.connectedUser, accountId);
        } catch (e) {}

        console.log(`[WhatsApp Multi-Device] Account #${accountId} (${account.account_name}) CONNECTED as +${session.connectedUser}!`);
      }
    });

    session.isInitializing = false;
    return {
      status: session.connectionStatus,
      qrDataUrl: session.qrDataUrl,
      userPhone: session.connectedUser
    };
  } catch (err) {
    session.isInitializing = false;
    session.connectionStatus = 'DISCONNECTED';
    console.error(`[WhatsApp Multi-Device] Error initializing Account #${accountId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Get status of an account
 */
function getAccountSessionStatus(accountId) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(accountId);
  if (!account) return { status: 'DISCONNECTED', qrDataUrl: null };

  const session = activeSessions.get(accountId);
  if (!session || !session.sock) {
    return {
      status: 'DISCONNECTED',
      qrDataUrl: null,
      userPhone: account.phone_number,
      account
    };
  }

  return {
    status: session.connectionStatus,
    qrDataUrl: session.qrDataUrl,
    pairingCode: session.pairingCode || null,
    userPhone: session.connectedUser || account.phone_number,
    account
  };
}

/**
 * Request an 8-character WhatsApp pairing code for an account using phone number
 */
async function requestAccountPairingCode(accountId, phoneNumber) {
  const db = getDb();
  const cleanDigits = String(phoneNumber || '').replace(/\D/g, '');
  if (!cleanDigits || cleanDigits.length < 10) {
    throw new Error('Please enter a valid mobile number with country code (e.g., 919876543210).');
  }

  const account = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(accountId);
  if (!account) {
    throw new Error('WhatsApp account record not found');
  }

  let session = activeSessions.get(accountId);
  if (!session || !session.sock || session.connectionStatus === 'DISCONNECTED') {
    await initializeAccountSession(accountId, true);
    session = activeSessions.get(accountId);
  }

  if (session.connectionStatus === 'CONNECTED') {
    return {
      alreadyConnected: true,
      phone: session.connectedUser
    };
  }

  // Wait until socket is ready to receive pairing code request (up to 8s)
  let attempts = 0;
  while ((!session.sock || !session.currentQR) && session.connectionStatus !== 'CONNECTED' && attempts < 25) {
    await new Promise(r => setTimeout(r, 300));
    attempts++;
  }

  if (!session.sock) {
    throw new Error('Could not initialize WhatsApp connection. Please try again.');
  }

  if (session.connectionStatus === 'CONNECTED') {
    return {
      alreadyConnected: true,
      phone: session.connectedUser
    };
  }

  try {
    const code = await session.sock.requestPairingCode(cleanDigits);
    session.pairingCode = code;

    // Formatted as XXXX - XXXX for easy reading on phone screen
    const formatted = code && code.length === 8
      ? `${code.slice(0, 4)} - ${code.slice(4)}`
      : code;

    // Persist pairing code and phone number
    try {
      db.prepare(`
        UPDATE whatsapp_link_tokens 
        SET pairing_code = ?, phone_number = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE account_id = ? AND status = 'PENDING'
      `).run(code, cleanDigits, accountId);
    } catch (e) {}

    console.log(`[WhatsApp Multi-Device] Pairing code generated for Account #${accountId} (+${cleanDigits}): ${formatted}`);

    return {
      success: true,
      pairingCode: code,
      formattedCode: formatted,
      phoneNumber: cleanDigits
    };
  } catch (err) {
    console.error(`[WhatsApp Multi-Device] requestAccountPairingCode failed for #${accountId}:`, err.message);
    throw err;
  }
}

/**
 * List all WhatsApp accounts with live status and assigned event counts
 */
function listAllAccountsWithStatus() {
  const db = getDb();
  const accounts = db.prepare(`
    SELECT 
      wa.*,
      (SELECT COUNT(*) FROM events e WHERE e.whatsapp_account_id = wa.id) as assigned_events_count
    FROM whatsapp_accounts wa
    ORDER BY wa.is_default DESC, wa.id ASC
  `).all();

  return accounts.map(acc => {
    const session = activeSessions.get(acc.id);
    const liveStatus = session ? session.connectionStatus : acc.status;
    const phone = (session && session.connectedUser) ? session.connectedUser : acc.phone_number;
    return {
      ...acc,
      status: liveStatus,
      phone_number: phone,
      hasQr: !!(session && session.qrDataUrl)
    };
  });
}

/**
 * Send message from a specific account (or fallback to default connected account)
 */
async function sendDirectMessageFromAccount(accountId, toPhone, messageText) {
  const db = getDb();
  let targetAccountId = accountId;

  // If specific account not passed or not connected, pick primary default or any connected
  if (!targetAccountId) {
    const defaultAcc = db.prepare('SELECT id FROM whatsapp_accounts WHERE is_default = 1').get();
    targetAccountId = defaultAcc ? defaultAcc.id : null;
  }

  let session = targetAccountId ? activeSessions.get(targetAccountId) : null;

  // If not connected, check if any other account is connected
  if (!session || session.connectionStatus !== 'CONNECTED' || !session.sock) {
    for (const [id, s] of activeSessions.entries()) {
      if (s.connectionStatus === 'CONNECTED' && s.sock) {
        targetAccountId = id;
        session = s;
        break;
      }
    }
  }

  if (!session || session.connectionStatus !== 'CONNECTED' || !session.sock) {
    return {
      success: false,
      error: 'No active WhatsApp account is linked. Please link a WhatsApp account via QR code.'
    };
  }

  const cleanDigits = toPhone.replace(/\D/g, '');
  const jid = `${cleanDigits}@s.whatsapp.net`;

  try {
    const result = await session.sock.sendMessage(jid, { text: messageText });
    return {
      success: true,
      messageId: result.key?.id || 'DIRECT_' + Date.now(),
      senderAccountId: targetAccountId,
      senderPhone: session.connectedUser
    };
  } catch (err) {
    console.error(`[WhatsApp Multi-Device] Send failure to ${cleanDigits} from Account #${targetAccountId}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Logout and clear session for an account
 */
async function logoutAccountSession(accountId) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ?').get(accountId);
  if (!account) return { success: false, error: 'Account not found' };

  const session = activeSessions.get(accountId);
  if (session && session.sock) {
    try {
      await session.sock.logout();
    } catch (e) {}
  }

  if (session) {
    session.connectionStatus = 'DISCONNECTED';
    session.currentQR = null;
    session.qrDataUrl = null;
    session.connectedUser = null;
    session.sock = null;
  }

  const folderPath = getAccountFolder(account.auth_folder);
  try {
    if (account.auth_folder !== 'default') {
      fs.rmSync(folderPath, { recursive: true, force: true });
    } else {
      const files = fs.readdirSync(folderPath);
      for (const f of files) {
        if (f.endsWith('.json')) {
          fs.unlinkSync(path.join(folderPath, f));
        }
      }
    }
  } catch (e) {}

  db.prepare(`UPDATE whatsapp_accounts SET status = 'DISCONNECTED', phone_number = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(accountId);

  return { success: true };
}

/**
 * Auto-reconnect all accounts on startup that have saved credentials
 */
function autoReconnectAllSavedAccounts() {
  try {
    const db = getDb();
    const accounts = db.prepare('SELECT * FROM whatsapp_accounts').all();

    for (const acc of accounts) {
      const folderPath = getAccountFolder(acc.auth_folder);
      const credsPath = path.join(folderPath, 'creds.json');

      if (fs.existsSync(credsPath)) {
        console.log(`[WhatsApp Multi-Device] Reconnecting saved session for Account #${acc.id} (${acc.account_name})...`);
        initializeAccountSession(acc.id, false).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[WhatsApp Multi-Device] Error during auto-reconnect:', e);
  }
}

// Auto-reconnect on server startup
setTimeout(() => {
  autoReconnectAllSavedAccounts();
}, 1000);

// Backward Compatibility Helpers for existing single-session callers
function getSessionStatus() {
  const db = getDb();
  const primary = db.prepare('SELECT id FROM whatsapp_accounts WHERE is_default = 1').get() ||
                  db.prepare('SELECT id FROM whatsapp_accounts LIMIT 1').get();
  if (!primary) return { status: 'DISCONNECTED', qrDataUrl: null, userPhone: null };
  return getAccountSessionStatus(primary.id);
}

function initializeWhatsAppSession(forceRestart = false) {
  const db = getDb();
  const primary = db.prepare('SELECT id FROM whatsapp_accounts WHERE is_default = 1').get() ||
                  db.prepare('SELECT id FROM whatsapp_accounts LIMIT 1').get();
  if (!primary) return Promise.resolve({ status: 'DISCONNECTED' });
  return initializeAccountSession(primary.id, forceRestart);
}

function sendDirectMessage(toPhone, messageText) {
  return sendDirectMessageFromAccount(null, toPhone, messageText);
}

function logoutWhatsApp() {
  const db = getDb();
  const primary = db.prepare('SELECT id FROM whatsapp_accounts WHERE is_default = 1').get() ||
                  db.prepare('SELECT id FROM whatsapp_accounts LIMIT 1').get();
  if (!primary) return Promise.resolve({ success: true });
  return logoutAccountSession(primary.id);
}

module.exports = {
  initializeAccountSession,
  getAccountSessionStatus,
  requestAccountPairingCode,
  listAllAccountsWithStatus,
  sendDirectMessageFromAccount,
  logoutAccountSession,
  autoReconnectAllSavedAccounts,

  // Backward compatibility exports:
  getSessionStatus,
  initializeWhatsAppSession,
  sendDirectMessage,
  logoutWhatsApp
};
