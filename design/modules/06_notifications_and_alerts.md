# Notifications & Alerts — Complete Analysis & System Design

**Date:** 10 March 2026
**Scope:** Full analysis of notification system, alert delivery, targeting, and real-time capabilities
**Principle:** Analyse current → Identify gaps → Design enterprise-grade notification platform

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

The notification module implements a **Workday-inspired targeted notifications** system built in a prior session:

| Layer              | Files                                                  | Purpose                                      |
| ------------------ | ------------------------------------------------------ | -------------------------------------------- |
| **Models**         | `core/models.py` (Notification, NotificationReceipt)   | Notification storage, per-user read receipts |
| **Service**        | `core/services/notifications.py` (NotificationService) | Create, deliver, query, mark read/delete     |
| **Views**          | `api/views/chat.py` (notification endpoints)           | REST API for user notification inbox         |
| **Frontend Page**  | `pages/Notifications.tsx`                              | Notification inbox UI                        |
| **Frontend Store** | `services/notification.service.ts`                     | API wrapper for notification operations      |

### 1.2 Current Notification Targeting

```
Notification Targets (4 types):
    ├── USER        → Single user by user_id
    ├── DEPARTMENT  → All users in a department
    ├── ROLE        → All users with a specific role
    └── TENANT      → All users in the tenant (broadcast)

Visibility Resolution (NotificationService.get_notifications_for_user):
    user sees notification IF any of:
        1. target_type=USER    AND target_id=user.id
        2. target_type=DEPT    AND target_id=user.department_id
        3. target_type=ROLE    AND target_id=user.role_id
        4. target_type=TENANT  AND target_id=user.tenant_id
```

---

## 2. Component Deep-Dive

### 2.1 Notification Model

**Current Fields:**

- `id` (UUID), `tenant` (FK), `created_by` (FK User, nullable)
- `title`, `message`, `notification_type` (info/success/warning/error/system)
- `target_type` (user/department/role/tenant), `target_id` (UUID)
- `priority` (low/normal/high/urgent)
- `action_url` (optional deep-link), `metadata` (JSONField)
- `expires_at` (optional auto-expiry)
- `created_at`

**Strengths:**

- Flexible targeting — 4 resolution levels cover most scenarios
- Priority levels for urgency
- Metadata JSONField for extensibility
- Action URL for deep-linking to relevant page
- Expiry for auto-cleanup

**Issues:**

- No delivery channel management (email, push, in-app)
- No real-time delivery (polling, no WebSocket)
- No batching / digest (50 notifications = 50 items)
- No template system (every notification is raw text)
- No user notification preferences (no mute, no channel selection)
- No delivery status tracking (sent/delivered/read per channel)
- No notification categories for filtering
- Visibility query performs 4-way OR — expensive at scale
- `target_id` is opaque UUID — no FK constraint (integrity risk)
- No rate limiting on notification creation (spam risk)

### 2.2 NotificationReceipt Model

**Current Fields:**

- `notification` (FK), `user` (FK), `is_read`, `read_at`, `created_at`

**Design:**

- Created lazily — receipt exists only after user interacts
- `is_read=True` serves double duty: "read" and "dismissed/deleted"
- No bulk receipt creation on notification send (efficient for tenant-wide broadcasts)

**Issues:**

- No true delete (soft-delete via `is_read=True` means "dismissed" is "read")
- No delivery confirmation (was it actually shown to user?)
- No distinction between seen, read, and dismissed
- `mark_all_read()` creates N receipts in a loop (N+1 problem at scale)

### 2.3 NotificationService

**Current Methods:**

- `notify_user(tenant, user_id, title, message, **kwargs)` → creates Notification with target_type=USER
- `notify_department(tenant, department_id, ...)` → target_type=DEPARTMENT
- `notify_role(tenant, role_id, ...)` → target_type=ROLE
- `notify_tenant(tenant, ...)` → target_type=TENANT
- `get_notifications_for_user(user)` → 4-way OR query, excludes read receipts, orders by created_at
- `mark_read(user, notification_id)` → get_or_create receipt, set is_read
- `mark_all_read(user)` → loop through unread, create receipts (N+1)
- `delete_for_user(user, notification_id)` → actually calls mark_read (soft delete)

