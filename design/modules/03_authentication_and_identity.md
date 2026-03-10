# Authentication & Identity Management — Complete Analysis & System Design

**Date:** 10 March 2026
**Scope:** Full analysis of authentication, session management, identity, and profile features
**Principle:** Analyse current → Identify gaps → Design enterprise-grade identity management

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Deep-Dive](#2-component-deep-dive)
3. [SWOT Analysis](#3-swot-analysis)
4. [Gap Analysis — Current vs Enterprise-Grade](#4-gap-analysis)
5. [Advanced System Design](#5-advanced-system-design)
6. [Architecture Design](#6-architecture-design)
7. [Data Model Design](#7-data-model-design)
8. [API Design](#8-api-design)
9. [Security Design](#9-security-design)
10. [Scalability & Reliability Design](#10-scalability--reliability-design)
11. [Frontend Design](#11-frontend-design)
12. [Migration Strategy](#12-migration-strategy)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. System Overview

### 1.1 Current Architecture Summary

The authentication module spans **8 files** across backend + frontend:

| Layer              | Files                                                | Purpose                                                      |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------ |
| **Auth Views**     | `api/views/auth.py`                                  | Login, token refresh, profile (me), change password          |
| **Auth Service**   | (inline in views — no dedicated service)             | Credential validation, JWT generation                        |
| **Middleware**     | `core/middleware.py` (TenantIsolation, AuditLogging) | Tenant attachment, deactivation checks, JWT-fallback audit   |
| **Models**         | `core/models.py` (User, Tenant)                      | Custom AbstractBaseUser, tenant-scoped identity              |
| **Exceptions**     | `core/exceptions.py`                                 | TenantInactiveError, InsufficientPermissionsError            |
| **Settings**       | `config/settings.py` (SIMPLE_JWT, REST_FRAMEWORK)    | Token lifetimes, signing key, auth classes                   |
| **Frontend Auth**  | `services/auth.service.ts`, `store/auth.store.ts`    | Login API call, localStorage token management, Zustand store |
| **Frontend Pages** | `pages/Login.tsx`, `pages/Profile.tsx`               | Login form, profile editor with password change              |

### 1.2 Current Authentication Flow

```
User submits email + password
    │
    ▼
[POST /api/auth/login/]
    │
    ├─ Validate required fields
    ├─ Lookup user by email (select_related tenant)
    ├─ Check password (check_password)
    ├─ Check user.is_active → 403 if deactivated
    ├─ Check tenant.is_active → 403 if deactivated
    │
    ▼
[RefreshToken.for_user(user)] → JWT pair
    │
    ▼
Response: { access, refresh, user: { id, email, username, full_name, is_tenant_admin, isPlatformOwner, tenant } }
    │
    ▼
Frontend stores in localStorage: accessToken, refreshToken, user JSON
    │
    ▼
Subsequent requests: Authorization: Bearer <access_token>
    │
    ▼
[JWTAuthentication] → resolves user from token
    │
    ▼
[TenantIsolationMiddleware] → attaches tenant, blocks if inactive
```

---

## 2. Component Deep-Dive

### 2.1 Login Endpoint (`api/views/auth.py`)

**Strengths:**

- Single DB query with `select_related('tenant')` — avoids N+1
- Separate error messages for user deactivation vs tenant deactivation
- Returns structured user object with role flags

**Issues:**

- No login attempt throttling/rate limiting (brute force vulnerable)
- No account lockout after N failed attempts
- No multi-factor authentication (MFA/2FA)
- Plaintext password in HTTP body (relies entirely on TLS)
- No "remember me" functionality
- Session not invalidated on password change
- No IP-based anomaly detection

### 2.2 Token Management (`SIMPLE_JWT` settings)

**Current Configuration:**

- Access token: 1 hour (configurable via `JWT_ACCESS_TOKEN_LIFETIME`)
- Refresh token: 24 hours (configurable via `JWT_REFRESH_TOKEN_LIFETIME`)
- Rotate on refresh: `True` — old refresh token blacklisted
- Algorithm: `HS256`
- Signing key: Falls back to Django `SECRET_KEY`

**Issues:**

- `HS256` is symmetric — any server with the key can forge tokens (RS256/ES256 preferred for distributed)
- Single signing key — no key rotation mechanism
- No token revocation on password change (existing tokens remain valid)
- No per-device token tracking (can't log out specific devices)
- Token blacklist table can grow unbounded without cleanup

### 2.3 Profile Management (`me_view`)

**Strengths:**

- Explicit allowlist of editable fields (`first_name`, `last_name`, `profile_metadata`)
- Email immutable (prevents impersonation)

**Issues:**

- No email change flow (even with verification)
- `profile_metadata` is unvalidated JSON — can store arbitrary data
- No profile photo upload
- No audit log for profile changes

### 2.4 Password Management (`change_password_view`)

**Strengths:**

- Requires current password verification
- Prevents reuse of current password
- Enforces minimum 8 characters

**Issues:**

- No password complexity rules (uppercase, numbers, symbols)
- No password history (user can cycle between two passwords)
- No "forgot password" / reset flow
- Existing JWT tokens not revoked after password change
- No breach-detection (haveibeenpwned integration)

### 2.5 Frontend Auth (`auth.service.ts`, `auth.store.ts`)

**Strengths:**

- Clean separation of API calls (service) vs state (store)
- Zustand store is lightweight and reactive
- Token refresh logic present

**Issues:**

- Tokens in `localStorage` → vulnerable to XSS (httpOnly cookies preferred)
- No automatic token refresh interceptor (manual refresh only)
- No session timeout detection
- User JSON in localStorage can be tampered with
- No CSRF protection (not needed with Bearer tokens, but relevant if cookies are used)
- Demo credentials hardcoded in Login.tsx (security risk in production)

---

## 3. SWOT Analysis

### Strengths (7)

1. **JWT-based stateless auth** — scales horizontally without session affinity
2. **Refresh token rotation** — reduces window of stolen-token exploits
3. **Tenant-scoped identity** — users naturally isolated by organisation
4. **Custom User model** — extensible via AbstractBaseUser
5. **Middleware-level tenant check** — every request validates tenant status
6. **Profile field allowlisting** — prevents mass-assignment attacks
7. **Configurable token lifetimes** — environment-specific tuning without code changes

### Weaknesses (12)

1. No login rate limiting / account lockout
2. No MFA/2FA support
3. No password reset ("forgot password") flow
4. Weak password policy (length only, no complexity)
5. No password history enforcement
6. No token revocation on password change
7. Tokens in localStorage (XSS risk)
8. No device/session management (can't see/revoke active sessions)
9. No audit logging for auth events (login, logout, password change)
10. No email change/verification flow
11. `HS256` without key rotation
12. Demo credentials in production login page

### Opportunities (6)

1. SSO integration (SAML/OIDC) for enterprise customers
2. Biometric/WebAuthn/passkey support
3. Risk-based adaptive authentication
4. Session timeline / device management UI
5. Identity federation for cross-tenant access
6. Compliance certifications (SOC 2, ISO 27001) via strong auth

### Threats (4)

1. Credential stuffing — no protection currently
2. Token theft via XSS — localStorage vulnerability
3. Session hijacking — no device fingerprinting
4. Regulatory compliance risk — GDPR requires proper identity management

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability              | Current State        | Enterprise Target            | Gap    |
| ----------------------- | -------------------- | ---------------------------- | ------ |
| Password authentication | ✅ Basic             | ✅ With complexity rules     | Small  |
| MFA/2FA                 | ❌ None              | ✅ TOTP + SMS + WebAuthn     | Large  |
| SSO (SAML/OIDC)         | ❌ None              | ✅ Full SSO federation       | Large  |
| Password reset          | ❌ None              | ✅ Email-based OTP reset     | Medium |
| Account lockout         | ❌ None              | ✅ Progressive lockout       | Medium |
| Login rate limiting     | ❌ None              | ✅ Per-IP + per-account      | Medium |
| Token security          | ⚠️ localStorage      | ✅ httpOnly secure cookies   | Medium |
| Token revocation        | ⚠️ Partial (rotate)  | ✅ Instant on pwd change     | Medium |
| Device management       | ❌ None              | ✅ View/revoke devices       | Large  |
| Auth audit trail        | ❌ None (write-only) | ✅ All auth events logged    | Medium |
| Password history        | ❌ None              | ✅ Last N passwords          | Small  |
| Session timeout         | ⚠️ Token expiry only | ✅ Idle timeout + absolute   | Small  |
| Email verification      | ❌ None              | ✅ Verify on register/change | Medium |
| Risk-based auth         | ❌ None              | ✅ Adaptive MFA triggers     | Large  |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **Defense in depth** — multiple authentication layers, not just password
2. **Zero trust** — verify every request, never trust client state alone
3. **Least privilege tokens** — tokens carry minimal claims, permissions resolved server-side
4. **Auditability** — every authentication event fully logged
5. **User experience** — security without friction for legitimate users

### 5.2 Authentication Architecture

```
                                    ┌──────────────────────────────┐
                                    │    Identity Provider (IdP)    │
                                    │  ┌────────┐  ┌────────────┐  │
                                    │  │ SAML   │  │ OIDC       │  │
                                    │  │ Bridge │  │ Provider   │  │
                                    │  └───┬────┘  └─────┬──────┘  │
                                    │      │             │          │
                                    └──────┼─────────────┼──────────┘
                                           │             │
                    ┌──────────────────────┼─────────────┼────────────────┐
                    │                 Auth Gateway                         │
                    │  ┌──────────┐ ┌──────────┐ ┌───────────┐           │
                    │  │ Password │ │ MFA      │ │ SSO       │           │
                    │  │ Auth     │ │ Service  │ │ Handler   │           │
                    │  └────┬─────┘ └────┬─────┘ └─────┬─────┘           │
                    │       │            │              │                  │
                    │       ▼            ▼              ▼                  │
                    │  ┌──────────────────────────────────────────────┐   │
                    │  │           Session Manager                    │   │
                    │  │  ┌────────┐ ┌──────────┐ ┌──────────────┐  │   │
                    │  │  │ Token  │ │ Device   │ │ Risk         │  │   │
                    │  │  │ Issuer │ │ Registry │ │ Evaluator    │  │   │
                    │  │  └────────┘ └──────────┘ └──────────────┘  │   │
                    │  └──────────────────────────────────────────────┘   │
                    │       │                                             │
                    │       ▼                                             │
                    │  ┌──────────────────┐  ┌────────────────────┐      │
                    │  │  Auth Audit Log  │  │ Lockout Service    │      │
                    │  └──────────────────┘  └────────────────────┘      │
                    └─────────────────────────────────────────────────────┘
```

### 5.3 Multi-Factor Authentication (MFA)

**Supported Methods (Priority Order):**

1. **TOTP** (Time-based One-Time Password) — Google Authenticator, Authy
2. **Email OTP** — 6-digit code to registered email
3. **WebAuthn** — Hardware keys (YubiKey), biometrics (Face ID, Touch ID)
4. **SMS OTP** — Fallback only (SS7 vulnerability acknowledged)

**MFA Flow:**

```
POST /auth/login/  →  { email, password }
    │
    ├─ Password valid
    │  └─ User has MFA enabled?
    │     ├─ No  → Issue tokens immediately
    │     └─ Yes → Return { mfa_required: true, mfa_session: <token>, methods: ["totp", "email"] }
    │
    ▼
POST /auth/mfa/verify/  →  { mfa_session, method: "totp", code: "123456" }
    │
    ├─ Valid → Issue JWT tokens + record trusted device
    └─ Invalid → Increment attempt counter
         └─ Max attempts exceeded → Lock MFA session
```

### 5.4 SSO Integration

**SAML 2.0 Flow:**

```
User clicks "Sign in with SSO"
    │
    ▼
GET /auth/sso/saml/login/?tenant=<slug>
    │
    ├─ Lookup TenantSSOConfig by slug
    ├─ Build SAML AuthnRequest
    ├─ Redirect to IdP login URL
    │
    ▼
IdP authenticates → POST /auth/sso/saml/acs/  (Assertion Consumer Service)
    │
    ├─ Validate SAML assertion (signature, timestamp, audience)
    ├─ Extract claims (email, name, groups)
    ├─ Find or create user in tenant
    ├─ Map IdP groups → local roles (via TenantSSOConfig.role_mapping)
    │
    ▼
Issue JWT tokens → Redirect to frontend with tokens
```

### 5.5 Session & Device Management

Every login creates a `UserSession` record:

- Device fingerprint (user-agent hash + IP prefix)
- Geolocation (IP → approximate location)
- Created/last-active timestamps
- Revocation flag

Users can:

- View all active sessions in Profile
- Revoke any session (immediately invalidates its refresh token)
- "Revoke all other sessions" for emergency lockout

### 5.6 Password Security Enhancements

| Feature          | Design                                                     |
| ---------------- | ---------------------------------------------------------- |
| Complexity rules | Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special  |
| Password history | Store hashed last 5 passwords, reject reuse                |
| Breach detection | Hash-prefix check against HaveIBeenPwned API (k-anonymity) |
| Automatic expiry | Configurable per-tenant (default: 90 days)                 |
| Force reset      | Admin-triggered password reset for any user                |
| Reset flow       | Email OTP → verify → set new password                      |

---

## 6. Architecture Design

### 6.1 Module Structure

```
apps/
  auth/                          # NEW dedicated auth app
    __init__.py
    models.py                    # UserSession, MFADevice, LoginAttempt, PasswordHistory, SSOConfig
    services/
      __init__.py
      authentication.py          # AuthenticationService (login, MFA challenge, SSO)
      session_manager.py         # SessionManagerService (create, revoke, cleanup)
      mfa_service.py             # MFAService (TOTP setup/verify, email OTP)
      password_service.py        # PasswordService (validate, history, reset flow)
      risk_evaluator.py          # RiskEvaluationService (device, geo, behavior)
      lockout_service.py         # AccountLockoutService (progressive lockout)
    views/
      __init__.py
      login.py                   # Login + MFA views
      session.py                 # Device/session management views
      password.py                # Password change/reset views
      sso.py                     # SAML/OIDC handlers
      profile.py                 # Profile CRUD
    serializers/
      __init__.py
      auth.py                    # Login, MFA, session serializers
      profile.py                 # Profile serializers
    migrations/
    admin.py
    urls.py
```

### 6.2 Dependency Graph

```
auth module
    ├── core.models (User, Tenant)
    ├── rbac.services (RoleResolutionService — for SSO group mapping)
    ├── core.services.notifications (NotificationService — for login alerts)
    ├── django.core.cache (Redis — session state, lockout counters)
    └── External:
        ├── python-social-auth / django-allauth (SSO)
        ├── pyotp (TOTP generation/verification)
        └── fido2 (WebAuthn support)
```

---

## 7. Data Model Design

### 7.1 New Models

```python
# ── UserSession ──────────────────────────────────────────
class UserSession(models.Model):
    """Tracks active login sessions per device."""
    id            = UUIDField(primary_key=True)
    user          = ForeignKey(User, on_delete=CASCADE, related_name='sessions')
    refresh_token_jti = CharField(max_length=64, unique=True)  # JWT 'jti' claim
    device_fingerprint = CharField(max_length=128)              # SHA256 of user-agent + IP prefix
    device_name   = CharField(max_length=255)                   # "Chrome on macOS"
    ip_address    = GenericIPAddressField()
    location      = CharField(max_length=255, blank=True)       # "Mumbai, IN"
    is_active     = BooleanField(default=True)
    last_active_at = DateTimeField(auto_now=True)
    created_at    = DateTimeField(auto_now_add=True)
    expires_at    = DateTimeField()

# ── MFADevice ────────────────────────────────────────────
class MFADevice(models.Model):
    """User's registered MFA devices."""
    MFA_TYPES = [('totp','TOTP'), ('webauthn','WebAuthn'), ('email','Email OTP')]
    id            = UUIDField(primary_key=True)
    user          = ForeignKey(User, on_delete=CASCADE, related_name='mfa_devices')
    device_type   = CharField(max_length=20, choices=MFA_TYPES)
    name          = CharField(max_length=100)                    # "My YubiKey"
    secret        = TextField(blank=True)                        # Encrypted TOTP secret / WebAuthn credential
    is_primary    = BooleanField(default=False)
    is_verified   = BooleanField(default=False)
    last_used_at  = DateTimeField(null=True)
    created_at    = DateTimeField(auto_now_add=True)

# ── LoginAttempt ─────────────────────────────────────────
class LoginAttempt(models.Model):
    """Track login attempts for lockout and anomaly detection."""
    id            = UUIDField(primary_key=True)
    email         = EmailField(db_index=True)
    ip_address    = GenericIPAddressField()
    user_agent    = TextField()
    success       = BooleanField()
    failure_reason = CharField(max_length=50, blank=True)       # "invalid_password", "account_locked", "mfa_failed"
    mfa_method    = CharField(max_length=20, blank=True)
    created_at    = DateTimeField(auto_now_add=True)

# ── PasswordHistory ──────────────────────────────────────
class PasswordHistory(models.Model):
    """Stores hashed previous passwords to prevent reuse."""
    id            = UUIDField(primary_key=True)
    user          = ForeignKey(User, on_delete=CASCADE, related_name='password_history')
    password_hash = CharField(max_length=255)                   # Django's make_password hash
    created_at    = DateTimeField(auto_now_add=True)

# ── TenantSSOConfig ──────────────────────────────────────
class TenantSSOConfig(models.Model):
    """Per-tenant SSO configuration."""
    SSO_PROVIDERS = [('saml','SAML 2.0'), ('oidc','OpenID Connect')]
    id            = UUIDField(primary_key=True)
    tenant        = OneToOneField(Tenant, on_delete=CASCADE, related_name='sso_config')
    provider_type = CharField(max_length=10, choices=SSO_PROVIDERS)
    entity_id     = URLField()                                    # IdP entity ID
    login_url     = URLField()                                    # IdP SSO URL
    certificate   = TextField()                                   # IdP X.509 cert (PEM)
    role_mapping  = JSONField(default=dict)                       # { "IdP Group": "Local Role Name", ... }
    auto_provision = BooleanField(default=True)                   # Create user on first SSO login
    is_active     = BooleanField(default=True)
    created_at    = DateTimeField(auto_now_add=True)
    updated_at    = DateTimeField(auto_now=True)

# ── PasswordResetToken ───────────────────────────────────
class PasswordResetToken(models.Model):
    """Short-lived OTP for password reset flow."""
    id            = UUIDField(primary_key=True)
    user          = ForeignKey(User, on_delete=CASCADE)
    otp_hash      = CharField(max_length=128)                   # Hashed 6-digit code
    expires_at    = DateTimeField()
    is_used       = BooleanField(default=False)
    created_at    = DateTimeField(auto_now_add=True)
```

### 7.2 User Model Enhancements (existing model update)

```python
# Fields to add to existing User model:
mfa_enabled        = BooleanField(default=False)
password_changed_at = DateTimeField(null=True, blank=True)
force_password_change = BooleanField(default=False)
failed_login_count = IntegerField(default=0)
locked_until       = DateTimeField(null=True, blank=True)
```

### 7.3 ERD

```
┌────────────────────┐     ┌───────────────────────┐
│       User         │     │     UserSession        │
│ (existing + new    │────<│ refresh_token_jti      │
│  mfa_enabled,      │     │ device_fingerprint     │
│  locked_until,     │     │ ip_address, location   │
│  force_pwd_change) │     │ is_active, expires_at  │
└────────┬───────────┘     └───────────────────────┘
         │
         ├──────<┌─────────────────┐
         │       │   MFADevice     │
         │       │ type, secret    │
         │       │ is_primary      │
         │       └─────────────────┘
         │
         ├──────<┌─────────────────┐
         │       │ PasswordHistory │
         │       │ password_hash   │
         │       └─────────────────┘
         │
         ├──────<┌─────────────────┐
         │       │ LoginAttempt    │
         │       │ email, ip       │
         │       │ success, reason │
         │       └─────────────────┘
         │
         └──────<┌─────────────────────┐
                 │ PasswordResetToken  │
                 │ otp_hash, expires   │
                 └─────────────────────┘

┌────────────────────┐     ┌─────────────────────┐
│      Tenant        │─────│  TenantSSOConfig    │
│                    │  1:1│ provider_type        │
│                    │     │ entity_id, login_url │
│                    │     │ certificate          │
│                    │     │ role_mapping (JSON)   │
└────────────────────┘     └─────────────────────┘
```

---

## 8. API Design

### 8.1 Authentication Endpoints

| Endpoint                       | Method | Auth   | Purpose                                  |
| ------------------------------ | ------ | ------ | ---------------------------------------- |
| `/api/auth/login/`             | POST   | Public | Email + password login                   |
| `/api/auth/mfa/verify/`        | POST   | Public | Verify MFA code (TOTP/Email/WebAuthn)    |
| `/api/auth/refresh/`           | POST   | Public | Refresh access token                     |
| `/api/auth/logout/`            | POST   | Auth   | Revoke current session                   |
| `/api/auth/logout-all/`        | POST   | Auth   | Revoke all sessions                      |
| `/api/auth/forgot-password/`   | POST   | Public | Request password reset OTP               |
| `/api/auth/reset-password/`    | POST   | Public | Verify OTP + set new password            |
| `/api/auth/sso/saml/login/`    | GET    | Public | Initiate SAML SSO (redirect to IdP)      |
| `/api/auth/sso/saml/acs/`      | POST   | Public | SAML Assertion Consumer Service callback |
| `/api/auth/sso/oidc/callback/` | GET    | Public | OIDC callback handler                    |

### 8.2 Profile Endpoints

| Endpoint                          | Method  | Auth | Purpose                            |
| --------------------------------- | ------- | ---- | ---------------------------------- |
| `/api/auth/me/`                   | GET/PUT | Auth | View/update own profile            |
| `/api/auth/change-password/`      | POST    | Auth | Change password (requires current) |
| `/api/auth/sessions/`             | GET     | Auth | List active sessions/devices       |
| `/api/auth/sessions/{id}/revoke/` | POST    | Auth | Revoke specific session            |

### 8.3 MFA Management Endpoints

| Endpoint                      | Method | Auth | Purpose                                  |
| ----------------------------- | ------ | ---- | ---------------------------------------- |
| `/api/auth/mfa/setup/`        | POST   | Auth | Start MFA setup (returns QR code/secret) |
| `/api/auth/mfa/confirm/`      | POST   | Auth | Confirm MFA setup with verification code |
| `/api/auth/mfa/devices/`      | GET    | Auth | List registered MFA devices              |
| `/api/auth/mfa/devices/{id}/` | DELETE | Auth | Remove MFA device                        |
| `/api/auth/mfa/disable/`      | POST   | Auth | Disable MFA (requires password)          |

### 8.4 Admin Auth Endpoints (Tenant Admin)

| Endpoint                             | Method  | Auth  | Purpose                       |
| ------------------------------------ | ------- | ----- | ----------------------------- |
| `/api/admin/users/{id}/force-reset/` | POST    | Admin | Force password reset for user |
| `/api/admin/users/{id}/unlock/`      | POST    | Admin | Unlock locked account         |
| `/api/admin/users/{id}/sessions/`    | GET     | Admin | View user's active sessions   |
| `/api/admin/users/{id}/revoke-all/`  | POST    | Admin | Revoke all user sessions      |
| `/api/admin/sso/config/`             | GET/PUT | Admin | Configure tenant SSO settings |

---

## 9. Security Design

### 9.1 Threat Model

| Threat                      | Mitigation                                                                |
| --------------------------- | ------------------------------------------------------------------------- |
| Brute force attack          | Progressive lockout: 5 attempts → 1min, 10 → 5min, 15 → 30min lock        |
| Credential stuffing         | CAPTCHA after 3 failures, breached password detection                     |
| Token theft via XSS         | httpOnly secure cookies for refresh token, short-lived access token       |
| Session hijacking           | Device fingerprinting, IP change detection, session binding               |
| CSRF                        | SameSite=Lax cookies, CSRF token for cookie-based auth                    |
| Man-in-the-middle           | HSTS headers, TLS-only, secure cookie flags                               |
| Privilege escalation        | Token claims are minimal (user_id only), permissions resolved server-side |
| Account takeover            | MFA, anomalous login alerting, force re-auth for sensitive actions        |
| Phishing (SSO relay attack) | Strict ACS URL validation, response signature verification                |

### 9.2 Token Security Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Token Strategy                       │
│                                                       │
│  Access Token (JWT):                                  │
│    • Short-lived: 15 minutes                          │
│    • In-memory only (JavaScript variable)             │
│    • Claims: { user_id, tenant_id, iat, exp, jti }   │
│    • Algorithm: RS256 (asymmetric)                    │
│                                                       │
│  Refresh Token (Opaque):                              │
│    • Stored in httpOnly, Secure, SameSite=Strict cookie│
│    • Server-side record in UserSession table          │
│    • Rotated on every use (old one invalidated)       │
│    • Bound to device fingerprint                      │
│    • Lifetime: 7 days (configurable per tenant)       │
│                                                       │
│  MFA Session Token:                                   │
│    • Short-lived: 5 minutes                           │
│    • One-time use                                     │
│    • Not a JWT — opaque Redis key                     │
└──────────────────────────────────────────────────────┘
```

### 9.3 Account Lockout Strategy

```
Attempt 1-5:   Normal — no lockout
Attempt 6:     Lock 1 minute + CAPTCHA required
Attempt 10:    Lock 5 minutes
Attempt 15:    Lock 30 minutes + alert tenant admin
Attempt 20+:   Lock 1 hour + alert user via email

Lock is per-email, stored in Redis (survives restarts).
Successful login resets counter.
Admin can manually unlock.
```

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Metric                      | Target      | Current  |
| --------------------------- | ----------- | -------- |
| Login latency (p95)         | < 200ms     | ~100ms   |
| Token refresh latency (p95) | < 50ms      | ~30ms    |
| Auth check per request      | < 5ms       | ~3ms     |
| MFA verification            | < 500ms     | N/A      |
| Concurrent login capacity   | > 1000/sec  | ~200/sec |
| Login attempt storage       | 90 days     | None     |
| Session storage             | 1M+ records | None     |

### 10.2 Caching Strategy

| Data                  | Cache Key                  | TTL    | Invalidation     |
| --------------------- | -------------------------- | ------ | ---------------- |
| Lockout counter       | `lockout:{email}`          | 1 hour | Successful login |
| MFA session           | `mfa_session:{token}`      | 5 min  | Used or expired  |
| Password reset OTP    | `pwd_reset:{user_id}`      | 15 min | Used or expired  |
| SSO config per tenant | `sso_config:{tenant_slug}` | 10 min | Config update    |
| Failed attempt count  | `failed_attempts:{email}`  | 30 min | Successful login |

### 10.3 Reliability

- **Token blacklist cleanup:** Celery beat task daily, remove expired blacklist entries
- **Session cleanup:** Celery beat task, remove sessions expired > 7 days
- **Login attempt archival:** After 90 days, archive to cold storage / delete
- **SSO certificate rotation:** Alert admin 30 days before cert expiry
- **Database:** Login attempts table partitioned by month for performance

---

## 11. Frontend Design

### 11.1 Updated Login Flow

```
Login Page
    │
    ├─ Email + Password form
    │   └─ [Submit] → POST /auth/login/
    │       ├─ Success (no MFA) → Store tokens → Redirect to dashboard
    │       └─ MFA Required → Show MFA verification step
    │           ├─ TOTP input (6-digit)
    │           ├─ "Use backup code" link
    │           └─ [Verify] → POST /auth/mfa/verify/ → Store tokens → Redirect
    │
    ├─ "Sign in with SSO" button (if tenant has SSO configured)
    │   └─ Redirect to `/auth/sso/saml/login/?tenant=<slug>`
    │
    └─ "Forgot password?" link
        └─ Enter email → POST /auth/forgot-password/
            └─ Enter OTP + new password → POST /auth/reset-password/
```

### 11.2 Profile / Security Page

```
Profile Page
    ├─ Personal Information (existing)
    │
    ├─ Security Section
    │   ├─ Change Password (existing - enhanced with strength meter)
    │   ├─ Two-Factor Authentication
    │   │   ├─ Status: Enabled / Disabled
    │   │   ├─ [Setup 2FA] → Modal with QR code + verification
    │   │   └─ Device list with remove buttons
    │   │
    │   └─ Active Sessions
    │       ├─ List of devices with: name, IP, location, last active
    │       ├─ Current session highlighted
    │       └─ [Revoke] per session, [Revoke All Others] button
    │
    └─ Login History (last 20 attempts)
        └─ Table: date, device, IP, location, status (success/failed)
```

### 11.3 New Components

| Component               | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `MFASetupModal`         | QR code display + verification step      |
| `SessionList`           | Active devices with revoke buttons       |
| `LoginHistory`          | Recent login attempts table              |
| `PasswordStrengthMeter` | Visual indicator for password complexity |
| `SSOConfigPanel`        | Admin panel for SSO setup                |
| `ForgotPasswordFlow`    | Multi-step password reset wizard         |

---

## 12. Migration Strategy

### Phase 1: Foundation (Non-Breaking)

- Add new fields to User model (`mfa_enabled`, `password_changed_at`, `locked_until`, `force_password_change`)
- Create new models: `UserSession`, `LoginAttempt`, `PasswordHistory`
- Migrate existing login to create `UserSession` records
- Add login rate limiting with Redis

### Phase 2: Password Enhancement

- Add password complexity validation
- Create `PasswordHistory` entries on every password change
- Add "forgot password" flow (email OTP)
- Add password strength meter to frontend

### Phase 3: MFA

- Create `MFADevice` model
- Implement TOTP setup/verification service
- Add MFA challenge step to login flow
- Build MFA setup UI in profile

### Phase 4: Session Management

- Build session/device management UI
- Add session revocation endpoints
- Implement device fingerprinting
- Add anomalous login detection + alerting

### Phase 5: SSO (Enterprise)

- Create `TenantSSOConfig` model
- Implement SAML 2.0 SP with assertion validation
- Implement OIDC RP flow
- Add SSO admin configuration UI
- Build IdP group → role mapping

---

## 13. Implementation Roadmap

| #   | Task                                   | Phase | Depends On | Priority |
| --- | -------------------------------------- | ----- | ---------- | -------- |
| 1   | Add User model auth fields (migration) | 1     | —          | Critical |
| 2   | Create UserSession model               | 1     | —          | Critical |
| 3   | Create LoginAttempt model              | 1     | —          | Critical |
| 4   | Build AuthenticationService            | 1     | 1, 2, 3    | Critical |
| 5   | Add progressive lockout logic          | 1     | 3          | High     |
| 6   | Login rate limiter (Redis-backed)      | 1     | —          | High     |
| 7   | Create session on login, track devices | 1     | 2          | High     |
| 8   | Create PasswordHistory model           | 2     | —          | High     |
| 9   | Password complexity validator          | 2     | —          | High     |
| 10  | Password history check service         | 2     | 8          | High     |
| 11  | Forgot password flow (API + email)     | 2     | —          | High     |
| 12  | Frontend: password strength meter      | 2     | 9          | Medium   |
| 13  | Frontend: forgot password pages        | 2     | 11         | Medium   |
| 14  | Create MFADevice model                 | 3     | —          | High     |
| 15  | TOTP service (pyotp integration)       | 3     | 14         | High     |
| 16  | MFA challenge step in login flow       | 3     | 15         | High     |
| 17  | Frontend: MFA setup modal with QR code | 3     | 16         | High     |
| 18  | Email OTP as MFA method                | 3     | 14         | Medium   |
| 19  | Session list API endpoint              | 4     | 2          | Medium   |
| 20  | Session revocation API                 | 4     | 19         | Medium   |
| 21  | Frontend: active session list          | 4     | 19         | Medium   |
| 22  | Device fingerprinting service          | 4     | 2          | Medium   |
| 23  | Anomalous login alerts                 | 4     | 3, 22      | Medium   |
| 24  | Login history API + UI                 | 4     | 3          | Low      |
| 25  | TenantSSOConfig model                  | 5     | —          | Medium   |
| 26  | SAML 2.0 SP implementation             | 5     | 25         | Medium   |
| 27  | OIDC RP implementation                 | 5     | 25         | Medium   |
| 28  | SSO admin config UI                    | 5     | 26, 27     | Medium   |
| 29  | IdP group → role mapping               | 5     | 28         | Medium   |
| 30  | Remove demo credentials from Login.tsx | 1     | —          | Critical |

---

> **Status:** Analysis complete. Implementation ON HOLD until design review and approval.

---

## 14. Implementation Status

> **Implemented** — All backend services, models, migrations, API endpoints, frontend pages, and Celery tasks are in place.

### Files Created

| File | Purpose |
| --- | --- |
| `apps/core/services/password.py` | Password complexity validation + history management |
| `apps/core/services/lockout.py` | Progressive Redis-backed account lockout |
| `apps/core/services/session_manager.py` | Per-device session tracking tied to refresh tokens |
| `apps/core/services/authentication.py` | Login / MFA challenge / logout orchestrator |
| `apps/core/services/mfa.py` | TOTP setup, email OTP, device management |
| `apps/core/services/password_reset.py` | Forgot / reset password OTP flow |
| `apps/core/tasks.py` | Celery cleanup tasks (sessions, login attempts) |
| `apps/api/serializers/auth.py` | All auth request/response serializers |
| `apps/core/migrations/0012_auth_identity_redesign.py` | Migration for all new models & fields |
| `frontend/src/pages/ForgotPassword.tsx` | Forgot password page |
| `frontend/src/pages/ResetPassword.tsx` | Reset password with OTP page |

### Files Modified

| File | Changes |
| --- | --- |
| `apps/core/models.py` | 5 User auth fields + 6 new models (UserSession, LoginAttempt, PasswordHistory, MFADevice, PasswordResetToken, TenantSSOConfig) |
| `apps/api/views/auth.py` | Full rewrite — 20 endpoints (login, MFA verify, logout, sessions, password reset, MFA management, admin endpoints) |
| `apps/api/urls.py` | 20 new URL patterns for all auth endpoints |
| `config/celery.py` | 2 new periodic tasks (session cleanup daily, login attempt archival weekly) |
| `requirements.txt` | Added pyotp, qrcode, Pillow |
| `frontend/src/services/auth.service.ts` | All new API methods (MFA, sessions, password reset, logout) |
| `frontend/src/store/auth.store.ts` | MFA challenge state (mfaSession, mfaMethods) |
| `frontend/src/pages/Login.tsx` | MFA flow + forgot password link + demo credentials removed |
| `frontend/src/pages/Profile.tsx` | Active sessions list, MFA setup/disable, device management |
| `frontend/src/App.tsx` | Routes for /forgot-password and /reset-password |
| `frontend/src/components/layout/TopNav.tsx` | Async logout (server-side session revocation) |

### Remaining Manual / Future Steps

1. **Redis required** — lockout, MFA sessions, and email OTP all use Redis cache. Ensure `CACHES` in `config/settings.py` points to a running Redis instance.
2. **Email sending** — `NotificationService.send_notification()` is called for password reset and email OTP. Ensure email backend is configured in Django settings (`EMAIL_HOST`, `EMAIL_PORT`, etc.) or the notification service has a working email channel.
3. **SSO (Phase 5)** — `TenantSSOConfig` model is created but SAML/OIDC service layer is deferred to Phase 5.
4. **Password strength meter UI** — design doc item #12. A visual strength indicator can be added to the password fields in Profile.tsx and ResetPassword.tsx.
5. **Anomalous login alerts** — design doc item #23. LoginAttempt data is being recorded; anomaly detection logic (new device/IP alerts) is a future enhancement.

---

## 14. Implementation Summary — Manual Steps & File Locations

### 14.1 Python Dependencies (install in venv)

```bash
pip install pyotp qrcode[pil]
```

**Location:** Add to `requirements.txt`:

```
pyotp>=2.9.0
qrcode[pil]>=7.4
```

### 14.2 New Files Created

| File                                    | Purpose                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| `apps/core/services/password.py`        | Password complexity validation + history management     |
| `apps/core/services/lockout.py`         | Progressive Redis-backed account lockout                |
| `apps/core/services/session_manager.py` | Per-device session tracking tied to refresh tokens      |
| `apps/core/services/authentication.py`  | Core auth orchestrator — login, MFA challenge, logout   |
| `apps/core/services/mfa.py`             | MFA device management — TOTP setup + email OTP          |
| `apps/core/services/password_reset.py`  | Forgot/reset password OTP flow                          |
| `apps/core/tasks.py`                    | Celery tasks — session cleanup + login attempt archival |
| `apps/api/serializers/auth.py`          | All auth-related serializers                            |

### 14.3 Modified Files

| File                     | Changes                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/core/models.py`    | Added 5 User fields + 6 new models (UserSession, LoginAttempt, PasswordHistory, MFADevice, PasswordResetToken, TenantSSOConfig) |
| `apps/api/views/auth.py` | Full rewrite — login via AuthenticationService, MFA, sessions, password reset, admin endpoints                                  |
| `apps/api/urls.py`       | Added 20 new URL patterns for auth/mfa/sessions/admin                                                                           |
| `config/celery.py`       | Added 2 periodic tasks (session cleanup, login attempt archival)                                                                |

### 14.4 New API Endpoints

| Method | Path                                 | Auth   | Purpose                                         |
| ------ | ------------------------------------ | ------ | ----------------------------------------------- |
| POST   | `/api/auth/login/`                   | Public | Login (returns tokens or MFA challenge)         |
| POST   | `/api/auth/mfa/verify/`              | Public | Verify MFA code during login                    |
| POST   | `/api/auth/mfa/send-email/`          | Public | Send email OTP for MFA                          |
| POST   | `/api/auth/refresh/`                 | Public | Refresh JWT tokens                              |
| POST   | `/api/auth/logout/`                  | Auth   | Logout current session                          |
| POST   | `/api/auth/logout-all/`              | Auth   | Logout all sessions                             |
| POST   | `/api/auth/change-password/`         | Auth   | Change password (complexity + history enforced) |
| POST   | `/api/auth/forgot-password/`         | Public | Request password reset OTP                      |
| POST   | `/api/auth/reset-password/`          | Public | Verify OTP + set new password                   |
| GET    | `/api/auth/sessions/`                | Auth   | List active sessions                            |
| POST   | `/api/auth/sessions/{id}/revoke/`    | Auth   | Revoke a session                                |
| POST   | `/api/auth/mfa/setup/`               | Auth   | Start TOTP setup (returns QR)                   |
| POST   | `/api/auth/mfa/confirm/`             | Auth   | Confirm TOTP setup                              |
| GET    | `/api/auth/mfa/devices/`             | Auth   | List MFA devices                                |
| DELETE | `/api/auth/mfa/devices/{id}/`        | Auth   | Remove MFA device                               |
| POST   | `/api/auth/mfa/disable/`             | Auth   | Disable MFA (requires password)                 |
| POST   | `/api/admin/users/{id}/force-reset/` | Admin  | Force password change on next login             |
| POST   | `/api/admin/users/{id}/unlock/`      | Admin  | Unlock locked-out account                       |
| GET    | `/api/admin/users/{id}/sessions/`    | Admin  | View user's sessions                            |
| POST   | `/api/admin/users/{id}/revoke-all/`  | Admin  | Revoke all user sessions                        |

### 14.5 Frontend Changes Needed

**`frontend/src/services/auth.service.ts`** — Add API calls:

- `mfaVerify(mfaSession, method, code)` → POST `/api/auth/mfa/verify/`
- `mfaSendEmail(mfaSession)` → POST `/api/auth/mfa/send-email/`
- `logout()` → POST `/api/auth/logout/`
- `logoutAll()` → POST `/api/auth/logout-all/`
- `forgotPassword(email)` → POST `/api/auth/forgot-password/`
- `resetPassword(email, otp, newPassword)` → POST `/api/auth/reset-password/`
- `getSessions()` → GET `/api/auth/sessions/`
- `revokeSession(sessionId)` → POST `/api/auth/sessions/{id}/revoke/`
- `setupMFA()` → POST `/api/auth/mfa/setup/`
- `confirmMFA(code)` → POST `/api/auth/mfa/confirm/`
- `getMFADevices()` → GET `/api/auth/mfa/devices/`
- `removeMFADevice(deviceId)` → DELETE `/api/auth/mfa/devices/{id}/`
- `disableMFA(password)` → POST `/api/auth/mfa/disable/`

**`frontend/src/store/auth.store.ts`** — Handle MFA challenge response (when login returns `mfa_required: true`, store `mfa_session` and redirect to MFA verification page)

**`frontend/src/pages/Login.tsx`** — Add MFA verification step (detect `mfa_required`, show code input, call `mfaVerify`)

**`frontend/src/pages/` (new pages to create)**:

- `ForgotPassword.tsx` — Email input → call `forgotPassword`
- `ResetPassword.tsx` — OTP + new password → call `resetPassword`
- `Sessions.tsx` — List sessions with revoke buttons (link from Profile page)
- `MFASetup.tsx` — QR code display + confirm code flow

**`frontend/src/pages/Profile.tsx`** — Add sections for:

- Change password (already exists, now enforces complexity feedback)
- MFA management (enable/disable, view devices)
- Active sessions link

### 14.6 Environment / Redis

These services require Redis to be running (already configured for Celery). No additional env vars needed — the services use Django's default cache backend.

### 14.7 Migration Applied

```
apps/core/migrations/0012_auth_identity_redesign.py
```
