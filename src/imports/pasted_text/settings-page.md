Design the ASSUREDIA SETTINGS page as a completely independent top-level page.

IMPORTANT:
Settings must be a first-class destination in the sidebar.

SIDEBAR:

WORKSPACE
- Overview
- Flows
- Schedules
- Run History

MONITORING
- Alerts

SYSTEM
- Settings

The active Settings item should use the existing Assuredia royal-blue active state.

Do NOT put Settings inside Flows.
Do NOT put Settings inside Client Workspace tabs.
Do NOT create Settings as a modal-only experience.

--------------------------------

SETTINGS PAGE

Header:

Eyebrow:
"SYSTEM"

Title:
"Settings"

Description:
"Manage your account, client environment, execution defaults, and notification preferences."

Create a clean settings layout with a left-side settings navigation and a right-side content area.

SETTINGS NAVIGATION:

Account
Security
Client Environment
Test Execution
Notifications

Use the active section with the existing royal-blue accent.

--------------------------------

1. ACCOUNT

Section title:
"Account"

Show:

Name
Email
Role

Example:

Name:
Mahmoud

Email:
mahmoud@example.com

Role:
CLIENT

Allow editing only for fields already supported by the existing application.

Do not invent profile functionality.

--------------------------------

2. SECURITY

Section title:
"Security"

Show:

Password
Change Password

Session:
Current session information

Provide appropriate security actions only if supported by the existing product.

Do NOT display:
- passwords
- password hashes
- JWT tokens
- API keys
- sensitive credentials

--------------------------------

3. CLIENT ENVIRONMENT

Section title:
"Client Environment"

Show the existing client configuration:

Client name
Client ID
Website
Active / Inactive status

Site credentials should NOT be displayed as plain text.

If the existing application supports editing site credentials, represent them as secure password fields.

Do not expose sensitive values.

--------------------------------

4. TEST EXECUTION

Section title:
"Test Execution"

Organize existing runtime settings:

Browser
- Chrome
- Firefox
- Edge

Device
- Desktop
- Tablet
- Mobile
- Custom viewport

Headless Mode
Toggle

Timeout
Run Timeout
Retry Count

Keep these settings visually grouped.

Use helper text where useful.

Example:

Retry Count
"Number of additional attempts after a failed execution."

Do not invent new execution settings.

--------------------------------

5. NOTIFICATIONS

Section title:
"Notifications"

Create a clean notification preferences interface.

Notification Policy:

NEVER
ALWAYS
ON_FAILURE

Use the existing notification policy supported by the product.

Explain the behavior clearly:

NEVER
"Do not send notifications."

ALWAYS
"Send notifications for executions according to the configured policy."

ON_FAILURE
"Notify when a monitored test execution fails."

If the existing application has Telegram configuration, show:

Telegram
Connection status
Chat ID

Do NOT display the onboarding token.

Provide the existing Telegram connection action if supported.

--------------------------------

SAVE BEHAVIOR

Settings should use clear sections and explicit actions.

Use:

"Save Changes"

"Cancel"

Show a subtle success confirmation after saving.

Do not create unnecessary confirmation modals for normal settings changes.

--------------------------------

DARK THEME

Use the exact current Assuredia dark theme:

Background:
#0A0E17

Surface:
#0F1420

Elevated:
#151B29

Border:
#1E2536

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

Semantic colors:

Success:
existing green

Error:
existing red

Warning:
existing amber

IMPORTANT:
- Do NOT introduce cyan.
- Do NOT introduce purple.
- Do NOT use excessive neon.
- Do NOT use excessive glow.
- Keep the dark blue / royal blue visual identity.
- Maintain strong accessibility and contrast.

--------------------------------

UX PRINCIPLES

The Settings page should make it immediately clear:

Account
→ Who am I?

Security
→ How is my account protected?

Client Environment
→ Which application am I monitoring?

Test Execution
→ How should tests execute?

Notifications
→ When should I be notified?

Keep each section focused and avoid creating one extremely long settings form.

Use cards or grouped panels with clear headings and descriptions.

--------------------------------

IMPORTANT PRODUCT RULES

Do NOT expose:

- Password hashes
- JWT tokens
- API keys
- Telegram onboarding tokens
- Encrypted credentials

Do NOT change backend behavior.

Do NOT invent settings that do not exist.

The design should represent the existing Assuredia functionality while making the Settings experience cleaner and easier to understand.

FINAL GOAL:

Settings should feel like a professional enterprise SaaS configuration center.

It should be visually consistent with:

Client Dashboard
Flows
Schedules
Alerts
Run History

Use the exact same:

Sidebar
Typography
Buttons
Cards
Inputs
Switches
Status badges
Spacing
Border radius
Dark surfaces
Royal-blue accents