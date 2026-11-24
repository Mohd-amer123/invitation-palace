/**
 * Automated Background Scheduler & Zero-Click Auto-Dispatch Runner
 * Runs independently of the browser using node-cron (with built-in interval fallback).
 * Automatically delivers WhatsApp reminders in batches when scheduled date & time arrive!
 * THE INVITATION PALACE
 */

const { getDb } = require('../config/db');
const { renderTemplate } = require('./templateEngine');
const { sendViaMetaCloudApi } = require('./whatsappService');
const { 
  getSessionStatus, 
  getAccountSessionStatus, 
  listAllAccountsWithStatus, 
  sendDirectMessage, 
  sendDirectMessageFromAccount 
} = require('./baileysService');

let cron = null;
try {
  cron = require('node-cron');
} catch (e) {
  cron = null;
}

let schedulerTask = null;
let intervalTimer = null;

// Background Auto-Runner State
let isAutoBatchActive = false;
let cooldownUntilTimestamp = 0;
let lastBatchStats = {
  lastRunAt: null,
  dispatchedCount: 0,
  inCooldown: false
};

/**
 * Get current date and time in the configured timezone (Default: Asia/Kolkata)
 */
function getCurrentTimeInfo(timeZone = 'Asia/Kolkata') {
  const now = new Date();
  
  // Format YYYY-MM-DD
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  // Format HH:MM (24-hour)
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const timeStr = timeFormatter.format(now);

  return {
    currentDate: dateParts,
    currentTime: timeStr,
    timestamp: now
  };
}

/**
 * Scheduler check cycle - runs once every minute
 */
