Design the ASSUREDIA RUN HISTORY page as a top-level page in the Client Dashboard.

IMPORTANT:
This is a redesign of an existing Assuredia product.
Do NOT invent new functionality.
Do NOT change backend logic, APIs, database structure, execution behavior, or existing workflows.
Preserve the existing Run History functionality and improve only the UI/UX.

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

The active Run History item should use the existing Assuredia royal-blue active state.

--------------------------------

PAGE HEADER

Eyebrow:
"EXECUTION HISTORY"

Title:
"Run History"

Description:
"Review test executions, results, failures, and execution details."

At the top-right:

[ Filter ]
[ Date Range ]

--------------------------------

SUMMARY

Create compact summary cards:

Total Runs
Passed
Failed
Success Rate

Use the existing Assuredia dark dashboard style.

Do not make these cards visually dominant over the execution table.

--------------------------------

FILTER BAR

Create a clean filter area.

Filters:

Status:
All
Passed
Failed
Running

Trigger:
All
Manual
Scheduled

Flow:
All flows

Test:
All tests

Time:
Today
Last 7 days
Last 30 days
Custom range

Keep filters compact and easy to scan.

Do not invent additional filter categories.

--------------------------------

RUN HISTORY TABLE

Create a professional execution table.

Columns:

Status
Flow
Test / Tests
Trigger
Started
Duration
Result
Actions

Example:

✓
Login
testValidLogin
Manual
Today, 18:42
18s
Passed
View

✕
Checkout
testPayment
Scheduled
Today, 18:00
32s
Failed
View

⚡
Registration
3 tests
Manual
Today, 17:31
Running
View

Use clear semantic visual states:

PASS:
Green

FAILED:
Red

RUNNING:
Blue

SCHEDULED:
Use a subtle calendar/bell indicator

MANUAL:
Use a subtle lightning/bolt indicator

IMPORTANT:
Do NOT rely only on color.
Use icons and text so the status is immediately understandable.

--------------------------------

TRIGGER VISUALIZATION

Make the distinction between Manual and Scheduled runs visually obvious.

Manual:
⚡ Manual

Scheduled:
◷ Scheduled

Keep these indicators subtle and professional.

Do not create additional trigger types.

--------------------------------

RUN DETAILS

Clicking a run should open its execution details.

The details view should show:

Flow
Test / Tests
Client
Trigger
Status
Start time
End time
Duration

Then show execution details:

Tests
Steps
Assertions
Failures
Screenshots

If the run failed, clearly show:

Failure reason
Error message

If AI analysis is available:

"AI Analysis Available"

with an action:

"View AI Analysis"

Do not create AI functionality that does not already exist.

--------------------------------

PACKAGE / MULTI-TEST RUNS

The current product supports multi-test executions / saved live run packages.

The UI must clearly distinguish a package execution from a single test execution.

Example:

Login Package
5 tests
Manual
Passed

Clicking it should allow the user to inspect the tests contained in that execution.

Do not display every child execution as an unrelated top-level run.

Keep the package as the main execution record.

--------------------------------

RUNNING STATE

If a run is currently executing:

Show:

RUNNING

Live duration

Progress if available

"View Live Run"

If the existing application supports cancelling the execution:

Show:

"Cancel Run"

Do not invent cancellation functionality if it is not available in the current implementation.

--------------------------------

EMPTY STATE

If there are no executions:

"No runs yet"

"Your test executions will appear here."

Primary action:

"Go to Flows"

Keep the empty state simple.

--------------------------------

FAILURE STATE

Failed runs should be visually noticeable without making the entire page alarming.

Use:

Red status indicator
Failure label
Clear failure reason

Provide:

"View Run"
"View AI Analysis" when available

--------------------------------

RESPONSIVE DESIGN

Desktop:
- Full table
- Filters in one horizontal row where possible
- Comfortable spacing

Tablet:
- Responsive table
- Filters wrap naturally

Mobile:
- Convert execution rows into stacked cards
- Keep status, flow, trigger, time, and action visible
- Avoid unnecessary horizontal scrolling

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

Strong border/divider:
#2C3547

Primary:
#2563EB

Accent:
#3B82F6

Light blue:
#60A5FA

Primary text:
#F4F7FB

Secondary text:
#9AA3B5

Muted text:
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
- Keep the near-black navy + royal-blue visual identity.
- Maintain strong contrast and readability.

--------------------------------

UX PRINCIPLES

The Run History page should immediately answer:

1. What ran?
2. Which flow/test ran?
3. Was it Manual or Scheduled?
4. Did it pass or fail?
5. When did it run?
6. How long did it take?
7. What happened when it failed?
8. Is AI analysis available?
9. Can I open the full execution?

The page should feel like a professional QA execution history and monitoring center.

Keep the design consistent with:

Client Dashboard
Flows
Schedules
Alerts
Settings

Use the same:

Sidebar
Typography
Buttons
Cards
Tables
Status badges
Spacing
Border radius
Dark surfaces
Royal-blue accents

FINAL GOAL:

Run History should be the central place for understanding everything that has been executed by the client's Assuredia environment.

The user should be able to move naturally:

Flows → Run
Schedules → Run
Run History → Investigate
Failure → AI Analysis
Failure → Alerts