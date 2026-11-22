/**
 * File Upload Middleware
 * Supports Excel, CSV and Database backup files
 * THE INVITATION PALACE
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Memory storage for Excel/CSV parsing (faster and cleaner, no lingering temp files)
const memoryStorage = multer.memoryStorage();

const excelUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV (.csv) files are permitted.'));
    }
  }
});

// Disk storage for Database Restore (.db or .sqlite)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'restore-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const dbUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for database backups
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
      cb(null, true);
    } else {
      cb(new Error('Only SQLite database files (.db, .sqlite) are permitted for restore.'));
    }
  }
});

const LOGOS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'logos');
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

// Disk storage for Company Logo
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOGOS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
    cb(null, 'logo-' + uniqueSuffix + ext);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for logos
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (.png, .jpg, .jpeg, .svg, .webp) are permitted for company logo.'));
    }
  }
});

module.exports = {
  excelUpload,
  dbUpload,
  logoUpload
};