**Issues:**

- No async dispatch (notification creation is synchronous)
- No Celery integration for email/push delivery
- No batching multiple targets in one call
- `mark_all_read` is O(N) DB writes — should be bulk_create
- `delete_for_user` is misleading — actually marks as read
- No pagination in `get_notifications_for_user`

### 2.4 Frontend (Notifications.tsx)

**Current Features:**

- Lists notifications with unread count badge
- Mark individual as read
- Mark all as read
- Dismiss (calls delete endpoint)
- Notification type icons (info/success/warning/error)
- Priority indicator

**Issues:**

- No real-time updates (must manually refresh)
- No toast/snackbar for new notifications
- No sound or browser notification support
- No filtering by type or priority
- No notification preferences UI
- No infinite scroll / virtualized list

---

## 3. SWOT Analysis

### Strengths (6)

1. **Flexible multi-target system** — user, department, role, tenant targeting
2. **Priority system** — 4 levels enable urgency-based UI treatment
3. **Action URLs** — deep-link to relevant page from notification
4. **Metadata extensibility** — JSONField allows arbitrary data attachment
5. **Expiry support** — auto-cleanup of stale notifications
6. **Clean service layer** — `NotificationService` encapsulates all logic

### Weaknesses (12)

1. No multi-channel delivery (email, push, SMS)
2. No real-time delivery (no WebSocket / SSE)
3. No notification templates
4. No user preferences (mute, channel selection, schedule)
5. No digest/batching (e.g., daily summary email)
6. No delivery status tracking
7. No rate limiting on notification creation
8. Visibility query is 4-way OR (expensive at scale)
9. `mark_all_read` is O(N) (N+1 problem)
10. No notification categories
11. No true delete vs. dismiss distinction
12. No retry on failed delivery

### Opportunities (5)

1. WebSocket-based real-time notifications
2. Email digest for daily/weekly summaries
3. Browser push notifications (Web Push API)
4. Mobile push via FCM/APNs (future mobile app)
5. Integration with external tools (Slack, Teams webhooks)

### Threats (3)

1. Notification fatigue — users ignore everything without preferences
2. Scale bottleneck — 4-way OR query on 100K notifications
3. Compliance gaps — no proof of delivery for critical notifications

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability             | Current State     | Enterprise Target                   | Gap    |
| ---------------------- | ----------------- | ----------------------------------- | ------ |
| Multi-target delivery  | ✅ 4 target types | ✅ 4 target types                   | None   |
| In-app notifications   | ✅ Basic inbox    | ✅ Rich inbox + real-time           | Medium |
| Real-time delivery     | ❌ Polling only   | ✅ WebSocket/SSE                    | Large  |
| Email notifications    | ❌ None           | ✅ Per-event + digest               | Large  |
| Push notifications     | ❌ None           | ✅ Browser push + mobile            | Large  |
| User preferences       | ❌ None           | ✅ Per-category channel preferences | Large  |
| Notification templates | ❌ Raw text only  | ✅ Template engine with variables   | Medium |
| Digest/batching        | ❌ None           | ✅ Configurable digest frequency    | Medium |
| Delivery tracking      | ❌ None           | ✅ Sent/delivered/read per channel  | Medium |
| Rate limiting          | ❌ None           | ✅ Per-sender rate limits           | Small  |
| Categories/filtering   | ❌ None           | ✅ Category-based filter + mute     | Medium |
| External integrations  | ❌ None           | ✅ Slack/Teams/webhook              | Medium |
| Scalable query         | ⚠️ 4-way OR       | ✅ Materialized/denormalized inbox  | Medium |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **Channel-agnostic core** — notification created once, dispatched to multiple channels
2. **User control first** — users choose what they receive and how
3. **Fan-out at dispatch** — resolve targets at send time, create per-user delivery records
4. **At-least-once delivery** — retry failed deliveries with exponential backoff
5. **Real-time where possible** — WebSocket for in-app, async for email/push

