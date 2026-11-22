/**
 * Automated Unit Test Suite for Business Logic
 * THE INVITATION PALACE
 */

const assert = require('assert');
const { getUniversalTimeGreeting, normalizePhoneNumber } = require('../config/constants');
const { renderTemplate, formatDisplayDate } = require('../services/templateEngine');
const { calculateScheduledDate } = require('../services/reminderService');
const { generateWaLink } = require('../services/whatsappService');

console.log('====================================================');
console.log(' RUNNING THE INVITATION PALACE TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${desc}`);
    console.error('       ', err.message);
  }
}

// 1. Time-Based Universal Greeting Tests
it('Universal Greeting: 09:00 AM should return "Good morning"', () => {
  const morningDate = new Date('2026-12-20T09:30:00Z');
  // Asia/Kolkata is UTC+5:30 -> 09:30 UTC is 15:00 IST (afternoon).
  // Let's create an explicit date for morning IST: UTC 03:00 is 08:30 IST.
  const morningUTC = new Date('2026-12-20T03:00:00Z');
  const greeting = getUniversalTimeGreeting(morningUTC, 'Asia/Kolkata');
  assert.strictEqual(greeting, 'Good morning');
});

it('Universal Greeting: 02:30 PM should return "Good afternoon"', () => {
  // 14:30 IST is 09:00 UTC
  const afternoonUTC = new Date('2026-12-20T09:00:00Z');
  const greeting = getUniversalTimeGreeting(afternoonUTC, 'Asia/Kolkata');
  assert.strictEqual(greeting, 'Good afternoon');
});

it('Universal Greeting: 08:00 PM should return "Good evening"', () => {
  // 20:00 IST is 14:30 UTC
  const eveningUTC = new Date('2026-12-20T14:30:00Z');
  const greeting = getUniversalTimeGreeting(eveningUTC, 'Asia/Kolkata');
  assert.strictEqual(greeting, 'Good evening');
});

it('Universal Greeting: Never contains religious terms', () => {
  const g1 = getUniversalTimeGreeting(new Date('2026-12-20T03:00:00Z'), 'Asia/Kolkata');
  const g2 = getUniversalTimeGreeting(new Date('2026-12-20T09:00:00Z'), 'Asia/Kolkata');
  const g3 = getUniversalTimeGreeting(new Date('2026-12-20T14:30:00Z'), 'Asia/Kolkata');
  
  const religiousWords = ['assalam', 'namaste', 'sat sri akal', 'ram', 'allah', 'jesus'];
  [g1, g2, g3].forEach(g => {
    religiousWords.forEach(w => {
      assert.strictEqual(g.toLowerCase().includes(w), false);
    });
  });
});

// 2. Phone Number Normalization Tests
it('Phone: 10-digit standard Indian number normalizes to +91...', () => {
  const normalized = normalizePhoneNumber('9876543210', '+91');
  assert.strictEqual(normalized, '+919876543210');
});

it('Phone: Number with spaces and dashes normalizes correctly', () => {
  const normalized = normalizePhoneNumber('+91 98765-43210', '+91');
  assert.strictEqual(normalized, '+919876543210');
});

it('Phone: Number with leading 0 normalizes correctly', () => {
  const normalized = normalizePhoneNumber('09876543210', '+91');
  assert.strictEqual(normalized, '+919876543210');
});

it('Phone: Invalid letters or short strings return null', () => {
  assert.strictEqual(normalizePhoneNumber('abcd123'), null);
  assert.strictEqual(normalizePhoneNumber('12345'), null);
  assert.strictEqual(normalizePhoneNumber(''), null);
});

// 3. Reminder Schedule Calculation Tests
it('Reminder: 7-day, 3-day and 1-day calculations are exact', () => {
  const eventDate = '2026-12-20';
  assert.strictEqual(calculateScheduledDate(eventDate, 7), '2026-12-13');
  assert.strictEqual(calculateScheduledDate(eventDate, 3), '2026-12-17');
  assert.strictEqual(calculateScheduledDate(eventDate, 1), '2026-12-19');
});

// 4. Template Interpolation & Host Name Handling Tests
it('Template: Starts with time greeting and handles optional guest name', () => {
  const template = `{{time_greeting}},\n\nReminder for {{event_name}} hosted by {{host_name}} on {{event_date}} at {{venue_name}}.\n\nRegards,\n{{business_name}}`;
  const context = {
    guest_name: '', // guest name omitted
    event_name: 'Walima Ceremony',
    host_name: 'Farhan & Amina',
    event_date: '2026-12-25',
    venue_name: 'Grand Palace',
    business_name: 'THE INVITATION PALACE',
    timeZone: 'Asia/Kolkata',
    sendDate: new Date('2026-12-25T04:00:00Z') // morning IST
  };

  const rendered = renderTemplate(template, context);
  assert.strictEqual(rendered.startsWith('Good morning,'), true);
  assert.strictEqual(rendered.includes('hosted by Farhan & Amina'), true);
  assert.strictEqual(rendered.includes('Walima Ceremony'), true);
  assert.strictEqual(rendered.includes('Grand Palace'), true);
  assert.strictEqual(rendered.includes('THE INVITATION PALACE'), true);
  assert.strictEqual(rendered.includes('{{'), false);
});

it('Template: Gracefully handles missing optional lines', () => {
  const template = `Hello {{guest_name}},\nEvent: {{event_name}}\nVenue: {{venue_name}}\nAddress: {{venue_address}}\nMap: {{maps_link}}`;
  const context = {
    guest_name: 'Aditya',
    event_name: 'Birthday Party',
    venue_name: 'Green Villa',
    venue_address: '', // empty
    maps_link: ''      // empty
  };

  const rendered = renderTemplate(template, context);
  assert.strictEqual(rendered.includes('Address:'), false);
  assert.strictEqual(rendered.includes('Map:'), false);
  assert.strictEqual(rendered.includes('Green Villa'), true);
});

// 5. WhatsApp Click-to-Chat Link Generation Tests
it('WhatsApp: Generates 100% free wa.me URL without plus sign', () => {
  const phone = '+919876543210';
  const text = 'Good morning Zaid! Reminder for Wedding.';
  const link = generateWaLink(phone, text);
  assert.strictEqual(link.startsWith('https://wa.me/919876543210?text='), true);
  assert.strictEqual(link.includes('Good%20morning%20Zaid'), true);
});

console.log('\n----------------------------------------------------');
console.log(` RESULTS: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('----------------------------------------------------');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
