/**
 * THE INVITATION PALACE – Web Application Frontend Controller
 * Vanilla JavaScript Single Page Application
 */

// Global State
let currentUser = null;
let currentTemplates = [];
let activeTemplateStage = 7;
let parsedExcelRecords = [];
let currentDispatchReminderId = null;
let currentDispatchMessageText = '';
let currentViewEventId = null;

// Immediate Instant Branding Bootstrap (Zero-delay, resilient cache)
function applyInstantBranding() {
  try {
    const cachedLogo = localStorage.getItem('palace_company_logo') || '/images/company-logo.png';
    const cachedName = localStorage.getItem('palace_business_name') || 'THE INVITATION PALACE';
    const sidebarLogo = document.getElementById('sidebarCompanyLogo');
    const sidebarIcon = document.getElementById('sidebarBrandIcon');
    if (sidebarLogo) {
      sidebarLogo.src = cachedLogo;
      sidebarLogo.classList.remove('d-none');
      if (sidebarIcon) sidebarIcon.classList.add('d-none');
    }
    const headerLogo = document.getElementById('headerBrandLogo');
    const headerCrown = document.getElementById('headerCrownIcon');
    if (headerLogo) {
      headerLogo.src = cachedLogo;
      headerLogo.classList.remove('d-none');
      if (headerCrown) headerCrown.classList.add('d-none');
    }
    const sidebarName = document.getElementById('sidebarBrandName');
    if (sidebarName) sidebarName.textContent = cachedName;
    const headerText = document.getElementById('headerBrandText');
    if (headerText) headerText.textContent = cachedName;
    document.title = cachedName + ' | Event Reminder Management System';
  } catch (e) {}
}

// Run immediate bootstrap as early as possible
applyInstantBranding();

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  applyInstantBranding();
  loadBranding(); // Run branding fetch concurrently
  await verifyAuthentication();
  setupNavigation();
  setupClock();
  setupEventListeners();
  checkWhatsAppConnectionStatus();

  // Load initial view based on URL hash
  const initialSection = window.location.hash.replace('#', '') || 'dashboard';
  navigateToSection(initialSection);
});

