/**
 * Excel & CSV Processing Service
 * Using free open-source SheetJS (xlsx)
 * THE INVITATION PALACE
 */

const XLSX = require('xlsx');
const { normalizePhoneNumber } = require('../config/constants');
const { getDb } = require('../config/db');

/**
 * Generate a downloadable sample Excel template
 * Guest Name is now completely optional!
 */
function generateSampleTemplate() {
  const sampleData = [
    {
      'Mobile Number': '9876543210',
      'Guest Name (Optional)': 'Rahul Sharma',
      'Email (Optional)': 'rahul.sharma@example.com',
      'Language': 'English',
      'Consent (Yes/No)': 'Yes',
      'Notes': 'Bride’s college friend'
    },
    {
      'Mobile Number': '+919123456789',
      'Guest Name (Optional)': '',
      'Email (Optional)': '',
      'Language': 'Hindi',
      'Consent (Yes/No)': 'Yes',
      'Notes': 'Family member'
    },
    {
      'Mobile Number': '+919988776655',
      'Guest Name (Optional)': 'Ahmed Khan',
      'Email (Optional)': '',
      'Language': 'Urdu',
      'Consent (Yes/No)': 'Yes',
      'Notes': 'VIP Guest'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);

  worksheet['!cols'] = [
    { wch: 20 }, // Mobile Number (Primary)
    { wch: 25 }, // Guest Name (Optional)
    { wch: 28 }, // Email
    { wch: 15 }, // Language
    { wch: 18 }, // Consent
    { wch: 30 }  // Notes
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Guest_Template');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Parse an uploaded Excel or CSV buffer and return validation & preview
 * Guest Name is now optional. Mobile Number is the required identifier.
 */
function parseAndValidateFile(buffer, eventId = null, defaultCountryCode = '+91') {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  const db = getDb();

  let existingEventPhones = new Set();
  if (eventId) {
    const existingRows = db.prepare(`
      SELECT g.mobile
      FROM guests g
      JOIN event_guests eg ON eg.guest_id = g.id
      WHERE eg.event_id = ?
    `).all(eventId);
    existingRows.forEach(r => existingEventPhones.add(r.mobile));
  }

  const validRecords = [];
  const invalidRecords = [];
  const seenPhonesInFile = new Set();

  rawRows.forEach((row, index) => {
    const rowNum = index + 2;

    const nameKey = Object.keys(row).find(k => /name|guest/i.test(k));
    const mobileKey = Object.keys(row).find(k => /mobile|phone|contact|whatsapp/i.test(k));
    const emailKey = Object.keys(row).find(k => /email|mail/i.test(k));
    const langKey = Object.keys(row).find(k => /lang/i.test(k));
    const consentKey = Object.keys(row).find(k => /consent/i.test(k));
    const notesKey = Object.keys(row).find(k => /note|remark/i.test(k));

    const rawName = nameKey ? String(row[nameKey]).trim() : '';
    const rawMobile = mobileKey ? String(row[mobileKey]).trim() : '';
    const rawEmail = emailKey ? String(row[emailKey]).trim() : '';
    const rawLanguage = langKey ? String(row[langKey]).trim() : 'English';
    const rawConsent = consentKey ? String(row[consentKey]).trim().toLowerCase() : 'yes';
    const rawNotes = notesKey ? String(row[notesKey]).trim() : '';

    // Skip completely empty rows
    if (!rawName && !rawMobile && !rawEmail) {
      return;
    }

    const issues = [];

    // Guest Name is now OPTIONAL (defaults to 'Guest' if empty)
    const displayName = rawName || 'Guest';

    // Mobile is required and validated
    const normalizedMobile = normalizePhoneNumber(rawMobile, defaultCountryCode);
    if (!rawMobile) {
      issues.push('Mobile number is missing');
    } else if (!normalizedMobile) {
      issues.push(`Invalid phone format: "${rawMobile}" (Must be 10-digit or international format)`);
    }

    // Duplicate within this file
    if (normalizedMobile) {
      if (seenPhonesInFile.has(normalizedMobile)) {
        issues.push(`Duplicate number inside file: ${normalizedMobile}`);
      } else {
        seenPhonesInFile.add(normalizedMobile);
      }
    }

    // Already associated with this event
    if (normalizedMobile && existingEventPhones.has(normalizedMobile)) {
      issues.push(`Already registered for this event`);
    }

    const consentStatus = (rawConsent === 'no' || rawConsent === '0' || rawConsent === 'false') ? 0 : 1;

    const record = {
      rowIndex: rowNum,
      name: displayName,
      rawName: rawName,
      mobile: normalizedMobile || rawMobile,
      rawMobile: rawMobile,
      email: rawEmail,
      language: rawLanguage || 'English',
      consentStatus: consentStatus,
      notes: rawNotes,
      status: issues.length === 0 ? 'VALID' : 'INVALID',
      issues: issues
    };

    if (issues.length === 0) {
      validRecords.push(record);
    } else {
      invalidRecords.push(record);
    }
  });

  return {
    totalParsed: rawRows.length,
    validCount: validRecords.length,
    invalidCount: invalidRecords.length,
    validRecords,
    invalidRecords
  };
}

module.exports = {
  generateSampleTemplate,
  parseAndValidateFile
};
