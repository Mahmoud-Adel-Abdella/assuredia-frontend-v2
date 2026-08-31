Design the ASSUREDIA RUN DETAILS / LIVE EXECUTION experience.

IMPORTANT:
This is a redesign of an existing Assuredia product.
Do NOT invent backend functionality.
Do NOT change execution behavior, APIs, database structure, or existing workflows.
The UI must represent the execution capabilities that already exist.

The experience should work for BOTH:

1. Completed Run Details
2. Currently Running Live Execution

It should feel like a detailed execution workspace connected directly to Run History.

--------------------------------

NAVIGATION

Keep the existing Assuredia sidebar:

WORKSPACE
- Overview
- Flows
- Schedules
- Run History

MONITORING
- Alerts

SYSTEM
- Settings

When the user opens a run from Run History, show the Run Details experience.

--------------------------------

RUN HEADER

At the top show:

Back to Run History

Flow name:
"Login"

Execution ID:
"RUN-000123"

Status:
PASSED / FAILED / RUNNING / CANCELLED

Trigger:
⚡ Manual
or
◷ Scheduled

Started:
Today, 18:42

Duration:
18s

For a running execution:

Status:
● RUNNING

Show live duration.

If supported by the existing application, show:

[Cancel Run]

The Cancel Run action must be visually distinct as a destructive action.

--------------------------------

LIVE EXECUTION MODE

When the execution is currently running, the interface should communicate that the execution is actively progressing.

Show:

RUNNING

Current test:
"testValidLogin"

Current step:
"Entering credentials"

Progress indicator if available.

Execution timeline:

✓ Open application
✓ Navigate to login
● Enter credentials
○ Submit login
○ Verify dashboard

Use:

Green → completed
Blue → currently executing
Muted → pending
Red → failed

Do NOT fake progress or invent percentages if the backend does not provide them.

The UI should update naturally as execution events arrive.

--------------------------------

EXECUTION SUMMARY

Create a compact summary section:

Status
Duration
Tests
Passed
Failed

For example:

Status
PASSED

Duration
18s

Tests
3

Passed
3

Failed
0

For failed executions, highlight the failed count using the existing semantic red.

--------------------------------

TEST EXECUTION

Show the tests contained in this execution.

Example:

Tests (3)

✓ testValidLogin
✓ testInvalidPassword
✓ testSessionTimeout

Each test should show:

Status
Test name
Duration if available

Clicking a test should reveal its execution details.

Do NOT create separate top-level history entries for child tests when the execution represents a multi-test package.

--------------------------------

STEP / ACTION TIMELINE

Create a detailed execution timeline.

Example:

✓ Browser launched
✓ Navigate to login
✓ Enter username
✓ Enter password
✓ Click Login
✓ Verify dashboard

For each step, allow relevant information to be displayed when available:

Duration
Action
Result
Error

Keep technical information readable but not overwhelming.

Use monospace typography only for technical values, selectors, IDs, logs, and error messages.

--------------------------------

FAILURE DETAILS

For a failed execution, create a clearly separated failure section.

Show:

Failure
"Expected dashboard element was not found."

Error message

Failed step

Timestamp

Screenshot if available

Use the existing red semantic color.

Do NOT make the entire page red.

Only the failure area should receive stronger visual emphasis.

--------------------------------

AI ANALYSIS

If AI analysis exists for the run, show:

AI Analysis

Risk Level

Business Impact

Assessment

Recommended Actions

Primary action:

"View AI Analysis"

AI analysis belongs to the EXECUTION/PACKAGE level.

Do NOT create separate AI analysis blocks for every individual test unless the existing backend explicitly provides that capability.

--------------------------------

SCREENSHOTS

If screenshots are available:

Create a "Screenshots" section.

Show thumbnails.

Clicking a screenshot opens a larger preview.

Keep screenshots associated with their execution/test step when that information exists.

--------------------------------

LOGS

If execution logs are available:

Create a collapsible:

"Execution Logs"

Use a dark elevated code/log container.

Use monospace typography.

Support:

Timestamp
Log level
Message

Do not make logs the primary focus of the page.

They should remain secondary technical information.

--------------------------------

RUNNING ACTIONS

For a currently running execution:

Show:

● RUNNING

Live duration

Current test / step

Live execution timeline

If cancellation is supported:

[Cancel Run]

The Cancel action should:

- Use destructive styling
- Require confirmation if the existing UX requires it
- Clearly communicate that the execution will be stopped

After cancellation:

Status becomes:

CANCELLED

Do not show the execution as FAILED.

--------------------------------

COMPLETED ACTIONS

For completed executions:

Available actions may include:

Run Again
View AI Analysis
View Screenshots

Only expose actions already supported by the existing application.

Do not invent additional actions.

--------------------------------

LIVE EXECUTION WINDOW BEHAVIOR

IMPORTANT UX:

The user must NOT be forced to keep the Live Execution view open while a test is running.

The user should be able to navigate back to the dashboard while execution continues.

If they leave the live execution page:

- The execution continues in the background.
- The Run History should eventually contain the result.
- The Alerts system should handle notifications according to the configured notification policy.
- Returning to the run should show the current/final state.

If the existing product supports a minimized live execution indicator, show a small persistent indicator such as:

● Test Running
"Login • 32s"

Do not create this behavior if it is not supported by the current application.

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
- No black-only surfaces.
- Keep the near-black navy + royal-blue identity.

--------------------------------

VISUAL HIERARCHY

The page hierarchy should be:

1. Execution status
2. What is running / what ran
3. Tests and progress
4. Failure details
5. AI analysis
6. Screenshots
7. Logs

Do not overwhelm the user with logs or technical details before showing the execution result.

--------------------------------

RESPONSIVE

Desktop:
Use a two-column layout where appropriate:

Main:
Execution timeline / tests / failure

Secondary:
Summary / status / AI analysis

Tablet:
Stack sections naturally.

Mobile:
Single-column layout.
Keep execution status and cancellation action easily accessible.

--------------------------------

FINAL UX GOAL

The user should be able to answer immediately:

"What is happening right now?"

"What ran?"

"Did it pass or fail?"

"Which test failed?"

"Where did it fail?"

"What does the AI think?"

"Can I see the screenshot?"

"Can I cancel the execution?"

The experience should feel like the execution control center of a professional QA monitoring platform.

It must look like a natural extension of:

Dashboard
Flows
Schedules
Run History
Alerts

—not a separate product.