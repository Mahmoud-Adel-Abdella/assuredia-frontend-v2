import React, { useMemo, useState } from "react"
import { Button, Card, cx } from "./primitives"
import { useLang } from "../lib/i18n"

/**
 * Client Help Center (Figma: "Help", Support section). UI-only by design —
 * no tickets, no backend. Categories and all page chrome come from the i18n
 * dictionary; the article corpus below is static documentation content
 * (not business data) kept in one place so it can be localized as content
 * without touching the UI layer.
 */

type Article = {
  id: string
  categoryId: string
  title: string
  description: string
  body: string
  related: string[]
}

type CategoryId =
  | "getting-started"
  | "flows-tests"
  | "automations"
  | "runs-history"
  | "alerts"
  | "requests"
  | "feedback"

const ICON_PROPS = { className: "size-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" } as const

const CATEGORIES: { id: CategoryId; titleKey: string; descKey: string; icon: React.ReactNode }[] = [
  {
    id: "getting-started",
    titleKey: "help.cat.gettingStarted.title",
    descKey: "help.cat.gettingStarted.desc",
    icon: <svg {...ICON_PROPS}><path strokeLinecap="round" strokeLinejoin="round" d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
  },
  {
    id: "flows-tests",
    titleKey: "help.cat.flowsTests.title",
    descKey: "help.cat.flowsTests.desc",
    icon: <svg {...ICON_PROPS}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path strokeLinecap="round" d="M6 8.5v3a3 3 0 003 3h.5M18 8.5v3a3 3 0 01-3 3h-.5" /></svg>,
  },
  {
    id: "automations",
    titleKey: "help.cat.automations.title",
    descKey: "help.cat.automations.desc",
    icon: <svg {...ICON_PROPS}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  },
  {
    id: "runs-history",
    titleKey: "help.cat.runsHistory.title",
    descKey: "help.cat.runsHistory.desc",
    icon: <svg {...ICON_PROPS}><path strokeLinecap="round" strokeLinejoin="round" d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 004 8" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v4h4M12 7.5V12l3 2" /></svg>,
  },
  {
    id: "alerts",
    titleKey: "help.cat.alerts.title",
    descKey: "help.cat.alerts.desc",
    icon: <svg {...ICON_PROPS}><path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.7 21a2 2 0 01-3.4 0" /></svg>,
  },
  {
    id: "requests",
    titleKey: "help.cat.requests.title",
    descKey: "help.cat.requests.desc",
    icon: <svg {...ICON_PROPS}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" /></svg>,
  },
  {
    id: "feedback",
    titleKey: "help.cat.feedback.title",
    descKey: "help.cat.feedback.desc",
    icon: <svg {...ICON_PROPS}><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" /></svg>,
  },
]

