# Habit Tracker Pro

A full-stack habit tracking application with a Node.js/Express backend and a modern dark-theme frontend.

## Features

- 🔐 Secure user authentication (JWT + bcrypt)
- 📅 Annual calendar view for each habit (365 days)
- 📊 Live statistics — total completions, today's status, year progress
- 💾 Server-side data persistence (JSON file database)
- 📱 Fully responsive dark-themed UI

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS (ES6) |
| Charts | Chart.js 3.9.1 |
| Backend | Node.js + Express 4.22 |
| Auth | bcryptjs + JSON Web Tokens |
| Database | JSON file (via Node `fs`) |

## Getting Started

### 1. Install backend dependencies

```bash
cd backend
npm install
```

### 2. Start the server

```bash
# production
npm start

# development (auto-reload)
npm run dev
```

The server starts on **http://localhost:3000** and serves the frontend automatically.

### 3. Open the app

Visit [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create a new account |
| POST | `/api/auth/login` | Login and receive a JWT |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/profile` | Update display name |
| PUT | `/api/auth/password` | Change password |
| DELETE | `/api/auth/account` | Delete account & all data |

### Habits *(require Bearer token)*

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/habits` | List all habits |
| POST | `/api/habits` | Create a habit |
| DELETE | `/api/habits/:name` | Delete a habit |
| POST | `/api/habits/:name/reset` | Reset a habit's progress |
| PUT | `/api/habits/:name/toggle` | Toggle a day on/off |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | *(insecure default)* | Change this in production! |

## Data Storage

Data is stored in `backend/data/db.json` (created automatically on first run). This file is excluded from version control via `.gitignore`.
