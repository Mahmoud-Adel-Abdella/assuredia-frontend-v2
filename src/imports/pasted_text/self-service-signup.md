Update the ASSUREDIA AUTHENTICATION AND ONBOARDING EXPERIENCE to support SELF-SERVICE CLIENT SIGNUP while preserving the existing ADMIN CLIENT CREATION flow.

IMPORTANT:
This is a UX/UI redesign and flow expansion.
Do NOT remove or replace the existing Admin "Create Client" functionality.
Do NOT change backend architecture, APIs, authentication logic, database structure, or permissions.
The goal is to add a new self-service onboarding path alongside the existing Admin-created client path.

==================================================
1. LOGIN PAGE
==================================================

Keep the current Assuredia Login design and dark theme.

The current login page already contains:

ASSUREDIA
Always On. Quality Assured.

Google authentication
GitHub authentication
Email / Password authentication

Keep all existing authentication methods.

Add a clear signup entry:

"Don't have an Assuredia account?"
"Create an account"

The signup link should lead to the self-service signup flow.

Do NOT add:
"Create Client" to the login page.

==================================================
2. SIGN UP
==================================================

Create a dedicated:

"Create your Assuredia account"

page.

The user should be able to register using:

- Email / Password
- Google
- GitHub

Use the existing authentication capabilities if already implemented.

Fields for email signup:

Full Name
Email
Password
Confirm Password

Primary action:

"Create Account"

Secondary:

"Continue with Google"
"Continue with GitHub"

After successful account creation:

→ Start onboarding.

==================================================
3. SELF-SERVICE ONBOARDING
==================================================

Create a clean onboarding experience.

The onboarding should collect the information required to create a client environment.

Use a step-based interface:

01 Account
02 Client
03 Application
04 Runtime
05 Review

IMPORTANT:
The onboarding is for a USER requesting access to Assuredia as a client.

It is NOT the same as the Admin "Create Client" flow.

==================================================
STEP 01 — ACCOUNT
==================================================

Show the authenticated user's information.

Example:

Name
Email

Explain:

"Your account will be associated with the client environment you are requesting."

Do not expose internal IDs.

==================================================
STEP 02 — CLIENT
==================================================

Collect client/company information supported by the existing product.

Example:

Company / Client Name
Website

Use clear business-friendly labels.

Do not expose database terminology.

==================================================
STEP 03 — APPLICATION
==================================================

Collect the information required for the application that Assuredia will monitor.

Show:

Application URL

Application Username
Application Password

IMPORTANT:

Clearly explain:

"These credentials are for the application Assuredia will test. They are NOT your Assuredia account credentials."

Use secure password input.

Never display passwords as plain text.

==================================================
STEP 04 — RUNTIME
==================================================

Collect the existing runtime configuration supported by the product.

Browser:
Chrome
Firefox
Edge

Device:
Desktop
Tablet
Mobile
Custom viewport

Headless Mode

Timeout

Retry Count

Do NOT invent new runtime configuration.

Keep advanced technical options visually secondary.

Use helper text explaining technical settings.

==================================================
STEP 05 — REVIEW
==================================================

Before submission, show a clean summary:

ACCOUNT

Name
Email

CLIENT

Company / Client Name
Website

APPLICATION

Application URL
Credentials configured

RUNTIME

Browser
Device
Headless
Timeout
Retry Count

IMPORTANT:
Never display the actual application password.

==================================================
6. SUBMIT REQUEST
==================================================

The final action should NOT immediately create an active client.

Primary button:

"Submit for Approval"

Supporting text:

"Your request will be reviewed by an Assuredia administrator before your workspace is activated."

After submission:

Show a dedicated success state:

"Request submitted"

"Your onboarding request has been sent to the Assuredia team."

"Your workspace will become available after approval."

Status:

PENDING APPROVAL

Provide:

"Back to Login"

or

"Go to Dashboard"

