/**
 * Meta WhatsApp Cloud API Webhook Routes
 * Supports verification challenge (GET) and incoming event status updates (POST)
 * THE INVITATION PALACE
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { processWebhookPayload } = require('../services/whatsappService');

// GET /api/whatsapp/webhook - Webhook Verification Challenge
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const db = getDb();
  const configuredToken = db.prepare(`
    SELECT value FROM settings WHERE key = 'meta_webhook_verify_token'
  `).get()?.value || 'palace_verify_token_secure_2026';

  if (mode && token) {
    if (mode === 'subscribe' && token === configuredToken) {
      console.log('[Webhook] Meta webhook successfully verified!');
      return res.status(200).send(challenge);
    } else {
      console.warn('[Webhook] Verification failed - token mismatch.');
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
});

// POST /api/whatsapp/webhook - Incoming status updates (Delivered, Read, Failed)
router.post('/', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    processWebhookPayload(body);
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.sendStatus(404);
});

module.exports = router;
