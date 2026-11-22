# THE INVITATION PALACE – Free WhatsApp Event Reminder Management System

A complete, professional, zero-cost web application designed specifically for **THE INVITATION PALACE** card and stationery business. This system manages customers, events, and guest rosters, and automatically calculates and schedules event reminders (**7-Day**, **3-Day**, and **1-Day** before the event).

Reminders are dispatched from **THE INVITATION PALACE's** WhatsApp number at **Zero Cost** using the official WhatsApp click-to-chat workflow, with seamless backend preparation for the official Meta WhatsApp Cloud API.

---

## 🌟 Key Features

### 1. 💰 Zero Cost Architecture
- **No Paid Subscriptions**: Developed entirely using free, open-source technologies.
- **No Paid APIs or Databases**: All data is stored locally in an embedded **SQLite** database on your Windows computer.
- **100% Free WhatsApp Workflow**: Uses the official WhatsApp Click-to-Chat protocol (`wa.me`) to open pre-filled, personalized messages directly into WhatsApp Web or Desktop with a single click.
- **Optional Meta Cloud API Preparation**: Fully configured for the official Meta WhatsApp Cloud API with secure backend token storage and webhook support if you decide to connect it later.

### 2. 👑 Luxury Branding & UI/UX
- **Custom Palace Theme**: Designed with royal maroon/burgundy accents (`#6B1724`), warm ivory backgrounds (`#FAF7F2`), antique gold highlights (`#C5A059`), and classical serif typography matching luxury wedding stationery.
- **Responsive Admin Panel**: Optimized for desktop, laptop, tablet, and mobile devices.
- **Pure Frontend**: Built with **HTML5, CSS3, Vanilla JavaScript, and Bootstrap 5** (Zero React/Vue/Angular complexity).

### 3. 👥 Customer Management
- Register and manage customers with unique auto-generated customer codes (`CUST-1001`, `CUST-1002`, etc.).
- Store customer full name, mobile number, email, address, order/reference number, registration date, notes, and status (`Active`, `Inactive`, `Archived`).
- **Multiple Events per Customer**: Each customer can have unlimited associated events (e.g., Engagement, Wedding, Reception).

### 4. 📅 Event Management & Dedicated Host Name
- Dedicated field for **Host Name / Main Person Name** (e.g., *Farhan & Amina*, *Rahul & Priya*, *Ahmed Khan*), which automatically interpolates into WhatsApp message templates.
- **12 Event Categories**: Wedding, Engagement, Reception, Nikah, Walima, Birthday, Anniversary, Baby Shower, Housewarming, Religious Function, Corporate Event, Other.
- Event Date, Event Time, Venue Name, Full Venue Address, and optional Google Maps link.
- **Automatic Reminder Scheduling**: Creating an event automatically calculates and stores the 7-day, 3-day, and 1-day reminder schedules in SQLite.
- **Reschedule & Cancellation Protection**:
  - Changing an event date automatically recalculates all pending reminder dates.
  - Cancelling an event automatically cancels all its pending reminders while preserving historical records.

### 5. 📋 Guest Management & Bulk Excel/CSV Import
- **Manual Entry**: Name, mobile number (normalized to E.164 international format e.g., `+919876543210`), event assignment, preferred language, consent status, and notes.
- **Excel / CSV Bulk Import**:
  - Upload `.xlsx`, `.xls`, or `.csv` files.
  - One-click **Download Sample Excel Template** (`/api/guests/sample-template`).
  - Interactive **Pre-import Validation Preview**: validates phone formats, identifies duplicates within the file, detects guests already registered for the event, and flags missing names.
  - One-click import that instantly links guests to the event and generates their reminder schedule.
  - Only sends reminders to guests who have provided consent.

### 6. ⏰ Background Scheduler & Reminder Engine
- Uses a local background scheduler running independently of the browser window.
- **Survives Browser Closes & Restarts**: Reminders are persistently stored in SQLite. As long as your computer and the local Node.js application are running, reminders are tracked.
- **Overdue Reminder Policy**: If the computer was turned off and missed a reminder date, the system marks it as `Skipped` with an explanation instead of blindly spamming stale notifications.
- **Timezone**: Defaulted to `Asia/Kolkata` (Indian Standard Time).

### 7. 💬 Universal Secular Greetings & Template Engine
- **Universal Time-Based Greetings**: Dynamically computed at the moment of sending based on the actual local time:
  - `Good morning`: 5:00 AM – 11:59 AM
  - `Good afternoon`: 12:00 PM – 4:59 PM
  - `Good evening`: 5:00 PM – 4:59 AM
  - **Zero Religious Greetings**: Strictly universal and inclusive for guests of any background.
- **Dynamic Variables**:
  - `{{time_greeting}}`
  - `{{guest_name}}`
  - `{{event_name}}`
  - `{{host_name}}`
  - `{{event_date}}`
  - `{{event_time}}`
  - `{{venue_name}}`
  - `{{venue_address}}`
  - `{{maps_link}}`
  - `{{business_name}}`
- **Real-Time WhatsApp Live Preview**: Visualizes the message in a simulated WhatsApp chat bubble as you edit.

### 8. 📊 Business Reports & Message History
- Dashboard KPI counters (Customers, Events, Guests, Scheduled, Sent, Delivered, Failed).
- Comprehensive message dispatch logs tracking delivery method (`manual_whatsapp` or `meta_cloud_api`), timestamps, and recipients.
- Event-wise and Customer-wise detailed reports.
- **Export to CSV**: Download any report as a CSV spreadsheet.