### 5.2 Multi-Channel Architecture

```
Event Source (system event or admin action)
    │
    ▼
NotificationService.send(template_key, context, targets)
    │
    ├── 1. Resolve template → render title + message
    ├── 2. Resolve targets → list of user_ids
    ├── 3. Check per-user preferences → filter channels
    │
    ▼
NotificationDispatcher (Celery task)
    │
    ├── Channel: IN_APP
    │   ├── Create UserNotification record
    │   └── Push via WebSocket (Django Channels)
    │
    ├── Channel: EMAIL
    │   ├── Check email preference + digest setting
    │   ├── If instant: send via email backend (SendGrid/SES)
    │   └── If digest: queue in DigestQueue
    │
    ├── Channel: BROWSER_PUSH
    │   ├── Lookup PushSubscription for user
    │   └── Send via Web Push protocol (pywebpush)
    │
    └── Channel: WEBHOOK
        ├── Lookup WebhookEndpoint for tenant
        └── POST to configured URL (Slack/Teams/custom)

Delivery Tracking:
    DeliveryRecord(notification, user, channel, status, sent_at, delivered_at, read_at)
```

### 5.3 Notification Templates

```python
# Template definition:
NotificationTemplate(
    key='document_uploaded',
    title_template='New document: {{ document_name }}',
    message_template='{{ uploader_name }} uploaded "{{ document_name }}" to {{ folder_name }}.',
    default_channels=['in_app', 'email'],
    category='documents',
    default_priority='normal'
)

# Usage:
NotificationService.send(
    template_key='document_uploaded',
    context={
        'document_name': 'Q4 Report.pdf',
        'uploader_name': 'Alice',
        'folder_name': 'Finance'
    },
    targets=[Target(type='department', id=dept_id)]
)
```

### 5.4 User Preference Model

```
UserNotificationPreference:
    user_id     → FK User
    category    → CharField (documents / chat / system / admin / security)
    channel     → CharField (in_app / email / browser_push)
    enabled     → Boolean
    digest_mode → CharField (instant / hourly / daily / weekly) — email only

Example preferences for a user:
    ┌──────────────┬─────────┬──────────────┬──────────┐
    │ Category     │ In-App  │ Email        │ Push     │
    ├──────────────┼─────────┼──────────────┼──────────┤
    │ Documents    │ ✅       │ Daily digest │ ✅       │
    │ Chat         │ ✅       │ ❌           │ ✅       │
    │ System       │ ✅       │ Instant      │ ❌       │
    │ Admin        │ ✅       │ Instant      │ ✅       │
    │ Security     │ ✅       │ Instant      │ ✅       │ (always on, non-overridable)
    └──────────────┴─────────┴──────────────┴──────────┘
```

### 5.5 Real-Time Delivery (WebSocket)

```
Django Channels Architecture:

Browser ──WebSocket──→ NotificationConsumer
                            │
                            ├── on_connect: join group "user_{user_id}"
                            ├── on_disconnect: leave group
                            └── on_channel_message: send JSON to client

Server-side push:
    NotificationDispatcher → channel_layer.group_send(
        f"user_{user_id}",
        {"type": "notification.new", "data": serialized_notification}
    )

Client-side:
    WebSocket onmessage → add to notification store → show toast → update badge count
```

### 5.6 Digest System

```
Celery beat schedule:
    ┌──────────────────────────────────────────┐
    │ Every hour:  process_hourly_digests()     │
    │ Every day @9AM: process_daily_digests()  │
    │ Every Mon @9AM: process_weekly_digests() │
    └──────────────────────────────────────────┘

process_daily_digest():
    for each user with digest_mode='daily' for any category:
        1. Collect all undelivered notifications in those categories (last 24h)
        2. Group by category
        3. Render digest email template
        4. Send single email with all grouped notifications
        5. Mark as delivered (channel=email)
```