// Toast notification helper
function showToast(message, type = 'dark') {
  const toastEl = document.getElementById('palaceToast');
  const toastMsg = document.getElementById('toastMessage');
  toastEl.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'dark'} border-0`;
  toastMsg.textContent = message;
  const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
  toast.show();
}

// Format date helper
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Format datetime helper
function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return '';
  try {
    const d = new Date(dateTimeStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return dateTimeStr;
  }
}

// Status badge helper
function getStatusBadge(status) {
  const map = {
    'Scheduled': 'badge-scheduled',
    'Pending': 'badge-awaiting',
    'Ready to Send': 'badge-ready',
    'Awaiting WhatsApp': 'badge-awaiting',
    'Sent': 'badge-sent',
    'Delivered': 'badge-delivered',
    'Read': 'badge-read',
    'Failed': 'badge-failed',
    'Cancelled': 'badge-cancelled',
    'Skipped': 'badge-skipped'
  };
  const cls = map[status] || 'badge-scheduled';
  return `<span class="badge-status ${cls}">${status}</span>`;
}

/* ==============================================================
   1. AUTHENTICATION & NAVIGATION
   ============================================================== */
async function verifyAuthentication() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      const userNameEl = document.getElementById('userNameDisplay');
      if (userNameEl) userNameEl.textContent = currentUser.fullName || currentUser.username;
      const userAvatarEl = document.getElementById('userAvatar');
      if (userAvatarEl) userAvatarEl.textContent = (currentUser.fullName || currentUser.username).charAt(0).toUpperCase();
    } else {
      window.location.href = '/login.html';
    }
  } catch (err) {
    window.location.href = '/login.html';
  }
}

async function handleLogout() {
  if (confirm('Are you sure you want to sign out of THE INVITATION PALACE?')) {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/login.html';
  }
}

function setupNavigation() {
  const navLinks = document.querySelectorAll('.sidebar-menu .nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.getAttribute('data-section');
      window.location.hash = section;
      navigateToSection(section);

      // On mobile, collapse sidebar
      if (window.innerWidth <= 992) {
        document.getElementById('sidebar').classList.remove('show');
      }
    });
  });

  window.addEventListener('hashchange', () => {
    const section = window.location.hash.replace('#', '') || 'dashboard';
    navigateToSection(section);
  });

  // Mobile sidebar toggle
  const sidebarToggle = document.getElementById('sidebarToggleBtn');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('show');
    });
  }
}

function navigateToSection(sectionId) {
  // Update sidebar active link
  document.querySelectorAll('.sidebar-menu .nav-link').forEach(l => {
    l.classList.toggle('active', l.getAttribute('data-section') === sectionId);
  });

  // Update views
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });

  const targetView = document.getElementById(`section-${sectionId}`);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Update header title
  const titles = {
    dashboard: 'Dashboard Overview',
    customers: 'Customer Directory',
    'customer-hub': 'Customer Workspace Hub (360° View)',
    events: 'Events Management',
    guests: 'Guest Contact List',
    reminders: 'Event Reminders Center',
    templates: 'WhatsApp Message Templates',
    history: 'Message Dispatch History',
    reports: 'Reports & Business Analytics',
    settings: 'System & WhatsApp Settings'
  };
  const titleDisplay = document.getElementById('pageTitleDisplay');
  if (titleDisplay) {
    titleDisplay.textContent = titles[sectionId] || 'Dashboard';
  }

  // Trigger section loader
  switch (sectionId) {
    case 'dashboard': loadDashboard(); break;
    case 'customers': loadCustomers(); break;
    case 'customer-hub': loadCustomerHub(); break;
    case 'events': loadEvents(); break;
    case 'guests': 
      if (currentGuestViewMode === 'cards') {
        loadGuestEventCards();
      } else {
        loadGuests();
      }
      break;
    case 'reminders': loadReminders(); break;
    case 'templates': loadTemplates(); break;
    case 'history': loadMessageHistory(); break;
    case 'reports': loadReports(); break;
    case 'settings': loadSettings(); break;
  }
}

function setupClock() {
  function updateTime() {
    try {
      const now = new Date();
      const options = {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };
      const formatted = new Intl.DateTimeFormat('en-IN', options).format(now);
      const clockEl = document.getElementById('currentTimeText');
      if (clockEl) clockEl.textContent = `${formatted} (IST)`;
    } catch (e) {
      const clockEl = document.getElementById('currentTimeText');
      if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();
    }
  }
  updateTime();
  setInterval(updateTime, 1000);
}

/* ==============================================================
   2. DASHBOARD VIEW
   ============================================================== */
async function loadDashboard() {
  try {
    const res = await fetch('/api/reports/dashboard');
    const data = await res.json();
    if (!data.success) return;

    const m = data.metrics;
    document.getElementById('kpiCustomers').textContent = m.totalCustomers || 0;
    document.getElementById('kpiEvents').textContent = m.totalEvents || 0;
    document.getElementById('kpiGuests').textContent = m.totalGuests || 0;
    document.getElementById('kpiScheduled').textContent = m.totalScheduledReminders || 0;
    document.getElementById('kpiSent').textContent = m.totalSentMessages || 0;
    document.getElementById('kpiDelivered').textContent = m.totalDeliveredMessages || 0;
    document.getElementById('kpiFailed').textContent = m.totalFailedMessages || 0;

    // Secondary Overview Displays
    const delivTop = document.getElementById('kpiDeliveredTop');
    if (delivTop) delivTop.textContent = m.totalDeliveredMessages || 0;
    const schedSec = document.getElementById('kpiScheduledSecondary');
    if (schedSec) schedSec.textContent = m.totalScheduledReminders || 0;
    const guestsSec = document.getElementById('kpiGuestsSecondary');
    if (guestsSec) guestsSec.textContent = m.totalGuests || 0;

    // Upcoming Events Table
    const eventsTbody = document.getElementById('dashboardUpcomingEventsBody');
    if (!data.upcomingEvents || data.upcomingEvents.length === 0) {
      eventsTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No upcoming events scheduled.</td></tr>`;
    } else {
      eventsTbody.innerHTML = data.upcomingEvents.map(e => `
        <tr>
          <td>
            <strong>${escapeHtml(e.event_name)}</strong>
            <div class="small text-muted"><i class="fa-solid fa-crown text-warning me-1"></i> ${escapeHtml(e.host_name)}</div>
          </td>
          <td><span class="badge bg-light text-dark border">${e.event_category}</span></td>
          <td>
            <div>${formatDate(e.event_date)}</div>
            <div class="small text-muted">${e.event_time}</div>
          </td>
          <td><span class="badge bg-secondary-subtle text-dark">${e.guest_count || 0} guests</span></td>
        </tr>
      `).join('');
    }

    // Upcoming Scheduled Reminders Table
    const remindersTbody = document.getElementById('dashboardUpcomingRemindersBody');
    if (!data.upcomingReminders || data.upcomingReminders.length === 0) {
      remindersTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No pending reminders due soon.</td></tr>`;
    } else {
      remindersTbody.innerHTML = data.upcomingReminders.map(r => `
        <tr>
          <td>
            <strong>${escapeHtml(r.guest_name)}</strong>
            <div class="small text-muted">${r.guest_phone}</div>
          </td>
          <td>
            <div>${escapeHtml(r.event_name)}</div>
            <div class="small text-muted">Host: ${escapeHtml(r.host_name)}</div>
          </td>
          <td><span class="badge bg-light text-dark border">${r.reminder_stage}</span></td>
          <td>${formatDate(r.scheduled_date)} ${r.scheduled_time}</td>
          <td>${getStatusBadge(r.status)}</td>
        </tr>
      `).join('');
    }

    // Ready for Dispatch Reminders (Today or Ready to Send)
    const readyReminders = (data.upcomingReminders || []).filter(r => r.status === 'Ready to Send' || r.status === 'Awaiting WhatsApp');
    const readyTbody = document.getElementById('dashboardReadyRemindersTableBody');
    if (readyReminders.length === 0) {
      readyTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">All reminders for today are up to date! None pending.</td></tr>`;
    } else {
      readyTbody.innerHTML = readyReminders.map(r => `
        <tr>
          <td><strong>${escapeHtml(r.guest_name)}</strong></td>
          <td><code>${r.guest_phone}</code></td>
          <td>${escapeHtml(r.event_name)} (${escapeHtml(r.host_name)})</td>
          <td><span class="badge bg-warning-subtle text-warning-emphasis">${r.reminder_stage}</span></td>
          <td>${getStatusBadge(r.status)}</td>
          <td>
            <button class="btn btn-sm btn-palace" onclick="openDispatchModal(${r.id})">
              <i class="fa-brands fa-whatsapp text-white"></i> Send WhatsApp
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

/* ==============================================================
   3. CUSTOMERS VIEW
   ============================================================== */
async function loadCustomers() {
  const search = document.getElementById('customerSearchInput').value;
  const status = document.getElementById('customerStatusFilter').value;

  try {
    const url = new URL('/api/customers', window.location.origin);
    if (search) url.searchParams.set('search', search);
    if (status) url.searchParams.set('status', status);

    const res = await fetch(url);
    const data = await res.json();
    const tbody = document.getElementById('customersTableBody');

    if (!data.customers || data.customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No customers found. Click <strong>Add New Customer</strong> to register one.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.customers.map(c => `
      <tr>
        <td><code>${c.customer_code}</code></td>
        <td>
          <a href="javascript:void(0)" onclick="viewCustomerDetails(${c.id})" class="fw-bold text-decoration-none text-dark">
            ${escapeHtml(c.full_name)}
          </a>
          ${c.email ? `<div class="small text-muted">${escapeHtml(c.email)}</div>` : ''}
        </td>
        <td><strong>${c.mobile}</strong></td>
        <td>${c.order_reference ? `<code>${escapeHtml(c.order_reference)}</code>` : '<span class="text-muted">-</span>'}</td>
        <td><span class="badge bg-light text-dark border">${c.total_events || 0} Event(s)</span></td>
        <td>
          <span class="badge ${c.status === 'Active' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted'}">
            ${c.status}
          </span>
        </td>
        <td>
          <div class="d-flex gap-1 align-items-center">
            <button class="btn btn-sm btn-palace px-2 py-1" onclick="openCustomerWorkspace(${c.id})" title="Open Dedicated Customer Workspace">
              <i class="fa-solid fa-folder-open me-1"></i> Hub
            </button>
            <button class="btn btn-sm btn-outline-primary" onclick="viewCustomerDetails(${c.id})" title="Quick Info">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="openEditCustomerModal(${c.id})" title="Edit">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomer(${c.id}, '${escapeHtml(c.full_name)}')" title="Delete / Archive">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function openAddCustomerModal() {
  document.getElementById('customerModalTitle').textContent = 'Add New Customer';
  document.getElementById('customerIdInput').value = '';
  document.getElementById('customerForm').reset();
  const modal = new bootstrap.Modal(document.getElementById('customerModal'));
  modal.show();
}

async function openEditCustomerModal(id) {
  try {
    const res = await fetch(`/api/customers/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const c = data.customer;
    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('customerIdInput').value = c.id;
    document.getElementById('custNameInput').value = c.full_name;
    document.getElementById('custMobileInput').value = c.mobile;
    document.getElementById('custEmailInput').value = c.email || '';
    document.getElementById('custOrderRefInput').value = c.order_reference || '';
    document.getElementById('custAddressInput').value = c.address || '';
    document.getElementById('custStatusInput').value = c.status || 'Active';
    document.getElementById('custNotesInput').value = c.notes || '';

    const modal = new bootstrap.Modal(document.getElementById('customerModal'));
    modal.show();
  } catch (err) {
    showToast('Could not load customer data: ' + err.message, 'error');
  }
}

async function viewCustomerDetails(id) {
  try {
    const res = await fetch(`/api/customers/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const c = data.customer;
    document.getElementById('custDetailTitle').textContent = `Customer: ${c.full_name} (${c.customer_code})`;

    document.getElementById('custDetailInfoBox').innerHTML = `
      <div class="col-md-4"><strong>Mobile:</strong> ${c.mobile}</div>
      <div class="col-md-4"><strong>Email:</strong> ${c.email || 'N/A'}</div>
      <div class="col-md-4"><strong>Order Ref:</strong> ${c.order_reference || 'N/A'}</div>
      <div class="col-md-8"><strong>Address:</strong> ${c.address || 'N/A'}</div>
      <div class="col-md-4"><strong>Registered:</strong> ${formatDate(c.registration_date)}</div>
      ${c.notes ? `<div class="col-12"><strong>Notes:</strong> ${escapeHtml(c.notes)}</div>` : ''}
    `;

    const tbody = document.getElementById('custDetailEventsTableBody');
    if (!data.events || data.events.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No events booked by this customer yet.</td></tr>`;
    } else {
      tbody.innerHTML = data.events.map(e => `
        <tr>
          <td><strong>${escapeHtml(e.event_name)}</strong></td>
          <td>${escapeHtml(e.host_name)}</td>
          <td>${formatDate(e.event_date)}</td>
          <td>${e.total_guests || 0}</td>
          <td>${e.total_reminders || 0}</td>
          <td><span class="badge bg-light text-dark border">${e.status}</span></td>
        </tr>
      `).join('');
    }

    const modal = new bootstrap.Modal(document.getElementById('customerDetailModal'));
    modal.show();
  } catch (err) {
    showToast('Failed to load customer profile: ' + err.message, 'error');
  }
}

async function deleteCustomer(id, name) {
  if (confirm(`Are you sure you want to permanently delete customer "${name}" and all their associated events?`)) {
    try {
      const res = await fetch(`/api/customers/${id}?force=true`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadCustomers();
      } else {
        showToast(data.error || 'Failed to delete customer', 'error');
      }
    } catch (err) {
      showToast('Error deleting customer: ' + err.message, 'error');
    }
  }
}

/* ==============================================================
   4. EVENTS VIEW
   ============================================================== */
async function loadEvents() {
  const search = document.getElementById('eventSearchInput').value;
  const category = document.getElementById('eventCategoryFilter').value;
  const status = document.getElementById('eventStatusFilter').value;

  try {
    const url = new URL('/api/events', window.location.origin);
    if (search) url.searchParams.set('search', search);
    if (category) url.searchParams.set('category', category);
    if (status) url.searchParams.set('status', status);

    const res = await fetch(url);
    const data = await res.json();

    // Populate category dropdown if needed
    if (data.categories && document.getElementById('eventCategoryFilter').children.length <= 1) {
      const filterSelect = document.getElementById('eventCategoryFilter');
      const formSelect = document.getElementById('eventCategorySelect');
      data.categories.forEach(cat => {
        filterSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
        formSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
      });
    }

    // Update Quick Overview Metric Chips
    const eventsList = data.events || [];
    const totalEvents = eventsList.length;
    const activeEvents = eventsList.filter(e => e.status === 'Active').length;
    const totalGuests = eventsList.reduce((sum, e) => sum + (Number(e.total_guests) || 0), 0);
    const linkedHosts = eventsList.filter(e => e.whatsapp_status === 'CONNECTED').length;

    const stTotal = document.getElementById('statEventsTotal');
    if (stTotal) stTotal.textContent = totalEvents;
    const stActive = document.getElementById('statEventsActive');
    if (stActive) stActive.textContent = activeEvents;
    const stGuests = document.getElementById('statEventsGuests');
    if (stGuests) stGuests.textContent = totalGuests;
    const stLinked = document.getElementById('statEventsLinked');
    if (stLinked) stLinked.textContent = linkedHosts;

    const tbody = document.getElementById('eventsTableBody');
    if (eventsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
        <i class="fa-solid fa-calendar-xmark fs-2 text-muted mb-2 d-block"></i>
        No ceremonies found. Click <strong>+ Create New Event</strong> to add your first ceremony.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = eventsList.map(e => `
      <tr>
        <td class="ps-3">
          <a href="javascript:void(0)" onclick="viewEventDetails(${e.id})" class="fw-bold text-decoration-none text-dark hover-burgundy d-inline-block">
            ${escapeHtml(e.event_name)}
          </a>
          ${e.whatsapp_sender_name ? `<div class="small text-muted mt-0.5 d-flex align-items-center gap-1" style="font-size: 11px;"><i class="fa-brands fa-whatsapp text-success"></i><span>${escapeHtml(e.whatsapp_sender_name)}</span></div>` : ''}
        </td>
        <td>
          <div class="fw-bold text-dark d-flex align-items-center gap-1.5">
            <i class="fa-solid fa-crown text-warning" style="font-size: 12px;"></i>
            <span>${escapeHtml(e.host_name)}</span>
          </div>
          ${e.host_phone ? `<div class="small text-muted" style="font-size: 11px;">+${e.host_phone}</div>` : ''}
        </td>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(e.customer_name)}</div>
          <span class="badge bg-light text-muted border px-2 py-0.5" style="font-size: 10px;">${escapeHtml(e.customer_code)}</span>
        </td>
        <td>
          <span class="badge bg-light text-dark border px-2.5 py-1 rounded-pill fw-semibold" style="font-size: 11.5px;">
            <i class="fa-solid fa-tag me-1 text-muted" style="font-size: 10px;"></i>${escapeHtml(e.event_category)}
          </span>
        </td>
        <td>
          <div class="fw-bold text-dark" style="font-size: 13px;">
            <i class="fa-regular fa-calendar me-1 text-secondary"></i>${formatDate(e.event_date)}
          </div>
          <div class="small text-muted" style="font-size: 11.5px;">
            <i class="fa-regular fa-clock me-1 text-muted"></i>${e.event_time}
          </div>
        </td>
        <td>
          <div class="text-truncate" style="max-width: 170px;" title="${escapeHtml(e.venue_name || 'N/A')}">
            ${escapeHtml(e.venue_name || 'N/A')}
          </div>
          ${e.maps_link ? `<a href="${e.maps_link}" target="_blank" class="small text-primary text-decoration-none fw-semibold d-inline-flex align-items-center gap-1 mt-0.5" style="font-size: 11px;"><i class="fa-solid fa-map-location-dot"></i> Directions</a>` : ''}
        </td>
        <td>
          <span class="badge bg-light text-dark border px-2.5 py-1 rounded-pill fw-bold" style="font-size: 12px;">
            <i class="fa-solid fa-user-group me-1 text-muted" style="font-size: 10px;"></i>${e.total_guests || 0}
          </span>
        </td>
        <td>
          ${e.whatsapp_status === 'CONNECTED' ? `
            <div class="d-flex align-items-center gap-1.5">
              <span class="host-connected-capsule" title="Host WhatsApp is Connected & Active">
                <i class="fa-solid fa-circle-check text-success"></i>
                <span>${e.whatsapp_sender_phone ? '+' + e.whatsapp_sender_phone : 'Linked'}</span>
              </span>
              <button class="btn btn-sm btn-share-link-circle" onclick="event.stopPropagation(); openShareClientLinkModal(${e.id})" title="View QR / Share Link with Host">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
              </button>
            </div>
          ` : `
            <button class="btn btn-link-host-pill shadow-sm"
                    onclick="event.stopPropagation(); openShareClientLinkModal(${e.id})"
                    title="Open WhatsApp pairing QR code & share link for ${escapeHtml(e.host_name)}">
              <i class="fa-brands fa-whatsapp"></i>
              <span>Link Host</span>
            </button>
          `}
        </td>
        <td>
          ${e.status === 'Active' ? `
            <span class="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1 rounded-pill fw-semibold">
              <span class="status-dot status-dot-active me-1"></span> Active
            </span>
          ` : e.status === 'Completed' ? `
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1 rounded-pill fw-semibold">
              <span class="status-dot status-dot-completed me-1"></span> Completed
            </span>
          ` : `
            <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1 rounded-pill fw-semibold">
              <span class="status-dot status-dot-cancelled me-1"></span> Cancelled
            </span>
          `}
        </td>
        <td class="text-end pe-3">
          <div class="d-inline-flex align-items-center gap-1">
            <button class="btn btn-action-icon text-primary" onclick="openEventGuestList(${e.id})" title="Guest Roster (${e.total_guests || 0} Guests)">
              <i class="fa-solid fa-users"></i>
            </button>
            <button class="btn btn-action-icon text-warning-emphasis" onclick="dispatchEventRemindersNow(${e.id}, '${escapeHtml(e.event_name)}')" title="Send Scheduled Reminders Now">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
            <button class="btn btn-action-icon text-secondary" onclick="openEditEventModal(${e.id})" title="Edit Ceremony Details">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-action-icon text-danger" onclick="cancelOrDeleteEvent(${e.id}, '${escapeHtml(e.event_name)}')" title="Delete Event">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading events:', err);
  }
}

function resetEventFilters() {
  const search = document.getElementById('eventSearchInput');
  const cat = document.getElementById('eventCategoryFilter');
  const stat = document.getElementById('eventStatusFilter');
  if (search) search.value = '';
  if (cat) cat.value = 'All';
  if (stat) stat.value = 'Active';
  loadEvents();
}

async function populateCustomerSelect(targetSelectId, selectedVal = null) {
  try {
    const res = await fetch('/api/customers?status=Active');
    const data = await res.json();
    const select = document.getElementById(targetSelectId);
    select.innerHTML = '<option value="">Select Customer...</option>';
    if (data.customers) {
      data.customers.forEach(c => {
        select.innerHTML += `<option value="${c.id}" ${selectedVal == c.id ? 'selected' : ''}>${escapeHtml(c.full_name)} (${c.customer_code} - ${c.mobile})</option>`;
      });
    }
  } catch (err) {
    console.error('Error populating customers:', err);
  }
}

async function populateEventSelect(targetSelectId, selectedVal = null, defaultLabel = 'Choose Event...') {
  try {
    const res = await fetch('/api/events?status=Active');
    const data = await res.json();
    const select = document.getElementById(targetSelectId);
    select.innerHTML = `<option value="">${defaultLabel}</option>`;
    if (data.events) {
      data.events.forEach(e => {
        select.innerHTML += `<option value="${e.id}" ${selectedVal == e.id ? 'selected' : ''}>${escapeHtml(e.event_name)} - Host: ${escapeHtml(e.host_name)} (${formatDate(e.event_date)})</option>`;
      });
    }
  } catch (err) {
    console.error('Error populating events:', err);
  }
}

async function openAddEventModal() {
  document.getElementById('eventModalTitle').textContent = 'Create New Event';
  document.getElementById('eventIdInput').value = '';
  document.getElementById('eventForm').reset();
  document.getElementById('eventReminderDaysInput').value = '7,3,1';
  document.getElementById('eventReminderTimeInput').value = '10:00';
  await populateCustomerSelect('eventCustomerSelect');
  await populateEventWhatsAppSelect();
  const modal = new bootstrap.Modal(document.getElementById('eventModal'));
  modal.show();
}

async function openEditEventModal(id) {
  try {
    const res = await fetch(`/api/events/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const e = data.event;
    document.getElementById('eventModalTitle').textContent = 'Edit Event Details';
    document.getElementById('eventIdInput').value = e.id;
    await populateCustomerSelect('eventCustomerSelect', e.customer_id);
    await populateEventWhatsAppSelect(e.whatsapp_account_id || null);

    document.getElementById('eventCategorySelect').value = e.event_category;
    document.getElementById('eventNameInput').value = e.event_name;
    document.getElementById('eventHostNameInput').value = e.host_name;
    document.getElementById('eventDateInput').value = e.event_date;
    document.getElementById('eventTimeInput').value = e.event_time;
    document.getElementById('eventVenueNameInput').value = e.venue_name;
    document.getElementById('eventVenueAddressInput').value = e.venue_address;
    document.getElementById('eventMapsLinkInput').value = e.maps_link || '';
    document.getElementById('eventReminderDaysInput').value = e.reminder_days || '7,3,1';
    document.getElementById('eventReminderTimeInput').value = e.reminder_time || '10:00';
    document.getElementById('eventDescInput').value = e.description || '';

    const modal = new bootstrap.Modal(document.getElementById('eventModal'));
    modal.show();
  } catch (err) {
    showToast('Failed to load event: ' + err.message, 'error');
  }
}

async function viewEventDetails(id) {
  currentViewEventId = id;
  try {
    const res = await fetch(`/api/events/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const e = data.event;
    document.getElementById('eventDetailHeaderTitle').textContent = `${e.event_name}`;

    document.getElementById('eventDetailCardInfo').innerHTML = `
      <div class="col-md-4"><strong>Host Name / Person:</strong> <span class="text-danger fw-bold">${escapeHtml(e.host_name)}</span></div>
      <div class="col-md-4"><strong>Customer:</strong> ${escapeHtml(e.customer_name)} (${e.customer_code})</div>
      <div class="col-md-4"><strong>Category:</strong> ${e.event_category}</div>
      <div class="col-md-4"><strong>Event Date & Time:</strong> ${formatDate(e.event_date)} at ${e.event_time}</div>
      <div class="col-md-8"><strong>Venue:</strong> ${escapeHtml(e.venue_name)} &bull; ${escapeHtml(e.venue_address)}</div>
      ${e.maps_link ? `<div class="col-12"><strong>Google Maps:</strong> <a href="${e.maps_link}" target="_blank">${e.maps_link}</a></div>` : ''}
    `;

    document.getElementById('eventGuestCountSpan').textContent = data.guests ? data.guests.length : 0;

    // Guests Table
    const guestsTbody = document.getElementById('eventGuestsTableBody');
    if (!data.guests || data.guests.length === 0) {
      guestsTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No guests linked yet. Click "+ Add Guest to Event" or use Bulk Excel Import.</td></tr>`;
    } else {
      guestsTbody.innerHTML = data.guests.map(g => `
        <tr>
          <td><strong>${escapeHtml(g.full_name)}</strong></td>
          <td>${g.mobile}</td>
          <td>${g.consent_status ? '<span class="badge bg-success-subtle text-success">Consented</span>' : '<span class="badge bg-danger-subtle text-danger">No Consent</span>'}</td>
          <td>${formatDate(g.registered_at)}</td>
        </tr>
      `).join('');
    }

    // Reminders Table
    const remTbody = document.getElementById('eventRemindersTableBody');
    if (!data.reminders || data.reminders.length === 0) {
      remTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No reminders generated yet. Add consenting guests to generate schedules automatically.</td></tr>`;
    } else {
      remTbody.innerHTML = data.reminders.map(r => `
        <tr>
          <td>${escapeHtml(r.guest_name)}</td>
          <td><span class="badge bg-light text-dark border">${r.reminder_stage}</span></td>
          <td>${formatDate(r.scheduled_date)} ${r.scheduled_time}</td>
          <td>${getStatusBadge(r.status)}</td>
          <td>
            <button class="btn btn-sm btn-palace" onclick="openDispatchModal(${r.id})">
              <i class="fa-brands fa-whatsapp"></i> Dispatch
            </button>
          </td>
        </tr>
      `).join('');
    }

    const modal = new bootstrap.Modal(document.getElementById('eventDetailModal'));
    modal.show();
  } catch (err) {
    showToast('Failed to view event: ' + err.message, 'error');
  }
}

async function cancelOrDeleteEvent(id, name) {
  if (confirm(`Are you sure you want to delete event "${name}"? This will delete the event, its guest assignments, and its reminders.`)) {
    try {
      const res = await fetch(`/api/events/${id}?force=true`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadEvents();
        if (typeof loadGuestEventCards === 'function') loadGuestEventCards();
        if (typeof loadDashboard === 'function') loadDashboard();
      } else {
        showToast(data.error || 'Failed to delete event', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

async function dispatchEventRemindersNow(eventId, eventName) {
  if (!confirm(`Send all reminders for "${eventName}" now via linked WhatsApp?`)) return;
  try {
    showToast(`Dispatching reminders for ${eventName}...`, 'info');
    const res = await fetch(`/api/reminders/dispatch-event/${eventId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadEvents();
      if (typeof loadReminders === 'function') loadReminders();
      if (typeof loadGuestEventCards === 'function') loadGuestEventCards();
    } else {
      showToast(data.error || 'Failed to dispatch reminders', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ==============================================================
   5. GUESTS DIRECTORY: EVENT & CUSTOMER CARDS + DEDICATED WORKSPACE
   ============================================================== */
let currentGuestViewMode = 'cards'; // 'cards' or 'table'
let allGuestEvents = [];
let currentEventWsId = null;
let currentEventWsData = null;

function switchGuestViewMode(mode) {
  currentGuestViewMode = mode;
  const cardsContainer = document.getElementById('guestEventCardsView');
  const tableContainer = document.getElementById('guestMasterTableView');
  const wsContainer = document.getElementById('eventGuestWorkspace');
  const btnCards = document.getElementById('btnViewGuestCards');
  const btnTable = document.getElementById('btnViewGuestTable');

  if (mode === 'cards') {
    if (cardsContainer) cardsContainer.style.display = 'block';
    if (tableContainer) tableContainer.style.display = 'none';
    if (wsContainer) wsContainer.style.display = 'none';
    if (btnCards) {
      btnCards.className = 'btn btn-sm btn-palace rounded-pill px-3 py-1 fw-semibold';
    }
    if (btnTable) {
      btnTable.className = 'btn btn-sm btn-outline-secondary rounded-pill px-3 py-1 fw-semibold border-0';
    }
    loadGuestEventCards();
  } else {
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    if (wsContainer) wsContainer.style.display = 'none';
    if (btnCards) {
      btnCards.className = 'btn btn-sm btn-outline-secondary rounded-pill px-3 py-1 fw-semibold border-0';
    }
    if (btnTable) {
      btnTable.className = 'btn btn-sm btn-palace rounded-pill px-3 py-1 fw-semibold';
    }
    loadGuests();
  }
}

async function loadGuestEventCards() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (!data.success) return;

    allGuestEvents = data.events || [];

    // Populate customer and category filters
    populateGuestCardFilters(allGuestEvents);
    renderGuestEventCards(allGuestEvents);
  } catch (err) {
    console.error('Error loading guest events:', err);
    const container = document.getElementById('guestEventCardsGrid');
    if (container) {
      container.innerHTML = `<div class="text-center text-danger py-4 col-12">Failed to load event cards: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function populateGuestCardFilters(events) {
  const custSelect = document.getElementById('guestCardCustomerFilter');
  const catSelect = document.getElementById('guestCardCategoryFilter');

  if (custSelect) {
    const uniqueCustomers = [];
    const seenCustIds = new Set();
    events.forEach(e => {
      if (e.customer_id && !seenCustIds.has(e.customer_id)) {
        seenCustIds.add(e.customer_id);
        uniqueCustomers.push({ id: e.customer_id, name: e.customer_name, code: e.customer_code });
      }
    });

    const currentVal = custSelect.value;
    let html = '<option value="">All Customers</option>';
    uniqueCustomers.forEach(c => {
      html += `<option value="${c.id}" ${currentVal == c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${c.code})</option>`;
    });
    custSelect.innerHTML = html;
  }

  if (catSelect) {
    const categories = Array.from(new Set(events.map(e => e.event_category).filter(Boolean)));
    const currentVal = catSelect.value;
    let html = '<option value="">All Categories</option>';
    categories.forEach(cat => {
      html += `<option value="${escapeHtml(cat)}" ${currentVal === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`;
    });
    catSelect.innerHTML = html;
  }
}

function filterGuestCards() {
  const search = (document.getElementById('guestCardSearchInput')?.value || '').toLowerCase().trim();
  const custId = document.getElementById('guestCardCustomerFilter')?.value || '';
  const category = document.getElementById('guestCardCategoryFilter')?.value || '';

  const filtered = allGuestEvents.filter(e => {
    const matchesSearch = !search ||
      (e.event_name && e.event_name.toLowerCase().includes(search)) ||
      (e.host_name && e.host_name.toLowerCase().includes(search)) ||
      (e.customer_name && e.customer_name.toLowerCase().includes(search)) ||
      (e.venue_name && e.venue_name.toLowerCase().includes(search));

    const matchesCust = !custId || String(e.customer_id) === String(custId);
    const matchesCat = !category || e.event_category === category;

    return matchesSearch && matchesCust && matchesCat;
  });

  renderGuestEventCards(filtered);
}

function renderGuestEventCards(events) {
  const container = document.getElementById('guestEventCardsGrid');
  if (!container) return;

  if (events.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5 palace-card p-4">
        <i class="fa-solid fa-calendar-xmark text-muted opacity-50 mb-3" style="font-size: 48px;"></i>
        <h5 class="fw-bold text-dark">No Events Found</h5>
        <p class="text-muted small">Create an event first to attach guest lists and Excel spreadsheets.</p>
        <button class="btn btn-sm btn-palace px-3 py-2 rounded-pill mt-2" onclick="openAddEventModal()">
          <i class="fa-solid fa-calendar-plus me-1"></i> + Create New Event
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = events.map(e => {
    const sender = e.whatsapp_account_name || 'Primary Palace WhatsApp';
    const totalGuests = e.total_guests || 0;
    const pendingRem = e.pending_reminders || 0;
    const sentRem = e.sent_reminders || 0;

    return `
      <div class="guest-event-card" onclick="openEventGuestList(${e.id})">
        <div class="guest-card-header">
          <span class="badge bg-light text-dark border px-2.5 py-1">
            <i class="fa-solid fa-tag text-muted me-1"></i> ${escapeHtml(e.event_category || 'Event')}
          </span>
          <span class="badge bg-palace-gold-soft text-dark px-2.5 py-1 font-monospace">
            <i class="fa-regular fa-calendar me-1 text-warning"></i> ${formatDate(e.event_date)}
          </span>
        </div>

        <h4 class="guest-card-title text-truncate" title="${escapeHtml(e.event_name)}">
          ${escapeHtml(e.event_name)}
        </h4>

        <div class="small text-muted mb-1">
          <i class="fa-solid fa-crown text-warning me-1"></i> <strong>Host:</strong> ${escapeHtml(e.host_name || '-')}
        </div>

        <div class="small text-muted mb-2">
          <i class="fa-solid fa-user-tie text-primary me-1"></i> <strong>Client:</strong> ${escapeHtml(e.customer_name)}
          <span class="badge bg-light text-dark border font-monospace ms-1" style="font-size: 10px;">${e.customer_code}</span>
        </div>

        <div class="small text-muted mb-2 text-truncate" title="${escapeHtml(e.venue_name || '-')}">
          <i class="fa-solid fa-location-dot text-danger me-1"></i> ${escapeHtml(e.venue_name || '-')}
        </div>

        <div class="small text-success mb-3 text-truncate" title="Sender WhatsApp">
          <i class="fa-brands fa-whatsapp me-1"></i> <strong>Sender:</strong> ${escapeHtml(sender)}
        </div>

        <!-- Metric Strip -->
        <div class="guest-metric-strip d-flex align-items-center justify-content-between mb-3">
          <div>
            <div class="fs-4 fw-bold text-dark font-monospace lh-1">${totalGuests}</div>
            <div class="text-muted" style="font-size: 11px;">Guests</div>
          </div>
          <div class="text-end">
            <span class="badge bg-warning-subtle text-warning-emphasis d-block mb-1" style="font-size: 11px;">
              ${pendingRem} Scheduled
            </span>
            <span class="badge bg-success-subtle text-success d-block" style="font-size: 11px;">
              ${sentRem} Sent
            </span>
          </div>
        </div>

        <!-- Action Buttons (Clean & Streamlined) -->
        <button class="btn btn-palace w-100 mb-2 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2 rounded-pill shadow-sm"
                onclick="event.stopPropagation(); openEventGuestList(${e.id})">
          <i class="fa-solid fa-users"></i>
          <span>Manage Guests & Excel (${totalGuests})</span>
          <i class="fa-solid fa-chevron-right ms-auto"></i>
        </button>

        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-success flex-grow-1 rounded-pill fw-semibold shadow-sm py-1.5"
                  onclick="event.stopPropagation(); openShareClientLinkModal(${e.id})"
                  title="Host WhatsApp Link">
            <i class="fa-brands fa-whatsapp text-success me-1"></i> Host Link
          </button>
          <button class="btn btn-sm btn-outline-warning rounded-pill fw-semibold shadow-sm px-2.5 py-1.5"
                  onclick="event.stopPropagation(); dispatchEventRemindersNow(${e.id}, '${escapeHtml(e.event_name)}')"
                  title="Send all reminders for this event now">
            <i class="fa-solid fa-paper-plane me-1"></i> Send Now
          </button>
          <button class="btn btn-sm btn-outline-danger rounded-pill shadow-sm px-2.5 py-1.5"
                  onclick="event.stopPropagation(); cancelOrDeleteEvent(${e.id}, '${escapeHtml(e.event_name)}')"
                  title="Delete this event">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/* ==============================================================
   DEDICATED EVENT GUEST WORKSPACE
   ============================================================== */
async function openEventGuestList(eventId) {
  currentEventWsId = eventId;
  const cardsView = document.getElementById('guestEventCardsView');
  const wsView = document.getElementById('eventGuestWorkspace');
  const masterTable = document.getElementById('guestMasterTableView');

  if (cardsView) cardsView.style.display = 'none';
  if (masterTable) masterTable.style.display = 'none';
  if (wsView) wsView.style.display = 'block';

  try {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Failed to load event guests', 'error');
      return;
    }

    currentEventWsData = data;
    renderEventGuestWorkspace(data);
  } catch (err) {
    showToast('Error loading event workspace: ' + err.message, 'error');
  }
}

function closeEventGuestWorkspace() {
  currentEventWsId = null;
  currentEventWsData = null;
  const cardsView = document.getElementById('guestEventCardsView');
  const wsView = document.getElementById('eventGuestWorkspace');
  if (wsView) wsView.style.display = 'none';
  if (cardsView) cardsView.style.display = 'block';
  loadGuestEventCards();
}

function renderEventGuestWorkspace(data) {
  const e = data.event;
  const guests = data.guests || [];
  const reminders = data.reminders || [];

  // Update Workspace Banner
  document.getElementById('eventWsTitle').textContent = e.event_name;
  document.getElementById('eventWsCategory').textContent = e.event_category || 'Event';
  document.getElementById('eventWsStatus').textContent = e.status;
  document.getElementById('eventWsCustomer').textContent = `${e.customer_name} (${e.customer_code})`;
  document.getElementById('eventWsHost').textContent = e.host_name || '-';
  document.getElementById('eventWsDateTime').textContent = `${formatDate(e.event_date)} at ${e.event_time}`;
  document.getElementById('eventWsVenue').textContent = e.venue_name || '-';
  document.getElementById('eventWsSender').textContent = e.whatsapp_account_name
    ? `${e.whatsapp_account_name} (${e.whatsapp_sender_phone ? '+' + e.whatsapp_sender_phone : 'Linked'})`
    : 'Primary Palace WhatsApp';

  // Stats
  document.getElementById('eventWsTotalGuests').textContent = guests.length;
  document.getElementById('eventWsGuestListCount').textContent = `${guests.length} Guest(s)`;

  const pendingCount = reminders.filter(r => ['Scheduled', 'Ready to Send'].includes(r.status)).length;
  const sentCount = reminders.filter(r => r.status === 'Sent').length;
  document.getElementById('eventWsScheduledReminders').textContent = pendingCount;
  document.getElementById('eventWsSentReminders').textContent = sentCount;

  // Render Guests Table for this event
  renderEventSpecificGuestsTable(guests);
}

function renderEventSpecificGuestsTable(guests) {
  const tbody = document.getElementById('eventWsGuestsTableBody');
  if (!tbody) return;

  if (guests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-muted">
          <i class="fa-solid fa-users-slash fs-2 mb-2 d-block opacity-50"></i>
          <div>No guests uploaded for this event yet.</div>
          <div class="mt-2">
            <button class="btn btn-sm btn-palace-gold me-2 rounded-pill shadow-sm" onclick="openExcelUploadForCurrentEvent()">
              <i class="fa-solid fa-file-excel text-success me-1"></i> Upload Excel Guest List
            </button>
            <button class="btn btn-sm btn-palace rounded-pill shadow-sm" onclick="openAddGuestForCurrentEvent()">
              <i class="fa-solid fa-user-plus me-1"></i> Add Single Guest
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = guests.map((g, idx) => {
    const waLink = `https://wa.me/${g.mobile.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello ' + (g.full_name || 'Guest') + ', Greetings from THE INVITATION PALACE!')}`;

    return `
      <tr>
        <td class="text-muted fw-bold">${idx + 1}</td>
        <td>
          <strong>${escapeHtml(g.full_name || 'Guest')}</strong>
          ${g.notes ? `<div class="small text-muted text-truncate" style="max-width: 200px;">${escapeHtml(g.notes)}</div>` : ''}
        </td>
        <td><code class="text-success fw-bold">${g.mobile}</code></td>
        <td><span class="badge bg-light text-dark border">${g.preferred_language || 'English'}</span></td>
        <td>
          ${g.consent_status ? '<span class="badge bg-success-subtle text-success"><i class="fa-solid fa-circle-check me-1"></i> Opted-In</span>' : '<span class="badge bg-secondary-subtle text-muted">Unconfirmed</span>'}
        </td>
        <td>
          <span class="badge ${g.rsvp_status === 'Accepted' ? 'bg-success-subtle text-success' : g.rsvp_status === 'Declined' ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning-emphasis'}">
            ${g.rsvp_status || 'Pending'}
          </span>
        </td>
        <td>
          <a href="${waLink}" target="_blank" class="btn btn-sm btn-outline-success px-2 py-1 rounded-pill" title="Send WhatsApp Message Directly">
            <i class="fa-brands fa-whatsapp text-success me-1"></i> Chat
          </a>
        </td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary table-action-btn" onclick="openEditGuestModal(${g.id})" title="Edit Guest">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-warning table-action-btn" onclick="unlinkGuestFromCurrentEvent(${g.id}, '${escapeHtml(g.full_name)}')" title="Remove from this Event">
              <i class="fa-solid fa-user-minus text-warning"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger table-action-btn" onclick="deleteGuest(${g.id}, '${escapeHtml(g.full_name)}')" title="Delete permanently">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterEventSpecificGuests() {
  if (!currentEventWsData || !currentEventWsData.guests) return;
  const q = (document.getElementById('eventWsGuestSearchInput')?.value || '').toLowerCase().trim();

  const filtered = currentEventWsData.guests.filter(g => {
    return !q ||
      (g.full_name && g.full_name.toLowerCase().includes(q)) ||
      (g.mobile && g.mobile.toLowerCase().includes(q)) ||
      (g.notes && g.notes.toLowerCase().includes(q));
  });

  renderEventSpecificGuestsTable(filtered);
}

function openExcelUploadForCurrentEvent() {
  if (currentEventWsId) {
    openExcelUploadModal(currentEventWsId);
  } else {
    openExcelUploadModal();
  }
}

function openAddGuestForCurrentEvent() {
  if (currentEventWsId) {
    openAddGuestModal(currentEventWsId);
  } else {
    openAddGuestModal();
  }
}

function dispatchCurrentEventReminders() {
  if (currentEventWsId) {
    openBatchDispatchModal(currentEventWsId);
  } else {
    openBatchDispatchModal();
  }
}

async function unlinkGuestFromCurrentEvent(guestId, guestName) {
  if (!currentEventWsId) return;
  if (!confirm(`Remove guest "${guestName}" from this specific event?`)) return;

  try {
    const res = await fetch(`/api/events/${currentEventWsId}/guests/${guestId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      await openEventGuestList(currentEventWsId);
    } else {
      showToast(data.error || 'Failed to remove guest', 'error');
    }
  } catch (err) {
    showToast('Error removing guest: ' + err.message, 'error');
  }
}

/* ==============================================================
   5.5 MASTER ALL GUESTS TABLE VIEW
   ============================================================== */
async function loadGuests() {
  const search = document.getElementById('guestSearchInput').value;
  const eventId = document.getElementById('guestEventFilter').value;

  try {
    const url = new URL('/api/guests', window.location.origin);
    if (search) url.searchParams.set('search', search);
    if (eventId) url.searchParams.set('eventId', eventId);

    const res = await fetch(url);
    const data = await res.json();

    await populateEventSelect('guestEventFilter', eventId);

    const tbody = document.getElementById('guestsTableBody');
    if (!data.guests || data.guests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No guests found. Add a single guest or upload an Excel file.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.guests.map(g => `
      <tr>
        <td><strong>${escapeHtml(g.full_name)}</strong></td>
        <td><code>${g.mobile}</code></td>
        <td>${g.preferred_language || 'English'}</td>
        <td>
          ${g.consent_status ? '<span class="badge bg-success-subtle text-success"><i class="fa-solid fa-circle-check"></i> Consented</span>' : '<span class="badge bg-danger-subtle text-danger">No Consent</span>'}
        </td>
        <td><span class="badge bg-light text-dark border">${g.total_events || 0} Event(s)</span></td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="openEditGuestModal(${g.id})" title="Edit">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteGuest(${g.id}, '${escapeHtml(g.full_name)}')" title="Delete">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading guests:', err);
  }
}

async function openAddGuestModal(preselectedEventId = null) {
  document.getElementById('guestModalTitle').textContent = 'Add Single Guest';
  document.getElementById('guestIdInput').value = '';
  document.getElementById('guestForm').reset();
  document.getElementById('guestConsentCheck').checked = true;
  await populateEventSelect('guestEventSelect', preselectedEventId);
  const modal = new bootstrap.Modal(document.getElementById('guestModal'));
  modal.show();
}

async function openEditGuestModal(id) {
  try {
    const res = await fetch(`/api/guests/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const g = data.guest;
    document.getElementById('guestModalTitle').textContent = 'Edit Guest Info';
    document.getElementById('guestIdInput').value = g.id;
    document.getElementById('guestNameInput').value = g.full_name;
    document.getElementById('guestMobileInput').value = g.mobile;
    document.getElementById('guestLangInput').value = g.preferred_language || 'English';
    document.getElementById('guestConsentCheck').checked = g.consent_status === 1;
    document.getElementById('guestNotesInput').value = g.notes || '';

    // Hide or disable event select in edit mode
    document.getElementById('guestEventSelect').innerHTML = '<option value="">(Manage events via Event details)</option>';

    const modal = new bootstrap.Modal(document.getElementById('guestModal'));
    modal.show();
  } catch (err) {
    showToast('Failed to load guest: ' + err.message, 'error');
  }
}

async function deleteGuest(id, name) {
  if (confirm(`Are you sure you want to permanently delete guest "${name}"?`)) {
    try {
      const res = await fetch(`/api/guests/${id}?force=true`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadGuests();
        if (currentGuestViewMode === 'cards') {
          loadGuestEventCards();
        }
        if (currentEventWsId) {
          openEventGuestList(currentEventWsId);
        }
      } else {
        showToast(data.error || 'Failed to delete guest', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

// Bulk Excel Upload Handling
async function openExcelUploadModal(preselectedEventId = null) {
  await populateEventSelect('excelTargetEventSelect', preselectedEventId);
  document.getElementById('excelFileInput').value = '';
  document.getElementById('excelValidationResults').style.display = 'none';
  parsedExcelRecords = [];
  const modal = new bootstrap.Modal(document.getElementById('excelUploadModal'));
  modal.show();
}

async function handlePreviewExcel() {
  const eventId = document.getElementById('excelTargetEventSelect').value;
  const fileInput = document.getElementById('excelFileInput');

  if (!eventId) {
    showToast('Please select the Target Event first.', 'error');
    return;
  }

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please choose an Excel (.xlsx) or CSV (.csv) file to upload.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('event_id', eventId);
  formData.append('file', fileInput.files[0]);

  const btn = document.getElementById('btnPreviewExcel');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Analyzing...';

  try {
    const res = await fetch('/api/guests/preview-import', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!data.success) {
      showToast(data.error || 'Could not parse file.', 'error');
      return;
    }

    const a = data.analysis;
    parsedExcelRecords = a.validRecords;

    document.getElementById('badgeValidCount').textContent = `${a.validCount} Valid Records`;
    document.getElementById('badgeInvalidCount').textContent = `${a.invalidCount} Invalid / Duplicates`;
    document.getElementById('tabValidCount').textContent = a.validCount;
    document.getElementById('tabInvalidCount').textContent = a.invalidCount;

    // Render Valid Table
    const validTbody = document.getElementById('excelValidTableBody');
    if (a.validRecords.length === 0) {
      validTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No valid records found in this file.</td></tr>`;
      document.getElementById('btnConfirmImport').disabled = true;
    } else {
      document.getElementById('btnConfirmImport').disabled = false;
      validTbody.innerHTML = a.validRecords.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(r.name)}</strong></td>
          <td><code>${r.mobile}</code></td>
          <td>${r.email || '-'}</td>
          <td>${r.language}</td>
          <td><span class="badge bg-success-subtle text-success">Consented</span></td>
          <td>${escapeHtml(r.notes || '-')}</td>
        </tr>
      `).join('');
    }

    // Render Invalid Table
    const invalidTbody = document.getElementById('excelInvalidTableBody');
    if (a.invalidRecords.length === 0) {
      invalidTbody.innerHTML = `<tr><td colspan="4" class="text-center text-success py-3"><i class="fa-solid fa-circle-check"></i> Perfect! No invalid records found.</td></tr>`;
    } else {
      invalidTbody.innerHTML = a.invalidRecords.map(r => `
        <tr>
          <td>${r.rowIndex}</td>
          <td>${escapeHtml(r.name || '<Missing>')}</td>
          <td><code>${r.rawMobile || '<Missing>'}</code></td>
          <td class="text-danger small">${r.issues.join('; ')}</td>
        </tr>
      `).join('');
    }

    document.getElementById('excelValidationResults').style.display = 'block';
  } catch (err) {
    showToast('Failed to preview file: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Preview & Validate';
  }
}

async function handleConfirmImport() {
  const eventId = document.getElementById('excelTargetEventSelect').value;

  if (!parsedExcelRecords || parsedExcelRecords.length === 0) {
    showToast('No valid records to import.', 'error');
    return;
  }

  const btn = document.getElementById('btnConfirmImport');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Importing...';

  try {
    const res = await fetch('/api/guests/confirm-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: parseInt(eventId, 10),
        records: parsedExcelRecords
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      bootstrap.Modal.getInstance(document.getElementById('excelUploadModal')).hide();
      loadGuests();
      loadEvents();
      loadDashboard();
      if (currentGuestViewMode === 'cards') {
        loadGuestEventCards();
      }
      if (currentEventWsId) {
        openEventGuestList(currentEventWsId);
      }
    } else {
      showToast(data.error || 'Import failed', 'error');
    }
  } catch (err) {
    showToast('Error during import: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Confirm & Import Valid Guests';
  }
}

/* ==============================================================
   6. REMINDERS VIEW & 100% FREE WHATSAPP DISPATCH
   ============================================================== */
async function loadReminders() {
  const status = document.getElementById('reminderStatusFilter').value;
  const eventId = document.getElementById('reminderEventFilter').value;
  const stage = document.getElementById('reminderStageFilter').value;
  const search = document.getElementById('reminderSearchInput').value;

  try {
    const url = new URL('/api/reminders', window.location.origin);
    if (status) url.searchParams.set('status', status);
    if (eventId) url.searchParams.set('eventId', eventId);
    if (stage) url.searchParams.set('stage', stage);
    if (search) url.searchParams.set('search', search);

    const res = await fetch(url);
    const data = await res.json();

    await populateEventSelect('reminderEventFilter', eventId);

    const tbody = document.getElementById('remindersTableBody');
    if (!data.reminders || data.reminders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No reminder records found matching filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.reminders.map(r => `
      <tr>
        <td>
          <strong>${escapeHtml(r.guest_name)}</strong>
          <div><code>${r.guest_phone}</code></div>
        </td>
        <td>
          <div><strong>${escapeHtml(r.event_name)}</strong></div>
          <small class="text-muted"><i class="fa-solid fa-crown text-warning me-1"></i> Host: ${escapeHtml(r.host_name)}</small>
        </td>
        <td><span class="badge bg-light text-dark border">${r.reminder_stage}</span></td>
        <td>
          <strong>${formatDate(r.scheduled_date)}</strong>
          <div class="small text-muted">${r.scheduled_time}</div>
        </td>
        <td>${getStatusBadge(r.status)}</td>
        <td>
          <button class="btn btn-sm btn-palace" onclick="openDispatchModal(${r.id})">
            <i class="fa-brands fa-whatsapp"></i> Preview & Send
          </button>
        </td>
        <td>
          <div class="d-flex gap-1">
            ${r.status !== 'Sent' && r.status !== 'Delivered' && r.status !== 'Cancelled' ? `
              <button class="btn btn-sm btn-outline-danger" onclick="cancelReminder(${r.id})" title="Cancel Reminder">
                <i class="fa-solid fa-xmark"></i>
              </button>
            ` : ''}
            ${r.status === 'Failed' ? `
              <button class="btn btn-sm btn-outline-warning" onclick="retryReminder(${r.id})" title="Retry Reminder">
                <i class="fa-solid fa-rotate-right"></i>
              </button>
            ` : ''}
            <button class="btn btn-sm btn-outline-danger" onclick="deleteReminderPermanently(${r.id})" title="Delete Reminder Permanently">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading reminders:', err);
  }
}

async function openDispatchModal(reminderId) {
  currentDispatchReminderId = reminderId;
  try {
    const res = await fetch(`/api/reminders/${reminderId}`);
    const data = await res.json();
    if (!data.success) return;

    const r = data.reminder;
    currentDispatchMessageText = data.freshMessage;

    document.getElementById('dispatchGuestDetailsBox').innerHTML = `
      <div class="row g-2">
        <div class="col-6"><strong>Guest:</strong> ${escapeHtml(r.guest_name)}</div>
        <div class="col-6"><strong>WhatsApp:</strong> <code>${r.guest_phone}</code></div>
        <div class="col-6"><strong>Event:</strong> ${escapeHtml(r.event_name)}</div>
        <div class="col-6"><strong>Host:</strong> ${escapeHtml(r.host_name)}</div>
        <div class="col-6"><strong>Stage:</strong> ${r.reminder_stage}</div>
        <div class="col-6"><strong>Status:</strong> ${getStatusBadge(r.status)}</div>
      </div>
    `;

    document.getElementById('dispatchModalMessageBubble').textContent = data.freshMessage;
    document.getElementById('dispatchModalWaLink').setAttribute('href', data.waLink);

    const modal = new bootstrap.Modal(document.getElementById('reminderDispatchModal'));
    modal.show();
  } catch (err) {
    showToast('Failed to prepare reminder dispatch: ' + err.message, 'error');
  }
}

function copyDispatchMessage() {
  if (!currentDispatchMessageText) return;
  navigator.clipboard.writeText(currentDispatchMessageText)
    .then(() => {
      showToast('Personalized reminder message copied to clipboard!', 'success');
    })
    .catch(() => {
      showToast('Could not access clipboard.', 'error');
    });
}

function onWaLinkClicked() {
  showToast('Opening official WhatsApp with pre-filled message...', 'dark');
}

async function confirmMarkSent() {
  if (!currentDispatchReminderId) return;

  try {
    const res = await fetch(`/api/reminders/${currentDispatchReminderId}/mark-sent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customMessage: currentDispatchMessageText })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Reminder marked as Sent and recorded into Message History!', 'success');
      bootstrap.Modal.getInstance(document.getElementById('reminderDispatchModal')).hide();
      loadReminders();
      loadDashboard();
    } else {
      showToast(data.error || 'Failed to update reminder', 'error');
    }
  } catch (err) {
    showToast('Error updating reminder: ' + err.message, 'error');
  }
}

async function cancelReminder(id) {
  if (confirm('Cancel this scheduled reminder?')) {
    try {
      const res = await fetch(`/api/reminders/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Reminder cancelled.', 'success');
        loadReminders();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

async function retryReminder(id) {
  try {
    const res = await fetch(`/api/reminders/${id}/retry`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Reminder reset to Ready to Send.', 'success');
      loadReminders();
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteReminderPermanently(id) {
  if (confirm('Delete this reminder permanently?')) {
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Reminder deleted', 'success');
        loadReminders();
        if (typeof loadDashboard === 'function') loadDashboard();
      } else {
        showToast(data.error || 'Failed to delete reminder', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function clearFailedSkippedReminders() {
  if (confirm('Are you sure you want to clear all Failed, Skipped, and Cancelled reminders?')) {
    try {
      const res = await fetch('/api/reminders/batch/failed-skipped', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadReminders();
        if (typeof loadDashboard === 'function') loadDashboard();
      } else {
        showToast(data.error || 'Failed to clear reminders', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

/* ==============================================================
   7. MESSAGE TEMPLATES VIEW
   ============================================================== */
async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (!data.success) return;

    currentTemplates = data.templates;
    selectTemplateStage(activeTemplateStage);
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

function selectTemplateStage(stageDays) {
  activeTemplateStage = stageDays;

  // Update tabs active state
  const tabs = document.querySelectorAll('#templateTabs .nav-link');
  tabs.forEach(t => {
    t.classList.toggle('active', t.textContent.includes(`${stageDays}-Day`));
  });

  const template = currentTemplates.find(t => t.stage_days === stageDays);
  if (template) {
    document.getElementById('currentTemplateId').value = template.id;
    document.getElementById('templateTextInput').value = template.template_text;
    updateLivePreview(template.template_text);
  }
}

function insertVariable(token) {
  const textarea = document.getElementById('templateTextInput');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;

  textarea.value = text.substring(0, start) + token + text.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + token.length;
  textarea.focus();
  updateLivePreview(textarea.value);
}

let previewDebounceTimer = null;
function updateLivePreview(text) {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_text: text })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('whatsappLivePreviewBubble').textContent = data.preview;
      }
    } catch (e) {}
  }, 250);
}

document.getElementById('templateTextInput')?.addEventListener('input', (e) => {
  updateLivePreview(e.target.value);
});

document.getElementById('templateEditForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('currentTemplateId').value;
  const text = document.getElementById('templateTextInput').value;

  try {
    const res = await fetch(`/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_text: text })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Template updated successfully!', 'success');
      loadTemplates();
    } else {
      showToast(data.error || 'Failed to update template', 'error');
    }
  } catch (err) {
    showToast('Error saving template: ' + err.message, 'error');
  }
});

function resetCurrentTemplateDefault() {
  const defaults = {
    7: `{{time_greeting}},\n\nWe are delighted to remind you about the upcoming {{event_name}} hosted by {{host_name}}.\n\nDate: {{event_date}}\nTime: {{event_time}}\nVenue: {{venue_name}}\nAddress: {{venue_address}}\n\nWe look forward to welcoming you and sharing this special occasion with you!\n\nRegards,\nTHE INVITATION PALACE`,
    3: `{{time_greeting}},\n\nJust 3 days to go!\n\nA friendly reminder about {{host_name}}'s upcoming {{event_name}}.\n\nDate: {{event_date}}\nTime: {{event_time}}\nVenue: {{venue_name}}\n\nWe look forward to seeing you!\n\nRegards,\nTHE INVITATION PALACE`,
    1: `{{time_greeting}},\n\nA gentle reminder that {{event_name}} hosted by {{host_name}} is happening tomorrow!\n\nTime: {{event_time}}\nVenue: {{venue_name}}\nAddress: {{venue_address}}\n\nWe hope to see you there!\n\nRegards,\nTHE INVITATION PALACE`
  };

  const def = defaults[activeTemplateStage];
  if (def) {
    document.getElementById('templateTextInput').value = def;
    updateLivePreview(def);
    showToast('Reset to default palace template. Click "Save Template" to apply.', 'dark');
  }
}

/* ==============================================================
   8. MESSAGE HISTORY VIEW
   ============================================================== */
async function loadMessageHistory() {
  const search = document.getElementById('historySearchInput').value;

  try {
    const url = new URL('/api/reports/history', window.location.origin);
    if (search) url.searchParams.set('search', search);

    const res = await fetch(url);
    const data = await res.json();

    const tbody = document.getElementById('historyTableBody');
    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No message dispatch history recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.history.map(h => `
      <tr>
        <td>${formatDateTime(h.created_at)}</td>
        <td>
          <strong>${escapeHtml(h.recipient_name)}</strong>
          <div class="small text-muted">${h.recipient_phone}</div>
        </td>
        <td>${escapeHtml(h.event_name || '-')}</td>
        <td><span class="badge bg-light text-dark border">${h.send_method}</span></td>
        <td>${getStatusBadge(h.status)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="alert('${escapeJs(h.message_text)}')">
            <i class="fa-regular fa-comment-dots"></i> View Text
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading history:', err);
  }
}

/* ==============================================================
   9. REPORTS VIEW
   ============================================================== */
async function loadReports() {
  try {
    // 1. Event stats
    const eventRes = await fetch('/api/reports/events');
    const eventData = await eventRes.json();
    const eventTbody = document.getElementById('reportEventsTableBody');

    if (!eventData.eventStats || eventData.eventStats.length === 0) {
      eventTbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-3">No event records available.</td></tr>`;
    } else {
      eventTbody.innerHTML = eventData.eventStats.map(e => `
        <tr>
          <td><strong>${escapeHtml(e.event_name)}</strong></td>
          <td>${escapeHtml(e.host_name)}</td>
          <td>${escapeHtml(e.customer_name)} (${e.customer_code})</td>
          <td>${formatDate(e.event_date)}</td>
          <td><span class="badge bg-secondary-subtle text-dark">${e.total_guests || 0}</span></td>
          <td><span class="badge bg-success-subtle text-success">${e.sent_count || 0}</span></td>
          <td><span class="badge bg-info-subtle text-info">${e.delivered_count || 0}</span></td>
          <td><span class="badge bg-warning-subtle text-warning">${e.pending_count || 0}</span></td>
          <td><span class="badge bg-danger-subtle text-danger">${e.failed_count || 0}</span></td>
        </tr>
      `).join('');
    }

    // 2. Customer stats
    const custRes = await fetch('/api/reports/customers');
    const custData = await custRes.json();
    const custTbody = document.getElementById('reportCustomersTableBody');

    if (!custData.customerStats || custData.customerStats.length === 0) {
      custTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No customer records available.</td></tr>`;
    } else {
      custTbody.innerHTML = custData.customerStats.map(c => `
        <tr>
          <td><code>${c.customer_code}</code></td>
          <td><strong>${escapeHtml(c.full_name)}</strong></td>
          <td>${c.mobile}</td>
          <td>${formatDate(c.registration_date)}</td>
          <td>${c.total_events || 0}</td>
          <td>${c.total_guests || 0}</td>
          <td><span class="badge bg-success-subtle text-success">${c.sent_reminders || 0}</span></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

/* ==============================================================
   10. SETTINGS VIEW
   ============================================================== */
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.success) return;

    const s = data.settings;
    document.getElementById('set_business_name').value = s.business_name || '';
    document.getElementById('set_business_phone').value = s.business_phone || '';
    document.getElementById('set_business_email').value = s.business_email || '';
    document.getElementById('set_business_address').value = s.business_address || '';
    document.getElementById('set_default_country_code').value = s.default_country_code || '+91';
    document.getElementById('set_default_timezone').value = s.default_timezone || 'Asia/Kolkata';

    // Branding settings
    const brandNameInput = document.getElementById('brandCompanyNameInput');
    const brandTaglineInput = document.getElementById('brandTaglineInput');
    if (brandNameInput) brandNameInput.value = s.business_name || '';
    if (brandTaglineInput) brandTaglineInput.value = s.business_tagline || '';

    const settingsLogoImg = document.getElementById('settingsCurrentLogoImg');
    const settingsFallback = document.getElementById('settingsLogoFallbackCrest');
    if (settingsLogoImg && settingsFallback) {
      const activeLogo = s.company_logo || '/images/company-logo.png';
      settingsLogoImg.src = activeLogo;
      settingsLogoImg.classList.remove('d-none');
      settingsFallback.classList.add('d-none');
    }

    // WhatsApp settings
    document.getElementById('set_whatsapp_mode').value = s.whatsapp_mode || 'manual_free';
    document.getElementById('set_meta_phone_number_id').value = s.meta_phone_number_id || '';
    document.getElementById('set_meta_waba_id').value = s.meta_waba_id || '';
    document.getElementById('set_meta_access_token').value = s.meta_access_token || '';
    document.getElementById('set_meta_api_version').value = s.meta_api_version || 'v21.0';
    document.getElementById('set_meta_api_enabled').checked = s.meta_api_enabled === '1';

    toggleMetaApiFields();
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function toggleMetaApiFields() {
  const mode = document.getElementById('set_whatsapp_mode').value;
  const container = document.getElementById('metaCloudApiFields');
  container.style.display = mode === 'meta_cloud_api' ? 'block' : 'none';
}

document.getElementById('set_whatsapp_mode')?.addEventListener('change', toggleMetaApiFields);

// Save Business Settings
document.getElementById('businessSettingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData.entries());

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Business details updated successfully!', 'success');
    }
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
});

// Save WhatsApp Settings
document.getElementById('whatsappSettingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    whatsapp_mode: form.whatsapp_mode.value,
    meta_phone_number_id: form.meta_phone_number_id.value,
    meta_waba_id: form.meta_waba_id.value,
    meta_access_token: form.meta_access_token.value,
    meta_api_version: form.meta_api_version.value,
    meta_api_enabled: form.meta_api_enabled.checked ? '1' : '0'
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('WhatsApp configuration saved!', 'success');
    }
  } catch (err) {
    showToast('Failed to save WhatsApp settings: ' + err.message, 'error');
  }
});

// Change Password
document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const current_password = document.getElementById('currPassword').value;
  const new_password = document.getElementById('newPassword').value;

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password, new_password })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Admin password changed successfully!', 'success');
      e.target.reset();
    } else {
      showToast(data.error || 'Password update failed', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
});

// Restore Database Form
document.getElementById('dbRestoreForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('dbRestoreFileInput');
  if (!fileInput.files || fileInput.files.length === 0) return;

  if (!confirm('CAUTION: Restoring a database file will overwrite all current data. Do you wish to continue?')) {
    return;
  }

  const formData = new FormData();
  formData.append('backup_file', fileInput.files[0]);

  try {
    const res = await fetch('/api/settings/restore', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('Database restored successfully! Refreshing...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showToast(data.error || 'Database restore failed', 'error');
    }
  } catch (err) {
    showToast('Restore error: ' + err.message, 'error');
  }
});

/* ==============================================================
   10.5 COMPANY BRANDING & LOGO CONTROLLER
   ============================================================== */
let currentPalaceBranding = {
  business_name: 'THE INVITATION PALACE',
  business_tagline: 'Luxury Wedding & Event Stationery',
  company_logo: ''
};

async function loadBranding() {
  try {
    const res = await fetch('/api/settings/public');
    const data = await res.json();
    if (!data.success || !data.settings) return;

    currentPalaceBranding = data.settings;
    const s = currentPalaceBranding;
    const activeLogo = s.company_logo || '/images/company-logo.png';
    s.company_logo = activeLogo;

    // Cache locally for instant loading across reloads and logins
    try {
      localStorage.setItem('palace_company_logo', activeLogo);
      if (s.business_name) localStorage.setItem('palace_business_name', s.business_name);
    } catch (e) {}

    // Sidebar Branding
    const brandNameEl = document.getElementById('sidebarBrandName');
    const brandSubEl = document.getElementById('sidebarBrandSubtitle');
    const sidebarLogo = document.getElementById('sidebarCompanyLogo');
    const sidebarIcon = document.getElementById('sidebarBrandIcon');

    if (brandNameEl) brandNameEl.textContent = s.business_name || 'THE INVITATION PALACE';
    if (brandSubEl) brandSubEl.textContent = s.business_tagline || 'WhatsApp Reminder System';

    if (sidebarLogo) {
      sidebarLogo.src = activeLogo;
      sidebarLogo.classList.remove('d-none');
      if (sidebarIcon) sidebarIcon.classList.add('d-none');
    }

    // Top Header Crumb
    const headerLogo = document.getElementById('headerBrandLogo');
    const headerCrown = document.getElementById('headerCrownIcon');
    const headerText = document.getElementById('headerBrandText');

    if (headerText) headerText.textContent = s.business_name || 'THE INVITATION PALACE';
    if (headerLogo) {
      headerLogo.src = activeLogo;
      headerLogo.classList.remove('d-none');
      if (headerCrown) headerCrown.classList.add('d-none');
    }

    // Profile Strip Brand
    const deckProfileBrand = document.getElementById('deckProfileBrandName');
    if (deckProfileBrand) deckProfileBrand.textContent = s.business_name || 'THE INVITATION PALACE';

    // Document Title
    document.title = (s.business_name || 'THE INVITATION PALACE') + ' | Event Reminder System';

    // Settings Preview (if on settings view)
    const settingsLogo = document.getElementById('settingsCurrentLogoImg');
    const settingsCrest = document.getElementById('settingsLogoFallbackCrest');
    if (settingsLogo) {
      settingsLogo.src = activeLogo;
      settingsLogo.classList.remove('d-none');
      if (settingsCrest) settingsCrest.classList.add('d-none');
    }

    // Inputs
    const brandNameInp = document.getElementById('brandCompanyNameInput');
    const brandTagInp = document.getElementById('brandTaglineInput');
    if (brandNameInp) brandNameInp.value = s.business_name || '';
    if (brandTagInp) brandTagInp.value = s.business_tagline || '';
  } catch (err) {
    console.warn('Could not load branding settings:', err);
  }
}

function openBrandingModal() {
  const modalName = document.getElementById('modalCompanyNameInput');
  const modalTag = document.getElementById('modalCompanyTaglineInput');
  const modalLogoImg = document.getElementById('modalLogoPreviewImg');
  const modalFallback = document.getElementById('modalLogoFallbackCrest');
  const fileInput = document.getElementById('modalLogoFileInput');

  if (fileInput) fileInput.value = '';
  if (modalName) modalName.value = currentPalaceBranding.business_name || 'THE INVITATION PALACE';
  if (modalTag) modalTag.value = currentPalaceBranding.business_tagline || 'Luxury Wedding & Event Stationery';

  if (modalLogoImg) {
    const activeLogo = currentPalaceBranding.company_logo || '/images/company-logo.png';
    modalLogoImg.src = activeLogo;
    modalLogoImg.classList.remove('d-none');
    if (modalFallback) modalFallback.classList.add('d-none');
  }

  const modal = new bootstrap.Modal(document.getElementById('brandingModal'));
  modal.show();
}

function openWorkflowModal() {
  const modal = new bootstrap.Modal(document.getElementById('workflowGuideModal'));
  modal.show();
}

async function handleResetLogo() {
  if (!confirm('Are you sure you want to reset your company logo to the default royal monogram?')) {
    return;
  }

  try {
    const res = await fetch('/api/settings/logo', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      try { localStorage.removeItem('palace_company_logo'); } catch (e) {}
      await loadBranding();
      if (document.getElementById('section-settings')?.classList.contains('active')) {
        loadSettings();
      }
      const modalEl = document.getElementById('brandingModal');
      if (modalEl && bootstrap.Modal.getInstance(modalEl)) {
        bootstrap.Modal.getInstance(modalEl).hide();
      }
    } else {
      showToast(data.error || 'Failed to reset logo.', 'error');
    }
  } catch (err) {
    showToast('Error resetting logo: ' + err.message, 'error');
  }
}

function setupLogoLivePreview(inputElId, previewImgId, fallbackId) {
  const fileInput = document.getElementById(inputElId);
  const previewImg = document.getElementById(previewImgId);
  const fallback = document.getElementById(fallbackId);

  if (!fileInput || !previewImg) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        previewImg.src = evt.target.result;
        previewImg.classList.remove('d-none');
        if (fallback) fallback.classList.add('d-none');
      };
      reader.readAsDataURL(file);
    }
  });
}

async function handleBrandingFormSubmit(formEl, modalIdToHide = null) {
  const btn = formEl.querySelector('button[type="submit"]');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Uploading...';
  }

  try {
    const fileInput = formEl.querySelector('input[type="file"]');
    const businessNameInput = formEl.querySelector('input[name="business_name"]');
    const taglineInput = formEl.querySelector('input[name="business_tagline"]');

    let base64Logo = null;
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      base64Logo = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });
    }

    const payload = {
      business_name: businessNameInput ? businessNameInput.value.trim() : '',
      business_tagline: taglineInput ? taglineInput.value.trim() : ''
    };
    if (base64Logo) {
      payload.logo_base64 = base64Logo;
    }

    const res = await fetch('/api/settings/logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      if (data.logoUrl) {
        try { localStorage.setItem('palace_company_logo', data.logoUrl); } catch (e) {}
      }
      await loadBranding();
      if (modalIdToHide) {
        bootstrap.Modal.getInstance(document.getElementById(modalIdToHide))?.hide();
      }
      if (document.getElementById('section-settings')?.classList.contains('active')) {
        loadSettings();
      }
    } else {
      showToast(data.error || 'Failed to apply branding.', 'error');
    }
  } catch (err) {
    showToast('Failed to upload logo: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

/* ==============================================================
   11. FORM HANDLERS & MODAL SUBMITS
   ============================================================== */
function setupEventListeners() {
  // Customer Form Submit
  document.getElementById('customerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('customerIdInput').value;
    const payload = {
      full_name: document.getElementById('custNameInput').value,
      mobile: document.getElementById('custMobileInput').value,
      email: document.getElementById('custEmailInput').value,
      order_reference: document.getElementById('custOrderRefInput').value,
      address: document.getElementById('custAddressInput').value,
      status: document.getElementById('custStatusInput').value,
      notes: document.getElementById('custNotesInput').value
    };

    try {
      const url = id ? `/api/customers/${id}` : '/api/customers';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        bootstrap.Modal.getInstance(document.getElementById('customerModal')).hide();
        loadCustomers();
        loadDashboard();
      } else {
        showToast(data.error || 'Failed to save customer', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // Event Form Submit
  document.getElementById('eventForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('eventIdInput').value;
    const waSelect = document.getElementById('eventWhatsAppAccountSelect');
    const whatsappAccountId = waSelect && waSelect.value ? parseInt(waSelect.value, 10) : null;
    const payload = {
      customer_id: parseInt(document.getElementById('eventCustomerSelect').value, 10),
      whatsapp_account_id: whatsappAccountId,
      event_category: document.getElementById('eventCategorySelect').value,
      event_name: document.getElementById('eventNameInput').value,
      host_name: document.getElementById('eventHostNameInput').value,
      event_date: document.getElementById('eventDateInput').value,
      event_time: document.getElementById('eventTimeInput').value,
      venue_name: document.getElementById('eventVenueNameInput').value,
      venue_address: document.getElementById('eventVenueAddressInput').value,
      maps_link: document.getElementById('eventMapsLinkInput').value,
      reminder_days: document.getElementById('eventReminderDaysInput').value,
      reminder_time: document.getElementById('eventReminderTimeInput').value,
      description: document.getElementById('eventDescInput').value
    };

    try {
      const url = id ? `/api/events/${id}` : '/api/events';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        bootstrap.Modal.getInstance(document.getElementById('eventModal')).hide();
        loadEvents();
        loadDashboard();
      } else {
        showToast(data.error || 'Failed to save event', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // Guest Form Submit
  document.getElementById('guestForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('guestIdInput').value;
    const event_id = document.getElementById('guestEventSelect').value;

    const payload = {
      full_name: document.getElementById('guestNameInput').value,
      mobile: document.getElementById('guestMobileInput').value,
      preferred_language: document.getElementById('guestLangInput').value,
      consent_status: document.getElementById('guestConsentCheck').checked ? 1 : 0,
      notes: document.getElementById('guestNotesInput').value,
      event_id: event_id ? parseInt(event_id, 10) : null
    };

    try {
      const url = id ? `/api/guests/${id}` : '/api/guests';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        bootstrap.Modal.getInstance(document.getElementById('guestModal')).hide();
        loadGuests();
        loadDashboard();
        if (currentGuestViewMode === 'cards') {
          loadGuestEventCards();
        }
        if (currentEventWsId) {
          openEventGuestList(currentEventWsId);
        }
      } else {
        showToast(data.error || 'Failed to save guest', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // Branding Form Submit (Settings View)
  document.getElementById('brandingUploadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleBrandingFormSubmit(e.target);
  });

  // Branding Form Submit (Modal)
  document.getElementById('modalBrandingForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleBrandingFormSubmit(e.target, 'brandingModal');
  });

  // Setup Live Logo Previews
  setupLogoLivePreview('companyLogoFileInput', 'settingsCurrentLogoImg', 'settingsLogoFallbackCrest');
  setupLogoLivePreview('modalLogoFileInput', 'modalLogoPreviewImg', 'modalLogoFallbackCrest');

  // Workflow Guide collapse icon and text toggle
  const workflowCollapseEl = document.getElementById('workflowCollapse');
  if (workflowCollapseEl) {
    workflowCollapseEl.addEventListener('hidden.bs.collapse', () => {
      const icon = document.getElementById('workflowChevronIcon');
      const text = document.getElementById('workflowToggleText');
      if (icon) icon.className = 'fa-solid fa-chevron-down me-1';
      if (text) text.textContent = 'View S.NO Steps';
    });
    workflowCollapseEl.addEventListener('shown.bs.collapse', () => {
      const icon = document.getElementById('workflowChevronIcon');
      const text = document.getElementById('workflowToggleText');
      if (icon) icon.className = 'fa-solid fa-chevron-up me-1';
      if (text) text.textContent = 'Minimize Steps';
    });
  }
}

/* ==============================================================
   6.5. SMART AUTOMATED BATCH WHATSAPP DISPATCHER (OPTION C)
   1-Click Full Queue Dispatch with 10-Message / 30-Min Cooldown Batches
   Supports Direct Background Dispatch via Linked WhatsApp!
   ============================================================== */
let batchQueue = [];
let batchIndex = 0;
let batchSentCount = 0;
let batchSkippedCount = 0;
let batchLimit = 10;
let batchIntervalMinutes = 30;
let currentBatchNumber = 1;
let totalBatches = 1;
let itemsSentInCurrentBatch = 0;
let batchAdvanceTimer = null;
let cooldownIntervalTimer = null;
let cooldownSecondsRemaining = 0;

let isWhatsAppLinked = false;
let currentLinkedPhone = null;
let allWhatsAppAccounts = [];
let currentActiveAccountId = null;
let waModalPollTimer = null;

// Check WhatsApp Link State on load & update header button
async function checkWhatsAppConnectionStatus() {
  try {
    const res = await fetch('/api/whatsapp/accounts');
    const data = await res.json();
    if (!data.success) return;

    allWhatsAppAccounts = data.accounts || [];
    const connected = allWhatsAppAccounts.filter(a => a.status === 'CONNECTED');

    const btn = document.getElementById('btnHeaderWhatsAppStatus');
    const label = document.getElementById('headerWhatsAppStatusText');
    const dot = document.getElementById('waStatusDot');
    const noticeText = document.getElementById('batchWhatsAppStatusNoticeText');

    if (connected.length > 0) {
      isWhatsAppLinked = true;
      currentLinkedPhone = connected[0].phone_number || 'Linked';

      if (label) {
        label.textContent = connected.length === 1 
          ? `Linked (+${currentLinkedPhone})` 
          : `${connected.length} Senders Linked`;
      }
      if (btn) {
        btn.className = 'btn btn-sm btn-wa-pill connected d-flex align-items-center gap-2 shadow-sm px-3 py-2 rounded-pill';
      }
      if (dot) {
        dot.className = 'status-indicator-dot online';
      }
      if (noticeText) {
        noticeText.innerHTML = `<strong>🟢 WhatsApp Senders Active (${connected.length} linked):</strong> 1-Click sends to all guests in the background without opening tabs!`;
      }
    } else {
      isWhatsAppLinked = false;
      currentLinkedPhone = null;

      if (label) label.textContent = 'Link WhatsApp';
      if (btn) {
        btn.className = 'btn btn-sm btn-wa-pill d-flex align-items-center gap-2 shadow-sm px-3 py-2 rounded-pill';
      }
      if (dot) {
        dot.className = 'status-indicator-dot offline';
      }
      if (noticeText) {
        noticeText.innerHTML = `<strong>⚠️ WhatsApp Not Linked:</strong> Click <em>Scan QR</em> to link your phone, or batch dispatch will open browser tabs.`;
      }
    }
  } catch (err) {
    console.error('Error checking WhatsApp status:', err);
  }
}

// Open Multi-WhatsApp Accounts Modal
async function openWhatsAppLinkModal() {
  const modalEl = document.getElementById('whatsappLinkModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  await loadWhatsAppAccountsInModal();

  clearInterval(waModalPollTimer);
  waModalPollTimer = setInterval(() => {
    if (currentActiveAccountId) {
      pollActiveAccountStatus(currentActiveAccountId);
    }
  }, 3000);

  modalEl.addEventListener('hidden.bs.modal', () => {
    clearInterval(waModalPollTimer);
    checkWhatsAppConnectionStatus();
  }, { once: true });
}

async function loadWhatsAppAccountsInModal(selectId = null) {
  try {
    const res = await fetch('/api/whatsapp/accounts');
    const data = await res.json();
    if (!data.success) return;

    allWhatsAppAccounts = data.accounts || [];
    renderWhatsAppAccountsList();

    const targetId = selectId || currentActiveAccountId || (allWhatsAppAccounts[0] ? allWhatsAppAccounts[0].id : null);
    if (targetId) {
      await selectWhatsAppAccount(targetId);
    }
  } catch (err) {
    console.error('Error loading accounts:', err);
  }
}

function renderWhatsAppAccountsList() {
  const container = document.getElementById('waAccountsListGroup');
  if (!container) return;

  if (allWhatsAppAccounts.length === 0) {
    container.innerHTML = `<div class="p-3 text-center text-muted small">No WhatsApp accounts configured. Click "+ Link Another Number" to start.</div>`;
    return;
  }

  container.innerHTML = allWhatsAppAccounts.map(acc => {
    const isSelected = acc.id === currentActiveAccountId;
    const isConn = acc.status === 'CONNECTED';
    const isScan = acc.status === 'SCAN_QR';

    let badge = `<span class="badge bg-secondary-subtle text-muted">Disconnected</span>`;
    if (isConn) {
      badge = `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="fa-solid fa-circle-check me-1"></i> Connected</span>`;
    } else if (isScan) {
      badge = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle"><i class="fa-solid fa-qrcode me-1"></i> Ready to Scan</span>`;
    }

    return `
      <a href="javascript:void(0)" onclick="selectWhatsAppAccount(${acc.id})" 
         class="list-group-item list-group-item-action p-3 ${isSelected ? 'active bg-light border-success text-dark' : ''}">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="fw-bold">${escapeHtml(acc.account_name)} ${acc.is_default ? '<span class="badge bg-warning text-dark small ms-1"><i class="fa-solid fa-star"></i> Default</span>' : ''}</div>
            <div class="text-muted small font-monospace">${acc.phone_number ? '+' + acc.phone_number : 'No number linked'}</div>
            <div class="small mt-1 text-primary"><i class="fa-solid fa-calendar-check me-1"></i> ${acc.assigned_events_count || 0} Event(s) assigned</div>
            <div class="mt-2">
              <button class="btn btn-xs btn-outline-success rounded-pill py-0.5 px-2.5 fw-semibold" 
                      onclick="event.stopPropagation(); openShareClientLinkModal(null, ${acc.id})" 
                      title="Share link for this number">
                <i class="fa-solid fa-share-nodes me-1"></i> Share Link
              </button>
              ${!acc.is_default ? `
                <button class="btn btn-xs btn-outline-danger rounded-pill py-0.5 px-2 fw-semibold ms-1"
                        onclick="event.stopPropagation(); removeWhatsAppAccount(${acc.id}, '${escapeHtml(acc.account_name)}')"
                        title="Remove this WhatsApp account">
                  <i class="fa-solid fa-trash-can me-1"></i> Remove
                </button>
              ` : ''}
            </div>
          </div>
          <div>${badge}</div>
        </div>
      </a>
    `;
  }).join('');
}

async function selectWhatsAppAccount(accountId) {
  currentActiveAccountId = accountId;
  renderWhatsAppAccountsList();

  const account = allWhatsAppAccounts.find(a => a.id === accountId);
  if (!account) return;

  document.getElementById('waActiveAccountTitle').textContent = account.account_name;
  document.getElementById('waActiveAccountSubtitle').textContent = account.is_default ? 'Default Primary Sender' : 'Dedicated Event Sender';

  // Update default button visibility
  const defBtn = document.getElementById('waMakeDefaultBtn');
  if (defBtn) {
    defBtn.style.display = account.is_default ? 'none' : 'inline-block';
  }

  await pollActiveAccountStatus(accountId);
}

async function pollActiveAccountStatus(accountId) {
  try {
    const res = await fetch(`/api/whatsapp/accounts/${accountId}/status`);
    const data = await res.json();
    if (!data.success) return;

    const qrBox = document.getElementById('waQrContainer');
    const connBox = document.getElementById('waConnectedContainer');
    const idleBox = document.getElementById('waIdleContainer');
    const badge = document.getElementById('waActiveAccountStatusBadge');

    if (data.status === 'CONNECTED') {
      qrBox.style.display = 'none';
      idleBox.style.display = 'none';
      connBox.style.display = 'block';
      document.getElementById('waConnectedPhone').textContent = `+${data.userPhone || 'Linked'}`;
      badge.className = 'badge bg-success';
      badge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> Online & Connected';
    } else if (data.status === 'SCAN_QR' && data.qrDataUrl) {
      connBox.style.display = 'none';
      idleBox.style.display = 'none';
      qrBox.style.display = 'block';
      document.getElementById('waQrLoading').style.display = 'none';
      const qrImg = document.getElementById('waQrImage');
      qrImg.src = data.qrDataUrl;
      qrImg.style.display = 'inline-block';
      badge.className = 'badge bg-warning text-dark';
      badge.innerHTML = '<i class="fa-solid fa-qrcode me-1"></i> Waiting for Phone Scan';
    } else {
      connBox.style.display = 'none';
      qrBox.style.display = 'none';
      idleBox.style.display = 'block';
      badge.className = 'badge bg-secondary';
      badge.innerHTML = '<i class="fa-solid fa-power-off me-1"></i> Disconnected';
    }
  } catch (err) {}
}

function toggleNewAccountForm() {
  const box = document.getElementById('waNewAccountFormBox');
  if (box.style.display === 'none') {
    box.style.display = 'block';
    document.getElementById('waNewAccountNameInput').focus();
  } else {
    box.style.display = 'none';
  }
}

async function handleCreateWhatsAppAccount() {
  const name = document.getElementById('waNewAccountNameInput').value.trim();
  if (!name) {
    showToast('Please enter an account name (e.g. Jenny Wedding Number)', 'error');
    return;
  }

  try {
    const res = await fetch('/api/whatsapp/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_name: name })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Failed to create account', 'error');
      return;
    }

    showToast('Account added! Starting QR code generation...', 'success');
    document.getElementById('waNewAccountNameInput').value = '';
    document.getElementById('waNewAccountFormBox').style.display = 'none';

    await loadWhatsAppAccountsInModal(data.accountId);
    await startActiveAccountConnection(true);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function removeWhatsAppAccount(id, name) {
  if (!confirm(`Are you sure you want to remove WhatsApp account "${name}"?`)) return;
  try {
    const res = await fetch(`/api/whatsapp/accounts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('WhatsApp account removed', 'success');
      currentActiveAccountId = null;
      await loadWhatsAppAccountsInModal();
    } else {
      showToast(data.error || 'Failed to remove account', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function startActiveAccountConnection(force = false) {
  if (!currentActiveAccountId) return;

  document.getElementById('waIdleContainer').style.display = 'none';
  document.getElementById('waConnectedContainer').style.display = 'none';
  document.getElementById('waQrContainer').style.display = 'block';
  document.getElementById('waQrImage').style.display = 'none';
  document.getElementById('waQrLoading').style.display = 'block';

  try {
    const res = await fetch(`/api/whatsapp/accounts/${currentActiveAccountId}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    });
    const data = await res.json();
    if (data.qrDataUrl) {
      document.getElementById('waQrLoading').style.display = 'none';
      const qrImg = document.getElementById('waQrImage');
      qrImg.src = data.qrDataUrl;
      qrImg.style.display = 'inline-block';
    }
    await pollActiveAccountStatus(currentActiveAccountId);
  } catch (err) {
    showToast('Failed to connect: ' + err.message, 'error');
  }
}

async function requestNewWhatsAppQr() {
  await startActiveAccountConnection(true);
}

async function disconnectWhatsAppDevice() {
  if (!currentActiveAccountId) return;
  if (confirm('Unlink this specific WhatsApp number?')) {
    try {
      await fetch(`/api/whatsapp/accounts/${currentActiveAccountId}/disconnect`, { method: 'POST' });
      showToast('Account disconnected.', 'dark');
      await loadWhatsAppAccountsInModal(currentActiveAccountId);
      checkWhatsAppConnectionStatus();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

async function handleMakeAccountDefault() {
  if (!currentActiveAccountId) return;
  try {
    const res = await fetch(`/api/whatsapp/accounts/${currentActiveAccountId}/set-default`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Set as default sender.', 'success');
      await loadWhatsAppAccountsInModal(currentActiveAccountId);
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Populate Event WhatsApp Accounts Select Dropdown
async function populateEventWhatsAppSelect(preselectedId = null) {
  const select = document.getElementById('eventWhatsAppAccountSelect');
  if (!select) return;

  try {
    const res = await fetch('/api/whatsapp/accounts');
    const data = await res.json();
    if (!data.success) return;

    let html = '<option value="">Default (Primary Palace WhatsApp)</option>';
    (data.accounts || []).forEach(acc => {
      const isSel = preselectedId && String(preselectedId) === String(acc.id) ? 'selected' : '';
      const phone = acc.phone_number ? `(+${acc.phone_number})` : '(Not linked yet)';
      const statusIcon = acc.status === 'CONNECTED' ? '🟢' : '⚪';
      html += `<option value="${acc.id}" ${isSel}>${statusIcon} ${escapeHtml(acc.account_name)} ${phone}</option>`;
    });
    select.innerHTML = html;
  } catch (e) {}
}

async function openBatchDispatchModal(preselectedEventId = null) {
  stopBatchDispatch();
  await checkWhatsAppConnectionStatus();
  await populateEventSelect('batchEventSelect', preselectedEventId, 'All Events (Due / Pending Reminders)');

  document.getElementById('batchSetupView').style.display = 'block';
  document.getElementById('batchRunnerView').style.display = 'none';
  document.getElementById('batchCompleteView').style.display = 'none';

  const modal = new bootstrap.Modal(document.getElementById('batchDispatchModal'));
  modal.show();
}

async function initiateBatchQueue() {
  const eventId = document.getElementById('batchEventSelect').value;
  const status = document.getElementById('batchStatusSelect').value;

  batchLimit = parseInt(document.getElementById('batchSizeSelect').value, 10) || 10;
  batchIntervalMinutes = parseInt(document.getElementById('batchIntervalSelect').value, 10);
  if (isNaN(batchIntervalMinutes)) batchIntervalMinutes = 30;

  try {
    const url = new URL('/api/reminders/batch-queue', window.location.origin);
    if (eventId) url.searchParams.set('eventId', eventId);
    if (status) url.searchParams.set('status', status);

    const res = await fetch(url);
    const data = await res.json();

    if (!data.success || !data.queue || data.queue.length === 0) {
      showToast('No pending reminders found in this queue.', 'dark');
      return;
    }

    batchQueue = data.queue;
    batchIndex = 0;
    batchSentCount = 0;
    batchSkippedCount = 0;
    currentBatchNumber = 1;
    itemsSentInCurrentBatch = 0;
    totalBatches = Math.ceil(batchQueue.length / batchLimit);

    document.getElementById('batchSetupView').style.display = 'none';
    document.getElementById('batchRunnerView').style.display = 'block';
    document.getElementById('batchCompleteView').style.display = 'none';
    document.getElementById('batchCooldownCard').style.display = 'none';
    document.getElementById('activeSendingCard').style.display = 'block';

    // Start 1-Click Automated Dispatch
    runNextInBatch();
  } catch (err) {
    showToast('Failed to load batch queue: ' + err.message, 'error');
  }
}

async function runNextInBatch() {
  clearTimeout(batchAdvanceTimer);

  // Check if entire queue is completed
  if (batchIndex >= batchQueue.length) {
    showBatchComplete();
    return;
  }

  // Check if current batch of 10 messages has been reached
  if (itemsSentInCurrentBatch >= batchLimit) {
    if (batchIntervalMinutes > 0) {
      startBatchCooldown();
      return;
    } else {
      itemsSentInCurrentBatch = 0;
      currentBatchNumber++;
    }
  }

  const current = batchQueue[batchIndex];
  const total = batchQueue.length;
  const currentNum = batchIndex + 1;
  const percent = Math.round((currentNum / total) * 100);

  // Update UI Elements
  document.getElementById('batchProgressText').textContent = `Processing Guest ${currentNum} of ${total}`;
  document.getElementById('batchPercentText').textContent = `${percent}%`;
  document.getElementById('batchProgressBar').style.width = `${percent}%`;

  document.getElementById('currentBatchBadge').textContent = `Batch ${currentBatchNumber} of ${totalBatches}`;
  document.getElementById('currentBatchInfoText').textContent = `Message ${itemsSentInCurrentBatch + 1} of max ${batchLimit} in this batch`;

  document.getElementById('batchCurrentPhone').textContent = current.guestPhone;
  document.getElementById('batchCurrentEvent').textContent = `${current.eventName} (${current.hostName})`;
  document.getElementById('batchCurrentStage').textContent = current.reminderStage;

  document.getElementById('batchCounterStats').textContent = `Dispatched: ${batchSentCount} | Remaining: ${total - batchSentCount}`;

  // Mode 1: DIRECT BACKGROUND SEND (If WhatsApp is linked via QR code!)
  if (isWhatsAppLinked) {
    document.getElementById('batchCurrentStatusMsg').innerHTML = `<span class="spinner-grow spinner-grow-sm me-1 text-success"></span> Sending directly in background to ${current.guestPhone}...`;

    try {
      const directRes = await fetch(`/api/reminders/${current.reminderId}/send-direct`, {
        method: 'POST'
      });
      const directData = await directRes.json();

      if (directData.success) {
        batchSentCount++;
        itemsSentInCurrentBatch++;
        document.getElementById('batchCurrentStatusMsg').innerHTML = `<i class="fa-solid fa-circle-check text-success me-1"></i> Delivered directly via WhatsApp!`;
      } else {
        // Fallback to wa.me if direct send had an error
        window.open(current.waLink, '_blank');
        await fetch(`/api/reminders/${current.reminderId}/mark-sent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: 'Sent via Click-to-Chat Fallback', customMessage: current.message })
        });
        batchSentCount++;
        itemsSentInCurrentBatch++;
      }
    } catch (e) {
      console.error('Direct send error:', e);
    }
  } else {
    // Mode 2: BROWSER CLICK-TO-CHAT
    document.getElementById('batchCurrentStatusMsg').innerHTML = `<span class="spinner-grow spinner-grow-sm me-1 text-success"></span> Opening WhatsApp Web chat for ${current.guestPhone}...`;
    window.open(current.waLink, '_blank');

    try {
      await fetch(`/api/reminders/${current.reminderId}/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: `Sent via Smart 1-Click Batch (Batch ${currentBatchNumber})`,
          customMessage: current.message
        })
      });
      batchSentCount++;
      itemsSentInCurrentBatch++;
    } catch (e) {}
  }

  batchIndex++;

  // Smooth, safe 3.5-second spacing between messages to avoid spam flags
  batchAdvanceTimer = setTimeout(() => {
    runNextInBatch();
  }, 3500);
}

function startBatchCooldown() {
  document.getElementById('activeSendingCard').style.display = 'none';
  document.getElementById('batchCooldownCard').style.display = 'block';

  const nextBatchCount = Math.min(batchLimit, batchQueue.length - batchIndex);
  document.getElementById('cooldownNextBatchSize').textContent = nextBatchCount;

  cooldownSecondsRemaining = batchIntervalMinutes * 60;
  updateCooldownDisplay();

  clearInterval(cooldownIntervalTimer);
  cooldownIntervalTimer = setInterval(() => {
    cooldownSecondsRemaining--;
    if (cooldownSecondsRemaining <= 0) {
      clearInterval(cooldownIntervalTimer);
      skipCooldownAndSendNow();
    } else {
      updateCooldownDisplay();
    }
  }, 1000);
}

function updateCooldownDisplay() {
  const mins = Math.floor(cooldownSecondsRemaining / 60);
  const secs = cooldownSecondsRemaining % 60;
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('cooldownTimerDisplay').textContent = `${pad(mins)}:${pad(secs)}`;
}

function skipCooldownAndSendNow() {
  clearInterval(cooldownIntervalTimer);
  document.getElementById('batchCooldownCard').style.display = 'none';
  document.getElementById('activeSendingCard').style.display = 'block';

  itemsSentInCurrentBatch = 0;
  currentBatchNumber++;
  runNextInBatch();
}

function stopBatchDispatch() {
  clearTimeout(batchAdvanceTimer);
  clearInterval(cooldownIntervalTimer);
  loadReminders();
  loadDashboard();
}

function showBatchComplete() {
  clearTimeout(batchAdvanceTimer);
  clearInterval(cooldownIntervalTimer);

  document.getElementById('batchRunnerView').style.display = 'none';
  document.getElementById('batchCompleteView').style.display = 'block';

  document.getElementById('batchSummaryStats').innerHTML = `
    <strong>${batchSentCount}</strong> reminders dispatched across <strong>${currentBatchNumber}</strong> batch(es).<br>
    All processed reminders have been recorded as <strong>Sent</strong> in the database.<br>
    Total guests completed: <strong>${batchQueue.length}</strong>.
  `;

  loadReminders();
  loadDashboard();
}

function finishBatchDispatch() {
  stopBatchDispatch();
  loadReminders();
  loadDashboard();
}

// Utility Sanitizers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}


/* ==============================================================
   3.5 CUSTOMER HUB WORKSPACE (360° MULTI-CUSTOMER VIEW)
   ============================================================== */
let currentHubCustomerId = null;
let currentHubData = null;

async function loadCustomerHub(customerId = null) {
  await populateHubCustomerSelector(customerId || currentHubCustomerId);

  const selector = document.getElementById('hubCustomerSelector');
  const targetId = customerId || currentHubCustomerId || (selector ? selector.value : null);

  if (!targetId) {
    const emptyState = document.getElementById('hubEmptyState');
    const contentArea = document.getElementById('hubContentArea');
    if (emptyState) emptyState.style.display = 'block';
    if (contentArea) contentArea.style.display = 'none';
    return;
  }

  currentHubCustomerId = targetId;
  if (selector && selector.value !== String(targetId)) {
    selector.value = targetId;
  }

  try {
    const res = await fetch(`/api/customers/${targetId}/workspace`);
    if (res.status === 401 || res.redirected) {
      window.location.href = '/login.html';
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      showToast('Your session has expired. Redirecting to login...', 'warning');
      setTimeout(() => { window.location.href = '/login.html'; }, 1000);
      return;
    }

    const data = await res.json();

    if (!data.success) {
      showToast(data.error || 'Failed to load customer hub', 'error');
      return;
    }

    currentHubData = data;
    renderCustomerHub(data);
    checkAutoRunnerStatus();
  } catch (err) {
    console.error('Error loading customer workspace:', err);
    showToast('Failed to load customer workspace: ' + err.message, 'error');
  }
}

async function populateHubCustomerSelector(preselectedId = null) {
  const select = document.getElementById('hubCustomerSelector');
  if (!select) return;

  try {
    const res = await fetch('/api/customers');
    const data = await res.json();
    if (!data.success) return;

    let html = '<option value="">-- Choose Customer to View Workspace --</option>';
    data.customers.forEach(c => {
      const selected = (preselectedId && String(preselectedId) === String(c.id)) ? 'selected' : '';
      html += `<option value="${c.id}" ${selected}>${escapeHtml(c.full_name)} (${c.customer_code}) - ${c.mobile} [${c.total_events || 0} Event(s)]</option>`;
    });
    select.innerHTML = html;
  } catch (e) {}
}

function switchCustomerHub(customerId) {
  if (!customerId) {
    currentHubCustomerId = null;
    const emptyState = document.getElementById('hubEmptyState');
    const contentArea = document.getElementById('hubContentArea');
    if (emptyState) emptyState.style.display = 'block';
    if (contentArea) contentArea.style.display = 'none';
    return;
  }
  loadCustomerHub(customerId);
}

function openCustomerWorkspace(customerId) {
  currentHubCustomerId = customerId;
  window.location.hash = 'customer-hub';
  navigateToSection('customer-hub');
  loadCustomerHub(customerId);
}

function renderCustomerHub(data) {
  const c = data.customer;
  const events = data.events || [];
  const guests = data.guests || [];
  const reminders = data.reminders || [];
  const history = data.history || [];
  const stats = data.stats || {};

  const emptyState = document.getElementById('hubEmptyState');
  const contentArea = document.getElementById('hubContentArea');
  if (emptyState) emptyState.style.display = 'none';
  if (contentArea) contentArea.style.display = 'block';

  // Profile
  document.getElementById('hubCustomerName').textContent = c.full_name;
  document.getElementById('hubCustomerCode').textContent = c.customer_code || 'CUST';
  document.getElementById('hubCustomerStatus').textContent = c.status || 'Active';
  document.getElementById('hubCustomerStatus').className = `badge ${c.status === 'Active' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-muted'}`;
  document.getElementById('hubCustomerPhone').textContent = c.mobile || '-';
  document.getElementById('hubCustomerEmail').textContent = c.email || 'Not provided';
  document.getElementById('hubCustomerOrderRef').textContent = c.order_reference || '-';
  document.getElementById('hubCustomerDate').textContent = c.created_at ? new Date(c.created_at).toLocaleDateString() : '-';
  document.getElementById('hubAvatar').textContent = (c.full_name || 'C').charAt(0).toUpperCase();

  if (c.address) {
    document.getElementById('hubAddressRow').style.display = 'block';
    document.getElementById('hubCustomerAddress').textContent = c.address;
  } else {
    document.getElementById('hubAddressRow').style.display = 'none';
  }

  if (c.notes) {
    document.getElementById('hubNotesRow').style.display = 'block';
    document.getElementById('hubCustomerNotes').textContent = c.notes;
  } else {
    document.getElementById('hubNotesRow').style.display = 'none';
  }

  // Metrics
  document.getElementById('hubMetricEvents').textContent = stats.totalEvents || events.length;
  document.getElementById('hubMetricGuests').textContent = stats.totalGuests || guests.length;
  document.getElementById('hubMetricSent').textContent = stats.sentReminders || 0;
  document.getElementById('hubMetricPending').textContent = stats.pendingReminders || 0;

  // Tab counters
  document.getElementById('hubTabCountEvents').textContent = events.length;
  document.getElementById('hubTabCountGuests').textContent = guests.length;
  document.getElementById('hubTabCountReminders').textContent = reminders.length;

  // Render Events Table
  const eventsTbody = document.getElementById('hubEventsTableBody');
  if (events.length === 0) {
    eventsTbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No events created for this customer yet. <button class="btn btn-sm btn-palace ms-2" onclick="openAddEventModalForCurrentCustomer()">+ Create First Event</button></td></tr>`;
  } else {
    eventsTbody.innerHTML = events.map(e => `
      <tr>
        <td>
          <strong>${escapeHtml(e.event_name)}</strong>
          ${e.whatsapp_sender_name ? `<div class="small text-success mt-1" title="Dedicated WhatsApp Sender"><i class="fa-brands fa-whatsapp me-1"></i>${escapeHtml(e.whatsapp_sender_name)}</div>` : ''}
        </td>
        <td>${escapeHtml(e.host_name || '-')}</td>
        <td><span class="badge bg-light text-dark border">${e.event_category}</span></td>
        <td><strong>${e.event_date}</strong> at ${e.event_time}</td>
        <td>${escapeHtml(e.venue_name || '-')}</td>
        <td><span class="badge bg-info-subtle text-info border">${e.total_guests || 0} Guest(s)</span></td>
        <td>
          <button class="btn btn-link-host-pill shadow-sm"
                  onclick="event.stopPropagation(); openShareClientLinkModal(${e.id})"
                  title="Generate unique WhatsApp login link for this host">
            <i class="fa-brands fa-whatsapp"></i> Link Host
          </button>
        </td>
        <td><span class="badge ${e.status === 'Active' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted'}">${e.status}</span></td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-action-icon text-primary" onclick="openBatchDispatchModal(${e.id})" title="Batch Dispatch Reminders for this event">
              <i class="fa-solid fa-rocket"></i>
            </button>
            <button class="btn btn-action-icon text-secondary" onclick="openEditEventModal(${e.id})" title="Edit / Reschedule">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // Render Guests Table
  const guestsTbody = document.getElementById('hubGuestsTableBody');
  if (guests.length === 0) {
    guestsTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No guests added yet. <button class="btn btn-sm btn-palace-gold ms-2" onclick="openExcelUploadForCurrentCustomer()"><i class="fa-solid fa-file-excel"></i> Import Guest Spreadsheet</button></td></tr>`;
  } else {
    guestsTbody.innerHTML = guests.map(g => `
      <tr>
        <td><strong>${escapeHtml(g.full_name || 'Guest')}</strong></td>
        <td><a href="https://wa.me/${g.mobile.replace(/\\D/g,'')}" target="_blank" class="text-decoration-none text-success fw-bold"><i class="fa-brands fa-whatsapp"></i> ${g.mobile}</a></td>
        <td><span class="badge bg-light text-dark border">${escapeHtml(g.event_name)}</span></td>
        <td><span class="badge bg-success-subtle text-success">Opted-In</span></td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="openEditGuestModal(${g.id})" title="Edit Guest">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Render Reminders Table
  const remindersTbody = document.getElementById('hubRemindersTableBody');
  if (reminders.length === 0) {
    remindersTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No reminders generated. Add guests to this customer's events to automatically generate reminders.</td></tr>`;
  } else {
    remindersTbody.innerHTML = reminders.map(r => {
      let badgeClass = 'badge-scheduled';
      if (r.status === 'Sent') badgeClass = 'badge-sent';
      else if (r.status === 'Ready to Send') badgeClass = 'badge-ready';
      else if (r.status === 'Skipped') badgeClass = 'badge-skipped';
      else if (r.status === 'Failed') badgeClass = 'badge-failed';

      return `
        <tr>
          <td><strong>${escapeHtml(r.guest_name || 'Guest')}</strong></td>
          <td>${r.guest_phone}</td>
          <td><span class="badge bg-light text-dark border">${escapeHtml(r.event_name)}</span></td>
          <td><span class="badge bg-palace-gold-subtle text-palace-burgundy fw-bold">${r.reminder_stage}</span></td>
          <td><strong>${r.scheduled_date}</strong> at ${r.scheduled_time}</td>
          <td><span class="badge-status ${badgeClass}">${r.status}</span></td>
          <td>
            <button class="btn btn-sm btn-outline-success" onclick="previewAndSendReminder(${r.id})" title="Test / Send Message">
              <i class="fa-brands fa-whatsapp"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Render History Table
  const logsTbody = document.getElementById('hubLogsTableBody');
  if (history.length === 0) {
    logsTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No message delivery history yet for this customer.</td></tr>`;
  } else {
    logsTbody.innerHTML = history.map(h => `
      <tr>
        <td><strong>${escapeHtml(h.recipient_name || 'Guest')}</strong></td>
        <td>${h.recipient_phone}</td>
        <td>${escapeHtml(h.event_name || '-')}</td>
        <td><small class="text-muted font-monospace">${escapeHtml((h.message_text || '').substring(0, 60))}...</small></td>
        <td><small>${new Date(h.sent_at).toLocaleString()}</small></td>
        <td><span class="badge bg-success-subtle text-success">${h.status}</span></td>
      </tr>
    `).join('');
  }
}

function editCurrentHubCustomer() {
  if (currentHubCustomerId) {
    openEditCustomerModal(currentHubCustomerId);
  }
}

function openAddEventModalForCurrentCustomer() {
  openAddEventModal();
  if (currentHubCustomerId) {
    setTimeout(() => {
      const select = document.getElementById('eventCustomerSelect');
      if (select) select.value = currentHubCustomerId;
    }, 150);
  }
}

function openExcelUploadForCurrentCustomer() {
  openExcelUploadModal();
  if (currentHubData && currentHubData.events && currentHubData.events.length > 0) {
    setTimeout(() => {
      const select = document.getElementById('excelTargetEventSelect');
      if (select) select.value = currentHubData.events[0].id;
    }, 150);
  }
}

function dispatchCurrentCustomerReminders() {
  if (currentHubData && currentHubData.events && currentHubData.events.length > 0) {
    openBatchDispatchModal(currentHubData.events[0].id);
  } else {
    openBatchDispatchModal();
  }
}

/* ==============================================================
   ZERO-CLICK AUTOMATED DISPATCH STATUS MONITOR
   ============================================================== */
async function checkAutoRunnerStatus() {
  try {
    const res = await fetch('/api/reminders/auto-runner-status');
    const data = await res.json();
    if (!data.success) return;

    const pill = document.getElementById('hubAutoDispatchPill');
    if (pill) {
      if (data.inCooldown) {
        const mins = Math.floor(data.cooldownSecondsRemaining / 60);
        const secs = data.cooldownSecondsRemaining % 60;
        pill.className = 'badge bg-warning text-dark px-3 py-2';
        pill.innerHTML = `<i class="fa-solid fa-hourglass-half me-1"></i> Cooldown Active (~${mins}m ${secs}s left)`;
      } else if (data.isAutoBatchActive) {
        pill.className = 'badge bg-primary text-white px-3 py-2';
        pill.innerHTML = `<span class="spinner-grow spinner-grow-sm me-1"></span> Automated Dispatching...`;
      } else if (data.isWhatsAppConnected) {
        pill.className = 'badge bg-success text-white px-3 py-2';
        pill.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> Auto-Runner Active (WhatsApp Linked)`;
      } else {
        pill.className = 'badge bg-secondary text-white px-3 py-2';
        pill.innerHTML = `<i class="fa-solid fa-qrcode me-1"></i> Scan QR to Enable Auto-Dispatch`;
      }
    }
  } catch (e) {}
}

// Poll auto runner status every 15 seconds
setInterval(checkAutoRunnerStatus, 15000);

/* ==============================================================
   REMOTE WHATSAPP CLIENT LINK SHARING
   ============================================================== */
let currentLinkData = null;
let currentNetworkMode = 'wifi';

async function openShareClientLinkModal(eventId = null, accountId = null) {
  const modalEl = document.getElementById('shareClientLinkModal');
  if (!modalEl) return;

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();

  const loadingEl = document.getElementById('shareLinkModalLoading');
  const contentEl = document.getElementById('shareLinkModalContent');
  if (loadingEl) loadingEl.style.display = 'block';
  if (contentEl) contentEl.style.display = 'none';

  try {
    const res = await fetch('/api/whatsapp/create-client-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        account_id: accountId
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.error || 'Failed to create client linking link.', 'error');
      bsModal.hide();
      return;
    }

    currentLinkData = data;

    // Populate modal fields
    const eventNameSmall = document.getElementById('shareLinkEventNameSmall');
    if (eventNameSmall) eventNameSmall.textContent = data.eventName ? `"${data.eventName}"` : 'this event';

    document.getElementById('shareLinkEventName').textContent = data.eventName || 'Event Reminders';
    document.getElementById('shareLinkHostName').textContent = data.hostName || 'Valued Client';
    document.getElementById('shareLinkHostPhone').textContent = data.targetPhone ? `+${data.targetPhone}` : 'No phone prefilled';

    const isCloudHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    // Populate custom tunnel URL if saved
    const tunnelInput = document.getElementById('customTunnelUrlInput');
    if (tunnelInput && data.savedBaseUrl) {
      tunnelInput.value = data.savedBaseUrl;
    }

    // Default to Public mode if cloud deployed or public tunnel is configured
    if (isCloudHost || data.savedBaseUrl) {
      document.getElementById('netModePublic').checked = true;
      switchLinkNetworkMode('public');
    } else {
      document.getElementById('netModeWifi').checked = true;
      switchLinkNetworkMode('wifi');
    }

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
  } catch (err) {
    console.error('Error generating client link:', err);
    showToast('Failed to generate client link: ' + err.message, 'error');
    bsModal.hide();
  }
}

function switchLinkNetworkMode(mode) {
  currentNetworkMode = mode;
  if (!currentLinkData) return;

  const badge = document.getElementById('currentNetworkBadge');
  const tunnelBox = document.getElementById('publicTunnelSettingsBox');
  const linkInput = document.getElementById('shareClientLinkInput');
  const waBtn = document.getElementById('shareViaWhatsAppBtn');
  const isCloudHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  let activeUrl = currentLinkData.clientLink;

  if (mode === 'wifi') {
    activeUrl = currentLinkData.wifiLink || currentLinkData.clientLink;
    if (badge) badge.innerHTML = `<i class="fa-solid fa-wifi me-1"></i> Wi-Fi Mobile / Phone (${currentLinkData.localIp || '192.168.1.x'})`;
    if (tunnelBox) tunnelBox.style.display = 'none';
  } else if (mode === 'public') {
    if (isCloudHost) {
      activeUrl = `${window.location.origin}/link-whatsapp.html?token=${currentLinkData.token}`;
      if (badge) badge.innerHTML = `<i class="fa-solid fa-globe me-1 text-success"></i> Remote Internet (Cloud Active)`;
      if (tunnelBox) tunnelBox.style.display = 'none';
    } else {
      if (tunnelBox) tunnelBox.style.display = 'block';
      if (currentLinkData.savedBaseUrl) {
        activeUrl = `${currentLinkData.savedBaseUrl}/link-whatsapp.html?token=${currentLinkData.token}`;
        if (badge) badge.innerHTML = `<i class="fa-solid fa-globe me-1"></i> Remote Internet (Tunnel Active)`;
      } else {
        activeUrl = currentLinkData.wifiLink || currentLinkData.clientLink;
        if (badge) badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-warning me-1"></i> Enter Public Tunnel URL below`;
      }
    }
  } else {
    activeUrl = currentLinkData.localhostLink || `http://localhost:3000/link-whatsapp.html?token=${currentLinkData.token}`;
    if (badge) badge.innerHTML = `<i class="fa-solid fa-laptop me-1"></i> This PC (Localhost only)`;
    if (tunnelBox) tunnelBox.style.display = 'none';
  }

  if (linkInput) linkInput.value = activeUrl;
  if (waBtn) {
    const cleanPhone = (currentLinkData.targetPhone || '').replace(/\D/g, '');
    const shareMessage = `Namaste ${currentLinkData.hostName || 'Host'}! 🙏\n\nPlease click this secure link to connect your WhatsApp with *THE INVITATION PALACE* so personalized invitation reminders for *${currentLinkData.eventName || 'your event'}* can be dispatched to your guests on time:\n\n👉 ${activeUrl}\n\n(Simply open the link and scan the QR code in WhatsApp Linked Devices)`;
    waBtn.href = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  }

  if (linkInput) linkInput.value = activeUrl;

  // Rebuild WhatsApp Share URL with the selected link
  const cleanPhone = currentLinkData.targetPhone || '';
  const hostName = currentLinkData.hostName || 'Host';
  const shareMessage = `Namaste ${hostName}! 🙏\n\nPlease click this secure link to connect your WhatsApp with *THE INVITATION PALACE* so personalized invitation reminders can be dispatched to your guests on time:\n\n👉 ${activeUrl}\n\n(You can link directly using your phone number or scan QR code)`;

  if (waBtn) {
    waBtn.href = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  }
}

async function saveCustomTunnelUrl() {
  const input = document.getElementById('customTunnelUrlInput');
  const url = input ? input.value.trim() : '';

  if (!url) {
    showToast('Please enter your public tunnel URL (e.g. from ngrok or localtunnel)', 'error');
    return;
  }

  try {
    const res = await fetch('/api/whatsapp/settings/base-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: url })
    });
    const data = await res.json();
    if (data.success) {
      if (currentLinkData) {
        currentLinkData.savedBaseUrl = data.baseUrl;
      }
      switchLinkNetworkMode('public');
      showToast('Public tunnel base URL saved! All client links now use this internet URL.', 'success');
    }
  } catch (err) {
    showToast('Failed to save tunnel URL: ' + err.message, 'error');
  }
}

function copyClientShareLink() {
  const input = document.getElementById('shareClientLinkInput');
  if (!input || !input.value) return;

  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.getElementById('btnCopyShareLink');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-check text-success me-1"></i> Copied!';
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-regular fa-copy me-1"></i> Copy';
      }, 2000);
    }
    showToast('Secure Client WhatsApp link copied to clipboard!', 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard!', 'success');
  });
}

function previewClientLinkInNewTab() {
  const input = document.getElementById('shareClientLinkInput');
  if (input && input.value) {
    window.open(input.value, '_blank');
  }
}

