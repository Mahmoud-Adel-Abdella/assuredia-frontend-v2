/**
 * LandingGlass — "Assuredia Dark Glass" visual variant.
 * Same layout, content, and motion as Landing.tsx.
 * Differences: dark translucent glass surfaces on cards, status bar, feature rail, tech panel.
 */
import React, { useEffect, useRef, useState } from "react"
import assureMarkPng from "@/imports/native-logo-2.png"

/* ------------------------------------------------------------------ */
/* Glass surface tokens                                                */
/* ------------------------------------------------------------------ */
const G = {
  /** Standard dark glass card */
  card: "bg-[rgba(15,20,32,0.62)] backdrop-blur-[14px] border border-white/[0.09] shadow-[0_8px_32px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.04)_inset]",
  /** Status bar — teal-accented glass */
  status: "bg-[rgba(15,20,32,0.68)] backdrop-blur-[16px] border border-[rgba(45,212,191,0.14)] shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_28px_rgba(45,212,191,0.07)]",
  /** Feature panel glass wrapper */
  panel: "bg-[rgba(15,20,32,0.55)] backdrop-blur-[14px] border border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
  /** Per-card hover state */
  cardHover: "hover:border-white/[0.18] hover:bg-[rgba(37,99,235,0.06)] hover:shadow-[0_0_24px_rgba(37,99,235,0.10)]",
  /** Detect card — blue pulse glow variant */
  detect: "bg-[rgba(15,20,32,0.62)] backdrop-blur-[14px] border border-brand-600/20 shadow-[0_8px_32px_rgba(37,99,235,0.12),0_1px_0_rgba(255,255,255,0.04)_inset]",
  /** Inform card — teal accent */
  inform: "bg-[rgba(15,20,32,0.62)] backdrop-blur-[14px] border border-[rgba(45,212,191,0.16)] shadow-[0_8px_32px_rgba(45,212,191,0.10),0_1px_0_rgba(255,255,255,0.04)_inset]",
}