---

## 6. Architecture Design

### 6.1 Module Structure

```
apps/
  notifications/                  # NEW dedicated notifications app
    __init__.py
    models.py                     # NotificationTemplate, UserNotification,
                                  # DeliveryRecord, UserNotificationPreference,
                                  # PushSubscription, WebhookEndpoint, DigestQueue
    services/
      __init__.py
      notification_service.py     # Core: send(), resolve targets, check preferences
      dispatcher.py               # Celery tasks: dispatch to channels
      email_service.py            # Email rendering + sending
      push_service.py             # Browser push via Web Push protocol
      webhook_service.py          # Slack/Teams/custom webhook delivery
      digest_service.py           # Digest collection + batched delivery
      template_service.py         # Template rendering with Jinja2
    consumers.py                  # Django Channels WebSocket consumer
    routing.py                    # WebSocket URL routing
    views/
      __init__.py
      inbox.py                    # User notification inbox endpoints
      preferences.py              # User notification preference endpoints
      admin.py                    # Admin: template management, stats
    admin.py
    urls.py
    migrations/
```

### 6.2 Dependency Graph

```
notifications module
    ├── core.models (User, Tenant, Department, Role)
    ├── django_channels (WebSocket real-time delivery)
    ├── celery (async dispatch, digest scheduling)
    ├── django.core.mail (email backend)
    └── External:
        ├── sendgrid / ses (email delivery)
        ├── pywebpush (browser push)
        └── httpx (webhook delivery)
```

---

## 7. Data Model Design

### 7.1 Models