### 9. 🔒 Local Security & Database Backup
- Secure admin login with password hashing.
- **One-Click SQLite Backup**: Download a timestamped `.db` backup file to your computer.
- **Database Restore**: Upload a `.db` backup to restore all data safely.
- **Full JSON Export**: Export all tables into a structured JSON file.

---

## 🚀 Quick Setup & Installation

### Prerequisites
- Windows 10 / 11
- Node.js (v18, v20, or v22 LTS recommended)

### Step 1: Open the Project
Open Visual Studio Code or your command prompt in this project folder:
```powershell
cd "c:\Users\Admin\Desktop\INVITATION REMINDER"
```

### Step 2: Install Free Dependencies
Run:
```powershell
npm install
```

### Step 3: Start the Application
Run:
```powershell
npm start
```

### Step 4: Access the Admin Panel
Open your browser and navigate to:
```
http://localhost:3000
```
- **Login URL**: `http://localhost:3000/login.html`
- **Default Username**: `admin`
- **Default Password**: `admin123`

*(You can change the password at any time in the **Settings** panel).*

---

## 🧪 Running Automated Tests

A comprehensive test suite is included covering unit tests, database lifecycles, and scheduler overdue handling:

```powershell
npm test
```
Or directly:
```powershell
node tests/run_all_tests.js
```

### What the test suite verifies:
- Universal time-based greetings (Morning, Afternoon, Evening).
- Phone number normalization and validation (+91 format).
- Exact 7-day, 3-day, and 1-day reminder date calculations.
- Dedicated host name and dynamic variable interpolation in templates.
- Customer creation and multiple events per customer.
- Duplicate reminder prevention.
- Automatic reminder schedule recalculation when event dates change.
- Safe event cancellation.
- Overdue reminder policy (preventing stale reminder dispatch).
- SQLite database backup integrity.

---

## 📂 Project Structure

```
INVITATION REMINDER/
├── package.json               # Free & open source dependencies & scripts
├── .env.example               # Environment variables template
├── .gitignore                 # Local database and node_modules exclusions
├── README.md                  # Complete documentation
├── server.js                  # Main Express backend server & scheduler bootstrapper
├── config/
│   ├── db.js                  # SQLite initialization, schema tables & migrations
│   └── constants.js           # Categories, statuses, time greetings & phone normalizer
├── middlewares/
│   ├── auth.js                # Administrator session validation
│   └── upload.js              # Multer configuration for Excel & DB uploads
├── services/
│   ├── excelService.js        # Excel/CSV parser, validator & sample template generator
│   ├── reminderService.js     # 7/3/1-day calculations, reschedule & cancellation logic
│   ├── scheduler.js           # Background scheduler running every minute
│   ├── templateEngine.js      # Dynamic template variable replacement & previews
│   └── whatsappService.js     # Free wa.me links, Meta API caller & webhook handler
├── routes/
│   ├── authRoutes.js          # Login, logout, change password
│   ├── customerRoutes.js      # Customer CRUD & associated events
│   ├── eventRoutes.js         # Event CRUD, host names, date changes & guest rosters
│   ├── guestRoutes.js         # Guest CRUD, bulk Excel upload & sample template download
│   ├── reminderRoutes.js      # Filter, preview, copy, wa.me link & mark sent
│   ├── reportRoutes.js        # KPI dashboard, event & customer reports, CSV export
│   ├── settingRoutes.js       # Business details, backup & restore, Meta API config
│   ├── templateRoutes.js      # Message template editor & live preview
│   └── webhookRoutes.js       # Meta Cloud API status update webhooks
├── utils/
│   └── security.js            # Password hashing & verification
├── database/
│   ├── invitation_palace.db   # Local SQLite database file (created on start)
│   └── backups/               # Automated timestamped database backups
├── tests/
│   ├── unit_test.js           # Greetings, phone numbers, templates, links tests
│   ├── integration_test.js    # Database lifecycle, events, recalculation tests
│   ├── scheduler_test.js      # Scheduler & overdue policy tests
│   └── run_all_tests.js       # Master automated test runner
└── public/                    # Frontend (HTML5, CSS3, Vanilla JS, Bootstrap 5)
    ├── index.html             # Admin Panel Single Page Application
    ├── login.html             # Royal login portal
    ├── css/
    │   └── style.css          # Ivory, burgundy & gold luxury stylesheet
    └── js/
        └── app.js             # Frontend SPA controller & event handlers
```

---

## 📲 How the Free WhatsApp Workflow Operates

1. **Automatic Detection**: The background scheduler identifies all reminders scheduled for today that have reached their designated dispatch time.
2. **Dashboard Notification**: Reminders due for dispatch appear immediately in the **Reminders Ready for Dispatch** table on your Dashboard.
3. **One-Click Action**: Click **Preview & Send**.
   - A modal displays the guest's details and the exact, personalized message with universal greetings (*"Good morning Mohammad Tariq..."*), host names (*"Farhan & Amina"*), venue, time, and address.
4. **Copy Message**: Click **Copy Message** to copy the exact text to your clipboard.
5. **Open WhatsApp**: Click **Open in WhatsApp**. This opens the official WhatsApp chat (`https://wa.me/...`) with the pre-filled personalized message ready to send.
6. **Confirm Dispatch**: After sending in WhatsApp, click **Mark as Sent**. This updates the status in SQLite and records the dispatch in your permanent **Message History**.

---

## 📄 License & Credits
Developed for **THE INVITATION PALACE**. Free and Open Source under the MIT License.