const ARTICLES: Article[] = [
  /* Getting Started */
  {
    id: "gs-1", categoryId: "getting-started",
    title: "How to get started with Assuredia",
    description: "Learn the basic steps to start monitoring your application.",
    body: "Assuredia monitors your application around the clock using automated test flows. To begin:\n\n1. **Review your Dashboard** — the Overview panel shows the current health of all monitored flows.\n2. **Explore your Flows** — navigate to Flows in the sidebar to see the test suites assigned to your workspace.\n3. **Check Run History** — every execution is logged. Open Run History to see passed, failed, and pending runs.\n4. **Set up Automations** — configure scheduled runs so Assuredia monitors continuously without manual intervention.\n5. **Configure Alerts** — make sure notifications are routed to your team so failures reach the right people immediately.",
    related: ["gs-2", "flows-1", "auto-1"],
  },
  {
    id: "gs-2", categoryId: "getting-started",
    title: "Understanding your Dashboard",
    description: "A quick overview of the main monitoring information and controls.",
    body: "The Dashboard is the central view of your workspace health. It surfaces:\n\n- **Status summary** — a quick count of passing, failing, and pending flows.\n- **Recent runs** — the latest executions across all flows.\n- **Active alerts** — unresolved failures that need attention.\n- **Quick actions** — shortcuts to trigger a run or navigate to a specific flow.\n\nThe Dashboard refreshes automatically. A green status indicator in the header confirms the platform is operational.",
    related: ["gs-1", "runs-1", "alerts-1"],
  },
  {
    id: "gs-3", categoryId: "getting-started",
    title: "Understanding Flows and Tests",
    description: "Learn how Assuredia organizes automated tests into flows.",
    body: "A **Flow** is a logical group of automated tests that represent a user journey or feature area — for example, *Login*, *Checkout*, or *Password Reset*.\n\nEach Flow contains one or more **Tests**. A test is a single automated scenario: opening a page, filling a form, asserting a result.\n\nFlows can be run manually from the Flows page, or automatically on a schedule via Automations. Results are collected in Run History.",
    related: ["flows-1", "flows-2", "auto-1"],
  },
  {
    id: "gs-4", categoryId: "getting-started",
    title: "Understanding Clients and Environments",
    description: "Learn how monitored clients and environments are represented.",
    body: "Each workspace in Assuredia belongs to a **Client** — the organization whose application is being monitored.\n\nWithin a client, tests may target different **Environments** such as staging, production, or UAT. Run results are tagged with the environment so you can distinguish production failures from pre-release issues.\n\nYour workspace header shows your client name and environment tier.",
    related: ["gs-1", "gs-2"],
  },

  /* Flows & Tests */
  {
    id: "flows-1", categoryId: "flows-tests",
    title: "What are Flows?",
    description: "Understand how flows group related automated tests.",
    body: "A Flow is a named collection of automated tests that together cover a meaningful user journey. Examples include:\n\n- **Login Flow** — tests the full authentication sequence.\n- **Checkout Flow** — covers adding items, entering payment, and confirming an order.\n- **Password Reset Flow** — tests the complete forgot-password journey.\n\nGrouping tests into flows makes it easy to run, monitor, and report on entire features at once.",
    related: ["flows-2", "flows-3", "gs-3"],
  },
  {
    id: "flows-2", categoryId: "flows-tests",
    title: "How to create a Flow",
    description: "Learn how to create and configure a new automation flow.",
    body: "Flows are created by the Assuredia team in response to a **Request**. To request a new flow:\n\n1. Navigate to **Requests** in the sidebar.\n2. Click **New Request** and choose *Add Flow*.\n3. Provide the flow name, target feature, and step descriptions.\n4. Submit the request — the Assuredia team will implement and activate it.\n\nOnce approved and implemented, the flow appears in your Flows list.",
    related: ["req-1", "req-2", "flows-1"],
  },
  {
    id: "flows-3", categoryId: "flows-tests",
    title: "How to manage Tests",
    description: "Learn how to work with individual tests inside a flow.",
    body: "Tests within a flow can be viewed from the **Flows** page. Click any flow to see its test list.\n\nTo add, modify, or remove a test, submit a **Request**. Tests are managed by the Assuredia team to ensure stability and consistency across your monitoring suite.",
    related: ["flows-1", "req-3", "req-4"],
  },
  {
    id: "flows-4", categoryId: "flows-tests",
    title: "Running a Full Flow",
    description: "Understand what happens when you run an entire flow.",
    body: "Running a full flow executes every test within it in sequence. To trigger a run:\n\n1. Open the **Flows** page.\n2. Select the target flow.\n3. Click **Run Flow**.\n\nAssuredia executes all tests in order. Results are collected and immediately visible in **Run History**. If any test fails, an alert is generated.",
    related: ["flows-5", "runs-1", "alerts-1"],
  },
  {
    id: "flows-5", categoryId: "flows-tests",
    title: "Running Selected Tests",
    description: "Learn how to execute specific tests without running the entire flow.",
    body: "When you only need to verify part of a flow, you can select individual tests to run:\n\n1. Open the flow in the **Flows** page.\n2. Select the tests you want to execute.\n3. Click **Run Selected**.\n\nOnly the selected tests execute. Results appear in Run History tagged as a partial run.",
    related: ["flows-4", "runs-1"],
  },
  {
    id: "flows-6", categoryId: "flows-tests",
    title: "Understanding Test Results",
    description: "Learn how to read passed and failed test results.",
    body: "After a run completes, each test is marked:\n\n- **Passed** — the test executed successfully and all assertions matched.\n- **Failed** — the test encountered an error or an assertion did not match.\n- **Skipped** — the test was not executed in this run.\n\nFailed tests include a screenshot and error message. Open Run History, select the run, and click any failed test to inspect the full failure details.",
    related: ["runs-4", "alerts-3"],
  },

  /* Automations */
  {
    id: "auto-1", categoryId: "automations",
    title: "How Automations work",
    description: "Understand how Assuredia automatically executes your monitoring flows.",
    body: "Automations are scheduled rules that trigger flow executions at set intervals — for example, every hour, every night, or after each deployment.\n\nWhen an automation fires, Assuredia runs the configured flow and collects results. If any test fails, an alert is generated and your team is notified immediately.",
    related: ["auto-2", "auto-3", "alerts-1"],
  },
  {
    id: "auto-2", categoryId: "automations",
    title: "Creating an Automation",
    description: "Learn how to configure automated execution.",
    body: "To create an automation:\n\n1. Navigate to **Automations** in the sidebar.\n2. Click **New Automation**.\n3. Select the flow to automate.\n4. Choose the execution schedule (frequency and time).\n5. Save the automation.\n\nThe automation becomes active immediately and will run at the next scheduled time.",
    related: ["auto-1", "auto-3", "auto-4"],
  },
  {
    id: "auto-3", categoryId: "automations",
    title: "Understanding Execution Schedules",
    description: "Learn how scheduled executions work.",
    body: "Schedules define when and how often a flow runs automatically. Common configurations include:\n\n- **Hourly** — ideal for critical flows that need frequent monitoring.\n- **Daily** — suitable for regression flows run overnight.\n- **Custom interval** — for specific business needs.\n\nSchedules are shown on the Automations page. Each automation displays the next scheduled execution time.",
    related: ["auto-2", "auto-4"],
  },
  {
    id: "auto-4", categoryId: "automations",
    title: "Managing Active Automations",
    description: "Learn how to review and manage your active automations.",
    body: "The **Automations** page lists all configured automations with their status and next run time.\n\nYou can:\n- **Pause** an automation to temporarily stop scheduled runs.\n- **Resume** a paused automation.\n- **Delete** an automation to remove it entirely.\n\nChanges take effect immediately.",
    related: ["auto-2", "auto-3"],
  },

  /* Runs & History */
  {
    id: "runs-1", categoryId: "runs-history",
    title: "Understanding Run History",
    description: "Learn how to review previous executions.",
    body: "Run History is a complete log of every flow execution — manual and automated. Each entry shows:\n\n- Flow name\n- Trigger type (manual or scheduled)\n- Start time and duration\n- Overall status (passed / failed / partial)\n\nOpen any run to see individual test results.",
    related: ["runs-2", "runs-3", "runs-4"],
  },
  {
    id: "runs-2", categoryId: "runs-history",
    title: "Direct Run vs. Scheduled Run",
    description: "Understand the difference between manually triggered and scheduled executions.",
    body: "A **Direct Run** is triggered manually from the Flows page. Use direct runs to test on demand — after a deployment or to investigate a suspected issue.\n\nA **Scheduled Run** is triggered automatically by an Automation. It runs at the configured interval without manual action.\n\nBoth types produce identical results and appear in Run History.",
    related: ["runs-1", "auto-1"],
  },
  {
    id: "runs-3", categoryId: "runs-history",
    title: "Reading Execution Results",
    description: "Learn how to interpret execution status and details.",
    body: "The execution status reflects the outcome of all tests in the run:\n\n- **Passed** — every test passed.\n- **Failed** — one or more tests failed.\n- **Partial** — only selected tests were executed.\n\nClick a run to open the details panel. You will see each test's individual status, timing, and any error messages.",
    related: ["runs-1", "runs-4", "flows-6"],
  },
  {
    id: "runs-4", categoryId: "runs-history",
    title: "Investigating Failed Tests",
    description: "Learn where to find failure information and error details.",
    body: "When a test fails, Assuredia captures:\n\n- **Error message** — the exact failure reason.\n- **Screenshot** — a snapshot of the browser state at the moment of failure.\n- **Stack trace** — technical detail for debugging.\n\nTo access this information:\n1. Open **Run History**.\n2. Select the failed run.\n3. Click the failed test.\n\nThe failure panel shows all captured data.",
    related: ["runs-3", "alerts-3", "alerts-4"],
  },
  {
    id: "runs-5", categoryId: "runs-history",
    title: "Understanding Execution Details",
    description: "Learn how to inspect an individual run.",
    body: "The execution detail view shows a full breakdown of one run:\n\n- **Summary** — overall pass/fail counts and duration.\n- **Test list** — each test with its individual status.\n- **Timeline** — when each test started and finished.\n- **Environment** — which environment was targeted.\n\nUse this view to understand exactly what happened during any execution.",
    related: ["runs-1", "runs-3"],
  },

  /* Alerts & Notifications */
  {
    id: "alerts-1", categoryId: "alerts",
    title: "How Failure Alerts Work",
    description: "Understand when Assuredia generates failure alerts.",
    body: "Assuredia generates an alert whenever a test fails during an automated or manual run. Alerts are designed to reach your team immediately so failures are addressed quickly.\n\nEach alert contains:\n- The name of the failed test and flow.\n- The execution time.\n- A link to the full failure details.\n- A screenshot of the failure state.",
    related: ["alerts-2", "alerts-3", "alerts-4"],
  },
  {
    id: "alerts-2", categoryId: "alerts",
    title: "Understanding Notifications",
    description: "Learn how to review your notifications.",
    body: "Notifications are accessible from the bell icon in the top-right header. The badge count shows unread alerts.\n\nOpening Alerts from the sidebar shows the full alert list with status, flow name, and time. You can filter by status and mark alerts as resolved.",
    related: ["alerts-1", "alerts-3"],
  },
  {
    id: "alerts-3", categoryId: "alerts",
    title: "Reading Failure Details",
    description: "Learn how to understand the information included in a failure alert.",
    body: "Each failure alert includes:\n\n- **Flow and test name** — identifies exactly what failed.\n- **Error message** — the assertion or exception that caused the failure.\n- **Screenshot** — visual evidence of the application state.\n- **Timestamp** — when the failure occurred.\n- **Environment** — staging or production.\n\nThis information is designed to let you start investigating without needing to run the test again.",
    related: ["alerts-1", "runs-4"],
  },
  {
    id: "alerts-4", categoryId: "alerts",
    title: "What to Do When a Test Fails",
    description: "A quick guide to investigating a failed test.",
    body: "When you receive a failure alert:\n\n1. **Open the alert** — read the error message and review the screenshot.\n2. **Check Run History** — confirm whether this is an isolated failure or part of a pattern.\n3. **Investigate the application** — the failure may indicate a regression in your app.\n4. **Submit a Request** if a test needs to be updated to reflect intentional application changes.\n5. **Contact Support** if you cannot determine the root cause.",
    related: ["alerts-1", "runs-4", "req-4"],
  },

  /* Requests */
  {
    id: "req-1", categoryId: "requests",
    title: "When Should I Create a Request?",
    description: "Understand when to request changes instead of managing an asset directly.",
    body: "Requests are used when you need the Assuredia team to modify your test suite. Submit a request when you need to:\n\n- Add a new flow or test.\n- Modify an existing flow or test to match application changes.\n- Delete a flow or test that is no longer relevant.\n\nRequests go through a review process to ensure changes are intentional and accurately specified.",
    related: ["req-2", "req-3", "req-4"],
  },
  {
    id: "req-2", categoryId: "requests",
    title: "Requesting a New Flow",
    description: "Learn how to request a new flow and provide the required information.",
    body: "To request a new flow:\n\n1. Open **Requests** in the sidebar.\n2. Click **New Request** and select *Add Flow*.\n3. Enter:\n   - Flow name\n   - Feature or user journey being covered\n   - Step-by-step description of the expected behavior\n4. Submit the request.\n\nThe Assuredia team will review your request and implement the flow once approved.",
    related: ["req-1", "req-3"],
  },
  {
    id: "req-3", categoryId: "requests",
    title: "Requesting a New Test",
    description: "Learn how to request a test for an existing flow.",
    body: "To add a test to an existing flow:\n\n1. Open **Requests** and click **New Request**.\n2. Select *Add Test*.\n3. Specify:\n   - The target flow\n   - Test name and purpose\n   - Steps and expected result\n4. Submit.\n\nThe new test will be added to the flow after approval and implementation.",
    related: ["req-1", "req-2", "req-4"],
  },
  {
    id: "req-4", categoryId: "requests",
    title: "Modifying a Flow or Test",
    description: "Learn how to request changes to an existing asset.",
    body: "When your application changes and existing tests no longer reflect the correct behavior, submit a modification request:\n\n1. Open **Requests** → **New Request**.\n2. Select *Modify Flow* or *Modify Test*.\n3. Select the target and describe what needs to change.\n4. Submit.\n\nCommon reasons to modify: UI changes, new form fields, updated error messages, changed URLs.",
    related: ["req-1", "req-5", "req-6"],
  },
  {
    id: "req-5", categoryId: "requests",
    title: "Deleting a Flow or Test",
    description: "Learn how to submit deletion requests.",
    body: "To remove a flow or test that is no longer needed:\n\n1. Open **Requests** → **New Request**.\n2. Select *Delete Flow* or *Delete Test*.\n3. Select the target and provide a reason for removal.\n4. Submit.\n\nDeletion requests require approval before the asset is removed from your monitoring suite.",
    related: ["req-1", "req-6"],
  },
  {
    id: "req-6", categoryId: "requests",
    title: "Understanding Request Status",
    description: "Understand Pending, Approved, Rejected, Cancelled, and Implemented states.",
    body: "Each request moves through the following states:\n\n- **Pending** — submitted and awaiting review.\n- **Approved** — accepted and scheduled for implementation.\n- **Implemented** — the change has been applied to your monitoring suite.\n- **Rejected** — not approved; the reason is provided in the request detail.\n- **Cancelled** — withdrawn before implementation.\n\nYou can track the status of all requests from the Requests page.",
    related: ["req-1", "req-2"],
  },

  /* Feedback */
  {
    id: "fb-1", categoryId: "feedback",
    title: "Sending Feedback",
    description: "Learn how to share your experience with Assuredia.",
    body: "To send feedback:\n\n1. Navigate to **Feedback** in the Support section of the sidebar.\n2. Select your experience rating.\n3. Write your feedback message.\n4. Choose a category.\n5. Click **Submit Feedback**.\n\nYour feedback is sent directly to the Assuredia team and reviewed regularly.",
    related: ["fb-2", "fb-3"],
  },
  {
    id: "fb-2", categoryId: "feedback",
    title: "Choosing a Feedback Category",
    description: "Understand the available feedback categories.",
    body: "When submitting feedback, select the category that best fits your message:\n\n- **General** — overall impressions or general comments.\n- **Feature Request** — suggestions for new features or improvements.\n- **UI / UX** — feedback about the interface, layout, or usability.\n- **Performance** — reports of slowness or responsiveness issues.\n- **Monitoring** — feedback specifically about monitoring behavior.\n- **AI Analysis** — feedback about AI-generated insights.\n- **Other** — anything that does not fit the above categories.",
    related: ["fb-1", "fb-3"],
  },
  {
    id: "fb-3", categoryId: "feedback",
    title: "What Happens After Submitting Feedback?",
    description: "Understand how your feedback reaches the Assuredia team.",
    body: "After you submit feedback:\n\n1. Your submission is received by the Assuredia team.\n2. It is reviewed alongside other client feedback during regular product reviews.\n3. Feature requests and recurring themes are prioritized in the product roadmap.\n\nYou will not receive a direct response to general feedback. If you need support for a specific issue, use the Contact Support option in the Help Center.",
    related: ["fb-1", "fb-2"],
  },
]

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function getCategory(id: string) {
  return CATEGORIES.find((c) => c.id === id)!
}