```python
# ── NotificationTemplate ────────────────────────────────
class NotificationTemplate(models.Model):
    key              = CharField(max_length=100, unique=True)    # 'document_uploaded'
    title_template   = CharField(max_length=500)                 # Jinja2 template
    message_template = TextField()                               # Jinja2 template
    email_subject    = CharField(max_length=500, blank=True)     # Email-specific subject
    email_body       = TextField(blank=True)                     # HTML email template
    category         = CharField(max_length=50)                  # documents, chat, system, admin, security
    default_priority = CharField(max_length=10, default='normal')
    default_channels = JSONField(default=list)                   # ['in_app', 'email']
    is_active        = BooleanField(default=True)
    created_at       = DateTimeField(auto_now_add=True)

# ── UserNotification (denormalized inbox) ───────────────
class UserNotification(models.Model):
    """Per-user materialized notification — enables fast inbox queries."""
    id               = UUIDField(primary_key=True)
    user             = ForeignKey(User, CASCADE, related_name='notifications_inbox')
    tenant           = ForeignKey(Tenant, CASCADE)
    title            = CharField(max_length=500)
    message          = TextField()
    notification_type = CharField(max_length=20)    # info/success/warning/error/system
    category         = CharField(max_length=50)
    priority         = CharField(max_length=10)
    action_url       = CharField(max_length=500, blank=True)
    metadata         = JSONField(default=dict)
    source_notification = ForeignKey('Notification', SET_NULL, null=True)  # original broadcast
    is_read          = BooleanField(default=False)
    read_at          = DateTimeField(null=True)
    is_dismissed     = BooleanField(default=False)
    dismissed_at     = DateTimeField(null=True)
    expires_at       = DateTimeField(null=True)
    created_at       = DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['user', 'is_read', '-created_at']),
            models.Index(fields=['user', 'category', '-created_at']),
        ]

# ── DeliveryRecord ──────────────────────────────────────
class DeliveryRecord(models.Model):
    """Track delivery status per channel per user."""
    CHANNELS = [('in_app','In-App'), ('email','Email'), ('browser_push','Browser Push'), ('webhook','Webhook')]
    STATUSES = [('pending','Pending'), ('sent','Sent'), ('delivered','Delivered'), ('failed','Failed'), ('skipped','Skipped')]

    id               = UUIDField(primary_key=True)
    user_notification = ForeignKey(UserNotification, CASCADE, related_name='deliveries')
    channel          = CharField(max_length=20, choices=CHANNELS)
    status           = CharField(max_length=20, choices=STATUSES, default='pending')
    sent_at          = DateTimeField(null=True)
    delivered_at     = DateTimeField(null=True)
    failure_reason   = TextField(blank=True)
    retry_count      = IntegerField(default=0)
    next_retry_at    = DateTimeField(null=True)

# ── UserNotificationPreference ─────────────────────────
class UserNotificationPreference(models.Model):
    DIGEST_MODES = [('instant','Instant'), ('hourly','Hourly'), ('daily','Daily'), ('weekly','Weekly')]

    user             = ForeignKey(User, CASCADE, related_name='notification_preferences')
    category         = CharField(max_length=50)     # documents, chat, system, admin, security
    channel          = CharField(max_length=20)      # in_app, email, browser_push
    enabled          = BooleanField(default=True)
    digest_mode      = CharField(max_length=10, default='instant')

    class Meta:
        unique_together = [['user', 'category', 'channel']]

# ── PushSubscription ───────────────────────────────────
class PushSubscription(models.Model):
    """Browser push notification subscription (Web Push API)."""
    user             = ForeignKey(User, CASCADE, related_name='push_subscriptions')
    endpoint         = TextField()                   # Push service URL
    p256dh_key       = CharField(max_length=200)     # Encryption key
    auth_key         = CharField(max_length=200)     # Auth secret
    user_agent       = CharField(max_length=300, blank=True)
    created_at       = DateTimeField(auto_now_add=True)

# ── WebhookEndpoint ────────────────────────────────────
class WebhookEndpoint(models.Model):
    """Tenant-level webhook for external delivery (Slack, Teams, custom)."""
    tenant           = ForeignKey(Tenant, CASCADE, related_name='webhook_endpoints')
    name             = CharField(max_length=100)     # "Slack #alerts"
    url              = URLField()                    # Webhook URL
    categories       = JSONField(default=list)       # ['system', 'security'] or [] for all
    secret           = CharField(max_length=200)     # HMAC signature secret
    is_active        = BooleanField(default=True)
    created_at       = DateTimeField(auto_now_add=True)

# ── DigestQueue ────────────────────────────────────────
class DigestQueue(models.Model):
    """Queue for batched digest delivery."""
    user             = ForeignKey(User, CASCADE)
    user_notification = ForeignKey(UserNotification, CASCADE)
    digest_mode      = CharField(max_length=10)      # hourly, daily, weekly
    processed        = BooleanField(default=False)
    created_at       = DateTimeField(auto_now_add=True)
```

### 7.2 ERD

```
┌──────────────────────┐
│ NotificationTemplate │
│ key, title, message  │
│ category, priority   │
└──────────┬───────────┘
           │ (used to create)
           ▼
┌──────────────────────┐      ┌────────────────────────┐
│    Notification      │      │  UserNotification      │
│ (broadcast source)   │──1:N─│ (per-user materialized)│
│ target_type, target_id│      │ user, title, message  │
└──────────────────────┘      │ is_read, is_dismissed  │
                               └───────────┬────────────┘
                                           │
                                    ┌──────┴──────┐
                                    │             │
                              ┌─────┴──────┐ ┌───┴──────────┐
                              │ Delivery   │ │ DigestQueue  │
                              │ Record     │ │              │
                              │ channel,   │ │ digest_mode, │
                              │ status     │ │ processed    │
                              └────────────┘ └──────────────┘

┌─────────────────────────────┐
│ UserNotificationPreference  │
│ user, category, channel     │
│ enabled, digest_mode        │
└─────────────────────────────┘

┌─────────────────────────────┐   ┌────────────────────────┐
│    PushSubscription         │   │   WebhookEndpoint      │
│ user, endpoint, keys        │   │ tenant, url, secret    │
└─────────────────────────────┘   └────────────────────────┘
```

