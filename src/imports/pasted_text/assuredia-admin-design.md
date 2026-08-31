Design the ASSUREDIA ADMIN DASHBOARD as the dedicated administration experience for the Assuredia platform.

IMPORTANT:
This is a redesign of the existing Assuredia Admin Dashboard.
Do NOT invent new backend functionality, APIs, database structures, permissions, or business logic.
Preserve the existing Admin functionality and only improve the UI/UX.

The Admin Dashboard must feel different from the Client Dashboard while remaining part of the same Assuredia design system.

--------------------------------

ADMIN SIDEBAR

Use a dedicated admin navigation:

ASSUREDIA
ADMIN CONSOLE

OVERVIEW
- Dashboard
- Clients
- Runs

MONITORING
- Alerts
- AI Analysis

SYSTEM
- Settings

Keep navigation simple and focused on platform administration.

Do NOT expose client-only navigation as if the Admin were a client.

--------------------------------

ADMIN DASHBOARD

Header:

Eyebrow:
"ADMIN CONSOLE"

Title:
"Platform Overview"

Description:
"Monitor clients, executions, platform health, and recent activity."

Top-level KPI cards:

Total Clients
Active Clients
Total Runs
Failed Runs
Success Rate

Keep these cards compact and data-focused.

--------------------------------

CLIENT OVERVIEW

Create a prominent section:

"Clients"

Show a professional table containing:

Client
Status
Flows
Recent Run
Success Rate
Last Activity
Actions

Example:

Daftra
ACTIVE
8 flows
Passed
96.4%
2 min ago
View

Use:

Green → Active / healthy
Red → inactive/problem
Blue → informational

Do not expose sensitive client credentials.

--------------------------------

PLATFORM ACTIVITY

Create a section:

"Recent Activity"

Show recent platform events:

Client created
Flow executed
Scheduled execution completed
Test failed
AI analysis generated
Alert triggered

Each activity should show:

Event
Client
Time
Status

Keep this visually lightweight.

--------------------------------

EXECUTION OVERVIEW

Create a section showing platform-wide execution health.

Show:

Successful
Failed
Running
Scheduled

Use a clean chart or visualization.

The purpose is to give the Admin an immediate understanding of platform execution health.

Do not create fake real-time metrics that are not available from the existing backend.

--------------------------------

CLIENT MANAGEMENT

The Admin should be able to navigate to:

Clients

The Clients page should retain the existing functionality for:

- Viewing clients
- Creating clients
- Opening client details
- Managing client status
- Viewing client activity

Use the same visual system as the Admin Dashboard.

--------------------------------

CLIENT DETAIL FROM ADMIN

When an Admin opens a client:

Show:

Client identity
Status
Website
Flows
Schedules
Run History
Alerts
AI Analysis

The Admin should have broader visibility than a CLIENT user.

Do not expose passwords, password hashes, JWTs, API keys, onboarding tokens, or encrypted credentials.

--------------------------------

ADMIN RUN HISTORY

The Admin Run History should provide platform-wide execution visibility.

Show:

Client
Flow
Test / Tests
Trigger
Status
Started
Duration
Actions

Filters:

Client
Status
Trigger
Flow
Time range

Trigger:

Manual
Scheduled

Keep the same execution visual language as the Client Run History.

--------------------------------

ADMIN ALERTS

The Admin Alerts page should show platform-wide alerts.

Show:

Client
Flow
Test
Alert
Trigger
Severity
Time
Status

The Admin should be able to navigate to the related execution and AI analysis.

Keep the same Alert design used by the Client Dashboard, but with platform-wide scope.

--------------------------------

ADMIN AI ANALYSIS

The Admin AI Analysis page should show AI analyses across clients.

Show:

Client
Flow
Execution
Risk
Business Impact
Analyzed
Action

The Admin should be able to open the full analysis and related execution.

Do not turn this into a chatbot.

--------------------------------

ADMIN SETTINGS

Keep Admin Settings separate from Client Settings.

Focus on settings that are actually supported by the existing application.

Do not invent organization billing, subscription, SSO, or enterprise configuration unless already implemented.

--------------------------------

ADMIN VS CLIENT VISUAL LANGUAGE

The visual identity remains the same:

Assuredia Blue
Royal Blue
Dark Navy
Green / Red / Amber semantic colors

But the Admin interface should feel slightly more:

Operational
Data-oriented
Platform-focused
Dense
Administrative

The Client interface should feel more:

Product-focused
Workflow-focused
Simple
Action-oriented

--------------------------------

DARK THEME

Use the EXACT CURRENT Assuredia dark theme:

Background:
#0A0E17

Surface:
#0F1420

Elevated:
#151B29

Border:
#1E2536

Strong divider:
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

IMPORTANT:
- No cyan.
- No purple.
- No excessive neon.
- No excessive glow.
- Keep the near-black navy + royal-blue identity.
- Maintain strong contrast and accessibility.

--------------------------------

RESPONSIVE DESIGN

Desktop:
- Persistent sidebar
- Multi-column KPI cards
- Data tables
- Charts

Tablet:
- Responsive dashboard grid
- Tables adapt naturally

Mobile:
- Collapsible navigation
- Stacked KPI cards
- Responsive tables/cards

--------------------------------

DESIGN SYSTEM CONSISTENCY

Reuse the same visual language as:

Client Dashboard
Flows
Schedules
Run History
Alerts
AI Analysis
Settings

Use consistent:

Typography
Buttons
Cards
Tables
Status badges
Inputs
Modals
Spacing
Border radius
Dark surfaces
Royal-blue accents

Do not create a completely separate product.

--------------------------------

FINAL GOAL

The Admin Dashboard should immediately answer:

How many clients are active?

How is the platform performing?

How many executions are running?

How many executions failed?

Which clients need attention?

What happened recently?

Which failures require investigation?

Where can I inspect the related execution or AI analysis?

The final result should feel like a serious enterprise SaaS administration console for Assuredia.