function getArticle(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id)
}

function getCategoryArticles(categoryId: string) {
  return ARTICLES.filter((a) => a.categoryId === categoryId)
}

function searchArticles(query: string) {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.body.toLowerCase().includes(q),
  )
}

/** Renders **bold** spans as React nodes — no HTML injection needed. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
  })
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                        */
/* ------------------------------------------------------------------ */
function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-300 transition-colors hover:text-brand-400"
    >
      <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  )
}

/** Renders paragraphs plus "- "/"1. " list blocks of an article body. */
function ArticleBody({ text }: { text: string }) {
  const paragraphs = text.split("\n\n")
  return (
    <div className="space-y-4 text-[14px] leading-7 text-slate-600">
      {paragraphs.map((para, i) => {
        if (para.startsWith("- ") || para.startsWith("1. ")) {
          const lines = para.split("\n")
          const isOrdered = /^\d+\./.test(lines[0])
          const Tag = isOrdered ? "ol" : "ul"
          return (
            <Tag key={i} className={cx("space-y-1.5 pl-5", isOrdered ? "list-decimal" : "list-disc")}>
              {lines.map((line, j) => (
                <li key={j}>{renderInline(line.replace(/^[-\d.]\s*/, ""), `${i}-${j}`)}</li>
              ))}
            </Tag>
          )
        }
        return <p key={i}>{renderInline(para, String(i))}</p>
      })}
    </div>
  )
}