---

## 8. API Design

### 8.1 User Inbox Endpoints

| Endpoint                            | Method | Auth | Purpose                                              |
| ----------------------------------- | ------ | ---- | ---------------------------------------------------- |
| `/api/notifications/`               | GET    | Auth | Paginated inbox (filter by category, read, priority) |
| `/api/notifications/unread-count/`  | GET    | Auth | Unread count (for badge)                             |
| `/api/notifications/{id}/read/`     | POST   | Auth | Mark single as read                                  |
| `/api/notifications/{id}/dismiss/`  | POST   | Auth | Dismiss (hide) notification                          |
| `/api/notifications/mark-all-read/` | POST   | Auth | Bulk mark all as read                                |

### 8.2 Preference Endpoints

| Endpoint                                     | Method | Auth | Purpose                      |
| -------------------------------------------- | ------ | ---- | ---------------------------- |
| `/api/notifications/preferences/`            | GET    | Auth | List user preferences        |
| `/api/notifications/preferences/`            | PUT    | Auth | Bulk update preferences      |
| `/api/notifications/push-subscription/`      | POST   | Auth | Register push subscription   |
| `/api/notifications/push-subscription/{id}/` | DELETE | Auth | Unregister push subscription |

### 8.3 Admin Endpoints

| Endpoint                                    | Method     | Auth     | Purpose                             |
| ------------------------------------------- | ---------- | -------- | ----------------------------------- |
| `/api/admin/notifications/send/`            | POST       | Admin    | Send notification (admin broadcast) |
| `/api/admin/notifications/templates/`       | GET/POST   | Platform | Manage notification templates       |
| `/api/admin/notifications/templates/{key}/` | PUT/DELETE | Platform | Update/delete template              |
| `/api/admin/notifications/stats/`           | GET        | Admin    | Delivery statistics                 |
| `/api/admin/notifications/webhooks/`        | GET/POST   | Admin    | Manage tenant webhooks              |
| `/api/admin/notifications/webhooks/{id}/`   | PUT/DELETE | Admin    | Update/delete webhook               |

---

## 9. Security Design

### 9.1 Threat Model

| Threat                            | Mitigation                                                      |
| --------------------------------- | --------------------------------------------------------------- |
| Notification spoofing             | Only system + admin users can create notifications              |
| Cross-tenant notification leakage | UserNotification has tenant FK, queries always filter by tenant |
| WebSocket hijacking               | JWT authentication on WS connect, same-origin validation        |
| Push subscription forgery         | Verify subscription ownership via challenge                     |
| Webhook SSRF                      | Validate webhook URL against allowlist, no internal IPs         |
| Webhook secret exposure           | HMAC-SHA256 signed payloads, secrets encrypted at rest          |
| Notification spam                 | Rate limit: max 100 notifications per hour per sender           |
| Sensitive data in notifications   | Never include passwords, tokens, PII in notification text       |

### 9.2 WebSocket Authentication

```
Connection flow:
    1. Client opens WS with JWT in query param: ws://host/ws/notifications/?token=xxx
    2. NotificationConsumer.connect():
       a. Extract token from query string
       b. Validate JWT (same as REST auth)
       c. If valid: accept connection, join user group
       d. If invalid: close with 4401 code
    3. Token refresh: client sends {"type": "auth.refresh", "token": "new_jwt"}
    4. Heartbeat: ping/pong every 30s, disconnect on 3 missed pongs
```

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Metric                       | Target         | Current |
| ---------------------------- | -------------- | ------- |
| Inbox query latency          | < 50ms         | ~100ms  |
| Unread count query           | < 5ms (cached) | ~30ms   |
| WebSocket message latency    | < 100ms        | N/A     |
| Fan-out for 1000-user tenant | < 5s           | N/A     |
| Email delivery               | < 30s          | N/A     |
| Push delivery                | < 5s           | N/A     |

