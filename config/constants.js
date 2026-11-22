/**
 * Application Constants & Universal Greeting Helpers
 * THE INVITATION PALACE - Event Reminder Management System
 */

const EVENT_CATEGORIES = [
  'Wedding',
  'Engagement',
  'Reception',
  'Nikah',
  'Walima',
  'Birthday',
  'Anniversary',
  'Baby Shower',
  'Housewarming',
  'Religious Function',
  'Corporate Event',
  'Other'
];

const REMINDER_STATUSES = {
  SCHEDULED: 'Scheduled',
  PENDING: 'Pending',
  AWAITING_WHATSAPP: 'Awaiting WhatsApp',
  READY_TO_SEND: 'Ready to Send',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  SKIPPED: 'Skipped'
};

const DEFAULT_SCHEDULE_DAYS = [7, 3, 1];

/**
 * Universal time-based greeting generator based on local time.
 * Specification:
 * - Good morning: 5:00 AM – 11:59 AM
 * - Good afternoon: 12:00 PM – 4:59 PM
 * - Good evening: 5:00 PM – 4:59 AM
 * Strictly secular & universal — NO religious greetings.
 * 
 * @param {Date} [dateObj=new Date()]
 * @param {string} [timeZone='Asia/Kolkata']
 * @returns {string} Universal greeting
 */
function getUniversalTimeGreeting(dateObj = new Date(), timeZone = 'Asia/Kolkata') {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false
    });
    const hour = parseInt(formatter.format(dateObj), 10);

    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  } catch (err) {
    // Fallback based on local system hour
    const localHour = dateObj.getHours();
    if (localHour >= 5 && localHour < 12) return 'Good morning';
    if (localHour >= 12 && localHour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

/**
 * Normalize and validate phone numbers into international E.164 format.
 * Defaults to Indian numbers (+91) if 10 digits are provided.
 * 
 * @param {string|number} rawNumber 
 * @param {string} [defaultCountryCode='+91']
 * @returns {string|null} Valid phone or null if invalid
 */
function normalizePhoneNumber(rawNumber, defaultCountryCode = '+91') {
  if (!rawNumber) return null;
  let str = String(rawNumber).trim().replace(/[\s\-\(\)\.]/g, '');
  
  if (str.startsWith('00')) {
    str = '+' + str.substring(2);
  }

  // If already starts with '+', validate length
  if (str.startsWith('+')) {
    const digitsOnly = str.substring(1);
    if (/^\d{8,15}$/.test(digitsOnly)) {
      return str;
    }
    return null;
  }

  // If 10 digits (typical Indian phone number e.g. 9876543210)
  if (/^\d{10}$/.test(str)) {
    const code = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    return `${code}${str}`;
  }

  // If 11 or 12 digits starting with country code without '+' (e.g. 919876543210 or 09876543210)
  if (str.startsWith('0') && /^\d{11}$/.test(str)) {
    const code = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    return `${code}${str.substring(1)}`;
  }

  if (/^\d{11,15}$/.test(str)) {
    return `+${str}`;
  }

  return null;
}

module.exports = {
  EVENT_CATEGORIES,
  REMINDER_STATUSES,
  DEFAULT_SCHEDULE_DAYS,
  getUniversalTimeGreeting,
  normalizePhoneNumber
};
