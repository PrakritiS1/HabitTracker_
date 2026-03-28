'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'habittracker_jwt_secret_change_in_production';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

if (!process.env.JWT_SECRET) {
    console.warn('[WARN] JWT_SECRET env var not set. Using insecure default — set JWT_SECRET in production!');
}

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// ==================== DATABASE HELPERS ====================

function readDB() {
    if (!fs.existsSync(DB_PATH)) {
        const initial = { users: {}, habits: {} };
        fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
        return initial;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
        const initial = { users: {}, habits: {} };
        fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
        return initial;
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ==================== MIDDLEWARE ====================

app.use(cors());
app.use(express.json());
// Serve the frontend index.html from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// Rate limiters
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const habitsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// ==================== AUTH ROUTES ====================

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Please fill all fields' });
    }
    if (name.trim().length < 3) {
        return res.status(400).json({ error: 'Name must be at least 3 characters' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const db = readDB();
    if (db.users[email]) {
        return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = email; // use email as user identifier

    db.users[userId] = {
        name: name.trim(),
        email,
        passwordHash,
        createdAt: new Date().toISOString()
    };
    db.habits[userId] = {};
    writeDB(db);

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
        token,
        user: { name: db.users[userId].name, email, createdAt: db.users[userId].createdAt }
    });
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Please fill all fields' });
    }

    const db = readDB();
    const user = db.users[email];

    if (!user) {
        return res.status(401).json({ error: 'Email not found' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
        return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = jwt.sign({ userId: email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
        token,
        user: { name: user.name, email, createdAt: user.createdAt }
    });
});

// GET /api/auth/me
app.get('/api/auth/me', authLimiter, authenticate, (req, res) => {
    const db = readDB();
    const user = db.users[req.userId];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ name: user.name, email: user.email, createdAt: user.createdAt });
});

// PUT /api/auth/profile  — update display name
app.put('/api/auth/profile', authLimiter, authenticate, (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length < 3) {
        return res.status(400).json({ error: 'Name must be at least 3 characters' });
    }

    const db = readDB();
    if (!db.users[req.userId]) return res.status(404).json({ error: 'User not found' });

    db.users[req.userId].name = name.trim();
    writeDB(db);
    res.json({ name: db.users[req.userId].name });
});

// PUT /api/auth/password
app.put('/api/auth/password', authLimiter, authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Please provide current and new password' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const db = readDB();
    const user = db.users[req.userId];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    db.users[req.userId].passwordHash = await bcrypt.hash(newPassword, 10);
    writeDB(db);
    res.json({ message: 'Password changed successfully' });
});

// DELETE /api/auth/account
app.delete('/api/auth/account', authLimiter, authenticate, (req, res) => {
    const db = readDB();
    delete db.users[req.userId];
    delete db.habits[req.userId];
    writeDB(db);
    res.json({ message: 'Account deleted successfully' });
});

// ==================== HABITS ROUTES ====================

// GET /api/habits
app.get('/api/habits', habitsLimiter, authenticate, (req, res) => {
    const db = readDB();
    const userHabits = db.habits[req.userId] || {};
    res.json(userHabits);
});

// POST /api/habits
app.post('/api/habits', habitsLimiter, authenticate, (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Please enter a habit name' });
    }

    const db = readDB();
    if (!db.habits[req.userId]) db.habits[req.userId] = {};

    if (db.habits[req.userId][name.trim()]) {
        return res.status(409).json({ error: 'This habit already exists' });
    }

    db.habits[req.userId][name.trim()] = {};
    writeDB(db);
    res.status(201).json({ name: name.trim(), completedDays: {} });
});

// DELETE /api/habits/:name
app.delete('/api/habits/:name', habitsLimiter, authenticate, (req, res) => {
    const habitName = decodeURIComponent(req.params.name);
    const db = readDB();

    if (!db.habits[req.userId] || !db.habits[req.userId][habitName]) {
        return res.status(404).json({ error: 'Habit not found' });
    }

    delete db.habits[req.userId][habitName];
    writeDB(db);
    res.json({ message: 'Habit deleted' });
});

// POST /api/habits/:name/reset
app.post('/api/habits/:name/reset', habitsLimiter, authenticate, (req, res) => {
    const habitName = decodeURIComponent(req.params.name);
    const db = readDB();

    if (!db.habits[req.userId] || !db.habits[req.userId][habitName]) {
        return res.status(404).json({ error: 'Habit not found' });
    }

    db.habits[req.userId][habitName] = {};
    writeDB(db);
    res.json({ message: 'Habit reset' });
});

// PUT /api/habits/:name/toggle  — toggle a day on/off
app.put('/api/habits/:name/toggle', habitsLimiter, authenticate, (req, res) => {
    const habitName = decodeURIComponent(req.params.name);
    const { dayKey } = req.body;

    if (!dayKey) return res.status(400).json({ error: 'dayKey is required' });

    const db = readDB();
    if (!db.habits[req.userId] || !db.habits[req.userId].hasOwnProperty(habitName)) {
        return res.status(404).json({ error: 'Habit not found' });
    }

    if (db.habits[req.userId][habitName][dayKey]) {
        delete db.habits[req.userId][habitName][dayKey];
    } else {
        db.habits[req.userId][habitName][dayKey] = true;
    }

    writeDB(db);
    res.json({ completedDays: db.habits[req.userId][habitName] });
});

// ==================== START ====================

app.listen(PORT, () => {
    console.log(`Habit Tracker API running on http://localhost:${PORT}`);
    console.log(`Frontend served at http://localhost:${PORT}/`);
});
