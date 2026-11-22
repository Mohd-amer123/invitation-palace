/**
 * WhatsApp Message Template Engine
 * Handles dynamic variable interpolation, universal time greetings,
 * and elegant message preview generation.
 * THE INVITATION PALACE
 */

const { getUniversalTimeGreeting } = require('../config/constants');

/**
 * Format date string into elegant readable date
 * e.g., "2026-12-20" -> "Sunday, 20 December 2026"
 */
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Render a template string with given context
 */
function renderTemplate(templateText, context = {}) {
  if (!templateText) return '';

  const timeZone = context.timeZone || 'Asia/Kolkata';
  const sendDate = context.sendDate || new Date();
  const timeGreeting = getUniversalTimeGreeting(sendDate, timeZone);

  const formattedDate = formatDisplayDate(context.event_date);
  const guestName = (context.guest_name && context.guest_name.trim() !== 'Guest') ? context.guest_name.trim() : '';

  const variables = {
    '{{time_greeting}}': timeGreeting,
    '{{guest_name}}': guestName,
    '{{event_name}}': (context.event_name || 'Special Celebration').trim(),
    '{{host_name}}': (context.host_name || 'Our Family').trim(),
    '{{event_date}}': formattedDate || (context.event_date || ''),
    '{{event_time}}': (context.event_time || '').trim(),
    '{{venue_name}}': (context.venue_name || '').trim(),
    '{{venue_address}}': (context.venue_address || '').trim(),
    '{{maps_link}}': (context.maps_link || '').trim(),
    '{{business_name}}': (context.business_name || 'THE INVITATION PALACE').trim()
  };

  let rendered = templateText;

  // Replace all variables
  for (const [token, value] of Object.entries(variables)) {
    rendered = rendered.split(token).join(value);
  }

  // Clean up greeting line formatting if guest_name was omitted:
  // e.g. "Good morning ," or "Good morning  ," -> "Good morning,"
  rendered = rendered.replace(/\b(Good morning|Good afternoon|Good evening)\s+,/gi, '$1,');
  rendered = rendered.replace(/\s+,/g, ',');

  // Handle any lines that had optional fields that resolved to empty
  const lines = rendered.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed === 'Address:' || trimmed === 'Venue:' || trimmed === 'Google Map:' || trimmed === 'Map:') {
      return false;
    }
    return true;
  });

  rendered = cleanedLines.join('\n');

  // Ensure no unrendered {{tag}} remains
  rendered = rendered.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '').trim();

  // Clean excessive blank lines (maximum 2 consecutive newlines)
  rendered = rendered.replace(/\n{3,}/g, '\n\n');

  return rendered;
}

/**
 * Generate a sample preview for template editor
 */
function getSamplePreview(templateText, stageDays = 7) {
  const sampleContext = {
    guest_name: '', // Optional guest name
    event_name: 'Grand Wedding Reception',
    host_name: 'Farhan & Amina',
    event_date: '2026-12-25',
    event_time: '07:30 PM',
    venue_name: 'Royal Heritage Palace, King’s Hall',
    venue_address: 'No. 42, Palace Cross Road, Vasanth Nagar, Bengaluru',
    maps_link: 'https://maps.google.com/?q=Royal+Heritage+Palace',
    business_name: 'THE INVITATION PALACE',
    timeZone: 'Asia/Kolkata',
    sendDate: new Date()
  };

  return renderTemplate(templateText, sampleContext);
}

module.exports = {
  renderTemplate,
  getSamplePreview,
  formatDisplayDate
};