function ArticleRow({
  article,
  showCategory,
  onClick,
}: {
  article: Article
  showCategory?: boolean
  onClick: () => void
}) {
  const { t } = useLang()
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-navy">{article.title}</p>
        <p className="mt-0.5 text-[12px] text-slate-400">
          {showCategory ? `${t(getCategory(article.categoryId).titleKey)} · ` : ""}
          {article.description}
        </p>
      </div>
      <svg className="size-4 shrink-0 text-slate-300 rtl:-scale-x-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M9 18l6-6-6-6" /></svg>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */
type View =
  | { type: "home" }
  | { type: "category"; categoryId: string }
  | { type: "article"; articleId: string }

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLang()
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("help.searchPlaceholder")}
        aria-label={t("help.searchAria")}
        className="w-full rounded-xl border border-slate-200 bg-surface py-3 ps-10 pe-4 text-[14px] text-navy placeholder:text-slate-400 transition-colors focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/30"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label={t("help.clearSearch")}
          className="absolute end-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function HomeView({
  onCategoryClick,
  onArticleClick,
  search,
  onSearchChange,
}: {
  onCategoryClick: (id: string) => void
  onArticleClick: (id: string) => void
  search: string
  onSearchChange: (v: string) => void
}) {
  const { t } = useLang()
  const results = useMemo(() => searchArticles(search), [search])
  const isSearching = search.trim().length > 0

  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <h1 className="font-display text-2xl font-bold tracking-tight text-navy">{t("page.help.title")}</h1>
        <p className="mt-1 text-[14px] text-slate-500">{t("page.help.subtitle")}</p>
      </div>

      {/* Search */}
      <div className="mb-8 max-w-[540px]">
        <p className="mb-2.5 text-[15px] font-semibold text-navy">{t("help.howCanWeHelp")}</p>
        <SearchBar value={search} onChange={onSearchChange} />
      </div>

      {/* Search results */}
      {isSearching ? (
        <div className="mb-10">
          {results.length > 0 ? (
            <>
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {results.length === 1
                  ? t("help.resultForOne", { query: search })
                  : t("help.resultsFor", { count: results.length, query: search })}
              </p>
              <Card className="divide-y divide-slate-100 overflow-hidden">
                {results.map((article) => (
                  <ArticleRow key={article.id} article={article} showCategory onClick={() => onArticleClick(article.id)} />
                ))}
              </Card>
            </>
          ) : (
            <Card className="flex flex-col items-center gap-2.5 py-14 text-center">
              <svg className="size-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <p className="font-semibold text-navy">{t("help.noResultsTitle")}</p>
              <p className="text-[13px] text-slate-500">{t("help.noResultsDesc")}</p>
            </Card>
          )}
        </div>
      ) : (
        <>
          {/* Category grid */}
          <div className="mb-10">
            <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">{t("help.browseByCategory")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {CATEGORIES.map((cat) => {
                const count = getCategoryArticles(cat.id).length
                return (
                  <Card
                    key={cat.id}
                    interactive
                    onClick={() => onCategoryClick(cat.id)}
                    className="flex flex-col gap-3 p-5"
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-400">
                      {cat.icon}
                    </div>
                    <div>
                      <p className="font-semibold text-navy">{t(cat.titleKey)}</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">{t(cat.descKey)}</p>
                    </div>
                    <p className="mt-auto text-[11px] font-semibold text-slate-400">
                      {count === 1 ? t("help.oneArticle") : t("help.articlesCount", { count })}
                    </p>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Still need help */}
          <StillNeedHelp />
        </>
      )}
    </div>
  )
}

