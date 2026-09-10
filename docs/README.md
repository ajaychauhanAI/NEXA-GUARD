# NEXA-GUARD 2.0 — System Documentation

> **AI-Powered Smart Hostel Movement, Autonomous Approval & Safety Intelligence Platform**  
> *"Smarter Movement. Safer Hostels. Zero Human Toil."*

---

## 📚 Documentation Index

1. [Architecture & Intelligence Pipeline](file:///c:/Users/Mr.%20Ajay/OneDrive/Desktop/SIH_2.0/docs/architecture.md) — System layers, AI risk scoring, lecture protection, geofencing, and state machine.
2. [REST API Reference](file:///c:/Users/Mr.%20Ajay/OneDrive/Desktop/SIH_2.0/docs/api.md) — Complete endpoint specifications with request/response payloads.
3. [Installation & Setup Guide](file:///c:/Users/Mr.%20Ajay/OneDrive/Desktop/SIH_2.0/docs/setup.md) — Prerequisites, database setup, environment variables, seeding, and execution.

---

## 🏆 Smart India Hackathon (SIH) Solution Overview

- **Problem Domain:** College Hostel & Residential Student Movement Safety Infrastructure
- **Institutional Deployment:** Campus Residential Complex, Babu Banarasi Das University (BBDU), Lucknow, UP (Hostel: `NBH A BLOCK`).
- **Core Architecture:**
  $$\text{DATA COLLECTION} \longrightarrow \text{POLICY VALIDATION} \longrightarrow \text{EXPLAINABLE AI TRIAGE} \longrightarrow \text{AUTONOMOUS APPROVAL} \longrightarrow \text{ZERO-WASTE MESS & GATE SECURITY}$$

---

## 🌟 Major Highlights & Production Features

### 1. Explainable AI Autonomous Approval Engine
- Routine safe outpasses (risk score ≤ 30, inside geofence, returning before gate closing) are approved by AI within seconds without human delay.
- Issues server-signed cryptographic QR tokens and 6-digit return codes.
- High-risk passes (late returns, score > 40) are escalated to the Warden Triage Queue with glowing alerts and parent telephone verification requirements.

### 2. Academic Lecture Hours Protection (Class Bunking Guard)
- Outpasses are strictly restricted during active lecture hours (**Mon–Sat, 09:00 AM – 04:30 PM**).
- Authorized pass cut windows: Weekday evenings (04:30 PM – 06:30 PM) and weekend mornings & evenings. Emergency exits are accessible 24/7.

### 3. Gender-Specific Gate Closing Deadlines
- Independent gate closing rules: **Boys Hostel Gate Closing (`21:30`)** and **Girls Hostel Gate Closing (`20:30`)**, configurable via Admin settings and wizard.

### 4. Flexible Multi-Day Home Passes
- Zero arbitrary hard day limits (e.g. 7 or 30 days). Students can apply for 3, 14, or 30 days for festivals or semester breaks, governed by parent verification.

### 5. Zero Food Waste Mess Operations Hub
- Real-time plate calculations for Breakfast, Lunch, and Dinner. Deducts home pass absentees, calculates ₹ saved, exports daily contractor slips.

### 6. Gate Return AI Biometric Face Detection Checkpoint
- When residents return to the hostel gate, the security terminal launches live camera face recognition to prevent proxy entries (>95% confidence threshold).

### 7. Zero "Curfew" Terminology Standard
- Replaced all punitive curfew phrasing across all frontend portals, backend jobs, and emails with "Gate Closing Deadline", "Gate Timings", and "Late Gate Return".

### 8. Authentic Parent Onboarding & Directory View
- Real guardian email is strictly mandatory during onboarding. Linked parent credentials and phones are displayed directly in the Admin Student Directory table.

---

## 🔑 System Accounts & Seeded Dataset

Seeded with **15 resident students, 15 linked parents, physical rooms, and active gate passes** for live evaluation:

| Role | Email | Password | Direct Portal URL |
| :--- | :--- | :--- | :--- |
| **Hostel Admin** | `ajaycha1232a@bbdu.ac.in` | `Password@123` | `http://localhost:5000/admin.html` |
| **Hostel Warden** | `ajaychaa17@gmail.com` | `Password@123` | `http://localhost:5000/warden.html` |
| **Security Guard** | `ajaycha1232a@bbdu.ac.in` | `Password@123` | `http://localhost:5000/guard.html` |
| **Student (15)** | `aarav.sharma@bbdu.ac.in` | `Student@123` | `http://localhost:5000/student.html` |
| **Parent (15)** | `ramesh.sharma.parent@gmail.com` | `Parent@123` | `http://localhost:5000/parent.html` |
