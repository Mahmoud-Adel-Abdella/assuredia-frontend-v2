Design the next Assuredia screen: CLIENT WORKSPACE → FLOWS.

IMPORTANT:
This is a redesign of an existing Assuredia product.
Do NOT invent new functionality.
Do NOT change the existing business logic, API behavior, routes, or workflows.
Preserve the existing functionality and information architecture.
Create the screen using the EXACT SAME DARK THEME currently implemented in the project.

DARK THEME — USE THE CURRENT IMPLEMENTED SYSTEM:

Background:
#0A0E17

Main surfaces / cards:
#0F1420

Elevated surfaces:
#151B29

Borders:
#1E2536

Strong borders / dividers:
#2C3547

Primary brand / active:
#2563EB

Accent / links / indicators:
#3B82F6

Light blue accent:
#60A5FA

Very light blue:
#93C5FD

Primary text:
#F4F7FB

Secondary text:
#9AA3B5

Muted text:
#7B8496

Semantic colors:
Success: existing green
Error: existing red
Warning: existing amber

IMPORTANT COLOR RULES:
- Keep the current near-black navy background.
- Keep the current dark surface hierarchy.
- Use royal blue as the primary brand color.
- Do NOT introduce cyan.
- Do NOT introduce teal.
- Do NOT introduce purple.
- Do NOT make the interface brighter than the current approved dark theme.
- Keep green, red, and amber strictly for semantic status states.
- Use subtle borders rather than glowing borders.
- Avoid excessive gradients and neon effects.
- Maintain the same visual language as the current Client Dashboard.

VISUAL DIRECTION:

Professional enterprise SaaS
Modern
Technical
Reliable
Minimal
Premium
Dark
Royal-blue focused

The page should look like a natural continuation of the existing Assuredia Client Dashboard and the current dark theme.

PAGE:
Client Workspace → Flows

CLIENT HEADER:

Show:

Client name:
"Northwind Cloud"

Client identifier:
"ID-0030"

Website:
"https://example.com"

Status:
● Active

Workspace navigation:

Overview
Flows
Run History

IMPORTANT:
Do NOT put Settings inside this workspace navigation.
Settings remain in the main Settings area.

FLOWS PAGE HEADER:

Eyebrow:
"FLOW REGISTRY"

Title:
"Automation checkpoints"

Description:
"Run complete flows or choose individual tests to execute."

Primary action:
"+ Add Flow"

Use #2563EB for the primary action.

FLOW LIST:

Display flows as clean, spacious dark cards.

Example flows:

Login
Checkout
User Registration
Payment
Product Search

Each flow card should contain:

- Flow icon
- Flow name
- Flow identifier
- Status badge
- Schedule information
- Advanced Options
- Tests section
- Run actions

Example:

Flow:
Login

ID:
FLOW-0001

Status:
ACTIVE

Schedule:
Every 30 minutes

Scope:
Full flow scheduled

FLOW STATUS:

ACTIVE → subtle blue/green treatment
INACTIVE → muted treatment
RUNNING → blue treatment

Do not use bright neon status pills.

TESTS:

Each flow can expand a Tests section.

Example:

Tests (3)

✓ testValidLogin
  LoginTest

✓ testInvalidPassword
  LoginTest

□ testSessionTimeout
  LoginTest

Include:

Select all
Deselect all

Show the number of selected tests.

RUN ACTIONS:

Each flow supports:

Primary:
"Run full flow"

Secondary:
"Run Selected (N)"

Secondary:
"Schedule"

Danger:
Delete

Use clear visual hierarchy.

When a flow is running:

Status:
RUNNING

Primary action:
"Running..."

Disable conflicting run actions while execution is active.

ADVANCED OPTIONS:

Keep advanced configuration collapsed by default.

When expanded, show the existing runtime configuration:

Browser:
Chrome
Firefox
Edge

Device:
Desktop
Tablet
Mobile
Custom viewport

Do not invent additional runtime settings.

SCHEDULE MODAL:

The Schedule action should open a clean dark modal matching the current theme.

Support the existing scheduling functionality:

- Schedule frequency
- Run scope
  - Full flow
  - Custom tests
- Test selection when Custom tests is selected
- Schedule active toggle
- Schedule preview
- Cron expression preview
- Save schedule
- Cancel

Do not redesign or change scheduler logic.

FLOW CARD DESIGN:

Use:

Dark surface:
#0F1420

Elevated surface:
#151B29

Border:
#1E2536

Primary action:
#2563EB

Accent:
#3B82F6

Cards should have subtle depth and clear separation from the #0A0E17 background.

Do NOT use cyan glow.

EMPTY STATE:

If no flows exist:

"No flows configured"

"Add your first flow to make this client runnable."

[+ Add Flow]

Use the same dark surface and royal-blue visual language.

RESPONSIVE DESIGN:

Desktop:
- Spacious layout
- Two-column flow cards where appropriate
- Clear action hierarchy

Tablet:
- Responsive card layout

Mobile:
- Single-column cards
- Accessible actions
- Expandable tests remain usable
- No horizontal overflow

COMPONENTS:

Create reusable visual components for:

Flow Card
Status Badge
Schedule Indicator
Advanced Options
Test List
Test Checkbox
Run Button
Schedule Button
Flow Actions
Schedule Modal
Empty State

IMPORTANT:

Do NOT create a new visual identity.

Match the existing Assuredia Dashboard exactly in:

- Background
- Surface colors
- Borders
- Royal-blue accents
- Typography
- Spacing
- Border radius
- Buttons
- Status badges
- Navigation
- Shadows

The final page should feel like it belongs to the same product and the same dark theme as the current Assuredia Client Dashboard.

FINAL GOAL:

The user should immediately understand:

1. What flows exist.
2. Which flows are active.
3. When they are scheduled.
4. Which tests belong to each flow.
5. How to run the full flow.
6. How to run selected tests.
7. How to schedule a flow.
8. What runtime configuration is being used.

Keep the interface operational, clean, and professional.