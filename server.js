/**
 * THE INVITATION PALACE – Free WhatsApp Event Reminder Management System
 * Main Express Application Server
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');

const { initDb, getDb } = require('./config/db');
const { startScheduler, stopScheduler } = require('./services/scheduler');

// Route handlers
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const eventRoutes = require('./routes/eventRoutes');
const guestRoutes = require('./routes/guestRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const templateRoutes = require('./routes/templateRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingRoutes = require('./routes/settingRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const whatsappAccountRoutes = require('./routes/whatsappAccountRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
initDb();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session Configuration
app.use(session({
  name: 'palace_session',
  secret: process.env.SESSION_SECRET || 'the_invitation_palace_royal_secret_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Root route redirect logic
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  return res.redirect('/login.html');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/whatsapp', whatsappAccountRoutes);
app.use('/api/whatsapp/webhook', webhookRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    app: 'THE INVITATION PALACE',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Start Background Reminder Scheduler
startScheduler();

// Start Server
const server = app.listen(PORT, () => {
  console.log('================================================================');
  console.log('  THE INVITATION PALACE - WhatsApp Reminder Management System   ');
  console.log('================================================================');
  console.log(`  Application running at: http://localhost:${PORT}`);
  console.log(`  Login Page:             http://localhost:${PORT}/login.html`);
  console.log(`  Default Admin:          admin / admin123`);
  console.log('  Scheduler Status:       ACTIVE (Runs in background every min)');
  console.log('  WhatsApp Mode:          100% FREE Manual Click-to-Chat Workflow');
  console.log('================================================================');
});

// Handle Server Errors (e.g. Port already in use)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Server Error] Port ${PORT} is already in use by another running instance.`);
    console.error(`To free port ${PORT}, run in your PowerShell terminal:`);
    console.error(`  Stop-Process -Name node -Force\n`);
    process.exit(1);
  } else {
    console.error('[Server Error]', err);
  }
});

// Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  stopScheduler();
  server.close(() => {
    try {
      const db = getDb();
      if (db) db.close();
      console.log('[Server] Database closed cleanly.');
    } catch (e) {}
    console.log('[Server] Process exited successfully.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

module.exports = app;
