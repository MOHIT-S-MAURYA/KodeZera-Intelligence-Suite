# Project Structure & Component Inventory: Kodezera Intelligence Suite

This document provides a comprehensive overview of the current project structure, including all pages, components, and design specifications. It serves as a reference for the ongoing redesign.

## 1. Project Overview
- **Project Name:** Kodezera Intelligence Suite (Redesign)
- **Stitch Project ID:** `1702434167254689230`
- **Design North Star:** **"The Kinetic Ether"**
  - **Concept:** Data floating in a high-fidelity, pressurized environment.
  - **Aesthetics:** Deep obsidian tones, electric cyan accents, glassmorphism, and tonal layering (replacing 1px borders).
  - **Typography:** Inter (Display, Headline, Title, Body, Label).

---

## 2. Page Inventory

### Core Application Pages
| Page Name | Route | Description | Key Widgets / Components |
| :--- | :--- | :--- | :--- |
| **Login** | `/login` | Authentication entry point. | Input, Button, Card, Toast |
| **Dashboard** | `/dashboard` | Tenant-level overview of stats and trends. | StatCard, Recharts (AreaChart), Card, Badge, ActivityStream |
| **AI Chat** | `/chat` | RAG interface for AI interaction. | ChatSidebar (Folders/Sessions), MessageArea, InputBar, ContextMenu, Modal |
| **Documents** | `/documents` | Document management and processing. | SearchableSelect, Table/List, Card, Button, Modal, Badge |
| **My Analytics** | `/my-analytics` | Personal usage and metric visualization. | Recharts, Card, Tabs, Badge |
| **Users** | `/users` | Organization user management. | Table/List, Card, Button, Modal, Badge |
| **Departments** | `/departments` | Org structure management. | Table/List, Card, Button, Modal, Badge |
| **Roles** | `/roles` | Role-Based Access Control (RBAC). | Table/List, Card, Button, Modal, Badge |
| **Audit Logs** | `/audit-logs` | Tenant event history. | Table/List, Card, SearchBar, Badge |
| **Profile** | `/profile` | User profile and preferences. | Input, Avatar, Button, Card |
| **Settings** | `/settings` | General system configuration. | Tabs, Switch, Input, Button, Card |
| **Notifications** | `/notifications`| In-app alert history. | List, Badge, Card |

### Platform Administration (Platform Owner)
| Page Name | Route | Description |
| :--- | :--- | :--- |
| **Platform Dashboard** | `/platform` | Global system overview for SaaS owners. |
| **Platform Tenants** | `/platform/tenants` | Multi-tenant management and onboarding. |
| **Platform Subscriptions**| `/platform/subscriptions` | Billing, plans, and subscription tracking. |
| **Platform Analytics** | `/platform/analytics` | Global usage and performance metrics. |
| **Platform Security** | `/platform/security` | Global security logs and firewall configs. |
| **Platform AI Config** | `/platform/ai-config` | LLM settings, RAG parameters, and model tuning. |
| **Platform Permissions**| `/platform/permissions` | Global permission mapping and RBAC templates. |
| **Platform Audit Logs** | `/platform/audit-logs` | Global system event history. |
| **Platform Support** | `/platform/support` | Support ticket management system. |
| **Platform Feature Flags**| `/platform/feature-flags`| Feature toggle and experiment management. |

---

## 3. Component Library (Reusable Widgets)

These components are located in `src/components/ui` and are used globally:

- **Avatar**: User and AI bot profiles.
- **Badge**: Status pills (e.g., Live, Success, Warning).
- **Button**: Actions with Primary, Secondary, and Ghost variants.
- **Card**: Standard content container with Header, Title, and Content sub-components.
- **Input**: Form fields, text areas, and search inputs.
- **Modal**: Overlays for confirmation and detailed views.
- **SearchableSelect**: Enhanced dropdown with internal search.
- **Spinner/Loader**: Visual feedback for async operations.
- **Switch**: Toggles for boolean settings.
- **Tabs**: View switching within a page.
- **Toast**: Transient notifications for system feedback.

---

## 4. Layout Architecture

- **MainLayout**: The primary wrapper for protected routes, managing the sidebar and top navigation.
- **Sidebar**: The main navigation rail for the application.
- **TopNav**: Header bar containing the global search, notifications, and user profile menu.
- **ProtectedRoute**: Logic wrapper ensuring authentication before page access.
- **ErrorBoundary**: Top-level wrapper to catch and display UI crashes gracefully.

---

## 5. Redesign Objectives (Kinetic Ether)
1. **Eliminate Borders**: Use background color shifts (`surface-container-low` vs `surface-container`) to define zones.
2. **Glassmorphism**: Implement `backdrop-blur` (12px to 32px) for elevated elements like Modals and Context Menus.
3. **Ambient Radiance**: Replace standard drop shadows with soft, tinted glows using `on-primary-fixed-variant`.
4. **Editorial Typography**: Ensure Inter is used with tight letter spacing (`-0.04em`) for displays and high line-height (`1.6`) for body text.
