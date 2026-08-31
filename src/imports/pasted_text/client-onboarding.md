Design the ASSUREDIA CREATE CLIENT / CLIENT ONBOARDING experience.

IMPORTANT:
This is a redesign of the existing Assuredia Admin functionality.
Do NOT change backend logic, APIs, database structure, authentication, permissions, or client creation behavior.
Do NOT invent fields that are not supported by the existing application.
Only improve the UI/UX and organization of the existing client creation flow.

The goal is to make creating a new client feel like a professional SaaS onboarding experience instead of a long administration form.

--------------------------------

NAVIGATION

This page is accessed from:

Admin Dashboard
→ Clients
→ Create Client

Use the existing Admin Sidebar:

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

--------------------------------

PAGE HEADER

Eyebrow:
"CLIENT MANAGEMENT"

Title:
"Create Client"

Description:
"Set up a new client environment and configure its testing defaults."

Provide:

← Back to Clients

--------------------------------

ONBOARDING STRUCTURE

Use a clean multi-section onboarding layout.

Recommended sections:

01 Client Information
02 Runtime Configuration
03 Application Access
04 Review & Create

Use a progress indicator at the top.

The user should always know which section they are currently configuring.

IMPORTANT:
This is a visual organization of the existing form.
Do NOT turn it into a multi-page flow if the existing implementation requires a single-page form.

It can visually behave like a stepper while remaining compatible with the existing form implementation.

--------------------------------

01 CLIENT INFORMATION

Section title:

"Client Information"

Description:

"Basic information about the client and their environment."

Show the existing client identity fields supported by the current application.

Examples:

Client Name
Client Identifier
Website / Application URL

Use clean labels and helper text.

Client Identifier should be clearly distinguished from the display name.

Do NOT expose internal database IDs unless the existing application already uses them here.

--------------------------------

02 RUNTIME CONFIGURATION

Section title:

"Runtime Configuration"

Description:

"Define the default environment used when executing tests."

Organize the existing runtime settings:

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

Use grouped cards rather than one long vertical list.

Provide concise helper text for technical settings.

Example:

Retry Count
"Number of additional attempts after a failed execution."

Do not invent additional runtime settings.

--------------------------------

03 APPLICATION ACCESS

Section title:

"Application Access"

Description:

"Configure the credentials Assuredia will use to access the monitored application."

Include only the existing supported site access fields.

Use secure password inputs.

Important security rules:

- Never display passwords as plain text.
- Never display password hashes.
- Never display encrypted credential values.
- Provide password visibility toggles where appropriate.
- Clearly communicate that these credentials belong to the monitored application, NOT the Assuredia user account.

Use helper text:

"These credentials are used by Assuredia to authenticate with the monitored application."

This distinction is important.

--------------------------------

04 REVIEW & CREATE

Before creation, show a clean summary:

Client Information
Client Name
Website
Status

Runtime
Browser
Device
Headless
Timeout
Retry Count

Application Access
Credentials configured

Do NOT display actual passwords.

Show:

"Ready to create client?"

Description:

"Review the configuration before creating this client environment."

Primary action:

"Create Client"

Secondary:

"Back"

--------------------------------

CREATE STATE

When creating:

Button:

"Creating client..."

Show a subtle loading indicator.

Prevent duplicate submission.

After successful creation:

Show a clear success state:

"Client created successfully"

Then provide:

"Open Client"

and optionally:

"Back to Clients"

Only include navigation supported by the existing application.

--------------------------------

VALIDATION

Use inline validation.

Examples:

Required field
Invalid URL
Invalid numeric value
Missing required configuration

Keep errors directly associated with their fields.

Use the existing semantic red.

Do not create large error banners unless necessary.

--------------------------------

EMPTY / ERROR STATES

If client creation fails:

"Client could not be created"

Show a concise error message.

Provide:

"Try Again"

Do not expose backend stack traces or sensitive implementation details.

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
#9AA3B8

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
- Use blue primarily for progress, focus, active steps, and primary actions.
- Use semantic colors only for actual states.

--------------------------------

DESIGN STYLE

The page should feel:

Professional
Enterprise
Trustworthy
Structured
Simple
Technical but approachable

Avoid making the form feel intimidating.

Use:

- Clear section headings
- Short descriptions
- Consistent input sizes
- Comfortable spacing
- Grouped configuration panels
- Strong visual hierarchy

--------------------------------

RESPONSIVE DESIGN

Desktop:

Use a two-column layout where appropriate:

Main:
Form sections

Secondary:
Onboarding progress
Configuration summary
Help/context

Tablet:
Stack naturally.

Mobile:
Single column.
Progress indicator becomes compact.
All fields remain easily accessible.
No horizontal overflow.

--------------------------------

IMPORTANT PRODUCT DISTINCTION

Make it visually obvious that:

Assuredia Account
≠
Client Application Credentials

The user is creating a client environment inside Assuredia.

The username/password configured under Application Access are credentials for the APPLICATION BEING TESTED.

Do not label them simply as:

"Username"
"Password"

Prefer:

"Application Username"
"Application Password"

if those are the actual existing fields.

--------------------------------

FINAL USER JOURNEY

The final experience should feel like:

Admin
→ Create Client
→ Configure Environment
→ Configure Application Access
→ Review
→ Create
→ Open Client Dashboard

The new client should naturally lead into:

Client Dashboard
→ Flows
→ Schedules
→ Run History
→ Alerts
→ AI Analysis

The final screen should feel like a polished enterprise SaaS onboarding experience while remaining faithful to the existing Assuredia functionality.