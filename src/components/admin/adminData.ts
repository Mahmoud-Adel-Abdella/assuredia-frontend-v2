/* ------------------------------------------------------------------ */
/* Shared admin types + mock data                                     */
/* ------------------------------------------------------------------ */

export type ClientStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED"
export type RunStatus = "PASS" | "FAILED" | "RUNNING" | "CANCELLED"
export type RiskLevel = "Critical" | "High" | "Medium" | "Low"
export type AlertSeverity = "Critical" | "High" | "Medium" | "Low"
export type Trigger = "Manual" | "Scheduled"

export type AdminClient = {
  id: string
  name: string
  status: ClientStatus
  plan: string
  flows: number
  schedules: number
  recentRun: RunStatus | null
  successRate: number
  totalRuns: number
  lastActivity: string
  website: string
  region: string
  createdAt: string
  contact: string
}

export type AdminRun = {
  id: string
  clientId: string
  clientName: string
  flow: string
  testLabel: string
  trigger: Trigger
  status: RunStatus
  started: string
  duration: string
}

export type AdminAlert = {
  id: string
  clientId: string
  clientName: string
  flow: string
  test: string
  message: string
  severity: AlertSeverity
  trigger: Trigger
  status: "Open" | "Acknowledged" | "Resolved"
  time: string
}

export type AdminAiRecord = {
  id: string
  clientId: string
  clientName: string
  flow: string
  runId: string
  status: "FAILED" | "PASSED"
  risk: RiskLevel
  businessImpact: string
  assessment: string
  actions: string[]
  analyzedAt: string
  duration: string
  started: string
}

export type ActivityEvent = {
  id: string
  type: "client_created" | "flow_executed" | "schedule_completed" | "test_failed" | "ai_generated" | "alert_triggered"
  client: string
  message: string
  time: string
  status?: "PASS" | "FAILED" | "INFO"
}

export type DayBucket = {
  label: string
  passed: number
  failed: number
}

/* ------------------------------------------------------------------ */
/* Clients                                                            */
/* ------------------------------------------------------------------ */
export const ADMIN_CLIENTS: AdminClient[] = [
  {
    id: "northwind",
    name: "Northwind Cloud",
    status: "ACTIVE",
    plan: "Enterprise",
    flows: 8,
    schedules: 5,
    recentRun: "PASS",
    successRate: 96.4,
    totalRuns: 412,
    lastActivity: "2 min ago",
    website: "northwindcloud.io",
    region: "us-east-1",
    createdAt: "Jan 12, 2026",
    contact: "elena.marsh@northwindcloud.io",
  },
  {
    id: "daftra",
    name: "Daftra",
    status: "ACTIVE",
    plan: "Professional",
    flows: 5,
    schedules: 3,
    recentRun: "FAILED",
    successRate: 82.1,
    totalRuns: 289,
    lastActivity: "18 min ago",
    website: "daftra.com",
    region: "eu-west-1",
    createdAt: "Mar 3, 2026",
    contact: "qa@daftra.com",
  },
  {
    id: "techventures",
    name: "TechVentures Inc",
    status: "ACTIVE",
    plan: "Enterprise",
    flows: 12,
    schedules: 8,
    recentRun: "PASS",
    successRate: 98.7,
    totalRuns: 381,
    lastActivity: "1 hr ago",
    website: "techventures.com",
    region: "us-west-2",
    createdAt: "Feb 17, 2026",
    contact: "ops@techventures.com",
  },
  {
    id: "globalshop",
    name: "GlobalShop",
    status: "INACTIVE",
    plan: "Starter",
    flows: 3,
    schedules: 1,
    recentRun: null,
    successRate: 71.4,
    totalRuns: 98,
    lastActivity: "2 days ago",
    website: "globalshop.store",
    region: "ap-southeast-1",
    createdAt: "May 5, 2026",
    contact: "tech@globalshop.store",
  },
  {
    id: "financecore",
    name: "FinanceCore",
    status: "ACTIVE",
    plan: "Professional",
    flows: 6,
    schedules: 4,
    recentRun: "RUNNING",
    successRate: 89.2,
    totalRuns: 67,
    lastActivity: "Just now",
    website: "financecore.io",
    region: "us-east-1",
    createdAt: "Jul 28, 2026",
    contact: "platform@financecore.io",
  },
]