async function checkAndProcessReminders() {
  const db = getDb();

  try {
    const timezoneSetting = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';
    const businessName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';
    const metaApiEnabled = db.prepare(`SELECT value FROM settings WHERE key = 'meta_api_enabled'`).get()?.value === '1';
    const whatsappMode = db.prepare(`SELECT value FROM settings WHERE key = 'whatsapp_mode'`).get()?.value || 'manual_free';

    const { currentDate, currentTime, timestamp } = getCurrentTimeInfo(timezoneSetting);

    // 1. Move reminders for today's or upcoming events whose scheduled date was reached to 'Ready to Send'
    const dueForUpcoming = db.prepare(`
      UPDATE reminders
      SET status = 'Ready to Send',
          scheduled_date = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT r.id FROM reminders r
        JOIN events e ON r.event_id = e.id
        WHERE r.status = 'Scheduled'
          AND r.scheduled_date <= ?
          AND e.status = 'Active'
          AND e.event_date >= ?
      )
    `).run(currentDate, currentDate, currentDate);

    if (dueForUpcoming.changes > 0) {
      console.log(`[Scheduler] Queued ${dueForUpcoming.changes} due reminder(s) for delivery today.`);
    }

    // 2. Only mark as Skipped if the EVENT ITSELF is already in the past (event_date < today)
    const overdueResult = db.prepare(`
      UPDATE reminders
      SET status = 'Skipped',
          failure_reason = 'Event date already passed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT r.id FROM reminders r
        JOIN events e ON r.event_id = e.id
        WHERE r.status = 'Scheduled'
          AND e.event_date < ?
      )
    `).run(currentDate);

    if (overdueResult.changes > 0) {
      console.log(`[Scheduler] Marked ${overdueResult.changes} reminders for past events as Skipped.`);
    }

    // 2. Fetch Reminders that are scheduled for TODAY and time has arrived
    const dueReminders = db.prepare(`
      SELECT 
        r.id as reminder_id, r.event_id, r.guest_id, r.stage_days, r.reminder_stage,
        r.scheduled_date, r.scheduled_time, r.rendered_message, r.status,
        g.full_name as guest_name, g.mobile as guest_phone, g.consent_status,
        e.event_name, e.event_category, e.host_name, e.event_date, e.event_time,
        e.venue_name, e.venue_address, e.maps_link, e.digital_card_link, e.status as event_status,
        t.template_text
      FROM reminders r
      JOIN guests g ON r.guest_id = g.id
      JOIN events e ON r.event_id = e.id
      LEFT JOIN templates t ON t.stage_days = r.stage_days
      WHERE r.status = 'Scheduled'
        AND r.scheduled_date = ?
        AND r.scheduled_time <= ?
        AND e.status = 'Active'
        AND g.consent_status = 1
    `).all(currentDate, currentTime);

    if (dueReminders.length > 0) {
      console.log(`[Scheduler] Found ${dueReminders.length} reminder(s) due for dispatch at ${currentTime} on ${currentDate}.`);

      for (const item of dueReminders) {
        // Re-render template dynamically to ensure accurate current time greeting (morning/afternoon/evening)
        const templateText = item.template_text || item.rendered_message;
        const context = {
          guest_name: item.guest_name,
          event_name: item.event_name,
          host_name: item.host_name,
          event_date: item.event_date,
          event_time: item.event_time,
          venue_name: item.venue_name,
          venue_address: item.venue_address,
          maps_link: item.maps_link,
          digital_card_link: item.digital_card_link,
          business_name: businessName,
          timeZone: timezoneSetting,
          sendDate: timestamp
        };

        const freshMessage = renderTemplate(templateText, context);

        // Check if Meta Cloud API mode is explicitly configured
        if (whatsappMode === 'meta_cloud_api' && metaApiEnabled) {
          const sendResult = await sendViaMetaCloudApi({
            toPhone: item.guest_phone,
            messageText: freshMessage
          });

          if (sendResult.success) {
            db.prepare(`
              UPDATE reminders
              SET status = 'Sent',
                  rendered_message = ?,
                  sent_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(freshMessage, item.reminder_id);

            db.prepare(`
              INSERT INTO message_history (
                reminder_id, event_id, guest_id, recipient_name,
                recipient_phone, message_text, send_method, status, provider_message_id
              ) VALUES (?, ?, ?, ?, ?, ?, 'meta_cloud_api', 'Sent', ?)
            `).run(
              item.reminder_id,
              item.event_id,
              item.guest_id,
              item.guest_name,
              item.guest_phone,
              freshMessage,
              sendResult.messageId
            );
          } else {
            db.prepare(`
              UPDATE reminders
              SET status = 'Ready to Send',
                  rendered_message = ?,
                  failure_reason = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(freshMessage, sendResult.error || 'Meta API delivery failed', item.reminder_id);
          }
        } else {
          // Transition status to 'Ready to Send' so it enters the automated batch queue
          db.prepare(`
            UPDATE reminders
            SET status = 'Ready to Send',
                rendered_message = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(freshMessage, item.reminder_id);
        }
      }
    }

    // 3. ZERO-CLICK AUTOMATED BATCH RUNNER
    // If WhatsApp is linked and auto-dispatch is enabled, automatically send batches!
    await runAutomatedBatchQueue();

  } catch (error) {
    console.error('[Scheduler] Error during execution cycle:', error);
  }
}

/**
 * Automated 10-Message Batch Runner with 30-Minute Cooldown
 * Runs automatically without requiring the user to click buttons repeatedly.
 */
async function runAutomatedBatchQueue() {
  if (isAutoBatchActive) return;

  const db = getDb();
  const autoDispatchSetting = db.prepare(`SELECT value FROM settings WHERE key = 'auto_dispatch_enabled'`).get()?.value || '1';
  if (autoDispatchSetting === '0') return;

  const batchLimit = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'batch_size'`).get()?.value || '10', 10);
  const cooldownMinutes = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'batch_interval_minutes'`).get()?.value || '30', 10);
  const timezoneSetting = db.prepare(`SELECT value FROM settings WHERE key = 'default_timezone'`).get()?.value || 'Asia/Kolkata';
  const businessName = db.prepare(`SELECT value FROM settings WHERE key = 'business_name'`).get()?.value || 'THE INVITATION PALACE';

  const { currentDate, currentTime, timestamp } = getCurrentTimeInfo(timezoneSetting);

  // Check Cooldown status
  if (Date.now() < cooldownUntilTimestamp) {
    const remainingMins = Math.ceil((cooldownUntilTimestamp - Date.now()) / 60000);
    lastBatchStats.inCooldown = true;
    return;
  }
  lastBatchStats.inCooldown = false;

  // Check if any WhatsApp Multi-Device session is connected
  const allAccounts = listAllAccountsWithStatus();
  const connectedAccounts = allAccounts.filter(a => a.status === 'CONNECTED');
  if (connectedAccounts.length === 0) {
    return; // No WhatsApp session connected
  }

  // Fetch reminders that are Ready to Send (due today or marked ready)
  const pendingBatch = db.prepare(`
    SELECT 
      r.id as reminder_id, r.event_id, r.guest_id, r.stage_days, r.reminder_stage,
      r.scheduled_date, r.scheduled_time, r.rendered_message, r.status,
      g.full_name as guest_name, g.mobile as guest_phone, g.consent_status,
      e.event_name, e.event_category, e.host_name, e.event_date, e.event_time,
      e.venue_name, e.venue_address, e.maps_link, e.digital_card_link, e.status as event_status,
      e.whatsapp_account_id,
      t.template_text
    FROM reminders r
    JOIN guests g ON r.guest_id = g.id
    JOIN events e ON r.event_id = e.id
    LEFT JOIN templates t ON t.stage_days = r.stage_days
    WHERE r.status = 'Ready to Send'
      AND r.scheduled_date <= ?
      AND e.status = 'Active'
      AND g.consent_status = 1
    ORDER BY r.scheduled_date ASC, r.scheduled_time ASC, r.id ASC
    LIMIT ?
  `).all(currentDate, batchLimit);

  if (pendingBatch.length === 0) {
    return;
  }

  isAutoBatchActive = true;
  console.log(`[Auto-Dispatcher] 🚀 Starting automated batch of ${pendingBatch.length} reminder(s) via WhatsApp...`);

  let countSent = 0;

  try {
    for (const item of pendingBatch) {
      const templateText = item.template_text || item.rendered_message;
      const context = {
        guest_name: item.guest_name,
        event_name: item.event_name,
        host_name: item.host_name,
        event_date: item.event_date,
        event_time: item.event_time,
        venue_name: item.venue_name,
        venue_address: item.venue_address,
        maps_link: item.maps_link,
        digital_card_link: item.digital_card_link,
        business_name: businessName,
        timeZone: timezoneSetting,
        sendDate: timestamp
      };

      const freshMessage = renderTemplate(templateText, context);

      // Resolve which WhatsApp account to send from:
      let senderAccountId = item.whatsapp_account_id;
      let sessionStatus = senderAccountId ? getAccountSessionStatus(senderAccountId) : null;
      if (!sessionStatus || sessionStatus.status !== 'CONNECTED') {
        const fallback = connectedAccounts[0];
        if (fallback) {
          senderAccountId = fallback.id;
        } else {
          console.log(`[Auto-Dispatcher] Waiting for WhatsApp connection for Account #${item.whatsapp_account_id}...`);
          continue;
        }
      }

      // Send directly in background using event's assigned or fallback connected WhatsApp account
      const sendResult = await sendDirectMessageFromAccount(senderAccountId, item.guest_phone, freshMessage);

      if (sendResult.success) {
        db.prepare(`
          UPDATE reminders
          SET status = 'Sent',
              rendered_message = ?,
              sent_at = CURRENT_TIMESTAMP,
              failure_reason = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(freshMessage, item.reminder_id);

        db.prepare(`
          INSERT INTO message_history (
            reminder_id, event_id, guest_id, recipient_name,
            recipient_phone, message_text, send_method, status, provider_message_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'whatsapp_direct', 'Sent', ?)
        `).run(
          item.reminder_id,
          item.event_id,
          item.guest_id,
          item.guest_name,
          item.guest_phone,
          freshMessage,
          sendResult.messageId
        );

        countSent++;
        console.log(`[Auto-Dispatcher] [Delivered] Message sent to ${item.guest_phone} (${item.guest_name || 'Guest'}) for "${item.event_name}".`);
      } else {
        db.prepare(`
          UPDATE reminders
          SET failure_reason = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(sendResult.error || 'Direct dispatch failed', item.reminder_id);

        console.error(`[Auto-Dispatcher] [Failed] Delivery failed to ${item.guest_phone}:`, sendResult.error);
      }

      // Safe human-paced pause between individual messages (3.5 seconds)
      await new Promise(r => setTimeout(r, 3500));
    }

    lastBatchStats.lastRunAt = new Date().toISOString();
    lastBatchStats.dispatchedCount += countSent;

    // Check if more remain in queue
    const remainingInQueue = db.prepare(`
      SELECT COUNT(*) as count
      FROM reminders r
      JOIN guests g ON r.guest_id = g.id
      JOIN events e ON r.event_id = e.id
      WHERE r.status = 'Ready to Send'
        AND r.scheduled_date <= ?
        AND e.status = 'Active'
        AND g.consent_status = 1
    `).get(currentDate)?.count || 0;

    if (remainingInQueue > 0) {
      cooldownUntilTimestamp = Date.now() + (cooldownMinutes * 60 * 1000);
      lastBatchStats.inCooldown = true;
      console.log(`[Auto-Dispatcher] ⏳ Batch limit (${batchLimit}) reached. ${remainingInQueue} remaining. 30-minute cooldown activated to protect WhatsApp. Next automated batch will dispatch at ${new Date(cooldownUntilTimestamp).toLocaleTimeString()}.`);
    } else {
      cooldownUntilTimestamp = 0;
      lastBatchStats.inCooldown = false;
      console.log(`[Auto-Dispatcher] 🎉 All due reminders in the queue have been fully dispatched!`);
    }
  } catch (err) {
    console.error('[Auto-Dispatcher] Error in automated batch dispatch:', err);
  } finally {
    isAutoBatchActive = false;
  }
}

/**
 * Get status of auto-batch runner for UI displays
 */
function getAutoRunnerStatus() {
  const remainingSeconds = Math.max(0, Math.ceil((cooldownUntilTimestamp - Date.now()) / 1000));
  return {
    isAutoBatchActive,
    inCooldown: remainingSeconds > 0,
    cooldownSecondsRemaining: remainingSeconds,
    lastRunAt: lastBatchStats.lastRunAt,
    dispatchedCount: lastBatchStats.dispatchedCount
  };
}

/**
 * Start the background scheduler
 */
function startScheduler() {
  stopScheduler();

  console.log('[Scheduler] Initializing local reminder scheduler (every 60 seconds)...');
  
  // Run once immediately on startup
  checkAndProcessReminders();

  if (cron) {
    schedulerTask = cron.schedule('* * * * *', () => {
      checkAndProcessReminders();
    });
  } else {
    // Built-in interval fallback
    intervalTimer = setInterval(() => {
      checkAndProcessReminders();
    }, 60000);
  }
}

/**
 * Stop scheduler gracefully
 */
function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  console.log('[Scheduler] Background scheduler stopped.');
}

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndProcessReminders,
  runAutomatedBatchQueue,
  getAutoRunnerStatus,
  getCurrentTimeInfo
};