/* ------------------------------------------------------------------ */
/* Inline SVG icons (self-contained, identical to Landing.tsx)        */
/* ------------------------------------------------------------------ */
function IconBrain({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 10-6 0c0 1.5.7 2.8 1.8 3.6A4 4 0 004 12a4 4 0 003.8 4A3 3 0 1012 19a3 3 0 104.2-2A4 4 0 0020 13a4 4 0 00-3.8-4A3 3 0 0012 5z" /><line x1="12" y1="9" x2="12" y2="15" /><line x1="9" y1="12" x2="15" y2="12" /></svg>
}
function IconLineChart({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
}
function IconSend({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
}
function IconCloud({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /></svg>
}
function IconArrowRight({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
}
function IconCheck({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
}
function IconBell({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
}
function IconImage({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
}

/* ------------------------------------------------------------------ */
/* Motion keyframes (same language as Landing.tsx)                    */
/* ------------------------------------------------------------------ */
const KEYFRAMES = `
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes flowDot {
  0% { transform: translateX(0); opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0; }
}
@keyframes detectPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.3); }
  50% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
}
@media (prefers-reduced-motion: reduce) {
  .anim-enter { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`

function au(delayMs: number, durationMs = 500): React.CSSProperties {
  return { animation: `fadeUp ${durationMs}ms ease-out ${delayMs}ms both` }
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
const features = [
  { Icon: IconBrain, title: "AI-Powered Insights", description: "Smart analysis and self-healing capabilities to keep your tests resilient and up to date." },
  { Icon: IconLineChart, title: "24/7 Monitoring", description: "Round-the-clock monitoring across all environments to ensure system stability." },
  { Icon: IconSend, title: "Instant Notifications", description: "Real-time alerts via Telegram with rich details and screenshots for faster response." },
  { Icon: IconCloud, title: "Scalable & Reliable", description: "Built with Docker and AWS for high availability, scalability, and performance." },
]

const technologies = [
  { label: "Java", mark: "J", color: "#f06b22" },
  { label: "Selenium", mark: "Se", color: "#39b54a" },
  { label: "REST Assured", mark: "REST", color: "#60a5fa" },
  { label: "n8n", mark: "n8n", color: "#ea4b71" },
  { label: "AWS", mark: "aws", color: "#ff9900" },
  { label: "Docker", mark: "D", color: "#2496ed" },
  { label: "AI", mark: "AI", color: "#93c5fd" },
]

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */
function Brand() {
  return (
    <a href="#" className="flex shrink-0 items-center gap-3" style={{ width: 208, height: 59 }}>
      <span className="flex h-[56px] w-[56px] shrink-0 items-center justify-center" aria-hidden="true">
        <img src={assureMarkPng} alt="" className="h-full w-full object-contain" draggable={false} />
      </span>
      <span className="hidden leading-none min-[480px]:block">
        <span className="block font-display text-[22px] font-extrabold tracking-tight text-navy">
          ASSURE<span className="text-[#2dd4bf]">DIA</span>
        </span>
      </span>
    </a>
  )
}

/* ------------------------------------------------------------------ */
/* Background — enhanced atmospheric glows for glass contrast         */
/* ------------------------------------------------------------------ */
function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Dot grid */}
      <div
        className="absolute left-0 top-[108px] h-[128px] w-[128px] opacity-30"
        style={{ backgroundImage: "radial-gradient(circle, #60a5fa 1px, transparent 1.3px)", backgroundSize: "16px 16px" }}
      />
      {/* Wave lines */}
      <svg className="absolute inset-x-0 bottom-[250px] h-[190px] w-full opacity-20" viewBox="0 0 1600 190" fill="none" preserveAspectRatio="none">
        {Array.from({ length: 14 }).map((_, i) => (
          <path key={i} d={`M-40 ${126 + i * 5}C138 ${46 + i * 3} 264 ${160 + i * 2} 420 ${120 + i * 4}C654 ${61 + i * 4} 770 ${95 + i * 2} 930 ${118 + i * 3}C1150 ${150 + i * 2} 1372 ${142 - i * 2} 1640 ${20 + i * 5}`}
            stroke="url(#waveGrad)" strokeWidth=".8" />
        ))}
        <defs>
          <linearGradient id="waveGradG" x1="0" y1="0" x2="1600" y2="0">
            <stop stopColor="#2563eb" />
            <stop offset=".5" stopColor="#2dd4bf" stopOpacity=".35" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
        </defs>
      </svg>
      {/* Enhanced radial glows for glass contrast */}
      <div className="absolute inset-x-0 top-0 h-[680px]" style={{
        background: [
          "radial-gradient(ellipse 55% 45% at 70% 0%, rgba(37,99,235,0.22) 0%, transparent 60%)",
          "radial-gradient(ellipse 40% 35% at 88% 40%, rgba(45,212,191,0.16) 0%, transparent 55%)",
          "radial-gradient(ellipse 30% 30% at 12% 60%, rgba(37,99,235,0.10) 0%, transparent 60%)",
        ].join(","),
      }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Process flow                                                        */
/* ------------------------------------------------------------------ */
function BrowserTile({ variant = "test" }: { variant?: "test" | "action" }) {
  return (
    <div className="relative h-[88px] w-[110px] rounded-[8px] border border-white/[0.09] bg-[rgba(15,20,32,0.70)] backdrop-blur-sm shadow-sm">
      <div className="flex h-[18px] items-center gap-[5px] rounded-t-[8px] bg-gradient-to-r from-brand-900 to-brand-700 px-3">
        <span className="h-[5px] w-[5px] rounded-full bg-white/60" />
        <span className="h-[5px] w-[5px] rounded-full bg-white/60" />
        <span className="h-[5px] w-[5px] rounded-full bg-white/60" />
      </div>
      <div className="space-y-[6px] px-3 py-3">
        <span className="block h-[5px] w-full rounded-full bg-white/10" />
        <span className="block h-[5px] w-3/4 rounded-full bg-white/10" />
        {variant === "test" && <span className="block h-[5px] w-1/2 rounded-full bg-white/10" />}
      </div>
      <div className="absolute -bottom-[6px] -right-[6px] flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#2dd4bf] to-[#0fa89b] text-white shadow-[0_2px_8px_rgba(45,212,191,0.4)]">
        <IconCheck className="size-3.5" />
      </div>
    </div>
  )
}

function GlassStepCard({
  number, title, description, children,
  glassClass = G.card, style,
}: {
  number: string; title: string; description: string
  children: React.ReactNode; glassClass?: string; style?: React.CSSProperties
}) {
  return (
    <article
      className={`anim-enter group relative z-10 flex min-h-[260px] shrink-0 flex-col rounded-[14px] p-6 transition-all duration-300 hover:-translate-y-0.5 ${glassClass} hover:border-white/[0.20]`}
      style={style}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-gradient-to-br from-[#2dd4bf] to-[#0fa89b] text-[12px] font-bold text-white shadow-[0_2px_6px_rgba(45,212,191,0.35)]">
          {number}
        </span>
        <h3 className="text-[15px] font-bold tracking-[-0.01em] text-navy">{title}</h3>
      </div>
      <p className="mt-3 text-[12px] font-medium leading-[1.6] text-slate-400">{description}</p>
      <div className="mt-auto flex justify-center pt-5">{children}</div>
    </article>
  )
}

function ConnectorArrow() {
  return (
    <div className="absolute top-1/2 -translate-y-1/2 flex items-center" style={{ left: "calc(100% - 2px)", width: "calc(16px + 4px)", zIndex: 5 }}>
      <div className="relative h-[1px] w-full">
        <div className="absolute inset-0 border-t-[2px] border-dashed border-white/[0.12]" />
        <div className="absolute top-[-3px] h-[7px] w-[7px] rounded-full bg-[#2dd4bf] shadow-[0_0_8px_rgba(45,212,191,0.6)]"
          style={{ animation: "flowDot 2.2s ease-in-out infinite" }} />
      </div>
      <svg className="absolute -right-[5px] top-1/2 -translate-y-1/2 h-[8px] w-[6px] text-white/20" viewBox="0 0 6 8" fill="currentColor">
        <path d="M0 0L6 4L0 8Z" />
      </svg>
    </div>
  )
}

function ProcessFlow() {
  return (
    <div className="relative mx-auto flex w-full max-w-[780px] items-center justify-center overflow-visible">
      <style>{KEYFRAMES}</style>
      <div className="grid w-full grid-cols-4 items-stretch gap-4">
        <div className="relative">
          <GlassStepCard number="1" title="Test" description="Automated UI & API tests run 24/7" style={au(660)}>
            <BrowserTile />
          </GlassStepCard>
          <ConnectorArrow />
        </div>
        <div className="relative">
          <GlassStepCard number="2" title="Detect" description="Issues detected in real-time" glassClass={G.detect} style={au(780)}>
            <div className="relative mx-auto flex h-[100px] w-[100px] items-center justify-center">
              <span className="absolute h-[100px] w-[100px] rounded-full border border-brand-600/15" />
              <span className="absolute h-[80px] w-[80px] rounded-full border border-brand-600/20" />
              <span className="absolute h-[60px] w-[60px] rounded-full border border-brand-600/30 bg-brand-50/50" />
              <span className="absolute h-[44px] w-[44px] rounded-full bg-gradient-to-br from-brand-700 to-brand-900 shadow-[0_0_24px_rgba(59,130,246,0.5)]"
                style={{ animation: "detectPulse 2.5s ease-in-out infinite" }} />
              <span className="relative text-[26px] font-extrabold leading-none text-white">!</span>
            </div>
          </GlassStepCard>
          <ConnectorArrow />
        </div>
        <div className="relative">
          <GlassStepCard number="3" title="Inform" description="Instant alerts with rich context" glassClass={`${G.inform} overflow-hidden`} style={au(900)}>
            <div className="flex flex-col items-center gap-3">
              <div className="relative flex h-[56px] w-[56px] items-center justify-center rounded-full bg-brand-50/60">
                <IconBell className="size-7 text-brand-400" />
                <span className="absolute -right-1 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-error text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(239,68,68,0.4)]">1</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-gradient-to-br from-brand-600 to-brand-900 text-white shadow-sm">
                  <IconSend className="size-3.5" />
                </span>
                <span className="text-base font-light text-slate-400">+</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#2dd4bf]/40 bg-[#2dd4bf]/10 text-[#2dd4bf]">
                  <IconImage className="size-3.5" />
                </span>
              </div>
            </div>
          </GlassStepCard>
          <ConnectorArrow />
        </div>
        <div className="relative">
          <GlassStepCard number="4" title="Action" description="Resolve faster with insights & automation" style={au(1020)}>
            <BrowserTile variant="action" />
          </GlassStepCard>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Status bar                                                          */
/* ------------------------------------------------------------------ */
function StatusBar() {
  return (
    <div className={`mx-auto mt-5 flex h-[52px] w-full max-w-[700px] items-center justify-between gap-5 rounded-[12px] px-6 text-navy ${G.status}`}>
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-[10px] w-[10px]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40" />
          <span className="relative inline-flex h-[10px] w-[10px] rounded-full bg-success shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
        </span>
        <span className="text-[13px] font-semibold text-slate-400">System Status</span>
      </div>
      <span className="h-5 w-px bg-white/10" />
      <span className="text-[13px] font-semibold text-success">All Systems Operational</span>
      <span className="h-5 w-px bg-white/10" />
      <svg className="h-5 w-16 text-[#2dd4bf]" viewBox="0 0 64 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="0,10 10,6 18,14 28,2 38,12 48,5 64,10" />
      </svg>
      <span className="h-5 w-px bg-white/10" />
      <span className="text-[13px] font-semibold">
        <span className="text-[#2dd4bf]">99.98%</span>
        <span className="ml-1 font-medium text-slate-400">Uptime</span>
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Feature rail                                                        */
/* ------------------------------------------------------------------ */
function FeatureRail() {
  const { ref, visible } = useInView()
  return (
    <section className="relative z-10 mx-auto w-full max-w-[1400px] px-6">
      <div ref={ref} className={`grid grid-cols-1 rounded-[14px] md:grid-cols-2 xl:grid-cols-4 overflow-hidden ${G.panel}`}>
        {features.map(({ Icon, title, description }, i) => (
          <article
            key={title}
            className={`anim-enter flex items-center gap-5 px-8 py-6 transition-all duration-200 ${G.cardHover} ${
              i > 0 ? "border-t border-white/[0.07] md:border-l md:border-t-0" : ""
            }`}
            style={visible ? au(i * 80) : { opacity: 0 }}
          >
            <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border border-brand-400/20 bg-brand-50/40 text-brand-400 backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
              <Icon className="h-9 w-9" />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold text-navy">{title}</h2>
              <p className="mt-1.5 text-[13px] font-medium leading-5 text-slate-400">{description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Technology panel                                                    */
/* ------------------------------------------------------------------ */
function TechnologyPanel() {
  const { ref, visible } = useInView()
  return (
    <section
      ref={ref}
      className="anim-enter relative z-10 mx-auto grid w-full max-w-[1400px] gap-4 px-6 pb-7 pt-4 lg:grid-cols-[1.25fr_.95fr]"
      style={visible ? au(80) : { opacity: 0 }}
    >
      <div className={`grid overflow-hidden rounded-[14px] md:grid-cols-[170px_1fr] ${G.panel}`}>
        <div className="flex items-center border-b border-white/[0.07] px-6 py-5 md:border-b-0 md:border-r">
          <h2 className="text-[15px] font-extrabold leading-7 text-navy">
            Built with<br />best-in-class<br />technologies
          </h2>
        </div>
        <div className="grid grid-cols-3 items-center gap-4 px-7 py-5 sm:grid-cols-4 lg:grid-cols-7">
          {technologies.map((tech) => (
            <div key={tech.label} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <div className="flex h-12 min-w-12 items-center justify-center rounded-lg text-[18px] font-extrabold" style={{ color: tech.color }}>
                {tech.mark}
              </div>
              <span className="text-[11px] font-medium leading-tight text-slate-400">{tech.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-[14px] px-7 py-6 ${G.panel}`}>
        <h2 className="relative z-10 max-w-[360px] text-[14px] font-normal leading-6 text-navy pr-[114px]">
          Everything you need to ensure quality, reliability, and confidence in every release.
        </h2>
        <div className="absolute bottom-0 right-4 flex h-[116px] w-[330px] items-end justify-end opacity-50">
          <div className="mr-3 flex items-end gap-2">
            <span className="h-9 w-6 rounded-t bg-[#2dd4bf]" />
            <span className="h-14 w-6 rounded-t bg-brand-600" />
            <span className="h-20 w-6 rounded-t bg-[#60a5fa]" />
            <span className="h-28 w-6 rounded-t bg-brand-900" />
          </div>
          <div className="relative h-[100px] w-[170px] rounded-t-[8px] border border-white/[0.08] bg-[rgba(15,20,32,0.80)]">
            <div className="h-5 rounded-t-[8px] bg-brand-900" />
            <div className="grid grid-cols-2 gap-2 p-3">
              {[0,1,2,3].map(n => <span key={n} className="h-8 rounded bg-white/[0.06]" />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Main glass landing page                                             */
/* ------------------------------------------------------------------ */
export function LandingGlass({
  onSignIn,
  onSignUp,
}: {
  onSignIn: () => void
  onSignUp: () => void
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-background font-sans text-navy antialiased">
      <style>{KEYFRAMES}</style>

      <section className="relative min-h-screen pb-5 pt-[100px]">
        <HeroBackground />

        {/* Header — subtle glass on scroll feel, always slightly frosted */}
        <header
          className="anim-enter absolute inset-x-0 top-0 z-30"
          style={{ animation: "fadeIn 0.5s ease-out 0.05s both" }}
        >
          <div className="mx-auto flex h-[64px] max-w-[1400px] items-center justify-between px-6">
            <Brand />
            <div className="flex items-center gap-3">
              <button
                onClick={onSignIn}
                className="flex h-9 items-center rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-4 text-[13px] font-semibold text-navy backdrop-blur-sm transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] active:scale-[.97]"
              >
                Log In
              </button>
              <button
                onClick={onSignUp}
                className="flex h-9 items-center gap-2 rounded-[10px] bg-brand-900 px-4 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(37,99,235,0.4)] transition-all duration-150 hover:brightness-110 hover:-translate-y-px active:scale-[.97]"
              >
                Get Started
                <IconArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Hero content */}
        <div className="relative z-10 mx-auto grid max-w-[1400px] items-center gap-8 px-6 lg:grid-cols-[.72fr_1.28fr]">
          <div className="max-w-xl">
            {/* Badge */}
            <div className="anim-enter mb-5 inline-flex items-center gap-3 rounded-full border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 px-4 py-2 text-[13px] font-semibold text-[#2dd4bf] backdrop-blur-sm" style={au(160)}>
              <span className="relative flex h-[9px] w-[9px]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2dd4bf] opacity-40" />
                <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-[#2dd4bf]" />
              </span>
              Continuous QA Monitoring
            </div>

            {/* Headline — stays on bare dark background, no glass */}
            <h1 className="anim-enter mb-5 font-display text-5xl font-black leading-tight tracking-tight xl:text-6xl" style={au(280)}>
              Always <span className="text-[#2dd4bf]">On.</span>
              <br />
              <span style={{ background: "linear-gradient(to right, #60a5fa, #2dd4bf)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Quality Assured.
              </span>
            </h1>

            <p className="anim-enter text-[15px] leading-relaxed text-slate-400" style={au(420)}>
              Monitor systems, detect failures, and act instantly with enterprise-grade QA automation and real-time insights.
            </p>

            <div className="anim-enter mt-8 flex flex-wrap gap-4" style={au(530)}>
              <button
                onClick={onSignUp}
                className="flex h-[52px] items-center gap-3 rounded-[10px] bg-brand-900 py-0 px-[28px] text-[16px] font-bold text-white shadow-[0_8px_28px_rgba(37,99,235,0.40)] transition-all duration-150 hover:brightness-110 hover:-translate-y-0.5 active:scale-[.97]"
              >
                Get Started
                <IconArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={onSignIn}
                className="flex h-[52px] items-center rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-7 text-[16px] font-semibold text-navy backdrop-blur-sm transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] active:scale-[.97]"
              >
                Log In
              </button>
            </div>
          </div>

          {/* Process flow — desktop */}
          <div className="hidden lg:block">
            <ProcessFlow />
            <div className="anim-enter" style={au(1120)}>
              <StatusBar />
            </div>
          </div>
        </div>

        {/* Process flow — mobile condensed */}
        <div className="relative z-10 mt-8 lg:hidden">
          <div className={`mx-6 rounded-[14px] p-5 ${G.card}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {["1. Test", "2. Detect", "3. Inform", "4. Action"].map((step) => (
                <div key={step} className="rounded-[10px] border border-white/[0.08] bg-white/[0.04] p-4 text-[13px] font-bold text-navy">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature rail + tech panel */}
        <div className="mt-10">
          <FeatureRail />
          <TechnologyPanel />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.07] bg-[rgba(10,14,23,0.80)] backdrop-blur-[12px] px-6 py-8">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-5 md:flex-row">
          <Brand />
          <p className="text-[12px] font-medium text-slate-400">
            © 2026 Assuredia QA Monitoring. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  )
}

export default LandingGlass
