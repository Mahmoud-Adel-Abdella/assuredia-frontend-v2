Design the ASSUREDIA CREATE / EDIT FLOW experience.

IMPORTANT:
This is a redesign of an existing Assuredia Client feature.
Do NOT change backend logic, APIs, database structure, test execution behavior, or existing functionality.
Do NOT invent new test types or automation capabilities.
Only improve the UI/UX and organization of the existing Flow creation and editing experience.

--------------------------------

ACCESS

The Flow creation experience is accessed from:

Client Dashboard
→ Flows
→ Add Flow

The editing experience is accessed from:

Flows
→ Flow
→ Edit

--------------------------------

PAGE HEADER

Show:

← Back to Flows

Eyebrow:
"FLOW MANAGEMENT"

Title:
"Create Flow"

For editing:

"Edit Flow"

Description:

"Define a customer journey and the tests Assuredia will execute."

--------------------------------

FLOW INFORMATION

Create a clean section:

"Flow Information"

Fields supported by the existing application:

Flow Name
Flow Description

If a Flow ID is generated automatically, display it as read-only after creation.

Keep the form simple.

Do not ask the user for technical database identifiers.

--------------------------------

TESTS

Create the main section:

"Tests"

Description:

"Add the tests that belong to this flow."

Show the existing tests associated with the flow.

Each test should display:

Test name
Test class / method if available
Status
Actions

Example:

✓ testValidLogin
LoginTest

✓ testInvalidPassword
LoginTest

Actions:

Edit
Remove

--------------------------------

ADD TEST

Primary action:

"+ Add Test"

The UI should allow the user to add a test using ONLY the test creation functionality already supported by the existing application.

If manual test creation is supported, clearly present the existing manual test fields.

Do not invent a new automation recording system.

Do not add Selenium IDE functionality here unless it already exists.

--------------------------------

MANUAL TEST

If the current product supports manually adding tests, create a clean manual test form.

Use only the fields currently supported by the application.

Organize the information logically.

For example:

Test Name

Test Description

Test Steps

Expected Result

Keep the interface simple and readable.

If these exact fields are not supported by the existing backend, do not add them.

--------------------------------

TEST SELECTION

If existing tests can be selected from available tests, provide:

Available Tests

[ Search tests ]

Checkbox list

Selected Tests

Show:

"3 tests selected"

Provide:

Select All
Clear Selection

Do not duplicate the same test inside the flow.

--------------------------------

FLOW SUMMARY

Provide a small summary panel:

Flow Name
Tests
Status

Example:

Login Flow

3 Tests

Active

This summary should update as the user edits the flow.

--------------------------------

SAVE ACTIONS

Primary:

"Save Flow"

For creation:

"Create Flow"

Secondary:

"Cancel"

During saving:

"Saving..."

Prevent duplicate submissions.

After successful creation:

"Flow created successfully"

Provide:

"Open Flow"

or:

"Back to Flows"

Only use navigation already supported by the application.

--------------------------------

VALIDATION

Use inline validation.

Examples:

Flow name required
Invalid test configuration
No tests selected, if tests are required by the existing implementation

Use the existing semantic red for errors.

Do not use large intrusive error banners for normal field validation.

--------------------------------

EDIT MODE

When editing an existing flow:

Pre-populate all existing values.

Clearly show:

"Edit Flow"

Do not reset or remove existing tests unless the user explicitly removes them.

Provide:

Save Changes
Cancel

--------------------------------

FLOW ↔ SCHEDULE SEPARATION

IMPORTANT:

Scheduling is NOT part of Flow creation/editing.

Do NOT include:

Schedule
Cron
Frequency
Next Run
Schedule Status

inside the Flow creation form.

Schedules are managed separately from:

Sidebar → Schedules

The product relationship is:

Flows
→ What we test

Schedules
→ When we run it

Run History
→ What happened

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

--------------------------------

DESIGN STYLE

The experience should feel:

Professional
Simple
Technical
Structured
Reliable
Enterprise SaaS

Avoid making Flow creation feel like a complicated developer configuration screen.

The user should understand immediately:

"What is this Flow?"

"What tests belong to it?"

"How do I add or remove tests?"

"How do I save it?"

--------------------------------

RESPONSIVE DESIGN

Desktop:

Use a two-column layout where appropriate:

Main:
Flow configuration and tests

Secondary:
Flow summary

Tablet:
Stack sections naturally.

Mobile:
Single-column layout.
Tests remain easy to manage.
Actions remain accessible.
No horizontal overflow.

--------------------------------

FINAL USER JOURNEY

The complete workflow should feel natural:

Client
→ Flows
→ Create Flow
→ Add Tests
→ Save Flow
→ Flow created

Then separately:

Flow
→ Schedules
→ Create Schedule

And after execution:

Flow
→ Run History
→ Run Details
→ AI Analysis / Alerts

Keep all of these responsibilities clearly separated.