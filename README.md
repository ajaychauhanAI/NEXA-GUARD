# NEXA-GUARD 2.0

> **AI-Powered Smart Hostel Movement, Autonomous Approval & Safety Intelligence Platform**  
> *"Smarter Movement. Safer Hostels. Zero Human Toil."*

---

## 🏆 Smart India Hackathon (SIH) Solution Overview

- **Problem Domain:** College Hostel & Residential Student Movement Safety Infrastructure
- **SIH Value Proposition:**
  $$\text{DATA COLLECTION} \longrightarrow \text{POLICY VALIDATION} \longrightarrow \text{EXPLAINABLE AI TRIAGE} \longrightarrow \text{AUTONOMOUS APPROVAL} \longrightarrow \text{ZERO-WASTE MESS & GATE SECURITY}$$
- **Institutional Implementation:** Campus Residential Complex, Babu Banarasi Das University (BBDU), Lucknow, UP (Hostel: `NBH A BLOCK`).

---

## 🌟 Core Innovations: "From Paper Registers to Safety Intelligence"

NEXA-GUARD is not merely a digital outpass system. It is an **explainable AI-assisted institutional movement, mess optimization, and safety platform** that eliminates bureaucratic warden rubber-stamping, prevents class bunking, and guarantees zero proxy movements:

1. **Explainable AI Autonomous Approval Engine:**
   - **80%–90% of routine, safe outpasses are auto-approved by AI** within seconds when applied during authorized windows, returning before gate closing, within campus geofence, and with clean records.
   - Generates server-signed cryptographic QR tokens and 6-digit gate codes instantly.
   - **Zero Blind Batch Approvals:** Wardens no longer blindly batch-approve hundreds of requests. High-risk passes (score > 40 or late returns) are automatically escalated to the Warden Triage Queue with glowing indicators and mandatory parent verification prompts.
2. **Academic Lecture Hours Protection (Class Bunking Guard):**
   - Outpasses are strictly restricted during active college lecture hours (**Mon–Sat, 09:00 AM – 04:30 PM**).
   - Casual pass requests during class hours are automatically blocked by institutional policy. Emergency exits remain accessible 24/7.
   - **Authorized Pass Cut Windows:** Weekday evenings (04:30 PM – 06:30 PM), Weekend mornings (07:00 AM – 11:00 AM) & evenings (04:00 PM – 07:00 PM).
3. **Gender-Specific Gate Closing Rules:**
   - Independent gate closing rules: **Boys Hostel Gate Closing (Default `21:30` / 09:30 PM)** and **Girls Hostel Gate Closing (Default `20:30` / 08:30 PM)**.
   - AI evaluates return deadlines against the hostel's specific gender policy, penalizing 45 risk points if the gate deadline is exceeded.
4. **Flexible Multi-Day Home Passes:**
   - Eradicated arbitrary hard day limits (e.g. 7 or 30 days). Students can request home leaves for any duration (e.g. 3 days, 15 days for festivals/semester breaks).
   - Managed under AI recommendation `WARDEN_PARENT_VERIFICATION` requiring Warden phone confirmation with guardians.
5. **Real-Time Mess & Food Operations Hub (Zero Food Waste):**
   - Telemetry-synced kitchen headcount engine calculates exact in-hostel residents, active home pass absences, and daytime outings.
   - Computes daily plates for Breakfast, Lunch, and Dinner, calculates kilograms of food saved and rupees saved (₹120/day per student away).
   - Generates printable/exportable Daily Mess Slips for head chefs and catering contractors.
6. **Gate Return AI Biometric Face Detection Checkpoint:**
   - When residents return to the hostel gate, the security terminal launches live camera face recognition.
   - Tracks 3D facial landmarks (eyes, nose, mouth) with >95% confidence match before granting return gate clearance, completely preventing proxy entry.
7. **Manual Physical Campus Infrastructure Management:**
   - Clean, self-service UI for administrators to manually add Blocks, Floors, and Rooms with custom bed capacities (zero auto-generated dummy rooms).
8. **Eradication of Punitive "Curfew" Language:**
   - Standardized across all UI copy, APIs, and emails to professional administrative terms: *"Gate Timings"*, *"Gate Closing Deadline"*, and *"Late Gate Return"*.
