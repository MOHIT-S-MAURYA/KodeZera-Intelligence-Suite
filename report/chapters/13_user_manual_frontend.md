# Chapter 14: User Manual

---

## 14.1 Platform Owner Manual

### 14.1.1 First-Time Setup

1. **Login**: Navigate to the platform URL and login with the superuser credentials created during installation.
2. **Configure AI Provider**: Go to **Settings → AI Configuration** and:
   - Select your LLM provider (OpenAI, Anthropic, HuggingFace, Ollama, or Local)
   - Enter the API key (displayed masked after saving)
   - Set the model identifier (e.g., `gpt-4-turbo-preview`)
   - Configure the embedding provider and model
   - Set token limits and rate limits
3. **Create Subscription Plans**: Go to **Plans** and create Basic, Pro, and Enterprise plans with appropriate limits.
4. **Create First Tenant**: Go to **Tenants → Create** and:
   - Enter organisation name and slug
   - Assign a subscription plan
   - Set the data region
   - The tenant starts in "Created" onboarding step

### 14.1.2 Tenant Management

| Action | Path | Description |
|--------|------|-------------|
| View all tenants | Tenants → List | Paginated list with status, plan, user count |
| Suspend tenant | Tenant → Actions → Suspend | Blocks all tenant user access |
| Activate tenant | Tenant → Actions → Activate | Re-enables tenant access |
| Change plan | Tenant → Subscription → Change Plan | Upgrades/downgrades the subscription |
| View usage | Tenant → Usage | Query count, token usage, storage, active users |

### 14.1.3 Analytics Dashboard

The Platform Owner dashboard displays:
- **Global Metrics**: Total queries, total tokens, total tenants, active users
- **Tenant Comparison**: Bar/line charts comparing usage across tenants
- **Cost Tracking**: Revenue vs. LLM API costs per tenant
- **Alert Status**: Open security alerts and metric alerts
- **Health Status**: Real-time component health (DB, Redis, Qdrant, Celery)

### 14.1.4 Support Ticket Management

1. Navigate to **Support** to view all tickets across tenants
2. Filter by status (Open / In Progress / Resolved), priority, or category
3. Click a ticket to view details, including auto-captured browser context
4. Update status and add resolution notes

---

## 14.2 Tenant Administrator Manual

### 14.2.1 User Management

| Action | Steps |
|--------|-------|
| **Create user** | Users → Add User → Enter email, name, department, employment type → The user receives an activation email |
| **Assign role** | Users → Select user → Roles tab → Assign Role → Select from available roles |
| **Set clearance** | Users → Select user → Security tab → Set clearance level (0–5) |
| **Lock/unlock** | Users → Select user → Actions → Lock/Unlock account |
| **Force password change** | Users → Select user → Actions → Force Password Change |
| **Deactivate** | Users → Select user → Actions → Deactivate (soft-delete, reversible) |

### 14.2.2 Role Management

1. Navigate to **Roles** to view the role hierarchy tree
2. **Create Role**: Click "Add Role" → Set name, description, parent role
3. **Assign Permissions**: Click role → Permissions tab → Check/uncheck permissions by resource type
4. **View Effective Permissions**: Click role → "Effective" tab → Shows inherited + direct permissions
5. **Hierarchy**: Child roles inherit all permissions from parent roles via closure table

### 14.2.3 Document Management

| Action | Steps |
|--------|-------|
| **Upload** | Documents → Upload → Select file (PDF, DOCX, TXT, CSV, MD, JSON, XLSX) → Set title, classification, visibility |
| **Set access** | Documents → Select → Access tab → Grant to specific users, roles, or org units |
| **View status** | Documents → Status column shows: Pending → Processing → Completed (or Failed) |
| **Re-process** | Documents → Select → Actions → Re-process (re-embeds after model change) |
| **Delete** | Documents → Select → Delete (soft-delete, 30-day retention) |
| **Download** | Documents → Select → Download original file |

### 14.2.4 Document Classification System

| Level | Name | Access |
|:-----:|------|--------|
| 0 | Unclassified | Visible to all tenant users (if visibility allows) |
| 1 | Internal | Requires clearance ≥ 1 |
| 2 | Confidential | Requires clearance ≥ 2 |
| 3 | Secret | Requires clearance ≥ 3 |
| 4 | Top Secret | Requires clearance ≥ 4 |
| 5 | Ultra Secret | Requires clearance ≥ 5 |

**Rule**: A user with `clearance_level = N` can only access documents with `classification_level ≤ N`. This is enforced at the query level and the RAG retrieval level (vector search filters also apply classification).

---

## 14.3 Regular User Manual

### 14.3.1 AI Chat Interface

1. **New Chat**: Click the "+" button or "New Chat" to start a fresh conversation
2. **Ask a Question**: Type your question in the input field and press Enter or click Send
3. **Streaming Response**: The AI generates answers in real-time. Sources are displayed below the answer as clickable cards.
4. **Follow-up**: Ask follow-up questions in the same session — context is preserved
5. **Sources**: Each answer includes citations from your organisation's documents. Click a source to see the relevant passage.
6. **Feedback**: Use 👍/👎 buttons to provide feedback on answer quality

