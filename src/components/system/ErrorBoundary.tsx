import React from "react"

type ErrorBoundaryState = { hasError: boolean }

export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    const errorName = error instanceof Error ? error.constructor.name : "UnknownError"
    console.error(errorName)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const arabic = typeof document !== "undefined" && document.documentElement.lang === "ar"
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
        <section className="max-w-md space-y-4" role="alert" dir={arabic ? "rtl" : "ltr"}>
          <h1 className="text-2xl font-semibold">
            {arabic ? "حدث خطأ غير متوقع" : "Something went wrong"}
          </h1>
          <p className="text-sm text-white/65">
            {arabic
              ? "أعد تحميل الصفحة للمتابعة."
              : "Reload the page to continue."}
          </p>
          <button
            type="button"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            onClick={() => window.location.reload()}
          >
            {arabic ? "إعادة التحميل" : "Reload"}
          </button>
        </section>
      </main>
    )
  }
}