9. **Authentic Parent Onboarding & Directory Visibility:**
   - Real guardian emails are mandatory during student onboarding. Zero dummy `@institution.edu` emails.
   - Linked guardian details (name, phone, real email) are displayed directly in the Admin Student Directory table.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript (Zero framework bloat; fast native performance)
- **Backend:** Node.js, Express.js (REST API, Helmet, CORS, Rate Limiting, Nodemailer SMTP)
- **Database:** PostgreSQL 16 (**31 normalized relational tables**, foreign keys, check constraints, compound indexes)
- **AI Intelligence:** Explainable multi-signal risk engine, behavioral anomaly radar, resource optimizer, and predictive food forecaster
- **Biometrics:** HTML5 Canvas & WebRTC video stream biometric facial landmark tracker
- **GIS / Mapping:** Leaflet.js with OpenStreetMap + Server-side Haversine geofence calculation (100m perimeter)
- **QR Security:** Server-generated HMAC-SHA256 signed opaque tokens + single-use 6-digit return codes
- **Dataset:** Complete realistic dataset of 15 students, parents, rooms, active gate passes, and pending requests loaded via `seed.sql`.

---

## 🔑 System Credentials & Portals

The platform is seeded with 15 resident students and realistic movement telemetry for testing:

| Role | Email | Password | Direct Portal URL | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Hostel Admin** | `ajaycha1232a@bbdu.ac.in` | `Password@123` | `http://localhost:5000/admin.html` | Full telemetry, student directory, rooms/floors, mess hub, policies |
| **Hostel Warden** | `ajaychaa17@gmail.com` | `Password@123` | `http://localhost:5000/warden.html` | AI Auto-Approved Feed, high-risk triage queue, parent phone verify |
| **Security Guard**| `ajaycha1232a@bbdu.ac.in` | `Password@123` | `http://localhost:5000/guard.html` | Gate QR scanner, 6-digit return code check-in, live face biometric |
| **Student (15)**  | `aarav.sharma@bbdu.ac.in` | `Student@123` | `http://localhost:5000/student.html` | Digital QR outpass, pass applications, gate rules, history |
| **Parent (15)**   | `ramesh.sharma.parent@gmail.com` | `Parent@123` | `http://localhost:5000/parent.html` | Live ward movement timeline, outpass status, emergency alerts |

*(All 15 student accounts use `Student@123`. All 15 parent accounts use `Parent@123`.)*

---

## 🚀 Quickstart & Installation

### Prerequisites
- Node.js (v18+)
- PostgreSQL 16 (running on `localhost:5432` with database `nexaguard`)

### 1. Configure Environment Variables
Verify or edit `backend/.env`:
```env
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=root
DB_NAME=nexaguard
JWT_SECRET=nexaguard_enterprise_jwt_secret_key_prod_sec_x89f
JWT_EXPIRES_IN=7d
```

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Initialize Database Schema & Seed 15 Students
```bash
# Run schema and migrations
node database/migrate.js

# Populate 15 students, parents, rooms, and active gate passes
node ../scratch/generate_seed_sql.js
# Or execute SQL directly: psql -U postgres -d nexaguard -f database/seed.sql
```

### 4. Start the Platform
```bash
node server.js
```
Open **`http://localhost:5000`** in your browser.

---

## 🧪 Automated Test Suite Verification

Run the end-to-end verification suite:
```bash
node ../scratch/test_ai_approval_and_rules.js
```

**Verified Test Coverage:**
1. ✅ **Admin Login**: Authenticated via JWT
2. ✅ **Warden Login**: Authenticated via JWT
3. ✅ **Mandatory Parent Email**: Student creation without guardian email rejected (HTTP 400)
4. ✅ **Real Parent Email Onboarding**: Student and parent accounts created; emails sent
5. ✅ **Directory Visibility**: Parent email visible in Admin Student Directory
6. ✅ **Academic Lecture Protection**: Class bunking blocked during 09:00 AM – 04:30 PM
7. ✅ **AI Autonomous Approval**: Routine evening safe pass auto-approved by AI; QR generated
8. ✅ **Late Gate Return Escalation**: Return 23:30 flagged score 45, escalated to Warden
9. ✅ **Flexible Home Pass**: 14-day home pass accepted without arbitrary cap; queued for parent verify
10. ✅ **Warden AI Feed**: AI-approved passes recorded and auditable in real-time