### 10.2 Fan-Out Strategy

```
Tenant-wide broadcast to 1000 users:

Current approach: single Notification row, 4-way OR query per user
    Problem: every user query scans all notifications

Proposed approach: materialized fan-out
    1. Create source Notification (1 row)
    2. Celery task: resolve target → 1000 user_ids
    3. Batch create 1000 UserNotification rows (bulk_create, batch_size=500)
    4. For each user: push via WebSocket (channel_layer.group_send)

    Benefits:
    - Inbox query is simple: UserNotification.filter(user=me, is_dismissed=False)
    - Single index on (user, created_at) — O(log N)
    - No 4-way OR, no cross-table joins

    Tradeoff:
    - More storage (1000 rows vs 1)
    - Acceptable: UUID + varchar fields = ~500 bytes/row × 1000 = ~500KB per broadcast
```

### 10.3 Unread Count Caching

```
Redis key: notif:unread:{user_id}
Operations:
    - On new notification materialized: INCR
    - On mark_read: DECR
    - On mark_all_read: SET to 0
    - On inbox query (cache miss): COUNT from DB, SET in Redis
    - TTL: 5 minutes (fallback to DB)
```

---

## 11. Frontend Design

### 11.1 Real-Time Notification UX

```
Page Layout with Notifications:
┌──────────────────────────────────────────────────────────────┐
│  Nav Bar                              🔔 3  [avatar]        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ... page content ...                                         │
│                                                               │
│  ┌────────────────────────────────────┐ ← Toast (auto-dismiss)
│  │ 🟢 New document: Q4 Report.pdf     │    after 5s           │
│  │    Alice uploaded to Finance        │                       │
│  │    [View Document]   [Dismiss]      │                       │
│  └────────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

### 11.2 Notification Inbox (Redesigned)

```
Notifications Inbox:
┌──────────────────────────────────────────────────────────────┐
│  Notifications                          [Mark All Read]       │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ All │ Documents │ Chat │ System │ Admin │ Security       ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ● Today                                                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔴 URGENT  Security alert: suspicious login attempt    │  │
│  │    From IP 192.168.x.x — 2 minutes ago     [Details]  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 🟡 New document: Q4 Report.pdf                         │  │
│  │    Alice uploaded to Finance — 15 minutes ago          │  │
│  │    [View Document]                          [Dismiss]  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 🔵 Chat response ready in "Budget Analysis"            │  │
│  │    3 new messages — 1 hour ago              [Open Chat]│  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ● Yesterday                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ... older notifications ...                             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  [Load more...]                                               │
└──────────────────────────────────────────────────────────────┘
```

### 11.3 Notification Preferences Page

```
Notification Preferences:
┌──────────────────────────────────────────────────────────────┐
│  Notification Settings                                        │
│                                                               │
│  ┌────────────────┬────────────┬────────────────┬─────────┐  │
│  │ Category       │ In-App     │ Email          │ Push    │  │
│  ├────────────────┼────────────┼────────────────┼─────────┤  │
│  │ Documents      │ [✅]       │ [Daily digest ▾]│ [✅]    │  │
│  │ Chat           │ [✅]       │ [Off ▾]        │ [✅]    │  │
│  │ System         │ [✅]       │ [Instant ▾]    │ [  ]    │  │
│  │ Admin          │ [✅]       │ [Instant ▾]    │ [✅]    │  │
│  │ Security       │ [✅] 🔒    │ [Instant] 🔒   │ [✅] 🔒 │  │
│  └────────────────┴────────────┴────────────────┴─────────┘  │
│  🔒 = Always on (cannot be disabled for security events)      │
│                                                               │
│  Browser Push:  [Enable Push Notifications]                   │
│  Quiet Hours:   [10 PM] to [7 AM]  (no push/email)           │
│                                                               │
│  [Save Preferences]                                           │
└──────────────────────────────────────────────────────────────┘
```

### 11.4 New Components

| Component                 | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `NotificationToast`       | Animated toast for real-time notifications        |
| `NotificationBadge`       | Bell icon with unread count                       |
| `NotificationInbox`       | Full inbox with category tabs + pagination        |
| `NotificationPreferences` | Preference matrix (category × channel)            |
| `WebSocketProvider`       | React context for WebSocket connection management |
| `useNotifications` hook   | Subscribe to real-time notifications              |

---

## 12. Migration Strategy

### Phase 1: Materialized Inbox

- Create UserNotification model
- Create migration: fan-out existing Notification rows into UserNotification
- Update inbox endpoints to query UserNotification instead of 4-way OR
- Update mark_read / dismiss to use UserNotification
- Keep existing Notification model as "broadcast source"

### Phase 2: Templates & Preferences

- Create NotificationTemplate model + seed standard templates
- Create UserNotificationPreference model
- Build preference endpoints + UI
- Refactor NotificationService to use templates
- Wire preference checking into dispatch flow

### Phase 3: Real-Time (WebSocket)

- Add Django Channels dependency
- Create NotificationConsumer
- Add WebSocket routing
- Build WebSocketProvider React context
- Add toast notifications in frontend
- Wire fan-out to push via channel_layer

### Phase 4: Email & Push

- Create DeliveryRecord model
- Build email rendering service
- Integrate email backend (SendGrid/SES)
- Build PushSubscription model + endpoints
- Implement Web Push delivery
- Build digest service + Celery beat tasks

### Phase 5: External Integrations

- Create WebhookEndpoint model
- Build webhook delivery service with HMAC signing
- Add Slack/Teams webhook support
- Build webhook management UI

---

## 13. Implementation Roadmap

| #   | Task                                         | Phase | Depends On | Priority |
| --- | -------------------------------------------- | ----- | ---------- | -------- |
| 1   | Create UserNotification model                | 1     | —          | Critical |
| 2   | Migrate existing notifications → fan-out     | 1     | 1          | Critical |
| 3   | Refactor inbox endpoints to UserNotification | 1     | 1          | Critical |
| 4   | Update mark_read / dismiss                   | 1     | 1          | Critical |
| 5   | Redis unread count cache                     | 1     | 3          | High     |
| 6   | Create NotificationTemplate model + seeds    | 2     | —          | High     |
| 7   | Create UserNotificationPreference model      | 2     | —          | High     |
| 8   | Preference API endpoints                     | 2     | 7          | High     |
| 9   | Frontend: preference settings page           | 2     | 8          | Medium   |
| 10  | Refactor NotificationService → templates     | 2     | 6          | High     |
| 11  | Add Django Channels                          | 3     | —          | High     |
| 12  | NotificationConsumer (WebSocket)             | 3     | 11         | High     |
| 13  | Frontend: WebSocketProvider + toasts         | 3     | 12         | High     |
| 14  | Wire fan-out → WebSocket push                | 3     | 12, 1      | High     |
| 15  | Create DeliveryRecord model                  | 4     | —          | Medium   |
| 16  | Email rendering service                      | 4     | 6          | Medium   |
| 17  | Email delivery (SendGrid/SES)                | 4     | 16         | Medium   |
| 18  | PushSubscription model + endpoints           | 4     | —          | Medium   |
| 19  | Browser push delivery (pywebpush)            | 4     | 18         | Medium   |
| 20  | Digest service + Celery beat                 | 4     | 15, 17     | Medium   |
| 21  | WebhookEndpoint model                        | 5     | —          | Low      |
| 22  | Webhook delivery service                     | 5     | 21         | Low      |
| 23  | Slack/Teams integration                      | 5     | 22         | Low      |
| 24  | Webhook management UI                        | 5     | 22         | Low      |

---

> **Status:** Analysis complete. Implementation ON HOLD until design review and approval.