/* ------------------------------------------------------------------ */
/* Platform-wide runs                                                 */
/* ------------------------------------------------------------------ */
export const ADMIN_RUNS: AdminRun[] = [
  { id: "RUN-88213", clientId: "northwind", clientName: "Northwind Cloud", flow: "Registration", testLabel: "3 tests", trigger: "Manual", status: "RUNNING", started: "Today, 17:31", duration: "00:38" },
  { id: "RUN-88210", clientId: "financecore", clientName: "FinanceCore", flow: "Payment Gateway", testLabel: "testCharge", trigger: "Scheduled", status: "RUNNING", started: "Today, 17:29", duration: "01:12" },
  { id: "RUN-88207", clientId: "northwind", clientName: "Northwind Cloud", flow: "Checkout", testLabel: "testPayment", trigger: "Scheduled", status: "FAILED", started: "Today, 18:00", duration: "32s" },
  { id: "RUN-88205", clientId: "daftra", clientName: "Daftra", flow: "Invoice Export", testLabel: "testPdfGeneration", trigger: "Scheduled", status: "FAILED", started: "Today, 17:55", duration: "12s" },
  { id: "RUN-88201", clientId: "northwind", clientName: "Northwind Cloud", flow: "Login", testLabel: "testValidLogin", trigger: "Manual", status: "PASS", started: "Today, 18:42", duration: "18s" },
  { id: "RUN-88198", clientId: "techventures", clientName: "TechVentures Inc", flow: "API Health", testLabel: "5 tests", trigger: "Scheduled", status: "PASS", started: "Today, 17:00", duration: "44s" },
  { id: "RUN-88195", clientId: "daftra", clientName: "Daftra", flow: "Customer Portal", testLabel: "testLogin", trigger: "Manual", status: "PASS", started: "Today, 16:30", duration: "21s" },
  { id: "RUN-88190", clientId: "northwind", clientName: "Northwind Cloud", flow: "Login Package", testLabel: "5 tests", trigger: "Manual", status: "PASS", started: "Today, 15:10", duration: "16s" },
  { id: "RUN-88185", clientId: "techventures", clientName: "TechVentures Inc", flow: "Data Sync", testLabel: "testBulkImport", trigger: "Scheduled", status: "PASS", started: "Yesterday, 23:00", duration: "1m 04s" },
  { id: "RUN-88175", clientId: "northwind", clientName: "Northwind Cloud", flow: "Payment", testLabel: "testRefund", trigger: "Scheduled", status: "FAILED", started: "Yesterday, 22:10", duration: "6.4s" },
]

/* ------------------------------------------------------------------ */
/* Platform-wide alerts                                               */
/* ------------------------------------------------------------------ */
export const ADMIN_ALERTS: AdminAlert[] = [
  { id: "A-1001", clientId: "northwind", clientName: "Northwind Cloud", flow: "Checkout", test: "testPayment", message: "Payment gateway returned 402.", severity: "High", trigger: "Scheduled", status: "Open", time: "18 min ago" },
  { id: "A-1002", clientId: "daftra", clientName: "Daftra", flow: "Invoice Export", test: "testPdfGeneration", message: "PDF generation timeout exceeded 10s.", severity: "Medium", trigger: "Scheduled", status: "Open", time: "23 min ago" },
  { id: "A-1003", clientId: "financecore", clientName: "FinanceCore", flow: "Payment Gateway", test: "testCharge", message: "Charge endpoint latency > 5000ms.", severity: "Critical", trigger: "Scheduled", status: "Open", time: "Just now" },
  { id: "A-1004", clientId: "northwind", clientName: "Northwind Cloud", flow: "Payment", test: "testRefund", message: "Refund amount assertion failed: 0.00 ≠ 49.00.", severity: "Medium", trigger: "Scheduled", status: "Acknowledged", time: "Yesterday" },
  { id: "A-1005", clientId: "techventures", clientName: "TechVentures Inc", flow: "Data Sync", test: "testBulkImport", message: "Import completed with warnings.", severity: "Low", trigger: "Scheduled", status: "Resolved", time: "Yesterday" },
]