ONLY if the existing authentication flow supports it.

==================================================
7. PENDING APPROVAL STATE
==================================================

Create a clear pending state for users whose request has not yet been approved.

Show:

PENDING APPROVAL

"Your client setup is currently being reviewed."

Show:

Submitted
Client / Company
Website
Request status

Possible status:

Pending
Approved
Rejected

Do NOT allow the user to access the client workspace while the request is pending.

==================================================
8. APPROVAL STATE
==================================================

After Admin approval:

Show:

"Your workspace is ready"

"Your Assuredia environment has been approved."

Primary:

"Open Workspace"

The user should then enter the normal Client Dashboard.

==================================================
9. ADMIN SIDE — DO NOT REMOVE CREATE CLIENT
==================================================

CRITICAL:

The existing Admin Dashboard MUST KEEP:

Clients
→ Create Client

Do NOT remove it.

The Admin must still be able to create a client directly.

The Admin should additionally have a place to review self-service onboarding requests.

Add a new Admin section:

"Onboarding Requests"

or:

"Client Requests"

Example navigation:

ADMIN CONSOLE

Overview
Clients
Onboarding Requests
Runs

MONITORING
Alerts
AI Analysis

SYSTEM
Settings

==================================================
10. ADMIN ONBOARDING REQUESTS
==================================================

Create a dedicated Admin page:

"Onboarding Requests"

Description:

"Review and manage client registration requests."

Show a table:

Requester
Company
Website
Submitted
Status
Actions

Statuses:

PENDING
APPROVED
REJECTED

Example:

Mahmoud
Northwind Cloud
example.com
2 hours ago
PENDING
Review

==================================================
11. REQUEST DETAILS
==================================================

Admin clicks:

"Review"

Show:

Requester information
Client information
Application information
Runtime configuration
Submission time
Current status

Application credentials must remain protected.

Do NOT display sensitive credentials unnecessarily.

Actions:

Approve Request
Reject Request

If rejected, allow a reason only if the existing backend supports storing/displaying rejection reasons.

==================================================
12. AFTER APPROVAL
==================================================

When Admin approves a request:

The user becomes associated with the approved client environment.

The client can then access:

Client Dashboard
Flows
Schedules
Run History
Alerts
AI Analysis
Settings

The user should NOT have Admin permissions.

==================================================
13. TWO CLIENT CREATION PATHS
==================================================

The final product must clearly support BOTH:

PATH A — ADMIN CREATED

Admin
→ Clients
→ Create Client
→ Configure Client
→ Client Created
→ Client Workspace


PATH B — SELF SERVICE

User
→ Sign Up
→ Onboarding
→ Submit Request
→ Pending Approval
→ Admin Review
→ Approve
→ Client Workspace

Do NOT merge these two flows into one confusing experience.

==================================================
14. VISUAL DESIGN
==================================================

Use the current Assuredia dark theme:

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

Pending:
use a subtle amber/blue treatment.

IMPORTANT:

- No cyan.
- No purple.
- No excessive neon.
- No excessive glow.
- Keep the near-black navy + royal-blue identity.
- Maintain the same visual language as the current Login, Client Dashboard, and Admin Dashboard.

==================================================
15. UX PRINCIPLE
==================================================

The user should immediately understand:

"I can create my Assuredia account myself."

"I can request a client workspace."

"My request requires Admin approval."

"The Admin can still create clients directly."

The two paths must coexist without confusing the user.

FINAL EXPERIENCE:

LOGIN
↓
SIGN UP
↓
ONBOARDING
↓
SUBMIT REQUEST
↓
PENDING APPROVAL
↓
ADMIN REVIEW
↓
APPROVE
↓
CLIENT WORKSPACE

AND IN PARALLEL:

ADMIN
↓
CREATE CLIENT
↓
CLIENT WORKSPACE

Do NOT remove or weaken the existing Admin Create Client functionality.