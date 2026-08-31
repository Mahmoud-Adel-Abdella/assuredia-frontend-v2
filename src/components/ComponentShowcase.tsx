import React, { useState } from "react"
import {
  Alert,
  AiPill,
  Button,
  Card,
  CardSkeleton,
  Checkbox,
  cx,
  DataTable,
  Dropdown,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  Modal,
  PasswordInput,
  Radio,
  Select,
  Skeleton,
  Spinner,
  StatusBadge,
  Switch,
  TableSkeleton,
  Tabs,
  Textarea,
  useToast,
  AppStatus,
} from "./primitives"

/* ------------------------------------------------------------------ */
/* Section wrapper                                                     */
/* ------------------------------------------------------------------ */
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-[18px] font-bold text-navy">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Row({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  return <div className={cx("flex items-center gap-3", wrap && "flex-wrap")}>{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

/* ------------------------------------------------------------------ */
/* Showcase content                                                    */
/* ------------------------------------------------------------------ */
export function ComponentShowcase() {
  const toast = useToast()

  // Interactive state
  const [activeTab, setActiveTab] = useState("buttons")
  const [modalOpen, setModalOpen] = useState(false)
  const [dangerModalOpen, setDangerModalOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const [radioVal, setRadioVal] = useState("a")
  const [switchOn, setSwitchOn] = useState(true)
  const [dropVal, setDropVal] = useState("Chrome")
  const [tabVal, setTabVal] = useState("All")
  const [inputVal, setInputVal] = useState("")
  const [selectVal, setSelectVal] = useState("us-east-1")
  const [loadingBtn, setLoadingBtn] = useState(false)

  function triggerLoading() {
    setLoadingBtn(true)
    setTimeout(() => setLoadingBtn(false), 2000)
  }

  const ALL_TABS = ["buttons", "badges", "forms", "modals", "feedback", "tables", "layout"]

  const sampleRows = [
    { id: "c1", name: "Northwind Co", status: "ACTIVE" as AppStatus, region: "us-east-1", runs: 284 },
    { id: "c2", name: "StackByte", status: "RUNNING" as AppStatus, region: "eu-west-1", runs: 91 },
    { id: "c3", name: "Loop Commerce", status: "PAUSED" as AppStatus, region: "ap-southeast-1", runs: 57 },
    { id: "c4", name: "Veridian AI", status: "FAILED" as AppStatus, region: "us-west-2", runs: 19 },
  ]

  const ALL_STATUSES: AppStatus[] = [
    "ACTIVE", "INACTIVE", "RUNNING", "PASS", "PASSED",
    "FAILED", "CANCELLED", "SCHEDULED", "PAUSED",
    "PENDING", "RESOLVED", "APPROVED", "REJECTED",
  ]

  return (
    <div className="space-y-12 pb-12">
      {/* Page header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">Design System</h1>
            <AiPill />
          </div>
          <p className="mt-1 text-[14px] text-slate-500">
            Assuredia global UI component library — every component, every state, every variant.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        >
          Preview
        </Button>
      </div>

      {/* Nav tabs */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize transition-all",
              activeTab === t
                ? "bg-brand-900 text-white shadow-sm"
                : "border border-slate-200 bg-surface text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* --- BUTTONS --- */}
      {activeTab === "buttons" && (
        <div className="space-y-10">
          <Section title="Buttons" description="Primary action component across the entire product.">
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <Label>Variants</Label>
                <Row wrap>
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="danger">Danger</Button>
                  <Button variant="success">Success</Button>
                  <Button variant="link">Link</Button>
                </Row>
              </div>
              <div className="space-y-2">
                <Label>Sizes</Label>
                <Row wrap>
                  <Button variant="primary" size="sm">Small</Button>
                  <Button variant="primary" size="md">Medium</Button>
                  <Button variant="primary" size="lg">Large</Button>
                </Row>
              </div>
              <div className="space-y-2">
                <Label>With icons</Label>
                <Row wrap>
                  <Button variant="primary" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" /></svg>}>
                    Create Client
                  </Button>
                  <Button variant="secondary" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 3l14 9-14 9V3z" /></svg>}>
                    Run Flow
                  </Button>
                  <Button variant="danger" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" /></svg>}>
                    Delete
                  </Button>
                </Row>
              </div>
              <div className="space-y-2">
                <Label>States</Label>
                <Row wrap>
                  <Button variant="primary" loading={loadingBtn} onClick={triggerLoading}>
                    {loadingBtn ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="primary" disabled>Disabled</Button>
                  <Button variant="secondary" loading>Running...</Button>
                </Row>
              </div>
            </Card>
          </Section>

          <Section title="Icon Buttons" description="Compact action buttons for tables, toolbars, and sidebars.">
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <Label>Variants</Label>
                <Row>
                  <IconButton label="Edit" variant="ghost" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>} />
                  <IconButton label="Delete" variant="danger" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" /></svg>} />
                  <IconButton label="View" variant="secondary" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" /></svg>} />
                  <IconButton label="Refresh" variant="ghost" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" /></svg>} />
                  <IconButton label="Filter" variant="ghost" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" /></svg>} />
                  <IconButton label="Add" variant="primary" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" /></svg>} />
                </Row>
              </div>
              <div className="space-y-2">
                <Label>Sizes</Label>
                <Row>
                  <IconButton label="Small" size="sm" icon={<svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /></svg>} />
                  <IconButton label="Medium" size="md" icon={<svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /></svg>} />
                  <IconButton label="Large" size="lg" icon={<svg className="size-4.5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /></svg>} />
                </Row>
              </div>
            </Card>
          </Section>
        </div>
      )}

      {/* --- BADGES --- */}
      {activeTab === "badges" && (
        <Section title="Status Badges" description="Semantic status indicators. Always icon + text — never color alone.">
          <Card className="p-6 space-y-6">
            <div className="space-y-2">
              <Label>All statuses</Label>
              <div className="flex flex-wrap gap-3">
                {ALL_STATUSES.map((s) => (
                  <StatusBadge key={s} status={s} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>In context — run history row</Label>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {(["PASS", "FAILED", "RUNNING", "SCHEDULED", "CANCELLED"] as AppStatus[]).map((s) => (
                  <div key={s} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">Login → Checkout → Confirm</p>
                      <p className="text-[11px] text-slate-400 font-mono">exec-{s.toLowerCase()}-001 · 2m 14s</p>
                    </div>
                    <StatusBadge status={s} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Section>
      )}

      {/* --- FORMS --- */}
      {activeTab === "forms" && (
        <div className="space-y-10">
          <Section title="Inputs" description="Unified text inputs with consistent height, radius, and focus ring.">
            <Card className="p-6 space-y-5 max-w-xl">
              <FormField label="Client name" htmlFor="cname" required>
                <Input id="cname" placeholder="e.g. Northwind Co." value={inputVal} onChange={(e) => setInputVal(e.target.value)} />
              </FormField>
              <FormField label="Website" htmlFor="website" hint="Must start with https://">
                <Input id="website" placeholder="https://example.com" prefix="https://" />
              </FormField>
              <FormField label="Timeout" htmlFor="timeout" hint="Value in seconds (10–600)">
                <Input id="timeout" type="number" defaultValue={30} suffix="sec" />
              </FormField>
              <FormField label="Password" htmlFor="pw" required>
                <PasswordInput id="pw" placeholder="Enter password" />
              </FormField>
              <FormField label="Description" htmlFor="desc" hint="Optional. Max 500 characters.">
                <Textarea id="desc" placeholder="Describe this flow..." rows={3} />
              </FormField>
              <FormField label="Region" htmlFor="region" required>
                <Select
                  id="region"
                  value={selectVal}
                  onChange={(e) => setSelectVal(e.target.value)}
                  options={[
                    { value: "us-east-1", label: "US East (N. Virginia)" },
                    { value: "eu-west-1", label: "EU West (Ireland)" },
                    { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
                  ]}
                />
              </FormField>
              <FormField label="App URL" htmlFor="appurl" error="Please enter a valid URL">
                <Input id="appurl" placeholder="https://app.example.com" error="Please enter a valid URL" />
              </FormField>
            </Card>
          </Section>

          <Section title="Selection controls" description="Checkbox, Radio, and Switch — consistent sizing and focus behavior.">
            <Card className="p-6 space-y-6 max-w-xl">
              <div className="space-y-2">
                <Label>Checkbox</Label>
                <div className="space-y-2">
                  <Checkbox id="chk1" checked={checked} onChange={setChecked} label="Enable headless mode" />
                  <Checkbox id="chk2" checked={true} onChange={() => {}} label="Retry on failure (checked)" />
                  <Checkbox id="chk3" checked={false} onChange={() => {}} label="Disabled option" disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Radio</Label>
                <div className="space-y-2">
                  {["Chrome", "Firefox", "Edge"].map((b) => (
                    <Radio key={b} id={`radio-${b}`} name="browser" value={b} checked={radioVal === b} onChange={setRadioVal} label={b} />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Switch</Label>
                <div className="space-y-3">
                  <Switch on={switchOn} onChange={setSwitchOn} label="Headless execution" />
                  <Switch on={false} onChange={() => {}} label="Disabled (off)" disabled />
                </div>
              </div>
            </Card>
          </Section>

          <Section title="Dropdown" description="Single-select with keyboard support.">
            <Card className="p-6">
              <Dropdown label="Browser:" options={["Chrome", "Firefox", "Edge", "Safari"]} value={dropVal} onChange={setDropVal} />
            </Card>
          </Section>

          <Section title="Tabs" description="Filter and secondary navigation.">
            <Card className="p-6 space-y-4">
              <Tabs tabs={["All", "Pending", "Active", "Archived"]} active={tabVal} onChange={setTabVal} />
              <p className="text-[13px] text-slate-500">Selected: <span className="font-semibold text-slate-800">{tabVal}</span></p>
            </Card>
          </Section>
        </div>
      )}

      {/* --- MODALS --- */}
      {activeTab === "modals" && (
        <Section title="Modals" description="Portal-rendered dialogs with consistent header, body, and footer.">
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>Variants</Label>
              <Row>
                <Button variant="secondary" onClick={() => setModalOpen(true)}>Open default modal</Button>
                <Button variant="danger" onClick={() => setDangerModalOpen(true)}>Open danger modal</Button>
              </Row>
            </div>
            <Alert tone="info" title="Modals render in a portal">
              They appear above all other content and trap focus. Press Escape or click the overlay to close.
            </Alert>
          </Card>

          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Create Schedule"
            description="Configure when this flow should run automatically."
            size="md"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>Create Schedule</Button>
              </>
            }
          >
            <div className="space-y-4">
              <FormField label="Schedule name" htmlFor="sched-name" required>
                <Input id="sched-name" placeholder="e.g. Daily Login Check" />
              </FormField>
              <FormField label="Cron expression" htmlFor="cron" hint="e.g. 0 9 * * 1-5 — runs at 9 AM on weekdays">
                <Input id="cron" placeholder="0 9 * * 1-5" className="font-mono" />
              </FormField>
            </div>
          </Modal>

          <Modal
            isOpen={dangerModalOpen}
            onClose={() => setDangerModalOpen(false)}
            title="Delete Flow"
            description="This action cannot be undone."
            size="sm"
            variant="danger"
            footer={
              <>
                <Button variant="ghost" onClick={() => setDangerModalOpen(false)}>Cancel</Button>
                <Button variant="danger" onClick={() => setDangerModalOpen(false)}>Delete</Button>
              </>
            }
          >
            <p className="text-[13px] text-slate-600">
              Are you sure you want to delete <span className="font-semibold text-slate-800">Login → Checkout → Confirm</span>? All associated run history will be permanently removed.
            </p>
          </Modal>
        </Section>
      )}

      {/* --- FEEDBACK --- */}
      {activeTab === "feedback" && (
        <div className="space-y-10">
          <Section title="Toasts" description="Non-blocking notifications — always positioned bottom-right.">
            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Trigger toasts</Label>
                <Row wrap>
                  <Button variant="success" size="sm" onClick={() => toast({ title: "Client created successfully", description: "Northwind Co. is ready to configure.", variant: "success" })}>
                    Success toast
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => toast({ title: "Unable to create client", description: "Check your network connection and retry.", variant: "error" })}>
                    Error toast
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => toast({ title: "Schedule updated", variant: "warning" })}>
                    Warning toast
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => toast({ title: "Execution started", description: "Flow will begin running shortly.", variant: "info" })}>
                    Info toast
                  </Button>
                </Row>
              </div>
            </Card>
          </Section>

          <Section title="Alerts" description="Inline contextual messages embedded within page content.">
            <div className="space-y-3">
              <Alert tone="info" title="Information" onDismiss={() => {}}>
                Your test environment is configured to use Chrome on Desktop.
              </Alert>
              <Alert tone="success" title="Flow saved successfully">
                Changes will take effect on the next scheduled run.
              </Alert>
              <Alert tone="warning" title="Application credentials required">
                These are NOT your Assuredia account credentials. They are used to authenticate the application under test.
              </Alert>
              <Alert tone="error" title="Execution failed" onDismiss={() => {}}>
                Step 3 — Add to cart — timed out after 30 seconds.
              </Alert>
            </div>
          </Section>

          <Section title="Empty states" description="Used when a list, table, or section has no content yet.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <EmptyState
                  title="No flows configured"
                  description="Create your first flow to start automating quality checks."
                  action={<Button variant="primary" size="sm">Create Flow</Button>}
                />
              </Card>
              <Card>
                <EmptyState
                  icon={<svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>}
                  title="No alerts yet"
                  description="Alerts will appear here when issues are detected during test execution."
                />
              </Card>
            </div>
          </Section>

          <Section title="Error states" description="Used when a component fails to load data.">
            <Card>
              <ErrorState
                title="Unable to load run history"
                description="Something went wrong while fetching execution history. Check your connection and retry."
                onRetry={() => toast({ title: "Retrying...", variant: "info" })}
              />
            </Card>
          </Section>
        </div>
      )}

      {/* --- TABLES --- */}
      {activeTab === "tables" && (
        <div className="space-y-10">
          <Section title="Data Table" description="Consistent table layout with hover, empty, and loading states.">
            <DataTable
              columns={[
                {
                  key: "name",
                  label: "Client",
                  render: (row) => (
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 font-display text-[11px] font-bold text-brand-400">
                        {row.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[13px] font-medium text-slate-800">{row.name}</span>
                    </div>
                  ),
                },
                { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
                { key: "region", label: "Region", render: (row) => <span className="font-mono text-[12px] text-slate-500">{row.region}</span> },
                { key: "runs", label: "Runs", align: "right", render: (row) => <span className="text-[13px] font-semibold text-slate-700">{row.runs}</span> },
                {
                  key: "actions",
                  label: "",
                  align: "right",
                  render: () => (
                    <div className="flex items-center justify-end gap-1">
                      <IconButton label="Edit" size="sm" icon={<svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /></svg>} />
                      <IconButton label="Delete" size="sm" variant="danger" icon={<svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" /></svg>} />
                    </div>
                  ),
                },
              ]}
              rows={sampleRows}
            />
          </Section>

          <Section title="Loading skeleton" description="Displayed while data is being fetched.">
            <TableSkeleton rows={4} columns={5} />
          </Section>

          <Section title="Empty table" description="Rendered when the data set is empty.">
            <DataTable
              columns={[
                { key: "name", label: "Flow", render: (r: any) => r.name },
                { key: "status", label: "Status", render: (r: any) => r.status },
              ]}
              rows={[]}
              emptyTitle="No flows configured"
              emptyDescription="Create your first flow to get started."
            />
          </Section>
        </div>
      )}

      {/* --- LAYOUT --- */}
      {activeTab === "layout" && (
        <div className="space-y-10">
          <Section title="Cards" description="The primary surface for grouping related content.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Total Runs</p>
                <p className="mt-1 font-display text-3xl font-bold text-navy">1,284</p>
                <p className="mt-1 text-[12px] text-emerald-600">↑ 12% vs last month</p>
              </Card>
              <Card className="p-5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Pass Rate</p>
                <p className="mt-1 font-display text-3xl font-bold text-navy">98.2%</p>
                <p className="mt-1 text-[12px] text-emerald-600">Above 95% threshold</p>
              </Card>
              <Card className="p-5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Active Clients</p>
                <p className="mt-1 font-display text-3xl font-bold text-navy">24</p>
                <p className="mt-1 text-[12px] text-amber-600">2 pending approval</p>
              </Card>
            </div>
          </Section>

          <Section title="Card skeleton" description="Placeholder while card content loads.">
            <div className="grid gap-4 sm:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </Section>

          <Section title="Spinners" description="In-line loading indicator.">
            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Sizes</Label>
                <Row>
                  <Spinner size="sm" />
                  <Spinner size="md" />
                  <Spinner size="lg" />
                </Row>
              </div>
              <div className="space-y-2">
                <Label>In context</Label>
                <div className="flex items-center gap-2 text-[13px] text-slate-500">
                  <Spinner size="sm" />
                  <span>Loading run history...</span>
                </div>
              </div>
            </Card>
          </Section>

          <Section title="Skeleton" description="Shape-matched placeholder blocks.">
            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Widths + shapes</Label>
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-96 max-w-full" />
                  <Skeleton className="h-4 w-64" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-20" rounded="lg" />
                    <Skeleton className="h-8 w-16" rounded="lg" />
                  </div>
                </div>
              </div>
            </Card>
          </Section>
        </div>
      )}
    </div>
  )
}

export default ComponentShowcase