/* ------------------------------------------------------------------ */
/* Platform-wide AI analyses                                          */
/* ------------------------------------------------------------------ */
export const ADMIN_AI_RECORDS: AdminAiRecord[] = [
  {
    id: "RUN-88207",
    clientId: "northwind",
    clientName: "Northwind Cloud",
    flow: "Checkout",
    runId: "RUN-88207",
    status: "FAILED",
    risk: "High",
    businessImpact: "Customers cannot complete purchases while the payment gateway rejects charges.",
    assessment: "The charge endpoint returned HTTP 402, consistent with an expired gateway credential or insufficient sandbox funds.",
    actions: ["Verify payment gateway credentials", "Check sandbox account balance", "Re-run after gateway is restored"],
    analyzedAt: "2 min ago",
    duration: "32s",
    started: "Aug 24, 2026 · 18:00",
  },
  {
    id: "RUN-88205",
    clientId: "daftra",
    clientName: "Daftra",
    flow: "Invoice Export",
    runId: "RUN-88205",
    status: "FAILED",
    risk: "Medium",
    businessImpact: "Invoice PDF exports are unavailable, blocking finance teams from issuing invoices.",
    assessment: "The PDF generation service timed out after 10s. Likely caused by an unoptimized template or a resource constraint on the rendering server.",
    actions: ["Profile the PDF rendering pipeline", "Check server resource utilization", "Add a timeout fallback with a retry mechanism"],
    analyzedAt: "23 min ago",
    duration: "12s",
    started: "Aug 24, 2026 · 17:55",
  },
  {
    id: "RUN-88175",
    clientId: "northwind",
    clientName: "Northwind Cloud",
    flow: "Payment",
    runId: "RUN-88175",
    status: "FAILED",
    risk: "Medium",
    businessImpact: "Refunds may not be issued correctly, affecting customer trust and finance reconciliation.",
    assessment: "The refund endpoint returned a zero amount. Points to a backend calculation issue rather than a UI defect.",
    actions: ["Inspect the refund calculation service", "Confirm the order total used for the refund", "Add a regression assertion for refund totals"],
    analyzedAt: "18 hr ago",
    duration: "6.4s",
    started: "Aug 23, 2026 · 22:10",
  },
]

/* ------------------------------------------------------------------ */
/* Activity feed                                                      */
/* ------------------------------------------------------------------ */
export const ACTIVITY_FEED: ActivityEvent[] = [
  { id: "ev-1", type: "test_failed", client: "FinanceCore", message: "Payment Gateway · testCharge started running", time: "Just now", status: "INFO" },
  { id: "ev-2", type: "alert_triggered", client: "FinanceCore", message: "Critical alert: charge endpoint latency > 5000ms", time: "Just now", status: "FAILED" },
  { id: "ev-3", type: "flow_executed", client: "Northwind Cloud", message: "Login · testValidLogin passed in 18s", time: "2 min ago", status: "PASS" },
  { id: "ev-4", type: "alert_triggered", client: "Northwind Cloud", message: "High alert: payment gateway returned 402", time: "18 min ago", status: "FAILED" },
  { id: "ev-5", type: "ai_generated", client: "Northwind Cloud", message: "AI analysis generated for RUN-88207", time: "20 min ago", status: "INFO" },
  { id: "ev-6", type: "test_failed", client: "Daftra", message: "Invoice Export · testPdfGeneration failed after 12s", time: "23 min ago", status: "FAILED" },
  { id: "ev-7", type: "schedule_completed", client: "TechVentures Inc", message: "API Health · 5 tests passed in 44s", time: "1 hr ago", status: "PASS" },
  { id: "ev-8", type: "flow_executed", client: "Northwind Cloud", message: "Login Package · 5 tests passed in 16s", time: "3 hr ago", status: "PASS" },
]