### 14.3.2 Chat Management

| Feature | How to Use |
|---------|------------|
| **Rename chat** | Click chat title → Edit → Enter new name |
| **Pin chat** | Right-click (or long-press on mobile) → Pin to top |
| **Create folder** | Chat list → "New Folder" → Name the folder → Drag chats into it |
| **Move to folder** | Right-click chat → Move to → Select folder |
| **Delete chat** | Right-click → Delete (or swipe left on mobile) |
| **Bulk select** | Long-press → Enter selection mode → Select multiple → Delete or Move |
| **Search chats** | Use the search bar to filter chats by title |
| **Chat details** | Right-click → Details → See creation date, last modified, message count |

### 14.3.3 Document Access

- Users can browse documents they have access to via the Documents page
- Access is determined by a **6-rule evaluation** (in order):
  1. ✅ Classification level ≤ user's clearance level
  2. ✅ Document visibility allows access (public/restricted/confidential)
  3. ✅ Direct user access grant exists
  4. ✅ Role-based access (user holds a role with document access)
  5. ✅ Department-based access (user is in the document's department)
  6. ✅ Org-unit-based access (user's org unit has document access)

### 14.3.4 Notifications

- Bell icon in the header shows unread count (from Redis cache for speed)
- Click to view notification dropdown
- Mark all as read, or click individual notifications
- **Categories**: User Management, Document, Role & Permission, Department, System, Security
- **Settings**: Configure notification preferences per category per channel (in-app, email, browser push)
- **Mandatory**: Security notifications cannot be disabled

### 14.3.5 MFA Setup

1. Navigate to **Profile → Security**
2. Click "Enable MFA"
3. Choose method:
   - **TOTP**: Scan QR code with authenticator app (Google Authenticator, Authy)
   - **Email**: Receive 6-digit code via email on each login
4. Enter verification code to confirm
5. Save backup codes in a secure location
6. To disable: Profile → Security → Disable MFA (requires current code)

### 14.3.6 Password Management

- **Change password**: Profile → Security → Change Password
- **Requirements**: Minimum 8 characters, must include uppercase, lowercase, number, special character
- **History**: Cannot reuse any of the last 5 passwords
- **Expiry**: Configurable by admin (default: no forced expiry)
- **Reset**: Use "Forgot Password" link on login page → email link → set new password

---

## 14.4 Mobile/Responsive Usage

The application is fully responsive and supports:
- **Gesture controls**: Long-press to select multiple chats, swipe to delete
- **Touch optimised**: All buttons and touch targets meet minimum 44×44px guideline
- **Responsive sidebar**: Collapsible on small screens with hamburger menu
- **Dark mode**: System-preference detection + manual toggle
- **Offline indicators**: Shows connection status and queues actions when offline

---

# Chapter 15: Frontend Architecture Deep-Dive

---

## 15.1 Component Hierarchy

```
App
├── AuthProvider
│   ├── LoginPage
│   │   ├── LoginForm
│   │   └── MFAChallenge (conditional)
│   ├── ForgotPasswordPage
│   └── ResetPasswordPage
├── ProtectedRoute (requires auth)
│   ├── Layout
│   │   ├── Sidebar
│   │   │   ├── NavigationMenu
│   │   │   ├── ThemeToggle
│   │   │   └── UserProfileBadge
│   │   ├── Header
│   │   │   ├── SearchBar
│   │   │   ├── NotificationBell
│   │   │   │   └── NotificationDropdown
│   │   │   │       └── NotificationItem (×N)
│   │   │   └── UserMenu
│   │   └── MainContent
│   │       ├── DashboardPage
│   │       │   ├── MetricCards (×4)
│   │       │   ├── UsageChart (Recharts)
│   │       │   └── RecentActivityFeed
│   │       ├── ChatPage
│   │       │   ├── ChatSidebar
│   │       │   │   ├── ChatSearchBar
│   │       │   │   ├── ChatFolderList
│   │       │   │   │   └── ChatFolderItem (×N)
│   │       │   │   └── ChatSessionList
│   │       │   │       └── ChatSessionItem (×N)
│   │       │   └── ChatMain
│   │       │       ├── ChatHeader (title, actions)
│   │       │       ├── MessageList
│   │       │       │   └── MessageBubble (×N)
│   │       │       │       ├── MarkdownRenderer
│   │       │       │       ├── CodeBlock
│   │       │       │       └── SourceCards (×N)
│   │       │       └── ChatInput
│   │       │           ├── TextArea (auto-resize)
│   │       │           └── SendButton
│   │       ├── DocumentsPage
│   │       │   ├── DocumentFilters
│   │       │   ├── DocumentTable
│   │       │   │   └── DocumentRow (×N)
│   │       │   └── UploadDialog
│   │       ├── UsersPage (admin only)
│   │       │   ├── UserTable
│   │       │   ├── UserCreateDialog
│   │       │   └── UserDetailPanel
│   │       ├── RolesPage (admin only)
│   │       │   ├── RoleHierarchyTree
│   │       │   ├── RoleCreateDialog
│   │       │   └── PermissionMatrix
│   │       ├── AnalyticsPage
│   │       │   ├── TimeRangeSelector
│   │       │   ├── MetricChart (×N, Recharts)
│   │       │   └── QueryAnalyticsTable
│   │       ├── NotificationsPage
│   │       │   ├── NotificationFilters
│   │       │   └── NotificationList
│   │       ├── SettingsPage
│   │       │   ├── ProfileSettings
│   │       │   ├── SecuritySettings (MFA)
│   │       │   └── NotificationPreferences
│   │       └── AIConfigPage (platform owner only)
│   │           ├── LLMProviderForm
│   │           ├── EmbeddingProviderForm
│   │           └── RateLimitSettings
│   └── PlatformOwnerRoutes (superuser only)
│       ├── PlatformDashboard
│       ├── TenantManagement
│       ├── PlanManagement
│       ├── AuditLogViewer
│       └── SystemHealthPage
```

## 15.2 State Management (Zustand)

```
┌───────────────────────────────────────────┐
│            Zustand Stores                 │
├───────────────────────────────────────────┤
│  useAuthStore                             │
│  ├── user: User | null                    │
│  ├── accessToken: string | null           │
│  ├── refreshToken: string | null          │
│  ├── isAuthenticated: boolean             │
│  ├── login(email, password): Promise      │
│  ├── logout(): void                       │
│  └── refreshAccessToken(): Promise        │
├───────────────────────────────────────────┤
│  useChatStore                             │
│  ├── sessions: ChatSession[]              │
│  ├── activeSessionId: string | null       │
│  ├── messages: Record<id, Message[]>      │
│  ├── isStreaming: boolean                 │
│  ├── createSession(): Promise             │
│  ├── sendMessage(text): Promise           │
│  └── deleteSession(id): Promise           │
├───────────────────────────────────────────┤
│  useThemeStore                            │
│  ├── mode: 'light' | 'dark' | 'system'   │
│  ├── toggleTheme(): void                  │
│  └── resolvedTheme: 'light' | 'dark'     │
├───────────────────────────────────────────┤
│  useNotificationStore                     │
│  ├── unreadCount: number                  │
│  ├── notifications: Notification[]        │
│  ├── fetchUnreadCount(): Promise          │
│  ├── markRead(id): Promise                │
│  └── markAllRead(): Promise               │
└───────────────────────────────────────────┘
```

## 15.3 Routing Architecture

```
/login                    → LoginPage          (public)
/forgot-password          → ForgotPasswordPage (public)
/reset-password/:token    → ResetPasswordPage  (public)
/                         → DashboardPage      (authenticated)
/chat                     → ChatPage           (authenticated)
/chat/:sessionId          → ChatPage           (authenticated)
/documents                → DocumentsPage      (authenticated)
/users                    → UsersPage          (admin)
/roles                    → RolesPage          (admin)
/departments              → DepartmentsPage    (admin)
/org-chart                → OrgChartPage       (admin)
/analytics                → AnalyticsPage      (admin)
/notifications            → NotificationsPage  (authenticated)
/settings                 → SettingsPage       (authenticated)
/settings/security        → SecuritySettings   (authenticated)
/ai-config                → AIConfigPage       (platform owner)
/platform                 → PlatformDashboard  (platform owner)
/platform/tenants         → TenantManagement   (platform owner)
/platform/plans           → PlanManagement     (platform owner)
/platform/audit           → AuditLogViewer     (platform owner)
/platform/health          → SystemHealthPage   (platform owner)
/support                  → SupportPage        (authenticated)
```

## 15.4 Axios Interceptor

```javascript
// Request interceptor — attach JWT and tenant context
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor — handle 401 with token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401 && !error.config._isRetry) {
            error.config._isRetry = true;
            try {
                await useAuthStore.getState().refreshAccessToken();
                const newToken = useAuthStore.getState().accessToken;
                error.config.headers.Authorization = `Bearer ${newToken}`;
                return api(error.config);  // Retry original request
            } catch {
                useAuthStore.getState().logout();
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);
```

**Key Behaviour**: On any 401 response, the interceptor automatically attempts a token refresh using the stored refresh token. If this fails (refresh token also expired), the user is logged out and redirected to the login page. This gives a seamless experience where users are never shown random 401 errors — their session either auto-extends or they gracefully re-authenticate.

## 15.5 SSE Streaming Integration

```javascript
// Chat message streaming via fetch + ReadableStream
async function streamChatMessage(question, sessionId) {
    const response = await fetch('/api/rag/query/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ question, session_id: sessionId }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n\n');

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
                case 'token':
                    appendToken(data.content);     // Real-time typing effect
                    break;
                case 'sources':
                    setSources(data.sources);       // Display source cards
                    break;
                case 'metadata':
                    setMetadata(data.metadata);     // Latency, cost, etc.
                    break;
                case 'done':
                    setIsStreaming(false);           // Mark complete
                    break;
            }
        }
    }
}
```

---
