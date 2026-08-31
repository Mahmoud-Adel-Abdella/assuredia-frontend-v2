Create and standardize the ASSUREDIA GLOBAL UI COMPONENT SYSTEM.

IMPORTANT:
This is NOT a redesign of individual pages.
Do NOT change page layouts, business logic, routes, APIs, functionality, or existing workflows.

The goal is to create ONE consistent reusable component language across the entire Assuredia application.

These components must be used consistently across:

Client Dashboard
Flows
Schedules
Run History
Run Details / Live Execution
Alerts
AI Analysis
Settings
Admin Dashboard
Admin Clients
Create Client
Onboarding
Login / Signup

--------------------------------
DESIGN SYSTEM
--------------------------------

Use the EXACT current Assuredia visual system:

Background:
#0A0E17

Surface:
#0F1420

Elevated:
#151B29

Border:
#1E2536

Strong Divider:
#2C3547

Primary:
#2563EB

Accent:
#3B82F6

Light Blue:
#60A5FA

Primary Text:
#F4F7FB

Secondary Text:
#9AA3B5

Muted Text:
#7B8496

Semantic:

Success:
existing green

Error:
existing red

Warning:
existing amber

Pending:
subtle amber / blue treatment

IMPORTANT:
- No cyan
- No purple
- No excessive neon
- No excessive glow
- No random colors
- Keep the near-black navy + royal-blue identity

--------------------------------
1. BUTTONS
--------------------------------

Create a unified Button system.

Variants:

Primary
Secondary
Ghost
Outline
Danger
Success
Link

States:

Default
Hover
Active
Focus
Disabled
Loading

Sizes:

Small
Medium
Large

Examples:

Primary:
"Create Client"
"Run Flow"
"Save Changes"

Danger:
"Delete"
"Cancel Run"

Loading:
"Saving..."
"Running..."

Rules:

- Primary uses #2563EB.
- Hover uses a slightly lighter blue.
- Danger uses existing semantic red.
- Success uses existing semantic green.
- Do NOT create unique button styles per page.

All buttons must share:
Typography
Height
Padding
Border radius
Icon spacing
Focus behavior

--------------------------------
2. MODALS / DIALOGS
--------------------------------

Create one unified Modal/Dialog system.

Structure:

Header
Title
Description
Content
Footer

Variants:

Default
Confirmation
Danger
Information

Example:

Delete Flow

"Are you sure you want to delete this flow?"

[Cancel] [Delete]

Rules:

- Dark elevated surface #151B29
- Border #1E2536
- Consistent padding
- Consistent radius
- Clear primary action
- Destructive actions use red
- Overlay should be subtle and not pure black

Modal sizes:

Small
Medium
Large

Use the same modal system for:

Schedule creation
Delete confirmation
Cancel execution
Alert details
Flow creation
Client creation
Other dialogs

--------------------------------
3. FORMS
--------------------------------

Create a unified Form system.

Components:

Text Input
Password Input
Textarea
Select
Multi-select
Checkbox
Radio
Switch
Date Picker
Number Input

States:

Default
Hover
Focus
Filled
Disabled
Error
Success

Rules:

Labels must always be clear.

Helper text should appear below the field when needed.

Errors should appear directly below the field.

Use:

Border:
#1E2536

Focus:
#3B82F6

Input background:
#151B29

Text:
#F4F7FB

Placeholder:
#7B8496

Do NOT use different input styles across different pages.

Password inputs must support a visibility toggle where appropriate.

--------------------------------
4. TABLES
--------------------------------

Create one unified Data Table system.

Use it for:

Clients
Run History
Schedules
Alerts
AI Analysis
Admin tables

Structure:

Header
Rows
Status
Actions

States:

Default
Hover
Selected
Loading
Empty

Rules:

- Header text uses muted/secondary text.
- Rows use subtle separators.
- Hover uses a subtle elevated blue/navy surface.
- Actions should use consistent icon buttons.
- Status should use standardized badges.
- Avoid excessive borders.

Responsive behavior:

Desktop:
Full table

Tablet:
Responsive table

Mobile:
Convert rows to cards where appropriate.

--------------------------------
5. TOASTS / NOTIFICATIONS
--------------------------------

Create a unified Toast system.

Variants:

Success
Error
Warning
Info