function CategoryView({
  categoryId,
  onBack,
  onArticleClick,
}: {
  categoryId: string
  onBack: () => void
  onArticleClick: (id: string) => void
}) {
  const { t } = useLang()
  const cat = getCategory(categoryId)
  const articles = getCategoryArticles(categoryId)

  return (
    <div className="max-w-[720px]">
      <BackButton label={t("help.backToHelp")} onClick={onBack} />
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-400">
          {cat.icon}
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-navy">{t(cat.titleKey)}</h1>
          <p className="text-[13px] text-slate-500">
            {articles.length === 1 ? t("help.oneArticle") : t("help.articlesCount", { count: articles.length })}
          </p>
        </div>
      </div>
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {articles.map((article) => (
          <ArticleRow key={article.id} article={article} onClick={() => onArticleClick(article.id)} />
        ))}
      </Card>
    </div>
  )
}

function ArticleView({
  articleId,
  onBack,
  onArticleClick,
}: {
  articleId: string
  onBack: () => void
  onArticleClick: (id: string) => void
}) {
  const { t } = useLang()
  const article = getArticle(articleId)
  if (!article) return null
  const cat = getCategory(article.categoryId)
  const related = article.related.map(getArticle).filter((a): a is Article => Boolean(a))

  return (
    <div className="max-w-[680px]">
      <BackButton label={t(cat.titleKey)} onClick={onBack} />

      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-600/10">
          {t(cat.titleKey)}
        </span>
      </div>

      <h1 className="mb-2 font-display text-[22px] font-bold leading-tight tracking-tight text-navy">
        {article.title}
      </h1>
      <p className="mb-6 text-[14px] text-slate-500">{article.description}</p>

      <Card className="mb-6 p-6 sm:p-8">
        <ArticleBody text={article.body} />
      </Card>

      {related.length > 0 && (
        <div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">{t("help.related")}</p>
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {related.map((rel) => (
              <ArticleRow key={rel.id} article={rel} onClick={() => onArticleClick(rel.id)} />
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}

function StillNeedHelp() {
  const { t } = useLang()
  return (
    <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-navy">{t("help.stillNeedHelp")}</p>
        <p className="mt-1 text-[13px] text-slate-500">{t("help.stillNeedHelpDesc")}</p>
      </div>
      <Button variant="primary" size="md" className="shrink-0">
        {t("help.contactSupport")}
        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */
export function Help() {
  const [view, setView] = useState<View>({ type: "home" })
  const [search, setSearch] = useState("")

  function goHome() {
    setView({ type: "home" })
  }

  function goCategory(categoryId: string) {
    setSearch("")
    setView({ type: "category", categoryId })
  }

  function goArticle(articleId: string) {
    setView({ type: "article", articleId })
  }

  /** From an article, back returns to its category (design behavior). */
  function goBackFromArticle() {
    if (view.type === "article") {
      const article = getArticle(view.articleId)
      if (article) setView({ type: "category", categoryId: article.categoryId })
    }
  }

  if (view.type === "category") {
    return <CategoryView categoryId={view.categoryId} onBack={goHome} onArticleClick={goArticle} />
  }

  if (view.type === "article") {
    return <ArticleView articleId={view.articleId} onBack={goBackFromArticle} onArticleClick={goArticle} />
  }

  return (
    <HomeView
      onCategoryClick={goCategory}
      onArticleClick={goArticle}
      search={search}
      onSearchChange={setSearch}
    />
  )
}

export default Help
