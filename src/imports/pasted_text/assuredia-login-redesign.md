Design the ASSUREDIA LOGIN / AUTHENTICATION EXPERIENCE.

IMPORTANT:
This is a redesign of the existing Assuredia authentication UI.
Do NOT change authentication logic, APIs, OAuth configuration, roles, permissions, or backend behavior.
Only redesign the visual experience.

The Login screen must support the authentication methods already available in the product.

--------------------------------

DESIGN DIRECTION

Create a premium, modern enterprise SaaS authentication experience.

Visual identity:

Professional
Technical
Reliable
Minimal
Modern
Blue-focused

The login page should immediately communicate:

"Assuredia — Always On. Quality Assured."

Avoid:
- Generic template appearance
- Excessive gradients
- Neon effects
- Purple
- Cyan-heavy visuals
- Overly complicated illustrations

--------------------------------

DARK THEME

Use the EXACT CURRENT Assuredia dark theme:

Background:
#0A0E17

Main Surface:
#0F1420

Elevated Surface:
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
- No excessive glow.
- No excessive gradients.
- Keep the near-black navy + royal-blue identity.

--------------------------------

DESKTOP LAYOUT

Use a two-column composition.

LEFT SIDE:

Brand / product area.

Show:

ASSUREDIA

"Always On. Quality Assured."

Short supporting message:

"Continuous QA monitoring for the customer journeys that matter."

Include a subtle abstract visual representing:

Monitoring
Testing
Reliability
Automation

Keep it minimal and technical.

Do NOT use stock photos.

Do NOT create a large distracting illustration.

RIGHT SIDE:

Login card.

Use a clean elevated surface:

#0F1420

Subtle border:

#1E2536

Title:

"Welcome back"

Subtitle:

"Sign in to your Assuredia workspace."

--------------------------------

LOGIN FORM

Email / Username

Password

Password visibility toggle

Primary button:

"Sign In"

Use #2563EB.

Include:

"Forgot password?"

only if the existing authentication flow supports it.

--------------------------------

SOCIAL AUTHENTICATION

If Google and GitHub authentication are supported by the current product, show:

Continue with Google

Continue with GitHub

Use official recognizable icons.

Separate social authentication from normal login with:

"OR"

Do NOT show social login methods if they are not actually implemented.

--------------------------------

ERROR STATES

Authentication errors should appear directly below the relevant form area.

Example:

"Invalid email or password."

Use the existing semantic red.

Do not use large red banners.

--------------------------------

LOADING STATE

When signing in:

Button text:

"Signing in..."

Show a subtle loading indicator.

Prevent duplicate submission while authentication is in progress.

--------------------------------

CLIENT / ADMIN EXPERIENCE

Do not create separate login pages for Client and Admin unless the existing application already uses separate authentication flows.

The same authentication entry point should route the authenticated user to the correct experience based on their existing role.

Client:
→ Client Dashboard

Admin:
→ Admin Dashboard

Do not expose role selection on the login page.

Do NOT let the user manually choose:
Admin / Client.

--------------------------------

RESPONSIVE DESIGN

Desktop:
Two-column layout.

Tablet:
Reduce the branding area and prioritize the login card.

Mobile:
Show the login card prominently.
Branding becomes compact.

No horizontal scrolling.

--------------------------------

ACCESSIBILITY

Ensure:

- Strong text contrast
- Clearly visible focus states
- Proper input labels
- Keyboard accessibility
- Clear error states
- Buttons large enough to interact with comfortably

--------------------------------

BRAND DETAILS

Use the Assuredia logo if it already exists in the project.

Do NOT create a completely new logo.

Keep the branding consistent with the rest of the product.

Use the royal-blue accent subtly around:

Logo
Primary button
Focus states
Links
Small decorative elements

--------------------------------

FINAL GOAL

The login experience should feel like the entrance to the same product as:

Client Dashboard
Flows
Schedules
Run History
Alerts
AI Analysis
Admin Dashboard

It should feel polished enough for a production B2B SaaS product.

The user should immediately understand:

1. This is Assuredia.
2. They are signing into their workspace.
3. How to authenticate.
4. What happens after signing in.

Keep the design simple, premium, trustworthy, and consistent with the existing Assuredia dark design system.