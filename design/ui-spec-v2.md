# Kodezera Intelligence Suite UI Specification (v2)

## 1. Design Principles

- Enterprise-grade visual consistency
- Information density with clear hierarchy
- Accessibility-first interaction patterns
- Responsive and performance-aware layouts

---

## 2. Color System

### Brand Colors
- **Primary (Indigo)**: `#6366F1` - Buttons, links, active states
- **Primary Dark**: `#4F46E5` - Hover states
- **Primary Light**: `#EEF2FF` - Backgrounds, hover backgrounds

### Neutrals
- **Gray 50**: `#FAFAFA` - Page background
- **Gray 100**: `#F5F5F5` - Card backgrounds
- **Gray 200**: `#E5E5E5` - Borders
- **Gray 400**: `#A3A3A3` - Disabled text
- **Gray 600**: `#525252` - Secondary text
- **Gray 900**: `#171717` - Primary text

### Semantic
- **Success**: `#22C55E` - Positive actions
- **Warning**: `#F59E0B` - Caution states
- **Error**: `#EF4444` - Destructive actions
- **Info**: `#3B82F6` - Informational

---

## 3. Typography

**Font**: Inter (Variable)

### Hierarchy
- **Display SM**: 30px / Bold / -0.015em
- **Title LG**: 24px / Semi-bold
- **Title MD**: 20px / Semi-bold
- **Title SM**: 18px / Semi-bold
- **Body MD**: 16px / Regular / 1.6 line-height
- **Body SM**: 14px / Regular / 1.5 line-height
- **Label**: 14px / Medium / 1.25 line-height
- **Caption**: 12px / Medium

---

## 4. Layout Structure

```
┌─────────────────────────────────────────────┐
│  TopNav (64px height)                       │
├──────┬──────────────────────────────────────┤
│      │                                      │
│ Side │  Main Content Area                   │
│ bar  │  (Padding: 24px)                     │
│ 240px│                                      │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

### Responsive Breakpoints
- Mobile: < 768px (Drawer sidebar)
- Tablet: 768px - 1024px
- Desktop: > 1024px

---

## 5. Component Specifications

### Button
**Variants**: Primary, Secondary, Ghost, Danger
**Sizes**: SM (32px), MD (40px), LG (48px)
**States**: Default, Hover, Active, Disabled, Loading

```
Primary: bg-brand-500, hover:bg-brand-600
Secondary: border-2, hover:bg-gray-50
Ghost: text-gray-600, hover:bg-gray-100
```

### Card
- Background: White
- Border: 1px solid gray-200
- Radius: 12px
- Shadow: sm (0 1px 3px rgba(0,0,0,0.1))
- Padding: 24px

### Input
- Height: 40px
- Border: 1px solid gray-200
- Radius: 8px
- Focus: 2px ring brand-500
- Icon support: left/right

### Table
- Header: bg-gray-50, text-label-sm uppercase
- Row: hover:bg-gray-50
- Border: gray-200
- Mobile: Convert to cards

---

## 6. Page Patterns

### 6.1 Login
- Centered card (max-width: 400px)
- Logo + Title
- Email + Password fields
- Remember me checkbox
- Primary button
- Minimal, no distractions

### 6.2 Dashboard Home
- 4-col stats grid (responsive to 1-col mobile)
- Recent activity list
- Quick actions

### 6.3 AI Chat
- Left: Conversation list (collapsible)
- Right: Chat area
  - Messages: User (right, brand-500), AI (left, gray-100)
  - Input bar at bottom
  - Sources expandable

### 6.4 Documents
- Search + Filters bar
- Desktop: Data table
- Mobile: Card list
- Upload button (if permission)

### 6.5 Users
- Search + Role/Status filters
- Desktop: Table with avatars
- Mobile: Cards with key info
- Add user button

### 6.6 Departments
- Search bar
- Grid of department cards
- User count badges

### 6.7 Roles
- Search bar
- Cards with permission counts
- System role badge

### 6.8 Audit Logs
- Date range + Action type filters
- Desktop: Detailed table
- Mobile: Timeline cards
- Status badges (success/error)

---

## 7. Interactions

### Animations
- Page transitions: fade-in (300ms)
- Modal: scale-in (200ms)
- Hover: 150ms ease-in-out
- Loading: subtle pulse

### States
- Hover: Slight background change
- Active: Deeper color
- Focus: 2px ring offset
- Disabled: 50% opacity + cursor-not-allowed

---

## 8. Quality Standards

1. **Consistency**: Same patterns across all pages
2. **Accessibility**: WCAG 2.1 AA compliant
3. **Performance**: < 100ms interactions
4. **Responsive**: Mobile-first approach
5. **Feedback**: Clear visual feedback for all actions
