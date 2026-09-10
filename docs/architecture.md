# NEXA-GUARD 2.0 System Architecture & Intelligence Pipeline

**NEXA-GUARD 2.0** is an explainable AI-assisted smart hostel movement, autonomous approval, and safety intelligence platform built for institutional scale. It combines multi-sensor telemetry to automate routine movement, eliminate class bunking, prevent proxy entries, and optimize mess operations.

---

## 1. High-Level System Architecture

```mermaid
graph TD
    subgraph ClientLayer[Institutional Client Layer - HTML5 + Tailwind + Vanilla JS]
        C1[Student Portal: QR Pass & Requests]
        C2[Warden Hub: AI Feed & Triage Queue]
        C3[Guard Terminal: QR Scan & Face Cam]
        C4[Admin Command Center: Mess Hub & Policies]
        C5[Parent Portal: Live Ward Movement Timeline]
    end

    subgraph SecurityGateway[API Gateway & Middleware - Node.js + Express]
        M1[JWT Authentication & Tenant Isolation]
        M2[Rate Limiting: 1,000 req / 15m]
        M3[Helmet Security Headers & CORS]
        M4[Relational Audit Logger]
    end

    subgraph PolicyEngine[Institutional Policy & Academic Protection]
        P1{Class Hours Check: Mon-Sat 09:00-16:30}
        P1 -->|Overlap| BUNK[❌ Blocked: College Lecture Hours Protection]
        P1 -->|Authorized Window| P2[GPS Geofence Check: 100m Perimeter]
        P2 --> P3[Gender Gate Deadline: Boys 21:30 | Girls 20:30]
    end

    subgraph AIEngine[Explainable Multi-Signal AI Risk Engine]
        R1[Timing Signal: Proximity to Gate Closing]
        R2[Location Signal: Campus Geofence Distance]
        R3[Velocity Signal: Movements in Past 72h]
        R4[History Signal: Overdue Late Return Ratio]
        R5[Academic Signal: Class Bunking Guard]
        R1 & R2 & R3 & R4 & R5 --> SCORE[Risk Score: 0 to 100]
    end

    subgraph AutonomousDecisions[Autonomous Movement Decision Pipeline]
        SCORE -->|Score <= 30 & Safe| AUTO[⚡ AI Autonomous Approval]
        AUTO -->|Server-Signed HMAC QR| QRCODE[Active Pass Ready for Gate Transit]
        SCORE -->|Late Return / Score > 40| ESC[⚠️ Warden Triage Queue Escalation]
        SCORE -->|Multi-Day Home Pass| HOME[📞 Warden & Parent Phone Verification Queue]
    end

    subgraph GateBiometrics[Gate Transit & Biometric Security]
        QRCODE -->|Outbound Scan| OUT[Exit Authorized -> Student OUTSIDE]
        OUT -->|Inbound Return| CAM[📷 Live 3D AI Face Recognition Camera]
        CAM -->|>95% Facial Landmark Confidence| IN[Return Clearance Granted -> IN_HOSTEL]
    end

    subgraph MessTelemetry[Zero Food Waste Mess Operations Hub]
        IN & OUT --> MESS[Mess Headcount Engine]
        MESS --> M_OUT[Breakfast / Lunch / Dinner Plates & Cost Savings]
    end

    subgraph DataLayer[PostgreSQL 16 Relational Storage]
        DB[(31 Normalized Tables with Foreign Keys & Constraints)]
    end

    ClientLayer --> SecurityGateway
    SecurityGateway --> PolicyEngine
    PolicyEngine --> AIEngine
    AIEngine --> AutonomousDecisions
    AutonomousDecisions --> GateBiometrics
    GateBiometrics --> MessTelemetry
    MessTelemetry --> DataLayer
```

---

## 2. Multi-Signal Explainable AI Risk Formulation

The risk scoring engine evaluates every movement request across five mathematical dimensions:

$$\text{Risk Score} = S_{\text{timing}} + S_{\text{location}} + S_{\text{velocity}} + S_{\text{history}} + S_{\text{academic}} \quad \in [0, 100]$$

1. **Timing Penalty ($S_{\text{timing}} \in [0, 45]$):**
   - If expected return exceeds the hostel's gender gate closing deadline (**Boys: 21:30, Girls: 20:30**), $+45$ points are added.
2. **Location Penalty ($S_{\text{location}} \in [0, 15]$):**
   - If the student is outside the verified 100m campus geofence when applying, $+15$ points are added.
3. **Velocity Penalty ($S_{\text{velocity}} \in [0, 20]$):**
   - Frequency of outpasses requested within the trailing 72 hours.
4. **Historical Disciplinary Penalty ($S_{\text{history}} \in [0, 20]$):**
   - Ratio of historical overdue return occurrences and active disciplinary infractions.
5. **Academic Penalty ($S_{\text{academic}} \in [0, 35]$):**
   - Request overlapping with college lecture hours (09:00 AM – 04:30 PM Mon–Sat).

### Decision Thresholds:
- **$\text{Risk Score} \le 30$:** `AUTO_APPROVE` (Routine safe pass autonomously approved by AI within seconds).
- **$31 \le \text{Risk Score} \le 60$:** `WARDEN_REVIEW` (Flagged for human Warden inspection).
- **$\text{Risk Score} > 60$:** `MANDATORY_WARDEN_OVERRIDE` (Requires explicit reason and parent telephone verification).
- **Home Pass:** `WARDEN_PARENT_VERIFICATION` (Requires parent consent confirmation).

---

## 3. Cryptographic State Machine & Transit Security

Pass transitions follow an atomic finite state machine:

$$\text{SUBMITTED} \longrightarrow \text{APPROVED} \longrightarrow \text{ACTIVE (OUTBOUND)} \longrightarrow \text{USED (RETURNED)}$$

- **Opaque Token Encryption:** Passes generate an HMAC-SHA256 token that contains **zero student PII**:
  $$\text{token} = \text{HMAC-SHA256}(\text{pass\_number} \parallel \text{student\_id} \parallel \text{salt}, \text{JWT\_SECRET})$$
- **6-Digit Gate Code:** Provides a hardware-friendly fallback for environments without camera scanners.
- **Return Check-in Face Biometric:** On inbound return, the gate terminal launches live facial landmark detection (eyes, nose, mouth) requiring >95% confidence before transitioning to `USED`.

---

## 4. Real-Time Mess & Food Headcount Calculation

The dining telemetry engine dynamically calculates meal requisitions to prevent kitchen waste:

$$\text{Breakfast Plates} = N_{\text{in\_hostel}}$$
$$\text{Lunch Plates} = N_{\text{in\_hostel}}$$
$$\text{Dinner Plates} = N_{\text{in\_hostel}} + N_{\text{day\_pass\_returning}}$$
$$\text{Food Cost Saved} = N_{\text{home\_pass\_absent}} \times ₹120/\text{day}$$

- All values are dynamically queried from live student movement statuses in PostgreSQL.
- Head chefs and catering contractors export printable Daily Mess Slips directly from the Admin Portal.
