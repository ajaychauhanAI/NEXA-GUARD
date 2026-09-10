# NEXA-GUARD 2.0 Installation & Setup Guide

This guide provides complete instructions for setting up, configuring, seeding, and running **NEXA-GUARD 2.0** on a local workstation or institutional server.

---

## 1. System Prerequisites

| Component | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | v18.0.0+ | v20.x or v25.x | Runtime for the Express application server |
| **npm** | v9.0.0+ | v10.x | Node package manager |
| **PostgreSQL** | v14.0+ | v16.x | Relational database (default port: `5432`) |
| **Web Browser** | Chrome / Edge | Chrome / Edge | WebRTC camera support for return face detection |

---

## 2. PostgreSQL Database Setup

1. Open PostgreSQL CLI (`psql`) or pgAdmin:
   ```bash
   psql -U postgres
   ```
2. Create the target relational database:
   ```sql
   CREATE DATABASE nexaguard;
   ```
3. Verify connection:
   ```sql
   \c nexaguard
   ```

---

## 3. Environment Configuration

Navigate to the `backend/` directory and configure `backend/.env`:
```env
PORT=5000
NODE_ENV=production

# PostgreSQL Connection Credentials
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=root
DB_NAME=nexaguard

# Security Secrets & Session Lifespan
JWT_SECRET=nexaguard_enterprise_jwt_secret_key_prod_sec_x89f
JWT_EXPIRES_IN=7d

# Institutional Geofence Defaults (BBDU Campus, Lucknow)
DEFAULT_HOSTEL_LAT=26.88268700
DEFAULT_HOSTEL_LNG=81.05825700
GEOFENCE_RADIUS_METERS=100

# Live SMTP Email Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=cwork8047@gmail.com
SMTP_PASSWORD=ywbx kkdh rhio makw
SMTP_FROM="NEXA-GUARD Notifications <cwork8047@gmail.com>"
FRONTEND_URL=http://localhost:5000
```

---

## 4. Install Dependencies

```bash
cd backend
npm install
```

Key packages installed:
- `express`: Core REST API web framework
- `pg`: Native PostgreSQL pool client
- `bcryptjs`: Salted password hashing (10 rounds)
- `jsonwebtoken`: Cryptographic HMAC-SHA256 bearer tokens
- `qrcode`: Server-side QR DataURL rendering engine
- `nodemailer`: Production transactional SMTP email dispatch
- `helmet`: Web security headers

---

## 5. Initialize Schema & Seed 15 Students Dataset

1. **Apply Migrations**:
   ```bash
   cd backend
   node database/migrate.js
   ```
2. **Seed 15 Resident Students & Telemetry**:
   ```bash
   # Executes seed.sql directly into PostgreSQL database
   node ../scratch/generate_seed_sql.js
   ```
   Or manually via `psql`:
   ```bash
   psql -U postgres -d nexaguard -f database/seed.sql
   ```

### Seeded Summary:
- **15 Resident Students** across B.Tech, BCA, MCA, and BBA
- **15 Real Parents** with genuine contact emails and phone numbers
- **10 In-Hostel Residents**
- **3 Casual Day Outpasses** currently active at gate
- **2 Multi-Day Home Passes** currently on leave (deducted from kitchen mess)
- **2 Pending Requests** (1 routine low risk, 1 high-risk late return)

---

## 6. Start the Server

```bash
cd backend
node server.js
```
The server will bind to **`http://localhost:5000`** with self-healing port conflict management.

---

## 7. Verified Login Credentials

| Role | Email | Password | Direct Portal URL |
| :--- | :--- | :--- | :--- |
| **Hostel Admin** | `ajaycha1232a@bbdu.ac.in` | `Password@123` | `http://localhost:5000/admin.html` |
| **Hostel Warden** | `ajaychaa17@gmail.com` | `Password@123` | `http://localhost:5000/warden.html` |
| **Security Guard** | `ajaycha1232a@bbdu.ac.in` | `Password@123` | `http://localhost:5000/guard.html` |
| **Students (15)** | `aarav.sharma@bbdu.ac.in` | `Student@123` | `http://localhost:5000/student.html` |
| **Parents (15)** | `ramesh.sharma.parent@gmail.com` | `Parent@123` | `http://localhost:5000/parent.html` |

---

## 8. Run Automated Test Verification

To run the automated verification test suite:
```bash
node ../scratch/test_ai_approval_and_rules.js
```
All 10 test suites should pass with **100% success rate**.