Examples:

"Client created successfully"

"Flow saved successfully"

"Schedule updated"

"Execution cancelled"

"Unable to create client"

Toast structure:

Icon
Title
Optional description
Close button

Rules:

Success → green
Error → red
Warning → amber
Info → blue

Keep toasts compact.

Do NOT create different notification styles on different pages.

--------------------------------
6. EMPTY STATES
--------------------------------

Create one reusable Empty State component.

Structure:

Icon / illustration
Title
Description
Optional action

Examples:

"No flows configured"

"No schedules yet"

"No alerts yet"

"No runs yet"

"No AI analyses yet"

Rules:

Keep empty states calm and informative.

Do NOT use alarming colors.

Primary action should use the standard Primary button.

--------------------------------
7. LOADING STATES
--------------------------------

Create standardized loading patterns.

Components:

Spinner
Skeleton
Loading Button
Table Skeleton
Card Skeleton
Page Loading

Rules:

Use subtle blue/neutral loading indicators.

Do NOT use excessive animation.

For tables:
Use skeleton rows.

For cards:
Use skeleton blocks matching the final layout.

For actions:

"Saving..."
"Creating..."
"Running..."
"Loading..."

--------------------------------
8. ERROR STATES
--------------------------------

Create one unified Error State system.

Variants:

Inline Error
Component Error
Page Error

Structure:

Icon
Title
Description
Retry action when supported

Example:

"Unable to load runs"

"Something went wrong while loading execution history."

[Retry]

Do NOT expose backend stack traces or technical implementation details to normal users.

--------------------------------
9. STATUS BADGES
--------------------------------

Create a unified Status Badge system.

Statuses:

ACTIVE
INACTIVE
RUNNING
PASSED
FAILED
CANCELLED
SCHEDULED
PAUSED
PENDING
RESOLVED

Use semantic colors consistently.

Examples:

PASSED → green
FAILED → red
RUNNING → blue
SCHEDULED → blue / neutral
PAUSED → amber
PENDING → amber / blue
CANCELLED → muted
RESOLVED → green

Always combine:
Icon + Text

Do not rely on color alone.

--------------------------------
10. ICON BUTTONS
--------------------------------

Create a unified icon button system.

Sizes:

Small
Medium
Large

States:

Default
Hover
Active
Disabled
Danger

Use consistently for:

Edit
Delete
View
More
Close
Refresh
Search
Filter
Notifications

All icons should use the same visual style and stroke weight.

--------------------------------
11. COMPONENT STATES
--------------------------------

Every reusable component should define:

Default
Hover
Focus
Active
Disabled
Loading
Error

This is important for implementation consistency.

--------------------------------
12. COMPONENT NAMING

Use clean reusable component names:

Button
IconButton
Modal
Dialog
Input
PasswordInput
Select
Checkbox
Radio
Switch
FormField
DataTable
StatusBadge
Toast
EmptyState
LoadingState
Skeleton
ErrorState
Tabs
Card
Dropdown
Tooltip

Do not create duplicate components with different names for the same purpose.

--------------------------------
13. SPACING & DIMENSIONS
--------------------------------

Use a consistent 8px spacing system.

Examples:

4px
8px
12px
16px
24px
32px
40px
48px

Keep:

Input heights consistent
Button heights consistent
Card padding consistent
Modal spacing consistent
Table row heights consistent

--------------------------------
14. TYPOGRAPHY
--------------------------------

Use the existing Assuredia typography system.

Headings:
Space Grotesk

UI/body:
IBM Plex Sans

Technical values:
IBM Plex Mono

Use monospace only for:

IDs
Execution IDs
Cron expressions
Logs
Technical values
Error messages when appropriate

--------------------------------
15. FINAL GOAL
--------------------------------

The user should feel that every page belongs to ONE product.

For example:

"Create Client"
and
"Create Flow"
and
"Create Schedule"

must use the same:

Button
Form
Modal
Input
Validation
Toast
Loading
Error

system.

Similarly:

Run History
Alerts
Schedules
AI Analysis

must use the same:

Table
Status Badge
Filter
Empty State
Loading State

system.

Do NOT redesign the individual screens.

Create a unified, production-ready Assuredia component system that can be implemented directly in React/Tailwind and reused across the entire application.