/* ------------------------------------------------------------------ */
/* Onboarding / self-service requests                                 */
/* ------------------------------------------------------------------ */
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED"

export type OnboardingRequest = {
  id: string
  requester: { name: string; email: string }
  company: string
  website: string
  appUrl: string
  appUsername: string
  browser: string
  device: string
  headless: boolean
  timeout: number
  retryCount: number
  submitted: string
  status: RequestStatus
  rejectionReason?: string
}

export const ONBOARDING_REQUESTS: OnboardingRequest[] = [
  {
    id: "REQ-001",
    requester: { name: "Mahmoud Hossam", email: "mahmoud@zoomtech.io" },
    company: "ZoomTech",
    website: "zoomtech.io",
    appUrl: "https://app.zoomtech.io",
    appUsername: "qa@zoomtech.io",
    browser: "Chrome",
    device: "Desktop",
    headless: true,
    timeout: 60,
    retryCount: 1,
    submitted: "2 hours ago",
    status: "PENDING",
  },
  {
    id: "REQ-002",
    requester: { name: "Sofia Reyes", email: "sofia@stackbyte.dev" },
    company: "StackByte",
    website: "stackbyte.dev",
    appUrl: "https://app.stackbyte.dev",
    appUsername: "tester@stackbyte.dev",
    browser: "Firefox",
    device: "Desktop",
    headless: true,
    timeout: 90,
    retryCount: 2,
    submitted: "Yesterday, 14:30",
    status: "PENDING",
  },
  {
    id: "REQ-003",
    requester: { name: "James Okoro", email: "james@veridian.ai" },
    company: "Veridian AI",
    website: "veridian.ai",
    appUrl: "https://platform.veridian.ai",
    appUsername: "qa.bot@veridian.ai",
    browser: "Chrome",
    device: "Desktop",
    headless: true,
    timeout: 120,
    retryCount: 1,
    submitted: "Aug 22, 2026",
    status: "APPROVED",
  },
  {
    id: "REQ-004",
    requester: { name: "Anna Fischer", email: "anna.f@merkurshop.de" },
    company: "MerkurShop",
    website: "merkurshop.de",
    appUrl: "https://shop.merkurshop.de",
    appUsername: "automation@merkurshop.de",
    browser: "Edge",
    device: "Desktop",
    headless: false,
    timeout: 60,
    retryCount: 0,
    submitted: "Aug 20, 2026",
    status: "REJECTED",
    rejectionReason: "Insufficient plan tier for the requested configuration.",
  },
  {
    id: "REQ-005",
    requester: { name: "Priya Nair", email: "priya@loop-commerce.in" },
    company: "Loop Commerce",
    website: "loop-commerce.in",
    appUrl: "https://dashboard.loop-commerce.in",
    appUsername: "priya+qa@loop-commerce.in",
    browser: "Chrome",
    device: "Mobile",
    headless: true,
    timeout: 45,
    retryCount: 1,
    submitted: "Aug 19, 2026",
    status: "APPROVED",
  },
]

/* ------------------------------------------------------------------ */
/* 7-day execution chart                                              */
/* ------------------------------------------------------------------ */
export const WEEKLY_CHART: DayBucket[] = [
  { label: "Aug 18", passed: 42, failed: 3 },
  { label: "Aug 19", passed: 38, failed: 5 },
  { label: "Aug 20", passed: 51, failed: 2 },
  { label: "Aug 21", passed: 45, failed: 7 },
  { label: "Aug 22", passed: 39, failed: 4 },
  { label: "Aug 23", passed: 47, failed: 8 },
  { label: "Aug 24", passed: 31, failed: 6 },
]
