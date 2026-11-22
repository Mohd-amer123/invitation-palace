/**
 * WhatsApp Integration Service
 * THE INVITATION PALACE
 * 
 * Provides:
 * 1. 100% Free Manual WhatsApp Workflow via official wa.me click-to-chat links and message copying.
 * 2. Official Meta WhatsApp Cloud API integration structure (strictly opt-in, disabled by default to ensure zero cost).
 * 3. Webhook handling for delivery and read receipts.
 */

const { getDb } = require('../config/db');

/**
 * Generate official WhatsApp Click-to-Chat Link (wa.me)
 * This is 100% free, officially supported by WhatsApp, and requires zero paid APIs.
 * 
 * @param {string} phone International phone number with country code (e.g. "+919876543210")
 * @param {string} message Rendered text message
 * @returns {string} URL
 */
function generateWaLink(phone, message) {
  if (!phone) return '';
  // wa.me format expects digits only without leading '+' or symbols
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(message || '');
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Send message via Official Meta Cloud API (if configured and enabled)
 * Otherwise returns fallback response indicating manual send is required.
 */
async function sendViaMetaCloudApi({ toPhone, messageText, templateName = null, languageCode = 'en' }) {
  const db = getDb();
  
  // Read settings from DB
  const settingsRows = db.prepare(`
    SELECT key, value FROM settings WHERE key IN (
      'whatsapp_mode', 'meta_api_enabled', 'meta_phone_number_id',
      'meta_access_token', 'meta_api_version'
    )
  `).all();
  
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });

  const isEnabled = settings.meta_api_enabled === '1' && settings.whatsapp_mode === 'meta_cloud_api';
  const phoneNumberId = settings.meta_phone_number_id;
  const accessToken = settings.meta_access_token;
  const apiVersion = settings.meta_api_version || 'v21.0';

  if (!isEnabled || !phoneNumberId || !accessToken) {
    return {
      success: false,
      mode: 'manual_free',
      message: 'Automatic Meta Cloud API is disabled or unconfigured to ensure ZERO cost. Use the Free Manual WhatsApp workflow.'
    };
  }

  const cleanRecipient = toPhone.replace(/\D/g, '');

  try {
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'text',
      text: {
        preview_url: false,
        body: messageText
      }
    };

    // Use global fetch (built into modern Node.js)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `Meta API HTTP ${response.status}`;
      return {
        success: false,
        mode: 'meta_cloud_api',
        error: errMsg,
        code: data?.error?.code
      };
    }

    const messageId = data?.messages?.[0]?.id;

    return {
      success: true,
      mode: 'meta_cloud_api',
      messageId: messageId || 'META_' + Date.now(),
      raw: data
    };
  } catch (error) {
    console.error('[WhatsApp Service] Meta Cloud API Error:', error.message);

    return {
      success: false,
      mode: 'meta_cloud_api',
      error: error.message
    };
  }
}

/**
 * Handle incoming Meta Webhook payload (status updates)
 */
function processWebhookPayload(body) {
  const db = getDb();

  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const statuses = value?.statuses;

    if (statuses && Array.isArray(statuses)) {
      for (const st of statuses) {
        const msgId = st.id;
        const status = st.status; // sent, delivered, read, failed

        if (msgId) {
          const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1);
          db.prepare(`
            UPDATE message_history
            SET status = ?
            WHERE provider_message_id = ?
          `).run(normalizedStatus, msgId);

          db.prepare(`
            UPDATE reminders
            SET status = ?
            WHERE id = (
              SELECT reminder_id FROM message_history WHERE provider_message_id = ? LIMIT 1
            )
          `).run(normalizedStatus, msgId);
        }
      }
    }
    return { success: true };
  } catch (err) {
    console.error('[WhatsApp Service] Error processing webhook payload:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  generateWaLink,
  sendViaMetaCloudApi,
  processWebhookPayload
};
