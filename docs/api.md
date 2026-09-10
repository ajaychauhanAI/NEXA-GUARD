# NEXA-GUARD 2.0 REST API Reference

Base URL: `http://localhost:5000/api`

All protected endpoints require an `Authorization: Bearer <JWT>` header unless specified as public.

---

## 1. Authentication & Session Endpoints

### `POST /auth/login`
Authenticates an institutional user and issues a signed JWT.
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "ajaycha1232a@bbdu.ac.in",
    "password": "Password@123"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 23,
      "email": "ajaycha1232a@bbdu.ac.in",
      "fullName": "Ajay Chauhan",
      "role": "HOSTEL_ADMIN",
      "hostelId": 33
    }
  }
  ```

### `GET /auth/me`
Returns the verified identity profile, role, and tenant metadata.
- **Access:** Any authenticated role

---

## 2. Movement & Pass Requests

### `POST /passes/requests`
Submits a student outpass request. Automatically triggers:
1. Academic Lecture Hours Protection check (**Mon–Sat 09:00 AM – 04:30 PM blocked** for casual passes).
2. Event-based Haversine campus geofence verification.
3. Multi-Signal Explainable AI Risk Score evaluation (0–100).
4. **Autonomous AI Approval** (if score ≤ 30, geofence verified, gate deadline compliant).
- **Access:** `STUDENT`
- **Request Body:**
  ```json
  {
    "passType": "OUTPASS",
    "fromTime": "2026-09-10T17:00:00.000Z",
    "toTime": "2026-09-10T20:30:00.000Z",
    "reason": "Buying Study Stationery",
    "destination": "Local Bookstore",
    "requestLat": 26.882687,
    "requestLng": 81.058257
  }
  ```
- **Response (201 Created - AI Auto-Approved):**
  ```json
  {
    "success": true,
    "message": "🤖 Pass safely Auto-Approved by NEXA-GUARD AI Engine.",
    "autoApproved": true,
    "request": { "id": 42, "status": "APPROVED" },
    "riskAnalysis": {
      "riskScore": 0,
      "riskLevel": "LOW",
      "recommendation": "AUTO_APPROVE"
    },
    "pass": {
      "pass_number": "PASS-2026-0042",
      "return_code": "482910",
      "qr_code": "data:image/png;base64,..."
    }
  }
  ```

### `GET /passes/requests`
Retrieves filterable pass requests for the hostel tenant.
- **Query Params:** `status` (`PENDING`, `APPROVED`, `REJECTED`), `riskLevel`, `limit`
- **Access:** `HOSTEL_ADMIN`, `WARDEN`, `STUDENT`

### `POST /passes/requests/:id/approve`
Warden manual approval / human override.
- **Access:** `HOSTEL_ADMIN`, `WARDEN`
- **Request Body:** `{ "overrideNotes": "Verified telephonically with guardian" }`

### `POST /passes/requests/:id/reject`
Warden manual rejection with documented reason.
- **Access:** `HOSTEL_ADMIN`, `WARDEN`
- **Request Body:** `{ "rejectionReason": "Late return unapproved by parent" }`

### `POST /passes/batch-approve`
Approves batch of routine pending requests. **Strictly blocks batch approval of high-risk passes, home leaves, and emergency exits.**
- **Access:** `HOSTEL_ADMIN`, `WARDEN`

### `GET /passes/active`
Retrieves student's active approved pass with digital QR data URL.
- **Access:** `STUDENT`

---

## 3. Gate Operations & Biometric Security

### `POST /gate/scan`
Validates a presented QR token or 6-digit return code at the gate terminal.
- **Access:** `SECURITY_GUARD`, `HOSTEL_ADMIN`, `WARDEN`
- **Request Body:** `{ "token": "NXG-ACTIVE-PASS-2026-0003", "gateId": 20 }`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "isValid": true,
    "canExit": false,
    "canReturn": true,
    "student": { "name": "Aditya Tiwari", "rollNumber": "BBDU-2026-IT03", "room": "R-102" },
    "pass": { "passNumber": "PASS-2026-0003", "status": "ACTIVE", "returnCode": "482910" }
  }
  ```

### `POST /gate/exit`
Authorizes resident exit transit. Updates student movement status to `OUTSIDE`.
- **Access:** `SECURITY_GUARD`, `HOSTEL_ADMIN`, `WARDEN`

### `POST /gate/return`
Confirms resident inbound return check-in following live camera face detection match (>95% confidence). Updates student movement status to `IN_HOSTEL`.
- **Access:** `SECURITY_GUARD`, `HOSTEL_ADMIN`, `WARDEN`

---

## 4. Campus Infrastructure & Floor/Room Management

### `GET /api/hostels/blocks`, `POST /api/hostels/blocks`
Lists or creates residential campus blocks.

### `GET /api/hostels/floors`, `POST /api/hostels/floors`, `DELETE /api/hostels/floors/:id`
Manages floor levels within blocks.

### `GET /api/hostels/rooms`, `POST /api/hostels/rooms`, `PUT /api/hostels/rooms/:id`, `DELETE /api/hostels/rooms/:id`
Manages physical rooms, bed capacity, and live room occupancies.

### `PUT /api/hostels/policies`
Updates institutional policies, including:
- `boysGateClosing`: e.g. `"21:30"`
- `girlsGateClosing`: e.g. `"20:30"`
- `academicWindow`: `09:00 - 16:30`

---

## 5. Students & Parent Guardians

### `POST /api/students`
Registers a student with **mandatory real guardian email**.
- **Access:** `HOSTEL_ADMIN`, `WARDEN`
- **Request Body:**
  ```json
  {
    "fullName": "Aarav Sharma",
    "email": "aarav.sharma@bbdu.ac.in",
    "phone": "9812345001",
    "rollNumber": "BBDU-2026-CS01",
    "course": "B.Tech",
    "branch": "CSE",
    "year": 3,
    "roomId": 124,
    "guardianName": "Ramesh Sharma",
    "guardianEmail": "ramesh.sharma.parent@gmail.com",
    "guardianPhone": "9912345001",
    "relationship": "FATHER"
  }
  ```

### `GET /api/students`
Returns student directory including linked parent contact information (`guardian_name`, `guardian_email`, `guardian_phone`, `guardian_relationship`).

---

## 6. Zero Food Waste Mess Operations

### `GET /api/analytics/mess`
Calculates dynamic kitchen meal requisitions:
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "summary": {
      "totalResidents": 15,
      "inHostel": 10,
      "onHomePass": 2,
      "onDayPass": 3,
      "meals": {
        "breakfast": 10,
        "lunch": 10,
        "dinner": 13,
        "absentCount": 2,
        "costSavedToday": 240
      }
    }
  }
  ```
