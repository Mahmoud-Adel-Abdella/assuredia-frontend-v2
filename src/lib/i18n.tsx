import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

/**
 * Language preference (Phase 9) — purely frontend, persisted in localStorage.
 * The frozen backend has no language persistence, and none is invented here.
 * Backend DATA values (client names, flow names, run ids, test names, cron
 * expressions, AI report text) are intentionally NEVER routed through this
 * dictionary — only static UI copy is translated. Known backend ERROR
 * messages are the one exception: they are mapped to localized frontend
 * messages in src/lib/api.ts (never modified server-side).
 */
export type Lang = "en" | "ar"

const LANG_KEY = "assuredia_lang"

function readLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === "ar" || stored === "en") return stored
  } catch {
    /* ignore storage failures */
  }
  return "en"
}

type Entry = {
  en: string
  ar: string
}

/* eslint-disable @typescript-eslint/quotes */
const dict: Record<string, Entry> = {
  /* ---------- App chrome ---------- */
  "nav.workspace": { en: "Workspace", ar: "مساحة العمل" },
  "nav.monitoring": { en: "Monitoring", ar: "المراقبة" },
  "nav.system": { en: "System", ar: "النظام" },
  "nav.overview": { en: "Overview", ar: "نظرة عامة" },
  "nav.flows": { en: "Flows", ar: "التدفقات" },
  "nav.automations": { en: "Automations", ar: "الأتمتة" },
  "nav.requests": { en: "Requests", ar: "الطلبات" },
  "nav.runHistory": { en: "Run History", ar: "سجل التشغيل" },
  "nav.alerts": { en: "Alerts", ar: "التنبيهات" },
  "nav.aiAnalysis": { en: "AI Analysis", ar: "تحليل الذكاء الاصطناعي" },
  "nav.settings": { en: "Settings", ar: "الإعدادات" },
  "nav.adminConsole": { en: "Admin Console", ar: "وحدة تحكم المسؤول" },
  "nav.logout": { en: "Logout", ar: "تسجيل الخروج" },
  "header.subtitle": {
    en: "Monitor your application's quality and test health.",
    ar: "راقب جودة تطبيقك وسلامة الاختبارات.",
  },
  "header.goodMorning": { en: "Good morning", ar: "صباح الخير" },
  "header.goodAfternoon": { en: "Good afternoon", ar: "طاب يومك" },
  "header.goodEvening": { en: "Good evening", ar: "مساء الخير" },
  "header.allSystems": {
    en: "All systems operational",
    ar: "جميع الأنظمة تعمل",
  },
  "header.switchToLight": {
    en: "Switch to light mode",
    ar: "التبديل إلى الوضع الفاتح",
  },
  "header.switchToDark": {
    en: "Switch to dark mode",
    ar: "التبديل إلى الوضع الداكن",
  },
  "header.unreadAlerts": {
    en: "{count} unread alerts",
    ar: "{count} تنبيهات غير مقروءة",
  },
  "footer.tagline": {
    en: "© 2026 Assuredia · Always On. Quality Assured.",
    ar: "© 2026 Assuredia · دائماً في الخدمة. الجودة مضمونة.",
  },

  /* ---------- Common ---------- */
  "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
  "common.retry": { en: "Retry", ar: "إعادة المحاولة" },
  "common.save": { en: "Save", ar: "حفظ" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  "common.saveChanges": { en: "Save Changes", ar: "حفظ التغييرات" },
  "common.changesSaved": { en: "Changes saved", ar: "تم حفظ التغييرات" },
  "common.saveFailed": {
    en: "Could not save changes",
    ar: "تعذّر حفظ التغييرات",
  },
  "common.loadFailed": { en: "Could not load data", ar: "تعذّر تحميل البيانات" },
  "common.active": { en: "Active", ar: "نشط" },
  "common.inactive": { en: "Inactive", ar: "غير نشط" },
  "common.enabled": { en: "Enabled", ar: "مفعّل" },
  "common.disabled": { en: "Disabled", ar: "معطّل" },
  "common.close": { en: "Close", ar: "إغلاق" },
  "common.refresh": { en: "Refresh", ar: "تحديث" },
  "common.confirm": { en: "Confirm", ar: "تأكيد" },
  "common.create": { en: "Create", ar: "إنشاء" },
  "common.view": { en: "View", ar: "عرض" },
  "common.viewDetails": { en: "View details", ar: "عرض التفاصيل" },
  "common.back": { en: "Back", ar: "رجوع" },
  "common.next": { en: "Next", ar: "التالي" },
  "common.finish": { en: "Finish", ar: "إنهاء" },
  "common.submit": { en: "Submit", ar: "إرسال" },
  "common.search": { en: "Search", ar: "بحث" },
  "common.all": { en: "All", ar: "الكل" },
  "common.none": { en: "None", ar: "لا شيء" },
  "common.optional": { en: "Optional", ar: "اختياري" },
  "common.required": { en: "Required", ar: "مطلوب" },
  "common.yes": { en: "Yes", ar: "نعم" },
  "common.no": { en: "No", ar: "لا" },
  "common.today": { en: "Today", ar: "اليوم" },
  "common.yesterday": { en: "Yesterday", ar: "أمس" },
  "common.somethingWentWrong": { en: "Something went wrong", ar: "حدث خطأ ما" },
  "common.unexpectedError": {
    en: "An unexpected error occurred. Please try again.",
    ar: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
  },
  "common.noData": { en: "No data", ar: "لا توجد بيانات" },
  "common.nothingToDisplay": {
    en: "Nothing to display yet.",
    ar: "لا يوجد ما يُعرض بعد.",
  },
  "common.aiAnalysisAvailable": {
    en: "AI Analysis Available",
    ar: "تحليل الذكاء الاصطناعي متاح",
  },
  "common.copied": { en: "Copied to clipboard", ar: "تم النسخ إلى الحافظة" },

  /* ---------- Status labels (display labels for backend status values) ---------- */
  "status.active": { en: "Active", ar: "نشط" },
  "status.inactive": { en: "Inactive", ar: "غير نشط" },
  "status.passed": { en: "Passed", ar: "نجح" },
  "status.pass": { en: "Pass", ar: "نجاح" },
  "status.failed": { en: "Failed", ar: "فشل" },
  "status.running": { en: "Running", ar: "قيد التشغيل" },
  "status.scheduled": { en: "Scheduled", ar: "مجدول" },
  "status.pending": { en: "Pending", ar: "قيد المراجعة" },
  "status.paused": { en: "Paused", ar: "متوقف مؤقتاً" },
  "status.cancelled": { en: "Cancelled", ar: "تم الإلغاء" },
  "status.skipped": { en: "Skipped", ar: "تم التجاوز" },
  "status.resolved": { en: "Resolved", ar: "تم الحل" },
  "status.approved": { en: "Approved", ar: "تمت الموافقة" },
  "status.rejected": { en: "Rejected", ar: "مرفوض" },
  "status.unknown": { en: "Unknown", ar: "غير معروف" },

  /* ---------- Run triggers ---------- */
  "trigger.manual": { en: "Manual", ar: "يدوي" },
  "trigger.scheduled": { en: "Scheduled", ar: "مجدول" },
  "trigger.unknown": { en: "Unknown", ar: "غير معروف" },

  /* ---------- Time & relative labels ---------- */
  "time.todayAt": { en: "Today, {time}", ar: "اليوم، {time}" },
  "time.yesterdayAt": { en: "Yesterday, {time}", ar: "أمس، {time}" },
  "time.justNow": { en: "just now", ar: "الآن" },
  "time.minsAgo": { en: "{count}m ago", ar: "منذ {count} د" },
  "time.hoursAgo": { en: "{count}h ago", ar: "منذ {count} س" },
  "time.daysAgo": { en: "{count}d ago", ar: "منذ {count} يوم" },

  /* ---------- Run model display strings (lib mappers) ---------- */
  "run.testsCount": { en: "{count} tests", ar: "{count} اختبار" },
  "run.flowsCount": { en: "{count} flows", ar: "{count} تدفق" },
  "run.selectedTests": { en: "Selected Tests", ar: "اختبارات محددة" },
  "run.fullFlow": { en: "Full Flow", ar: "التدفق الكامل" },
  "run.failureStep": { en: "Failure", ar: "فشل" },
  "run.packageRun": { en: "Package run", ar: "تشغيل حزمة" },
  "run.flowRun": { en: "Flow run", ar: "تشغيل تدفق" },
  "run.flowFallback": { en: "Flow {id}", ar: "التدفق {id}" },
  "run.failedOfTotalTests": {
    en: "{failed} of {total} tests failed.",
    ar: "فشل {failed} من أصل {total} اختبار.",
  },
  "run.failedTestsCount": {
    en: "{count} tests failed.",
    ar: "فشل {count} اختبار.",
  },
  "run.failedFlowsOfTotal": {
    en: "{failed} of {total} flows failed.",
    ar: "فشل {failed} من أصل {total} تدفق.",
  },
  "run.executionFinishedWithFailure": {
    en: "The execution finished with a failure.",
    ar: "انتهى التنفيذ بفشل.",
  },
  "run.executionFailed": { en: "The execution failed.", ar: "فشل التنفيذ." },
  "run.failedBeforeAnyTest": {
    en: "The execution failed before any test could run.",
    ar: "فشل التنفيذ قبل تشغيل أي اختبار.",
  },
  "run.noLongerAvailable": {
    en: "This run is no longer available on the server.",
    ar: "هذا التشغيل لم يعد متاحاً على الخادم.",
  },
  "run.scheduledPackageNotCancellable": {
    en: "Scheduled package runs cannot be cancelled from Run History.",
    ar: "لا يمكن إلغاء عمليات تشغيل الحزم المجدولة من سجل التشغيل.",
  },
  "run.unableToCancelNow": {
    en: "Unable to cancel the run right now.",
    ar: "تعذّر إلغاء التشغيل الآن.",
  },
  "run.analysisSingleRunsOnly": {
    en: "The analysis can only be re-run for single flow runs.",
    ar: "يمكن إعادة تشغيل التحليل لعمليات تشغيل التدفق الفردية فقط.",
  },
  "run.aiDisabledForAccount": {
    en: "AI analysis is disabled for this account.",
    ar: "تحليل الذكاء الاصطناعي معطّل لهذا الحساب.",
  },
  "run.unableToStartAnalysis": {
    en: "Unable to start the analysis right now.",
    ar: "تعذّر بدء التحليل الآن.",
  },

  /* ---------- Run Detail screen ---------- */
  "run.cancelModalTitle": { en: "Cancel this run?", ar: "إلغاء هذا التشغيل؟" },
  "run.cancelModalDesc": {
    en: "The execution will be stopped immediately. Completed steps are kept, and the run will be marked as Cancelled.",
    ar: "سيتم إيقاف التنفيذ فورا. ستُحفظ الخطوات المكتملة، وسيُعلَّم التشغيل على أنه ملغى.",
  },
  "run.currentTest": { en: "Current test", ar: "الاختبار الحالي" },
  "run.currentStep": { en: "Current step", ar: "الخطوة الحالية" },
  "run.startedAt": { en: "Started {time}", ar: "بدأ في {time}" },
  "run.live": { en: "live", ar: "مباشر" },
  "run.unknownStatusNote": {
    en: "The backend returned an unrecognized execution status. Nothing is assumed about this run.",
    ar: "أعاد الخادم حالة تنفيذ غير معروفة. لا يتم افتراض أي شيء بخصوص هذا التشغيل.",
  },
  "run.runAgain": { en: "Run Again", ar: "تشغيل مرة أخرى" },
  "run.viewScreenshots": { en: "View Screenshots", ar: "عرض لقطات الشاشة" },
  "run.executionTimeline": {
    en: "Execution timeline",
    ar: "الخط الزمني للتنفيذ",
  },
  "run.failureDetails": { en: "Failure details", ar: "تفاصيل الإخفاق" },
  "run.errorMessage": { en: "Error message", ar: "رسالة الخطأ" },
  "run.failedTests": { en: "Failed tests", ar: "الاختبارات الفاشلة" },
  "run.failedStepLabel": { en: "Failed step", ar: "الخطوة الفاشلة" },
  "run.timestamp": { en: "Timestamp", ar: "الطابع الزمني" },
  "run.screenshots": { en: "Screenshots", ar: "لقطات الشاشة" },
  "run.executionLogs": { en: "Execution Logs", ar: "سجلات التنفيذ" },
  "run.executionSummary": { en: "Execution summary", ar: "ملخص التنفيذ" },
  "run.stepsLabel": { en: "Steps", ar: "الخطوات" },
  "run.client": { en: "Client", ar: "العميل" },
  "run.startTime": { en: "Start time", ar: "وقت البدء" },
  "run.endTime": { en: "End time", ar: "وقت الانتهاء" },
  "run.assertions": { en: "Assertions", ar: "التأكيدات" },

  /* ---------- Dashboard (derived KPI / list labels) ---------- */
  "dashboard.totalTests": { en: "Total Tests", ar: "إجمالي الاختبارات" },
  "dashboard.successRate": { en: "Success Rate", ar: "معدل النجاح" },
  "dashboard.thisWeek": { en: "this week", ar: "هذا الأسبوع" },
  "dashboard.vsLastWeek": { en: "vs last week", ar: "مقارنة بالأسبوع الماضي" },
  "dashboard.unknownFlow": { en: "Unknown flow", ar: "تدفق غير معروف" },
  "dashboard.testFailure": { en: "Test failure", ar: "إخفاق اختبار" },
  "dashboard.days7": { en: "7 days", ar: "7 أيام" },
  "dashboard.days30": { en: "30 days", ar: "30 يوماً" },
  "dashboard.passRate": { en: "pass rate", ar: "معدل النجاح" },
  "dashboard.allStatuses": { en: "All statuses", ar: "كل الحالات" },
  "dashboard.loadRunsFailed": {
    en: "Unable to load run data right now.",
    ar: "تعذّر تحميل بيانات التشغيل الآن.",
  },
  "dashboard.loadAlertsFailed": {
    en: "Unable to load recent failures right now.",
    ar: "تعذّر تحميل الإخفاقات الأخيرة الآن.",
  },
  "dashboard.testHealthLoadFailed": {
    en: "Couldn't load test health",
    ar: "تعذّر تحميل صحة الاختبارات",
  },
  "dashboard.noTestActivity": {
    en: "No test activity yet",
    ar: "لا يوجد نشاط اختبار بعد",
  },
  "dashboard.noTestActivityDesc": {
    en: "Once your first flow run completes, the pass/fail trend for your workspace will appear here.",
    ar: "بمجرد اكتمال أول تشغيل لتدفق، سيظهر هنا اتجاه النجاح والفشل لمساحة عملك.",
  },
  "dashboard.recentRunsLoadFailed": {
    en: "Couldn't load recent runs",
    ar: "تعذّر تحميل عمليات التشغيل الأخيرة",
  },
  "dashboard.noRunsYet": { en: "No runs yet", ar: "لا توجد عمليات تشغيل بعد" },
  "dashboard.noRunsYetDesc": {
    en: "Run your first flow and the latest executions will show up here.",
    ar: "شغّل تدفقك الأول وستظهر أحدث عمليات التنفيذ هنا.",
  },
  "dashboard.noMatchingRuns": {
    en: "No matching runs",
    ar: "لا توجد عمليات تشغيل مطابقة",
  },
  "dashboard.noMatchingRunsDesc": {
    en: "None of the latest runs are {filter}. Try a different filter.",
    ar: "لا توجد عمليات تشغيل حديثة بحالة «{filter}». جرّب مرشحاً مختلفاً.",
  },
  "dashboard.recentFailuresLoadFailed": {
    en: "Couldn't load recent failures",
    ar: "تعذّر تحميل الإخفاقات الأخيرة",
  },
  "dashboard.noRecentFailures": {
    en: "No recent failures",
    ar: "لا توجد إخفاقات حديثة",
  },
  "dashboard.noRecentFailuresDesc": {
    en: "Good news — none of your latest runs have failed.",
    ar: "أخبار جيدة — لم تفشل أي من عمليات التشغيل الأخيرة.",
  },
  "dashboard.noClientLinked": {
    en: "No client environment linked",
    ar: "لا توجد بيئة عميل مرتبطة",
  },
  "dashboard.noClientLinkedDesc": {
    en: "This account isn't attached to a client workspace, so there is no dashboard data to show. Contact your administrator.",
    ar: "هذا الحساب غير مرتبط بمساحة عمل عميل، لذلك لا توجد بيانات للعرض في لوحة التحكم. تواصل مع المسؤول.",
  },
  "dashboard.loadFailed": {
    en: "Couldn't load dashboard data",
    ar: "تعذّر تحميل بيانات لوحة التحكم",
  },

  /* ---------- Shared table headers ---------- */
  "table.flow": { en: "Flow", ar: "التدفق" },
  "table.status": { en: "Status", ar: "الحالة" },
  "table.trigger": { en: "Trigger", ar: "طريقة التشغيل" },
  "table.duration": { en: "Duration", ar: "المدة" },
  "table.time": { en: "Time", ar: "الوقت" },
  "table.date": { en: "Date", ar: "التاريخ" },
  "table.tests": { en: "Tests", ar: "الاختبارات" },
  "table.name": { en: "Name", ar: "الاسم" },
  "table.actions": { en: "Actions", ar: "إجراءات" },

  /* ---------- Automation schedules ---------- */
  "schedule.freq.every15m": { en: "Every 15 minutes", ar: "كل 15 دقيقة" },
  "schedule.freq.every30m": { en: "Every 30 minutes", ar: "كل 30 دقيقة" },
  "schedule.freq.everyHour": { en: "Every hour", ar: "كل ساعة" },
  "schedule.freq.every2h": { en: "Every 2 hours", ar: "كل ساعتين" },
  "schedule.freq.every6h": { en: "Every 6 hours", ar: "كل 6 ساعات" },
  "schedule.freq.everyDay": { en: "Every day", ar: "كل يوم" },
  "schedule.freq.everyWeek": { en: "Every week", ar: "كل أسبوع" },
  "schedule.runsEvery15m": {
    en: "Runs every 15 minutes",
    ar: "يعمل كل 15 دقيقة",
  },
  "schedule.runsEvery30m": {
    en: "Runs every 30 minutes",
    ar: "يعمل كل 30 دقيقة",
  },
  "schedule.runsEvery2h": { en: "Runs every 2 hours", ar: "يعمل كل ساعتين" },
  "schedule.runsEvery6h": { en: "Runs every 6 hours", ar: "يعمل كل 6 ساعات" },
  "schedule.dailyAt": { en: "Daily at {time}", ar: "يومياً في {time}" },
  "schedule.weeklyMonAt": {
    en: "Weekly (Mon) at {time}",
    ar: "أسبوعياً (الاثنين) في {time}",
  },
  "schedule.freqAt": {
    en: "{frequency} at {time}",
    ar: "{frequency} في {time}",
  },
  "schedule.notifyAlways": { en: "Always", ar: "دائماً" },
  "schedule.notifyOnFailure": { en: "On failure only", ar: "عند الفشل فقط" },
  "schedule.notifyNever": { en: "Never", ar: "أبداً" },
  "schedule.notifyDefault": { en: "Default", ar: "افتراضي" },

  /* ---------- Automation adapter messages ---------- */
  "automations.warningManualNotLoaded": {
    en: "Manual automations could not be loaded and are not shown.",
    ar: "تعذّر تحميل الأتمتة اليدوية ولن يتم عرضها.",
  },
  "automations.warningScheduledNotLoaded": {
    en: "Scheduled automations could not be loaded and are not shown.",
    ar: "تعذّر تحميل الأتمتة المجدولة ولن يتم عرضها.",
  },
  "automations.partialManualLeft": {
    en: "The schedule was saved, but the previous manual configuration could not be removed. Check the Automations list for a duplicate.",
    ar: "تم حفظ الجدول، لكن تعذّرت إزالة الإعداد اليدوي السابق. تحقق من قائمة الأتمتة بحثاً عن تكرار.",
  },
  "automations.partialScheduleLeft": {
    en: "The automation was saved, but the previous schedule could not be removed. Check the Automations list for a duplicate.",
    ar: "تم حفظ الأتمتة، لكن تعذّرت إزالة الجدول السابق. تحقق من قائمة الأتمتة بحثاً عن تكرار.",
  },
  "automations.onlyScheduledPauseResume": {
    en: "Only scheduled automations can be paused or resumed.",
    ar: "يمكن إيقاف أو استئناف الأتمتة المجدولة فقط.",
  },

  /* ---------- Automation create/edit form ---------- */
  "automations.form.editTitle": { en: "Edit Automation", ar: "تعديل الأتمتة" },
  "automations.form.editSubtitle": {
    en: "Update flows, schedule, and notification settings.",
    ar: "حدّث التدفقات والجدول وإعدادات الإشعارات.",
  },
  "automations.form.createSubtitle": {
    en: "Define the flows to run, then execute manually or on a schedule.",
    ar: "حدّد التدفقات المراد تشغيلها، ثم نفّذها يدوياً أو حسب جدول.",
  },
  "automations.form.nameTitle": { en: "Name", ar: "الاسم" },
  "automations.form.nameLabel": {
    en: "Automation name *",
    ar: "اسم الأتمتة *",
  },
  "automations.form.namePlaceholder": {
    en: "e.g. Regression Suite",
    ar: "مثال: حزمة اختبار التراجع",
  },
  "automations.form.nameRequired": {
    en: "Automation name is required.",
    ar: "اسم الأتمتة مطلوب.",
  },
  "automations.form.nameTooLong": {
    en: "Automation name must be 120 characters or fewer.",
    ar: "يجب ألا يتجاوز اسم الأتمتة 120 حرفاً.",
  },
  "automations.form.flowsTitle": { en: "Flows", ar: "التدفقات" },
  "automations.form.flowsHint": {
    en: "Add one or more flows. Each can run in full or with selected tests only. A flow can appear only once.",
    ar: "أضف تدفقاً واحداً أو أكثر. يمكن تشغيل كل تدفق بالكامل أو مع اختبارات محددة فقط. يمكن أن يظهر التدفق مرة واحدة فقط.",
  },
  "automations.form.noFlowsYet": {
    en: "This client has no flows yet. Create a flow on the Flows page first, then come back to build an automation.",
    ar: "لا توجد تدفقات لهذا العميل بعد. أنشئ تدفقاً من صفحة التدفقات أولاً، ثم عُد لإنشاء الأتمتة.",
  },
  "automations.form.addFlow": { en: "Add Flow", ar: "إضافة تدفق" },
  "automations.form.allFlowsAdded": {
    en: "All available flows have been added.",
    ar: "تمت إضافة جميع التدفقات المتاحة.",
  },
  "automations.form.flowsRequired": {
    en: "Every flow entry needs a selected flow.",
    ar: "كل إدخال تدفق يحتاج إلى تدفق محدد.",
  },
  "automations.form.selectTestsRequired": {
    en: "Select at least one test for every flow that uses Selected Tests.",
    ar: "اختر اختباراً واحداً على الأقل لكل تدفق يستخدم الاختبارات المحددة.",
  },
  "automations.form.flowN": { en: "Flow {index}", ar: "التدفق {index}" },
  "automations.form.flowLabel": { en: "Flow", ar: "التدفق" },
  "automations.form.moveUp": { en: "Move up", ar: "نقل لأعلى" },
  "automations.form.moveDown": { en: "Move down", ar: "نقل لأسفل" },
  "automations.form.removeFlow": { en: "Remove flow", ar: "إزالة التدفق" },
  "automations.form.selectFlowPlaceholder": {
    en: "Select a flow…",
    ar: "اختر تدفقاً…",
  },
  "automations.form.runScope": { en: "Run scope", ar: "نطاق التشغيل" },
  "automations.form.selectTests": {
    en: "Select tests",
    ar: "اختيار الاختبارات",
  },
  "automations.form.selectedCount": {
    en: "{selected} / {total} selected",
    ar: "{selected} / {total} محدد",
  },
  "automations.form.loadingTests": {
    en: "Loading tests…",
    ar: "جارٍ تحميل الاختبارات…",
  },
  "automations.form.testsLoadFailed": {
    en: "Could not load this flow's tests.",
    ar: "تعذّر تحميل اختبارات هذا التدفق.",
  },
  "automations.form.noTestsInFlow": {
    en: "This flow has no tests. Add tests to the flow first, or use Full Flow.",
    ar: "لا توجد اختبارات لهذا التدفق. أضف اختبارات إلى التدفق أولاً، أو استخدم التدفق الكامل.",
  },
  "automations.form.summaryTitle": {
    en: "Automation Summary",
    ar: "ملخص الأتمتة",
  },
  "automations.form.untitled": { en: "Untitled", ar: "بدون عنوان" },
  "automations.form.testsLabel": { en: "Tests", ar: "الاختبارات" },
  "automations.form.noFlow": { en: "No flow", ar: "لا يوجد تدفق" },
  "automations.form.fullScopeShort": { en: "Full", ar: "كامل" },
  "automations.form.scheduleTitle": { en: "Schedule", ar: "الجدول" },
  "automations.form.scheduleHint": {
    en: "Optionally run on a recurring schedule.",
    ar: "يمكن التشغيل اختيارياً حسب جدول متكرر.",
  },
  "automations.form.enable": { en: "Enable", ar: "تفعيل" },
  "automations.form.notScheduledHintBefore": {
    en: "Not scheduled — run manually using ",
    ar: "غير مجدول — شغّل يدوياً باستخدام ",
  },
  "automations.form.notScheduledSummary": {
    en: "Not scheduled",
    ar: "غير مجدول",
  },
  "automations.form.customCronWarningBefore": {
    en: "This schedule uses a custom CRON expression ",
    ar: "يستخدم هذا الجدول تعبير CRON مخصصاً ",
  },
  "automations.form.customCronWarningAfter": {
    en: ". Changing the frequency or time replaces it.",
    ar: ". تغيير التكرار أو الوقت سيستبدله.",
  },
  "automations.form.frequency": { en: "Frequency", ar: "التكرار" },
  "automations.form.time": { en: "Time", ar: "الوقت" },
  "automations.form.timezone": { en: "Timezone", ar: "المنطقة الزمنية" },
  "automations.form.useAccountTz": {
    en: "Use account timezone",
    ar: "استخدام المنطقة الزمنية للحساب",
  },
  "automations.form.customTz": {
    en: "Custom timezone",
    ar: "منطقة زمنية مخصصة",
  },
  "automations.form.fromSettingsTzBefore": {
    en: "From Settings ",
    ar: "من الإعدادات ",
  },
  "automations.form.fromSettingsTzAfter": {
    en: " Timezone",
    ar: " المنطقة الزمنية",
  },
  "automations.form.notificationsTitle": {
    en: "Notifications",
    ar: "الإشعارات",
  },
  "automations.form.collapse": { en: "Collapse", ar: "طي" },
  "automations.form.configure": { en: "Configure", ar: "تكوين" },
  "automations.form.notifScheduledOnly": {
    en: "Notifications apply to scheduled automations only. Enable a schedule above to configure them.",
    ar: "تنطبق الإشعارات على الأتمتة المجدولة فقط. فعّل الجدول أعلاه لتكوينها.",
  },
  "automations.form.notifyPrefix": { en: "Notify:", ar: "الإشعار:" },
  "automations.form.notifyPolicyHint": {
    en: "When scheduled runs finish, notifications are sent according to this policy.",
    ar: "عند انتهاء عمليات التشغيل المجدولة، تُرسَل الإشعارات وفقاً لهذه السياسة.",
  },
  "automations.form.saving": { en: "Saving…", ar: "جارٍ الحفظ…" },
  "automations.form.saveAutomation": {
    en: "Save Automation",
    ar: "حفظ الأتمتة",
  },
  "automations.form.loadingFlows": {
    en: "Loading flows…",
    ar: "جارٍ تحميل التدفقات…",
  },
  "automations.form.flowsLoadFailed": {
    en: "Could not load flows",
    ar: "تعذّر تحميل التدفقات",
  },
  "automations.form.flowsLoadError": {
    en: "Could not load flows.",
    ar: "تعذّر تحميل التدفقات.",
  },
  "automations.form.executionLabel": { en: "Execution", ar: "التنفيذ" },
  "automations.form.execManualScheduled": {
    en: "Manual + Scheduled",
    ar: "يدوي + مجدول",
  },

  /* ---------- Automations list / detail ---------- */
  "automations.moreOptions": { en: "More options", ar: "مزيد من الخيارات" },
  "automations.menu.pauseSchedule": {
    en: "Pause Schedule",
    ar: "إيقاف الجدول مؤقتاً",
  },
  "automations.menu.resumeSchedule": {
    en: "Resume Schedule",
    ar: "استئناف الجدول",
  },
  "automations.menu.deleteAutomation": {
    en: "Delete Automation",
    ar: "حذف الأتمتة",
  },
  "automations.flowsCount": { en: "{count} flows", ar: "{count} تدفقات" },
  "automations.accountTimezone": {
    en: "Account timezone",
    ar: "المنطقة الزمنية للحساب",
  },
  "automations.detail.info": { en: "Info", ar: "معلومات" },
  "automations.detail.recentExecutions": {
    en: "Recent Executions",
    ar: "عمليات التنفيذ الأخيرة",
  },
  "automations.detail.fullFlow": { en: "Full Flow", ar: "التدفق الكامل" },
  "automations.detail.selectedTests": {
    en: "Selected Tests · {count} selected",
    ar: "اختبارات محددة · {count} محدد",
  },
  "automations.detail.noExecutions": {
    en: "No executions yet. Use Run Now to trigger the first run.",
    ar: "لا توجد عمليات تنفيذ بعد. استخدم «التشغيل الآن» لبدء أول تشغيل.",
  },
  "automations.detail.id": { en: "ID", ar: "المعرّف" },
  "automations.detail.created": { en: "Created", ar: "تاريخ الإنشاء" },
  "automations.loadFailed": {
    en: "Could not load automations.",
    ar: "تعذّر تحميل الأتمتة.",
  },
  "automations.loadFailedTitle": {
    en: "Could not load automations",
    ar: "تعذّر تحميل الأتمتة",
  },
  "automations.emptyTitle": {
    en: "No automations yet",
    ar: "لا توجد أتمتة بعد",
  },
  "automations.emptyDesc": {
    en: "Combine multiple flows, pick which tests to run, then execute now or on a schedule.",
    ar: "اجمع عدة تدفقات، واختر الاختبارات التي تريد تشغيلها، ثم نفّذ الآن أو وفق جدول زمني.",
  },
  "automations.pausedTitle": {
    en: "Schedule paused",
    ar: "تم إيقاف الجدول مؤقتاً",
  },
  "automations.pausedDesc": {
    en: '"{name}" will not run until resumed.',
    ar: "لن يتم تشغيل «{name}» حتى استئناف الجدول.",
  },
  "automations.resumedTitle": {
    en: "Schedule resumed",
    ar: "تم استئناف الجدول",
  },
  "automations.resumedDesc": {
    en: '"{name}" will run on its next scheduled time.',
    ar: "سيتم تشغيل «{name}» في موعده المجدول التالي.",
  },
  "automations.pauseFailedTitle": {
    en: "Could not pause the schedule",
    ar: "تعذّر إيقاف الجدول مؤقتاً",
  },
  "automations.resumeFailedTitle": {
    en: "Could not resume the schedule",
    ar: "تعذّر استئناف الجدول",
  },
  "automations.deletedTitle": {
    en: "Automation deleted",
    ar: "تم حذف الأتمتة",
  },
  "automations.deletedDesc": {
    en: '"{name}" has been removed.',
    ar: "تمت إزالة «{name}».",
  },
  "automations.deleteFailedTitle": {
    en: "Could not delete the automation",
    ar: "تعذّر حذف الأتمتة",
  },
  "automations.updatedTitle": {
    en: "Automation updated",
    ar: "تم تحديث الأتمتة",
  },
  "automations.createdTitle": {
    en: "Automation created",
    ar: "تم إنشاء الأتمتة",
  },
  "automations.savedDesc": {
    en: '"{name}" has been saved.',
    ar: "تم حفظ «{name}».",
  },
  "automations.savedWarningTitle": {
    en: "Saved with a warning",
    ar: "تم الحفظ مع تحذير",
  },
  "automations.updateFailedTitle": {
    en: "Could not update the automation",
    ar: "تعذّر تحديث الأتمتة",
  },
  "automations.createFailedTitle": {
    en: "Could not create the automation",
    ar: "تعذّر إنشاء الأتمتة",
  },
  "automations.deleteModalTitle": {
    en: "Delete automation?",
    ar: "حذف الأتمتة؟",
  },
  "automations.deleteModalDesc": {
    en: '"{name}" will be permanently removed. This cannot be undone.',
    ar: "سيتم حذف «{name}» نهائياً. لا يمكن التراجع عن هذا الإجراء.",
  },

  /* ---------- Automation run view (aggregate execution) ---------- */
  "autrun.passedOfTotal": {
    en: "{passed}/{total} passed",
    ar: "نجح {passed}/{total}",
  },
  "autrun.failedCount": { en: "{count} failed", ar: "فشل {count}" },
  "autrun.skippedCount": { en: "{count} skipped", ar: "تم تخطي {count}" },
  "autrun.noTestsReported": {
    en: "No tests reported",
    ar: "لا توجد اختبارات مبلّغ عنها",
  },
  "autrun.currentFlow": { en: "Current flow", ar: "التدفق الحالي" },
  "autrun.progress": { en: "Progress", ar: "التقدم" },
  "autrun.scheduledExpired": {
    en: "The live state of this scheduled run is no longer available — the engine keeps it for about 30 minutes after a run finishes. Its result remains visible in Run History.",
    ar: "الحالة المباشرة لهذا التشغيل المجدول لم تعد متاحة — يحتفظ المحرك بها لمدة 30 دقيقة تقريباً بعد انتهاء التشغيل. تبقى النتيجة مرئية في سجل التشغيل.",
  },
  "autrun.executionGone": {
    en: "This execution is no longer available on the server.",
    ar: "هذا التنفيذ لم يعد متاحاً على الخادم.",
  },
  "autrun.cancelRequestedTitle": {
    en: "Cancellation requested",
    ar: "تم طلب الإلغاء",
  },
  "autrun.cancelRequestedDesc": {
    en: "The execution is being stopped. The status updates once the engine confirms it.",
    ar: "يجري إيقاف التنفيذ. سيتم تحديث الحالة بمجرد تأكيد المحرك.",
  },
  "autrun.runAlreadyFinishedTitle": {
    en: "Run already finished",
    ar: "انتهى التشغيل بالفعل",
  },
  "autrun.runAlreadyFinishedDesc": {
    en: "There is nothing left to cancel — the execution has already completed.",
    ar: "لا يوجد ما يمكن إلغاؤه — اكتمل التنفيذ بالفعل.",
  },
  "autrun.cancelFailedTitle": {
    en: "Could not cancel the run",
    ar: "تعذّر إلغاء التشغيل",
  },
  "autrun.openChildFailedTitle": {
    en: "Could not open the flow run",
    ar: "تعذّر فتح تشغيل التدفق",
  },
  "autrun.eyebrow": { en: "Automation execution", ar: "تنفيذ الأتمتة" },
  "autrun.scheduledAutomation": {
    en: "scheduled automation",
    ar: "أتمتة مجدولة",
  },
  "autrun.cancelRun": { en: "Cancel Run", ar: "إلغاء التشغيل" },
  "autrun.cancelling": { en: "Cancelling…", ar: "جارٍ الإلغاء…" },
  "autrun.passedLabel": { en: "passed", ar: "ناجح" },
  "autrun.failedLabel": { en: "failed", ar: "فاشل" },
  "autrun.skippedLabel": { en: "skipped", ar: "متخطّى" },
  "autrun.durationLabel": {
    en: "Duration: {duration}",
    ar: "المدة: {duration}",
  },
  "autrun.flowsInExecution": {
    en: "Flows in this execution",
    ar: "التدفقات في هذا التنفيذ",
  },
  "autrun.stateUnavailableTitle": {
    en: "Execution state unavailable",
    ar: "حالة التنفيذ غير متاحة",
  },
  "autrun.cancelModalTitle": {
    en: "Cancel this execution?",
    ar: "إلغاء هذا التنفيذ؟",
  },
  "autrun.cancelModalDesc": {
    en: "The engine will stop the execution after the current test finishes. Results already collected are kept.",
    ar: "سيوقف المحرك التنفيذ بعد انتهاء الاختبار الحالي. سيتم الاحتفاظ بالنتائج المجمّعة.",
  },
  "autrun.keepRunning": { en: "Keep Running", ar: "مواصلة التشغيل" },
  "autrun.cancelExecution": { en: "Cancel Execution", ar: "إلغاء التنفيذ" },
  "autrun.backToAutomationRun": {
    en: "Back to Automation Run",
    ar: "العودة إلى تشغيل الأتمتة",
  },

  /* ---------- Localized error messages (frontend + mapped backend) ---------- */
  "errors.networkUnreachable": {
    en: "Unable to reach the Assuredia server. Check your connection and try again.",
    ar: "تعذّر الوصول إلى خادم Assuredia. تحقق من اتصالك وحاول مرة أخرى.",
  },
  "errors.badRequest": {
    en: "The request was invalid. Please check your details and try again.",
    ar: "الطلب غير صالح. يرجى التحقق من بياناتك والمحاولة مرة أخرى.",
  },
  "errors.unauthorized": {
    en: "Your session is invalid or expired. Please sign in again.",
    ar: "جلستك غير صالحة أو منتهية. يرجى تسجيل الدخول مرة أخرى.",
  },
  "errors.forbidden": {
    en: "You do not have access to this resource.",
    ar: "ليس لديك صلاحية الوصول إلى هذا المورد.",
  },
  "errors.conflict": {
    en: "The request conflicts with an existing record.",
    ar: "يتعارض الطلب مع سجل موجود.",
  },
  "errors.serverError": {
    en: "Something went wrong on our side. Please try again.",
    ar: "حدث خطأ من جانبنا. يرجى المحاولة مرة أخرى.",
  },
  "errors.emailPasswordRequired": {
    en: "Please enter your email and password.",
    ar: "يرجى إدخال البريد الإلكتروني وكلمة المرور.",
  },
  "errors.pendingApproval": {
    en: "Your account is pending approval.",
    ar: "حسابك بانتظار الموافقة.",
  },
  "errors.notApproved": {
    en: "Your application was not approved.",
    ar: "لم تتم الموافقة على طلبك.",
  },
  "errors.signupRequired": {
    en: "Email, password, and company name are required.",
    ar: "البريد الإلكتروني وكلمة المرور واسم الشركة مطلوبة.",
  },
  "errors.validEmail": {
    en: "Enter a valid email address.",
    ar: "أدخل بريداً إلكترونياً صالحاً.",
  },
  "errors.passwordMinLength": {
    en: "Password must be at least {count} characters.",
    ar: "يجب أن تتكون كلمة المرور من {count} أحرف على الأقل.",
  },
  "errors.passwordMaxLength": {
    en: "Password must be at most {count} characters.",
    ar: "يجب ألا تتجاوز كلمة المرور {count} حرفاً.",
  },
  "errors.emailExists": {
    en: "An account with this email already exists.",
    ar: "يوجد حساب بهذا البريد الإلكتروني بالفعل.",
  },
  "errors.alreadyPending": {
    en: "Your application is already pending.",
    ar: "طلبك قيد الانتظار بالفعل.",
  },
  "errors.signupFailed": {
    en: "Could not complete signup. Please try again.",
    ar: "تعذّر إكمال التسجيل. يرجى المحاولة مرة أخرى.",
  },
  "errors.runAlreadyCompleted": {
    en: "Run has already completed.",
    ar: "اكتمل التشغيل بالفعل.",
  },
  "errors.runInProgress": {
    en: "This client already has a run in progress.",
    ar: "لدى العميل تشغيل قيد التنفيذ بالفعل.",
  },
  "errors.runNotFound": {
    en: "Run not found.",
    ar: "لم يتم العثور على التشغيل.",
  },
  "errors.flowNotFound": {
    en: "Client or flow not found.",
    ar: "لم يتم العثور على العميل أو التدفق.",
  },
  "errors.clientNotExist": {
    en: "This client does not exist.",
    ar: "هذا العميل غير موجود.",
  },
  "errors.flowNotOwned": {
    en: "The selected flow does not belong to this client.",
    ar: "التدفق المحدد لا ينتمي إلى هذا العميل.",
  },
  "errors.fromBeforeTo": {
    en: "The start date must be before the end date.",
    ar: "يجب أن يكون تاريخ البداية قبل تاريخ النهاية.",
  },
  "errors.planEmpty": {
    en: "Execution plan must contain at least one flow.",
    ar: "يجب أن تحتوي خطة التنفيذ على تدفق واحد على الأقل.",
  },
  "errors.planDuplicateFlow": {
    en: "A flow may appear only once in an execution plan.",
    ar: "يمكن أن يظهر التدفق مرة واحدة فقط في خطة التنفيذ.",
  },
  "errors.planNoTests": {
    en: "At least one test must be selected.",
    ar: "يجب اختيار اختبار واحد على الأقل.",
  },
  "errors.testsUnavailable": {
    en: "Selected tests are no longer available in {flow}.",
    ar: "الاختبارات المحددة لم تعد متاحة في {flow}.",
  },
  "errors.planNotStarted": {
    en: "Execution plan could not be started.",
    ar: "تعذّر بدء خطة التنفيذ.",
  },
  "errors.featureUnavailable": {
    en: "This feature is temporarily unavailable. Please try again later.",
    ar: "هذه الميزة غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.",
  },

  /* ---------- Settings page ---------- */
  "settings.eyebrow": { en: "System", ar: "النظام" },
  "settings.title": { en: "Settings", ar: "الإعدادات" },
  "settings.description": {
    en: "Manage your account, client environment, execution defaults, and notification preferences.",
    ar: "إدارة حسابك وبيئة العميل وإعدادات التنفيذ وتفضيلات الإشعارات.",
  },
  "settings.section.account": { en: "Account", ar: "الحساب" },
  "settings.section.security": { en: "Security", ar: "الأمان" },
  "settings.section.credentials": {
    en: "Secure Credentials",
    ar: "بيانات الاعتماد الآمنة",
  },
  "settings.section.environment": {
    en: "Client Environment",
    ar: "بيئة العميل",
  },
  "settings.section.execution": {
    en: "Test Execution",
    ar: "تنفيذ الاختبارات",
  },
  "settings.section.notifications": { en: "Notifications", ar: "الإشعارات" },
  "settings.section.timezone": { en: "Timezone", ar: "المنطقة الزمنية" },
  "settings.section.preferences": { en: "Preferences", ar: "التفضيلات" },
  "settings.noClient": {
    en: "No client environment is linked to this account. Client configuration settings are not available.",
    ar: "لا توجد بيئة عميل مرتبطة بهذا الحساب. إعدادات تهيئة العميل غير متاحة.",
  },

  /* Secure Credentials (PR10C.5 Phase 2) */
  "settings.credentials.eyebrow": {
    en: "Secure Credentials",
    ar: "بيانات الاعتماد الآمنة",
  },
  "settings.credentials.subtitle": {
    en: "Manage authentication credentials for tests that require secure access. Actual secret values are never displayed here.",
    ar: "إدارة بيانات اعتماد المصادقة للاختبارات التي تتطلب وصولًا آمنًا. لا تُعرض القيم السرية الفعلية هنا أبدًا.",
  },
  "settings.credentials.noticeTitle": {
    en: "Credential values are always protected",
    ar: "قيم بيانات الاعتماد محمية دائمًا",
  },
  "settings.credentials.noticeBody": {
    en: "Assuredia stores credentials securely and never exposes them in the UI. Only metadata such as name, type, and status are shown here. Credentials are referenced by name in test configurations — never by value.",
    ar: "تخزّن Assuredia بيانات الاعتماد بشكل آمن ولا تعرضها أبدًا في الواجهة. تُعرض هنا بيانات التعريف فقط مثل الاسم والنوع والحالة. يُشار إلى بيانات الاعتماد بالاسم في تكوينات الاختبار — وليس بالقيمة.",
  },
  "settings.credentials.statTotal": {
    en: "Total",
    ar: "الإجمالي",
  },
  "settings.credentials.statTotalHint": {
    en: "credentials defined",
    ar: "بيانات اعتماد محددة",
  },
  "settings.credentials.statConfigured": {
    en: "Configured",
    ar: "مُعد",
  },
  "settings.credentials.statConfiguredHint": {
    en: "ready to use",
    ar: "جاهزة للاستخدام",
  },
  "settings.credentials.statNeedsSetup": {
    en: "Needs Setup",
    ar: "تحتاج إعدادًا",
  },
  "settings.credentials.statNeedsSetupHint": {
    en: "not yet configured",
    ar: "غير مُعدة بعد",
  },
  "settings.credentials.addCredential": {
    en: "Add Credential",
    ar: "إضافة بيانات اعتماد",
  },
  "settings.credentials.emptyTitle": {
    en: "No credentials configured",
    ar: "لا توجد بيانات اعتماد مُعدة",
  },
  "settings.credentials.emptyBody": {
    en: "Add a secure credential to enable authenticated tests.",
    ar: "أضف بيانات اعتماد آمنة لتمكين الاختبارات المصادقة.",
  },
  "settings.credentials.typeUserAccount": {
    en: "User Account",
    ar: "حساب مستخدم",
  },
  "settings.credentials.typeApiService": {
    en: "API Service",
    ar: "خدمة API",
  },
  "settings.credentials.statusConfigured": {
    en: "Configured",
    ar: "مُعد",
  },
  "settings.credentials.statusNeedsSetup": {
    en: "Not configured",
    ar: "غير مُعد",
  },
  "settings.credentials.statusInvalid": {
    en: "Needs attention",
    ar: "تحتاج انتباهًا",
  },
  "settings.credentials.lastUsed": {
    en: "Last used",
    ar: "آخر استخدام",
  },
  "settings.credentials.lastUsedNever": {
    en: "Never used",
    ar: "لم تُستخدم مطلقًا",
  },
  "settings.credentials.useCount": {
    en: "Used in {count} run(s)",
    ar: "استُخدمت في {count} تشغيل(ات)",
  },
  "settings.credentials.username": {
    en: "Username",
    ar: "اسم المستخدم",
  },
  "settings.credentials.unavailable503": {
    en: "Secure credentials aren't available on this deployment yet. Please try again later.",
    ar: "بيانات الاعتماد الآمنة غير متاحة على هذا النشر بعد. يرجى المحاولة لاحقًا.",
  },

  /* Credential form */
  "credentials.form.addTitle": {
    en: "Add Secure Credential",
    ar: "إضافة بيانات اعتماد آمنة",
  },
  "credentials.form.editTitle": {
    en: "Edit Secure Credential",
    ar: "تعديل بيانات الاعتماد الآمنة",
  },
  "credentials.form.addNotice": {
    en: "Credential values are encrypted at rest. You enter the secret only once during configuration and it is never shown again.",
    ar: "تُشفَّر قيم بيانات الاعتماد عند التخزين. تُدخل القيمة السرية مرة واحدة فقط أثناء التهيئة ولا تُعرض مرة أخرى أبدًا.",
  },
  "credentials.form.editNotice": {
    en: "Leave the username or password blank to keep the current stored values. Enter a new password to replace it.",
    ar: "اترك اسم المستخدم أو كلمة المرور فارغين للاحتفاظ بالقيم المخزنة الحالية. أدخل كلمة مرور جديدة لاستبدالها.",
  },
  "credentials.form.name": {
    en: "Name",
    ar: "الاسم",
  },
  "credentials.form.namePlaceholder": {
    en: "e.g. Customer Login",
    ar: "مثال: تسجيل دخول العميل",
  },
  "credentials.form.nameHint": {
    en: "A unique label for this credential (e.g. \"Customer Login\").",
    ar: "تسمية فريدة لبيانات الاعتماد هذه (مثل \"تسجيل دخول العميل\").",
  },
  "credentials.form.type": {
    en: "Type",
    ar: "النوع",
  },
  "credentials.form.username": {
    en: "Username",
    ar: "اسم المستخدم",
  },
  "credentials.form.password": {
    en: "Password",
    ar: "كلمة المرور",
  },
  "credentials.form.passwordNew": {
    en: "New password",
    ar: "كلمة مرور جديدة",
  },
  "credentials.form.nameRequired": {
    en: "A credential name is required.",
    ar: "اسم بيانات الاعتماد مطلوب.",
  },
  "credentials.form.nameTooLong": {
    en: "The credential name must be at most 120 characters.",
    ar: "يجب ألا يزيد اسم بيانات الاعتماد عن 120 حرفًا.",
  },
  "credentials.form.usernameRequired": {
    en: "A username is required.",
    ar: "اسم المستخدم مطلوب.",
  },
  "credentials.form.passwordRequired": {
    en: "A password is required.",
    ar: "كلمة المرور مطلوبة.",
  },
  "credentials.form.save": {
    en: "Save Credential",
    ar: "حفظ بيانات الاعتماد",
  },
  "credentials.form.cancel": {
    en: "Cancel",
    ar: "إلغاء",
  },
  "credentials.form.saved": {
    en: "Credential saved.",
    ar: "تم حفظ بيانات الاعتماد.",
  },
  "credentials.form.errorValidation": {
    en: "Please check the highlighted fields and try again.",
    ar: "يرجى التحقق من الحقول المميزة والمحاولة مرة أخرى.",
  },
  "credentials.form.errorConflict": {
    en: "A credential with this name already exists. Choose a different name.",
    ar: "توجد بيانات اعتماد بهذا الاسم بالفعل. اختر اسمًا مختلفًا.",
  },
  "credentials.form.errorNotFound": {
    en: "This credential no longer exists. Refresh the list and try again.",
    ar: "لم تعد بيانات الاعتماد هذه موجودة. حدّث القائمة وحاول مرة أخرى.",
  },
  "credentials.form.errorUnavailable": {
    en: "Secure credentials aren't available on this deployment yet.",
    ar: "بيانات الاعتماد الآمنة غير متاحة على هذا النشر بعد.",
  },
  "credentials.form.errorNetwork": {
    en: "Could not reach Assuredia. Check your connection and try again.",
    ar: "تعذر الوصول إلى Assuredia. تحقق من اتصالك وحاول مرة أخرى.",
  },
  "credentials.form.errorFallback": {
    en: "Something went wrong. Please try again.",
    ar: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  },

  /* Delete confirmation */
  "credentials.delete.title": {
    en: "Delete credential?",
    ar: "حذف بيانات الاعتماد؟",
  },
  "credentials.delete.body": {
    en: "Tests using this credential will need to be updated. This cannot be undone.",
    ar: "ستحتاج الاختبارات التي تستخدم بيانات الاعتماد هذه إلى تحديث. لا يمكن التراجع عن هذا الإجراء.",
  },
  "credentials.delete.confirm": {
    en: "Delete Credential",
    ar: "حذف بيانات الاعتماد",
  },
  "credentials.delete.cancel": {
    en: "Cancel",
    ar: "إلغاء",
  },
  "credentials.delete.success": {
    en: "Credential deleted.",
    ar: "تم حذف بيانات الاعتماد.",
  },
  "credentials.delete.failed": {
    en: "Could not delete this credential.",
    ar: "تعذر حذف بيانات الاعتماد هذه.",
  },

  /* Test connection */
  "credentials.test.action": {
    en: "Test connection",
    ar: "اختبار الاتصال",
  },
  "credentials.test.testing": {
    en: "Testing…",
    ar: "جارٍ الاختبار…",
  },
  "credentials.test.works": {
    en: "Credential works",
    ar: "بيانات الاعتماد تعمل",
  },
  "credentials.test.failed": {
    en: "The connection test failed",
    ar: "فشل اختبار الاتصال",
  },
  "credentials.test.invalidNote": {
    en: "This credential is marked as needing attention.",
    ar: "تم وضع علامة على بيانات الاعتماد هذه بأنها تحتاج انتباهًا.",
  },

  /* Row actions */
  "credentials.row.edit": {
    en: "Edit",
    ar: "تعديل",
  },
  "credentials.row.remove": {
    en: "Remove",
    ar: "إزالة",
  },

  /* Manual editor credential context (audit F-01) */
  "credentials.manual.asSubmitted": {
    en: "As submitted:",
    ar: "كما سيُرسل:",
  },
  "credentials.manual.descriptionOverflow": {
    en: "Description is too long when combined with credential metadata. Reduce by {count} characters.",
    ar: "الوصف طويل جدًا عند دمجه مع بيانات تعريف بيانات الاعتماد. قلّل بمقدار {count} حرفًا.",
  },

  /* Selector (AI Composer + manual editors) */
  "credentials.selector.none": {
    en: "No credential",
    ar: "بدون بيانات اعتماد",
  },
  "credentials.selector.empty": {
    en: "No credentials configured",
    ar: "لا توجد بيانات اعتماد مُعدة",
  },
  "credentials.selector.emptyCta": {
    en: "Set up in Settings",
    ar: "الإعداد في الإعدادات",
  },
  "credentials.selector.managedNote": {
    en: "Managed in Settings · values never shown",
    ar: "تُدار في الإعدادات · لا تُعرض القيم أبدًا",
  },

  /* Account */
  "settings.account.description": {
    en: "Who am I? Your identity across the Assuredia workspace.",
    ar: "من أنا؟ هويتك عبر مساحة عمل Assuredia.",
  },
  "settings.account.name": { en: "Name", ar: "الاسم" },
  "settings.account.email": { en: "Email", ar: "البريد الإلكتروني" },
  "settings.account.role": { en: "Role", ar: "الدور" },
  "settings.account.roleHint": {
    en: "Roles are managed by your organization and cannot be changed here.",
    ar: "تُدار الأدوار من قبل مؤسستك ولا يمكن تغييرها هنا.",
  },
  "settings.account.readOnlyHint": {
    en: "Profile details come from your Assuredia account and cannot be edited here.",
    ar: "بيانات الملف الشخصي مصدرها حسابك في Assuredia ولا يمكن تعديلها هنا.",
  },

  /* Security */
  "settings.security.description": {
    en: "How is my account protected?",
    ar: "كيف يُحمى حسابي؟",
  },
  "settings.security.password": { en: "Password", ar: "كلمة المرور" },
  "settings.security.passwordHint": {
    en: "For your security, your password is never displayed.",
    ar: "لأمانك، لا تُعرض كلمة المرور أبداً.",
  },
  "settings.security.passwordManaged": {
    en: "Password changes are handled by your Assuredia administrator.",
    ar: "يتم تغيير كلمة المرور بواسطة مسؤول Assuredia لديك.",
  },
  "settings.security.currentSession": {
    en: "Current session",
    ar: "الجلسة الحالية",
  },
  "settings.security.signedInAs": {
    en: "Signed in as",
    ar: "مسجّل الدخول باسم",
  },
  "settings.security.signOut": { en: "Sign out", ar: "تسجيل الخروج" },
  "settings.security.signOutHint": {
    en: "End this session on this device. You will be asked to sign in again.",
    ar: "إنهاء هذه الجلسة على هذا الجهاز. سيُطلب منك تسجيل الدخول مجدداً.",
  },

  /* Client environment */
  "settings.env.description": {
    en: "Which application am I monitoring?",
    ar: "ما هو التطبيق الذي أراقبه؟",
  },
  "settings.env.clientName": { en: "Client name", ar: "اسم العميل" },
  "settings.env.clientNameHint": {
    en: "Assigned when the workspace was created and cannot be changed here.",
    ar: "يُعيَّن عند إنشاء مساحة العمل ولا يمكن تغييره هنا.",
  },
  "settings.env.clientId": { en: "Client ID", ar: "معرّف العميل" },
  "settings.env.clientIdHint": {
    en: "Assigned by Assuredia and cannot be changed.",
    ar: "يُعيَّن من Assuredia ولا يمكن تغييره.",
  },
  "settings.env.website": { en: "Website", ar: "الموقع الإلكتروني" },
  "settings.env.specUrlLabel": {
    en: "API specification URL",
    ar: "رابط مواصفات الـ API",
  },
  "settings.env.specUrlHint": {
    en: "Optional. Leave empty to discover the specification automatically on the application URL. Example: https://api.example.com/docs",
    ar: "اختياري. اتركه فارغًا لاكتشاف المواصفات تلقائيًا من رابط التطبيق. مثال: https://api.example.com/docs",
  },
  "settings.env.clientStatus": { en: "Client status", ar: "حالة العميل" },
  "settings.env.clientStatusDesc": {
    en: "Inactive clients are excluded from scheduled runs.",
    ar: "يُستبعد العملاء غير النشطين من عمليات التشغيل المجدولة.",
  },
  "settings.env.siteCredentials": {
    en: "Site credentials",
    ar: "بيانات اعتماد الموقع",
  },
  "settings.env.siteCredentialsHint": {
    en: "Credentials are encrypted at rest and never displayed. Enter a new value to replace them.",
    ar: "تُشفّر بيانات الاعتماد عند التخزين ولا تُعرض أبداً. أدخل قيمة جديدة لاستبدالها.",
  },
  "settings.env.siteUsernamePlaceholder": {
    en: "Site username",
    ar: "اسم مستخدم الموقع",
  },
  "settings.env.sitePasswordPlaceholderKept": {
    en: "Leave blank to keep the current password",
    ar: "اتركه فارغاً للاحتفاظ بكلمة المرور الحالية",
  },
  "settings.env.sitePasswordPlaceholderNew": {
    en: "Enter a site password",
    ar: "أدخل كلمة مرور الموقع",
  },
  "settings.env.sitePasswordSet": {
    en: "A site password is saved. Leave the password field blank to keep it.",
    ar: "توجد كلمة مرور محفوظة للموقع. اترك الحقل فارغاً للاحتفاظ بها.",
  },
  "settings.env.sitePasswordUnset": {
    en: "No site password is saved yet.",
    ar: "لا توجد كلمة مرور محفوظة للموقع بعد.",
  },

  /* Test execution */
  "settings.exec.description": {
    en: "How should tests execute by default?",
    ar: "كيف يجب أن تُنفَّذ الاختبارات افتراضياً؟",
  },
  "settings.exec.browser": { en: "Browser", ar: "المتصفح" },
  "settings.exec.device": { en: "Device", ar: "الجهاز" },
  "settings.exec.device.desktop": { en: "Desktop", ar: "سطح المكتب" },
  "settings.exec.device.tablet": { en: "Tablet", ar: "جهاز لوحي" },
  "settings.exec.device.mobile": { en: "Mobile", ar: "هاتف محمول" },
  "settings.exec.device.custom": {
    en: "Custom viewport",
    ar: "نافذة عرض مخصصة",
  },
  "settings.exec.viewportWidth": {
    en: "Viewport width (px)",
    ar: "عرض نافذة العرض (بكسل)",
  },
  "settings.exec.viewportHeight": {
    en: "Viewport height (px)",
    ar: "ارتفاع نافذة العرض (بكسل)",
  },
  "settings.exec.headless": {
    en: "Headless mode",
    ar: "الوضع غير المرئي (Headless)",
  },
  "settings.exec.headlessDesc": {
    en: "Run without a visible browser window for faster execution.",
    ar: "التشغيل دون نافذة متصفح مرئية لتنفيذ أسرع.",
  },
  "settings.exec.runTimeout": {
    en: "Run timeout (minutes)",
    ar: "مهلة التشغيل (بالدقائق)",
  },
  "settings.exec.runTimeoutHint": {
    en: "Force-stop a run that exceeds this duration.",
    ar: "إيقاف التشغيل قسراً إذا تجاوز هذه المدة.",
  },
  "settings.exec.timeout": {
    en: "Implicit wait (seconds)",
    ar: "الانتظار الضمني (بالثواني)",
  },
  "settings.exec.timeoutHint": {
    en: "How long WebDriver waits for elements to appear before failing a step.",
    ar: "مدة انتظار WebDriver لعناصر الصفحة قبل اعتبار الخطوة فاشلة.",
  },
  "settings.exec.aiReports": {
    en: "AI reports",
    ar: "تقارير الذكاء الاصطناعي",
  },
  "settings.exec.aiReportsDesc": {
    en: "Add an AI explanation to failed runs.",
    ar: "إضافة تفسير بالذكاء الاصطناعي إلى التشغيلات الفاشلة.",
  },
  "settings.exec.retries": { en: "Retry count", ar: "عدد إعادة المحاولات" },
  "settings.exec.retriesHint": {
    en: "Number of additional attempts after a failed execution.",
    ar: "عدد المحاولات الإضافية بعد فشل التنفيذ.",
  },

  /* Notifications */
  "settings.notify.description": {
    en: "When should I be notified?",
    ar: "متى يجب أن أُخطر؟",
  },
  "settings.notify.policy": {
    en: "Notification policy",
    ar: "سياسة الإشعارات",
  },
  "settings.notify.policy.never": { en: "Never", ar: "أبداً" },
  "settings.notify.policy.neverDesc": {
    en: "Do not send notifications.",
    ar: "عدم إرسال إشعارات.",
  },
  "settings.notify.policy.always": { en: "Always", ar: "دائماً" },
  "settings.notify.policy.alwaysDesc": {
    en: "Send notifications for executions according to the configured policy.",
    ar: "إرسال إشعارات لعمليات التشغيل وفقاً للسياسة المُعدّة.",
  },
  "settings.notify.policy.onFailure": { en: "On failure", ar: "عند الفشل" },
  "settings.notify.policy.onFailureDesc": {
    en: "Notify when a monitored test execution fails.",
    ar: "الإخطار عند فشل تنفيذ اختبار مُراقب.",
  },
  "settings.notify.telegram": { en: "Telegram", ar: "تيليجرام" },
  "settings.notify.telegramBot": { en: "Telegram bot", ar: "روبوت تيليجرام" },
  "settings.notify.telegramConnected": { en: "Connected", ar: "متصل" },
  "settings.notify.telegramNotConnected": {
    en: "Not connected",
    ar: "غير متصل",
  },
  "settings.notify.telegramChatId": { en: "Chat ID", ar: "معرّف المحادثة" },
  "settings.notify.telegramConnectDesc": {
    en: "Connect Telegram to receive alerts in your chat.",
    ar: "اربط تيليجرام لتلقي التنبيهات في محادثتك.",
  },
  "settings.notify.connectTelegram": {
    en: "Connect Telegram",
    ar: "ربط تيليجرام",
  },
  "settings.notify.disconnect": { en: "Disconnect", ar: "قطع الاتصال" },
  "settings.notify.sendTest": {
    en: "Send test notification",
    ar: "إرسال إشعار تجريبي",
  },
  "settings.notify.testSent": {
    en: "Test notification dispatched",
    ar: "تم إرسال الإشعار التجريبي",
  },
  "settings.notify.connectTitle": {
    en: "Connect your Telegram chat",
    ar: "اربط محادثة تيليجرام",
  },
  "settings.notify.connectSteps": {
    en: "Open the link below and press Start in the Telegram bot. Your chat is connected automatically once the bot registers it.",
    ar: "افتح الرابط أدناه واضغط ابدأ في روبوت تيليجرام. سيتم ربط محادثتك تلقائياً بمجرد تسجيلها لدى الروبوت.",
  },
  "settings.notify.openBotLink": {
    en: "Open Telegram bot",
    ar: "فتح روبوت تيليجرام",
  },
  "settings.notify.checkStatus": {
    en: "Check connection",
    ar: "التحقق من الاتصال",
  },
  "settings.notify.disconnectConfirm": {
    en: "Disconnect Telegram notifications for this workspace?",
    ar: "قطع إشعارات تيليجرام لمساحة العمل هذه؟",
  },
  "settings.notify.deliveryNote": {
    en: "Notifications are delivered by the Assuredia notification service according to this policy.",
    ar: "تُسلَّم الإشعارات بواسطة خدمة إشعارات Assuredia وفقاً لهذه السياسة.",
  },

  /* Timezone */
  "settings.tz.description": {
    en: "Your global timezone for schedules and time-based activity across Assuredia.",
    ar: "منطقتك الزمنية العامة للجداول والأنشطة الزمنية عبر Assuredia.",
  },
  "settings.tz.autoDetect": {
    en: "Auto-detect timezone",
    ar: "اكتشاف المنطقة الزمنية تلقائياً",
  },
  "settings.tz.autoDetectDesc": {
    en: "Use your browser to automatically determine your local timezone.",
    ar: "استخدم متصفحك لتحديد منطقتك الزمنية المحلية تلقائياً.",
  },
  "settings.tz.detected": {
    en: "Detected timezone",
    ar: "المنطقة الزمنية المكتشفة",
  },
  "settings.tz.selected": {
    en: "Selected timezone",
    ar: "المنطقة الزمنية المحددة",
  },
  "settings.tz.autoDetected": { en: "Auto-detected", ar: "اكتشاف تلقائي" },
  "settings.tz.label": { en: "Timezone", ar: "المنطقة الزمنية" },
  "settings.tz.hint": {
    en: "Select your preferred timezone from the list below.",
    ar: "اختر منطقتك الزمنية المفضلة من القائمة أدناه.",
  },
  "settings.tz.scheduleNote": {
    en: "Your automations will use {tz} by default. You can override the timezone per automation when needed.",
    ar: "ستستخدم عمليات الأتمتة {tz} افتراضياً. يمكنك تجاوز المنطقة الزمنية لكل أتمتة عند الحاجة.",
  },
  "settings.tz.schedulingDefault": {
    en: "Scheduling default: ",
    ar: "الافتراضي للجدولة: ",
  },

  /* Preferences */
  "settings.prefs.description": {
    en: "Personal display preferences for this device.",
    ar: "تفضيلات العرض الشخصية لهذا الجهاز.",
  },
  "settings.prefs.language": { en: "Language", ar: "اللغة" },
  "settings.prefs.languageDesc": {
    en: "Choose the language of the Assuredia interface. Backend data keeps its original language.",
    ar: "اختر لغة واجهة Assuredia. تحتفظ بيانات الخادم بلغتها الأصلية.",
  },
  "settings.prefs.theme": { en: "Theme", ar: "المظهر" },
  "settings.prefs.themeDesc": {
    en: "Switch between light and dark appearance across the whole application.",
    ar: "التبديل بين المظهر الفاتح والداكن عبر التطبيق بالكامل.",
  },
  "settings.prefs.darkMode": { en: "Dark mode", ar: "الوضع الداكن" },
  "settings.prefs.lightMode": { en: "Light mode", ar: "الوضع الفاتح" },

  /* ---------- Login ---------- */
  "login.title": { en: "Welcome back", ar: "مرحباً بعودتك" },
  "login.subtitle": {
    en: "Sign in to your Assuredia workspace.",
    ar: "سجّل الدخول إلى مساحة عمل Assuredia الخاصة بك.",
  },
  "login.email": { en: "Email address", ar: "البريد الإلكتروني" },
  "login.password": { en: "Password", ar: "كلمة المرور" },
  "login.submit": { en: "Sign In", ar: "تسجيل الدخول" },
  "login.signingIn": { en: "Signing in…", ar: "جارٍ تسجيل الدخول…" },
  "login.emailRequired": {
    en: "Please enter your email address.",
    ar: "يرجى إدخال بريدك الإلكتروني.",
  },
  "login.passwordRequired": {
    en: "Please enter your password.",
    ar: "يرجى إدخال كلمة المرور.",
  },
  "login.invalidCredentials": {
    en: "Invalid email or password.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  "login.signInFailed": {
    en: "Sign-in failed. Please try again.",
    ar: "فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.",
  },
  "login.continueGoogle": {
    en: "Continue with Google",
    ar: "المتابعة عبر Google",
  },
  "login.continueGitHub": {
    en: "Continue with GitHub",
    ar: "المتابعة عبر GitHub",
  },
  "login.or": { en: "or", ar: "أو" },
  "login.socialUnavailable": {
    en: "{provider} sign-in isn't available yet",
    ar: "تسجيل الدخول عبر {provider} غير متاح بعد",
  },
  "login.socialUnavailableDesc": {
    en: "Please sign in with your email and password.",
    ar: "يرجى تسجيل الدخول بالبريد الإلكتروني وكلمة المرور.",
  },
  "login.hidePassword": { en: "Hide password", ar: "إخفاء كلمة المرور" },
  "login.showPassword": { en: "Show password", ar: "إظهار كلمة المرور" },
  "login.forgot": { en: "Forgot password?", ar: "نسيت كلمة المرور؟" },
  "login.noAccount": { en: "Don't have an account?", ar: "ليس لديك حساب؟" },
  "login.createAccount": { en: "Create an account", ar: "إنشاء حساب" },

  /* ---------- Auth screen shell (Figma split-screen layout) ---------- */
  "auth.tabLogin": { en: "Log In", ar: "تسجيل الدخول" },
  "auth.tabSignup": { en: "Sign Up", ar: "إنشاء حساب" },
  "auth.backHome": { en: "Back to home", ar: "العودة إلى الرئيسية" },
  "auth.feature1": {
    en: "Automated UI & API tests running 24/7",
    ar: "اختبارات واجهات وواجهات برمجية آلية تعمل على مدار الساعة",
  },
  "auth.feature2": {
    en: "Instant Telegram alerts on failure detection",
    ar: "تنبيهات تيليجرام فورية عند اكتشاف الإخفاق",
  },
  "auth.feature3": {
    en: "AI-powered failure analysis & summaries",
    ar: "تحليل وتلخيص للإخفاقات بالذكاء الاصطناعي",
  },
  "auth.metric.uptime": { en: "System Uptime", ar: "توفر النظام" },
  "auth.metric.monitoring": { en: "Active Monitoring", ar: "مراقبة نشطة" },
  "auth.metric.response": { en: "Alerts Response", ar: "الاستجابة للتنبيهات" },

  /* ---------- Sign up ---------- */
  "signup.title": { en: "Create your account", ar: "أنشئ حسابك" },
  "signup.subtitle": {
    en: "Sign up to request an Assuredia workspace.",
    ar: "سجّل حسابك لطلب مساحة عمل Assuredia.",
  },
  "signup.fullName": { en: "Full Name", ar: "الاسم الكامل" },
  "signup.fullNameRequired": {
    en: "Full name is required.",
    ar: "الاسم الكامل مطلوب.",
  },
  "signup.emailRequired": {
    en: "Email address is required.",
    ar: "عنوان البريد الإلكتروني مطلوب.",
  },
  "signup.invalidEmail": {
    en: "Please enter a valid email address.",
    ar: "يرجى إدخال عنوان بريد إلكتروني صالح.",
  },
  "signup.passwordRequired": {
    en: "Password is required.",
    ar: "كلمة المرور مطلوبة.",
  },
  "signup.passwordMin": {
    en: "Password must be at least 8 characters.",
    ar: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
  },
  "signup.confirmRequired": {
    en: "Please confirm your password.",
    ar: "يرجى تأكيد كلمة المرور.",
  },
  "signup.passwordMismatch": {
    en: "Passwords do not match.",
    ar: "كلمتا المرور غير متطابقتين.",
  },
  "signup.socialUnavailable": {
    en: "{provider} sign-up isn't available yet",
    ar: "التسجيل عبر {provider} غير متاح بعد",
  },
  "signup.socialUnavailableDesc": {
    en: "Please create your account with email and password.",
    ar: "يرجى إنشاء حسابك بالبريد الإلكتروني وكلمة المرور.",
  },
  /* ---------------- OAuth (Google + GitHub) ---------------- */
  "oauth.signingIn": { en: "Signing you in…", ar: "جارٍ تسجيل دخولك…" },
  "oauth.connectingGoogle": {
    en: "Connecting your Google account…",
    ar: "جارٍ ربط حساب Google الخاص بك…",
  },
  "oauth.connectingGitHub": {
    en: "Connecting your GitHub account…",
    ar: "جارٍ ربط حساب GitHub الخاص بك…",
  },
  "oauth.cancelled": {
    en: "{provider} sign-in was cancelled",
    ar: "تم إلغاء تسجيل الدخول عبر {provider}",
  },
  "oauth.cancelledDesc": {
    en: "No changes were made to your account. You can try again whenever you're ready.",
    ar: "لم تُجرَ أي تغييرات على حسابك. يمكنك المحاولة مرة أخرى في أي وقت.",
  },
  "oauth.invalidSession": {
    en: "Invalid OAuth session",
    ar: "جلسة تسجيل الدخول غير صالحة",
  },
  "oauth.invalidSessionDesc": {
    en: "Your sign-in session expired or was interrupted. Please start the sign-in again.",
    ar: "انتهت صلاحية جلسة تسجيل الدخول أو تم مقاطعتها. يرجى بدء تسجيل الدخول من جديد.",
  },
  "oauth.invalidCode": {
    en: "This sign-in link has already been used or has expired",
    ar: "تم استخدام رابط تسجيل الدخول هذا من قبل أو انتهت صلاحيته",
  },
  "oauth.invalidCodeDesc": {
    en: "For security, each sign-in link works only once and for a short time. Start the sign-in again.",
    ar: "لأسباب أمنية، يعمل كل رابط تسجيل دخول مرة واحدة فقط ولفترة قصيرة. ابدأ تسجيل الدخول من جديد.",
  },
  "oauth.providerUnavailable": {
    en: "{provider} sign-in is temporarily unavailable",
    ar: "تسجيل الدخول عبر {provider} غير متاح مؤقتًا",
  },
  "oauth.providerUnavailableDesc": {
    en: "The provider could not be reached. Please try again in a few minutes.",
    ar: "تعذّر الوصول إلى مزوّد الخدمة. يرجى المحاولة مرة أخرى بعد بضع دقائق.",
  },
  "oauth.unverifiedEmail": {
    en: "Your {provider} email address is not verified",
    ar: "عنوان بريدك الإلكتروني لدى {provider} غير موثَّق",
  },
  "oauth.unverifiedEmailDesc": {
    en: "Verify your email address with {provider}, then try again.",
    ar: "وثِّق عنوان بريدك الإلكتروني لدى {provider} ثم حاول مرة أخرى.",
  },
  "oauth.missingConfiguration": {
    en: "{provider} sign-in is not available yet",
    ar: "تسجيل الدخول عبر {provider} غير متاح بعد",
  },
  "oauth.missingConfigurationDesc": {
    en: "This deployment has not enabled {provider} sign-in. Please use your email and password.",
    ar: "لم يتم تفعيل تسجيل الدخول عبر {provider} في هذا النظام بعد. يرجى استخدام البريد الإلكتروني وكلمة المرور.",
  },
  "oauth.accountConflict": {
    en: "An account with this email already exists",
    ar: "يوجد حساب بهذا البريد الإلكتروني بالفعل",
  },
  "oauth.accountConflictDesc": {
    en: "Sign in with your existing account, then link {provider} from Settings.",
    ar: "سجّل الدخول بحسابك الحالي، ثم اربط {provider} من الإعدادات.",
  },
  "oauth.linkConflict": {
    en: "This {provider} account is already linked to a different account",
    ar: "حساب {provider} هذا مرتبط بالفعل بحساب آخر",
  },
  "oauth.linkConflictDesc": {
    en: "Try a different {provider} account, or sign in with the account it is already linked to.",
    ar: "جرّب حساب {provider} آخر، أو سجّل الدخول بالحساب المرتبط به بالفعل.",
  },
  "oauth.genericError": {
    en: "We couldn't sign you in with {provider}",
    ar: "تعذّر تسجيل دخولك عبر {provider}",
  },
  "oauth.genericErrorDesc": {
    en: "Something went wrong during the sign-in. Please try again.",
    ar: "حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.",
  },
  "oauth.onboardingTitle": {
    en: "Complete your profile",
    ar: "أكمل ملفك الشخصي",
  },
  "oauth.onboardingDesc": {
    en: "Tell us your company name to submit your application.",
    ar: "أخبرنا باسم شركتك لإرسال طلبك.",
  },
  "oauth.onboardingNote": {
    en: "Your application will be reviewed before your workspace is activated.",
    ar: "ستتم مراجعة طلبك قبل تفعيل مساحة العمل الخاصة بك.",
  },
  "oauth.submitFailed": {
    en: "Could not submit your application",
    ar: "تعذّر إرسال طلبك",
  },
  "oauth.rejectedTitle": {
    en: "This application was not approved",
    ar: "لم تتم الموافقة على هذا الطلب",
  },
  "oauth.rejectedDesc": {
    en: "Your application was reviewed and not approved. Approval by an administrator is the only way to activate this account.",
    ar: "تمت مراجعة طلبك ولم تتم الموافقة عليه. موافقة المسؤول هي الطريقة الوحيدة لتفعيل هذا الحساب.",
  },
  "oauth.linkedGoogle": {
    en: "Google account linked",
    ar: "تم ربط حساب Google",
  },
  "oauth.linkedGitHub": {
    en: "GitHub account linked",
    ar: "تم ربط حساب GitHub",
  },
  "oauth.linkedDesc": {
    en: "You can now use this provider to sign in to your account.",
    ar: "يمكنك الآن استخدام هذا المزوّد لتسجيل الدخول إلى حسابك.",
  },
  "oauth.linkedAccounts": { en: "Linked accounts", ar: "الحسابات المرتبطة" },
  "oauth.linkedAccountsDesc": {
    en: "Connect a Google or GitHub account to sign in with it instead of your password.",
    ar: "اربط حساب Google أو GitHub لتسجيل الدخول به بدلاً من كلمة المرور.",
  },
  "oauth.linkGoogle": { en: "Link Google account", ar: "ربط حساب Google" },
  "oauth.linkGitHub": { en: "Link GitHub account", ar: "ربط حساب GitHub" },
  "oauth.connect": { en: "Connect", ar: "ربط" },
  "oauth.connecting": { en: "Connecting…", ar: "جارٍ الربط…" },
  "oauth.linkStartFailed": {
    en: "Could not start the linking process",
    ar: "تعذّر بدء عملية الربط",
  },
  "oauth.goToSignIn": { en: "Go to sign in", ar: "الانتقال إلى تسجيل الدخول" },
  "oauth.tryAgain": { en: "Try again", ar: "حاول مرة أخرى" },
  "signup.passwordPlaceholder": {
    en: "Min. 8 characters",
    ar: "8 أحرف على الأقل",
  },
  "signup.confirmPassword": { en: "Confirm Password", ar: "تأكيد كلمة المرور" },
  "signup.confirmPlaceholder": {
    en: "Repeat your password",
    ar: "أعد كتابة كلمة المرور",
  },
  "signup.creating": { en: "Creating account…", ar: "جارٍ إنشاء الحساب…" },
  "signup.submit": { en: "Create Account", ar: "إنشاء الحساب" },
  "signup.haveAccount": {
    en: "Already have an account?",
    ar: "هل لديك حساب بالفعل؟",
  },
  "signup.signIn": { en: "Sign in", ar: "تسجيل الدخول" },
  "signup.stepAccount": { en: "Account", ar: "الحساب" },
  "signup.stepClient": { en: "Client", ar: "العميل" },
  "signup.stepApplication": { en: "Application", ar: "التطبيق" },
  "signup.stepRuntime": { en: "Runtime", ar: "بيئة التشغيل" },
  "signup.stepReview": { en: "Review", ar: "المراجعة" },

  /* ---------- Self-service onboarding ---------- */
  "onb.eyebrow": { en: "Self-Service Onboarding", ar: "التأهيل الذاتي" },
  "onb.title": {
    en: "Create your Assuredia account",
    ar: "أنشئ حساب Assuredia الخاص بك",
  },
  "onb.subtitle": {
    en: "Complete each step to request your client workspace.",
    ar: "أكمل كل خطوة لطلب مساحة عمل العميل الخاصة بك.",
  },
  "onb.exit": { en: "Exit", ar: "خروج" },
  "onb.step1Desc": { en: "Your identity", ar: "هويتك" },
  "onb.step2Desc": { en: "Company info", ar: "معلومات الشركة" },
  "onb.step3Desc": { en: "App credentials", ar: "بيانات اعتماد التطبيق" },
  "onb.step4Desc": { en: "Test configuration", ar: "إعدادات الاختبار" },
  "onb.step5Desc": { en: "Confirm & submit", ar: "التأكيد والإرسال" },
  "onb.s1Desc": {
    en: "Your Assuredia account information.",
    ar: "معلومات حساب Assuredia الخاص بك.",
  },
  "onb.s1Note": {
    en: "Your account will be associated with the client environment you are requesting. The details below are taken from your registration.",
    ar: "سيتم ربط حسابك ببيئة العميل التي تطلبها. التفاصيل أدناه مأخوذة من تسجيلك.",
  },
  "onb.s2Desc": {
    en: "Your company or organization details.",
    ar: "تفاصيل شركتك أو مؤسستك.",
  },
  "onb.companyName": { en: "Company / Client Name", ar: "اسم الشركة / العميل" },
  "onb.companyHint": {
    en: "The name of your organization or product.",
    ar: "اسم مؤسستك أو منتجك.",
  },
  "onb.website": { en: "Website", ar: "الموقع الإلكتروني" },
  "onb.websiteHint": {
    en: "Your company or product website.",
    ar: "الموقع الإلكتروني لشركتك أو منتجك.",
  },
  "onb.s3Desc": {
    en: "The application Assuredia will monitor.",
    ar: "التطبيق الذي ستراقبه Assuredia.",
  },
  "onb.credTitle": {
    en: "Application credentials — not your Assuredia account",
    ar: "بيانات اعتماد التطبيق — وليست حساب Assuredia الخاص بك",
  },
  "onb.credNote": {
    en: "These credentials are for the application Assuredia will test. They are NOT your Assuredia account credentials. They are stored encrypted and never displayed after saving.",
    ar: "بيانات الاعتماد هذه خاصة بالتطبيق الذي ستختبره Assuredia. إنها ليست بيانات اعتماد حساب Assuredia الخاص بك. يتم تخزينها مشفرة ولا تُعرض أبداً بعد الحفظ.",
  },
  "onb.appUrl": { en: "Application URL", ar: "رابط التطبيق" },
  "onb.appUrlHint": {
    en: "The URL where Assuredia will start each test run.",
    ar: "الرابط الذي ستبدأ منه Assuredia كل عملية اختبار.",
  },
  "onb.appUsername": { en: "Application Username", ar: "اسم مستخدم التطبيق" },
  "onb.appUsernameHint": {
    en: "The username used to log into the monitored application.",
    ar: "اسم المستخدم المستخدم لتسجيل الدخول إلى التطبيق المراقب.",
  },
  "onb.appPassword": { en: "Application Password", ar: "كلمة مرور التطبيق" },
  "onb.appPasswordHint": {
    en: "The password for the monitored application. Stored encrypted — never exposed in plain text.",
    ar: "كلمة مرور التطبيق المراقب. تُخزَّن مشفرة — ولا تُكشف أبداً كنص عادي.",
  },
  "onb.s4Desc": {
    en: "Default test execution environment.",
    ar: "بيئة تنفيذ الاختبار الافتراضية.",
  },
  "onb.browser": { en: "Browser", ar: "المتصفح" },
  "onb.device": { en: "Device", ar: "الجهاز" },
  "onb.device.desktop": { en: "Desktop", ar: "سطح المكتب" },
  "onb.device.tablet": { en: "Tablet", ar: "جهاز لوحي" },
  "onb.device.mobile": { en: "Mobile", ar: "جوال" },
  "onb.device.custom": { en: "Custom", ar: "مخصص" },
  "onb.headless": { en: "Headless Mode", ar: "وضع بدون واجهة" },
  "onb.headlessHint": {
    en: "Run tests without a visible browser window.",
    ar: "تشغيل الاختبارات دون نافذة متصفح مرئية.",
  },
  "onb.timeoutLabel": { en: "Run Timeout", ar: "مهلة التشغيل" },
  "onb.timeoutHint": {
    en: "Max seconds before run is terminated (10–600).",
    ar: "الحد الأقصى للثواني قبل إنهاء التشغيل (10–600).",
  },
  "onb.retryLabel": { en: "Retry Count", ar: "عدد محاولات الإعادة" },
  "onb.retryHint": {
    en: "Additional attempts after a failure (0–5).",
    ar: "محاولات إضافية بعد الفشل (0–5).",
  },
  "onb.readyTitle": { en: "Ready to submit?", ar: "جاهز للإرسال؟" },
  "onb.readyDesc": {
    en: "Review the configuration below. Your request will be reviewed by an Assuredia administrator before your workspace is activated.",
    ar: "راجع الإعدادات أدناه. ستتم مراجعة طلبك من قبل مسؤول Assuredia قبل تفعيل مساحة عملك.",
  },
  "onb.name": { en: "Name", ar: "الاسم" },
  "onb.emailLabel": { en: "Email", ar: "البريد الإلكتروني" },
  "onb.companyLabel": { en: "Company", ar: "الشركة" },
  "onb.requester": { en: "Requester", ar: "مقدم الطلب" },
  "onb.username": { en: "Username", ar: "اسم المستخدم" },
  "onb.passwordConfigured": {
    en: "●●●●●●●● configured",
    ar: "●●●●●●●● تم الإعداد",
  },
  "onb.timeoutShort": { en: "Timeout", ar: "المهلة" },
  "onb.seconds": { en: "{n} seconds", ar: "{n} ثانية" },
  "onb.secondsShort": { en: "s", ar: "ث" },
  "onb.continue": { en: "Continue", ar: "متابعة" },
  "onb.submitting": { en: "Submitting…", ar: "جارٍ الإرسال…" },
  "onb.submitForApproval": { en: "Submit for Approval", ar: "إرسال للموافقة" },
  "onb.companyRequired": {
    en: "Company name is required.",
    ar: "اسم الشركة مطلوب.",
  },
  "onb.websiteRequired": {
    en: "Website is required.",
    ar: "الموقع الإلكتروني مطلوب.",
  },
  "onb.invalidUrl": {
    en: "Please enter a valid URL.",
    ar: "يرجى إدخال رابط صالح.",
  },
  "onb.appUrlRequired": {
    en: "Application URL is required.",
    ar: "رابط التطبيق مطلوب.",
  },
  "onb.appUsernameRequired": {
    en: "Application username is required.",
    ar: "اسم مستخدم التطبيق مطلوب.",
  },
  "onb.appPasswordRequired": {
    en: "Application password is required.",
    ar: "كلمة مرور التطبيق مطلوبة.",
  },
  "onb.timeoutRange": {
    en: "Must be 10–600 seconds.",
    ar: "يجب أن يكون بين 10 و600 ثانية.",
  },
  "onb.retryRange": { en: "Must be 0–5.", ar: "يجب أن يكون بين 0 و5." },
  "onb.signupFailed": { en: "Signup failed", ar: "فشل التسجيل" },
  "onb.stillPending": {
    en: "Still pending approval",
    ar: "لا يزال بانتظار الموافقة",
  },
  "onb.statusCheckFailed": {
    en: "Unable to check your status right now.",
    ar: "تعذّر التحقق من حالتك الآن.",
  },
  "onb.pendingApproval": { en: "Pending Approval", ar: "بانتظار الموافقة" },
  "onb.requestSubmitted": { en: "Request submitted", ar: "تم إرسال الطلب" },
  "onb.requestSentDesc": {
    en: "Your onboarding request has been sent to the Assuredia team.",
    ar: "تم إرسال طلب التأهيل الخاص بك إلى فريق Assuredia.",
  },
  "onb.afterApproval": {
    en: "Your workspace will become available after approval.",
    ar: "ستصبح مساحة عملك متاحة بعد الموافقة.",
  },
  "onb.pending": { en: "Pending", ar: "قيد الانتظار" },
  "onb.checking": { en: "Checking status…", ar: "جارٍ التحقق من الحالة…" },
  "onb.checkStatus": { en: "Check Status", ar: "التحقق من الحالة" },
  "onb.backToLogin": { en: "Back to Login", ar: "العودة إلى تسجيل الدخول" },
  "onb.notifyEmail": {
    en: "You will be notified by email when your request is reviewed.",
    ar: "سيتم إشعارك عبر البريد الإلكتروني عند مراجعة طلبك.",
  },
  "onb.approved": { en: "Approved", ar: "تمت الموافقة" },
  "onb.workspaceReady": {
    en: "Your workspace is ready",
    ar: "مساحة عملك جاهزة",
  },
  "onb.approvedDesc": {
    en: "Your Assuredia environment has been approved, {name}.",
    ar: "تمت الموافقة على بيئة Assuredia الخاصة بك يا {name}.",
  },
  "onb.welcome": { en: "Welcome to the team.", ar: "مرحباً بك في الفريق." },
  "onb.openWorkspace": { en: "Open Workspace", ar: "فتح مساحة العمل" },
  "onb.dashboardAccess": {
    en: "You now have access to your full client dashboard.",
    ar: "أصبح لديك الآن حق الوصول إلى لوحة عميلك الكاملة.",
  },

  /* ---------- Admin console chrome ---------- */
  "admin.navDashboard": { en: "Dashboard", ar: "لوحة المعلومات" },
  "admin.navClients": { en: "Clients", ar: "العملاء" },
  "admin.navRequests": { en: "Onboarding Requests", ar: "طلبات التأهيل" },
  "admin.navRuns": { en: "Runs", ar: "عمليات التشغيل" },
  "admin.navDesignSystem": { en: "Design System", ar: "نظام التصميم" },
  "admin.exitToClient": {
    en: "Exit to Client Dashboard",
    ar: "الخروج إلى لوحة تحكم العميل",
  },
  "admin.platformHealthy": {
    en: "Platform healthy",
    ar: "المنصة تعمل بشكل سليم",
  },
  "admin.platformAdmin": { en: "Platform Admin", ar: "مسؤول المنصة" },
  "admin.superAdminGlobal": {
    en: "Super Admin · Global",
    ar: "مسؤول رئيسي · عام",
  },
  "admin.openNav": { en: "Open navigation", ar: "فتح قائمة التنقل" },
  "admin.footer": {
    en: "© 2026 Assuredia · Always On. Quality Assured.",
    ar: "© 2026 Assuredia · دائماٌ في الخدمة. الجودة مضمونة.",
  },

  /* ---------- Admin console: shared ---------- */
  "admin.total": { en: "Total", ar: "الإجمالي" },
  "admin.action": { en: "Action", ar: "إجراء" },
  "admin.started": { en: "Started", ar: "وقت البدء" },
  "admin.submitted": { en: "Submitted", ar: "تاريخ التقديم" },
  "admin.severity": { en: "Severity", ar: "درجة الخطورة" },
  "admin.allTriggers": { en: "All triggers", ar: "كل طرق التشغيل" },
  "admin.suspended": { en: "Suspended", ar: "موقوف" },
  "admin.flows": { en: "Flows", ar: "التدفقات" },
  "admin.schedules": { en: "Schedules", ar: "الجداول" },
  "admin.totalRuns": { en: "Total Runs", ar: "إجمالي عمليات التشغيل" },
  "admin.successRate": { en: "Success Rate", ar: "معدل النجاح" },
  "admin.recentRun": { en: "Recent run", ar: "آخر تشغيل" },
  "admin.lastActivity": { en: "Last activity", ar: "آخر نشاط" },
  "admin.plan": { en: "Plan", ar: "الخطة" },
  "admin.region": { en: "Region", ar: "المنطقة" },
  "admin.contact": { en: "Contact", ar: "جهة الاتصال" },
  "admin.created": { en: "Created", ar: "تاريخ الإنشاء" },
  "admin.connected": { en: "Connected", ar: "متصل" },
  "admin.configure": { en: "Configure", ar: "تهيئة" },
  "admin.hours": { en: "{n} hours", ar: "{n} ساعات" },
  "admin.hourOne": { en: "1 hour", ar: "ساعة واحدة" },
  "admin.alertStatus.open": { en: "Open", ar: "مفتوح" },
  "admin.alertStatus.acknowledged": { en: "Acknowledged", ar: "تم الاطلاع" },
  "admin.table.flowTest": { en: "Flow / Test", ar: "التدفق / الاختبار" },
  "admin.table.flowExecution": {
    en: "Flow / Execution",
    ar: "التدفق / التنفيذ",
  },
  "admin.table.testTests": { en: "Test / Tests", ar: "الاختبار / الاختبارات" },
  "admin.table.alert": { en: "Alert", ar: "التنبيه" },

  /* ---------- Admin console: dashboard ---------- */
  "admin.dash.title": { en: "Platform Overview", ar: "نظرة عامة على المنصة" },
  "admin.dash.subtitle": {
    en: "Monitor clients, executions, platform health, and recent activity.",
    ar: "راقب العملاء وعمليات التشغيل وصحة المنصة والنشاط الأخير.",
  },
  "admin.dash.totalClients": { en: "Total Clients", ar: "إجمالي العملاء" },
  "admin.dash.activeClients": { en: "Active Clients", ar: "العملاء النشطون" },
  "admin.dash.inactiveCount": { en: "{count} inactive", ar: "{count} غير نشط" },
  "admin.dash.failedRuns": { en: "Failed Runs", ar: "عمليات التشغيل الفاشلة" },
  "admin.dash.last30": { en: "last 30 days", ar: "آخر 30 يوماً" },
  "admin.dash.execHealth": {
    en: "Execution health · Now",
    ar: "صحة التنفيذ · الآن",
  },
  "admin.dash.viewAllRuns": {
    en: "View all runs",
    ar: "عرض كل عمليات التشغيل",
  },
  "admin.dash.manageClients": { en: "Manage clients", ar: "إدارة العملاء" },
  "admin.dash.chart7": {
    en: "Executions · Last 7 days",
    ar: "عمليات التنفيذ · آخر 7 أيام",
  },
  "admin.dash.chartTip": {
    en: "{label}: {passed} passed, {failed} failed",
    ar: "{label}: نجح {passed}، فشل {failed}",
  },
  "admin.dash.recentActivity": { en: "Recent Activity", ar: "النشاط الأخير" },
  "admin.dash.noActivity": {
    en: "No recent activity recorded yet.",
    ar: "لا يوجد نشاط أخير مسجل بعد.",
  },
  "admin.dash.noClients": {
    en: "No clients registered yet.",
    ar: "لا يوجد عملاء مسجلون بعد.",
  },
  "admin.dash.loadFailed": {
    en: "Failed to load platform overview.",
    ar: "تعذّر تحميل النظرة العامة للمنصة.",
  },

  /* ---------- Admin console: clients ---------- */
  "admin.clients.subtitle": {
    en: "Manage platform clients, view activity, and configure access.",
    ar: "أدر عملاء المنصة واعرض النشاط وتهيئة الوصول.",
  },
  "admin.clients.newClient": { en: "New Client", ar: "عميل جديد" },
  "admin.clients.back": { en: "Back to Clients", ar: "العودة إلى العملاء" },
  "admin.clients.suspend": { en: "Suspend Client", ar: "تعليق العميل" },
  "admin.clients.activate": { en: "Activate Client", ar: "تفعيل العميل" },
  "admin.clients.details": { en: "Client details", ar: "تفاصيل العميل" },
  "admin.clients.successShort": { en: "{rate}% success", ar: "نجاح {rate}%" },

  /* ---------- Admin console: runs ---------- */
  "admin.runs.title": { en: "Platform Runs", ar: "عمليات تشغيل المنصة" },
  "admin.runs.subtitle": {
    en: "Platform-wide execution history across all clients.",
    ar: "سجل التنفيذ على مستوى المنصة عبر جميع العملاء.",
  },
  "admin.runs.noMatch": {
    en: "No runs match these filters",
    ar: "لا توجد عمليات تشغيل تطابق عوامل التصفية هذه",
  },
  "admin.runs.empty": {
    en: "No runs recorded yet",
    ar: "لا توجد عمليات تشغيل مسجلة بعد",
  },
  "admin.runs.emptyHint": {
    en: "Runs will appear here once clients execute their flows.",
    ar: "ستظهر عمليات التشغيل هنا بمجرد أن ينفذ العملاء تدفقاتهم.",
  },
  "admin.runs.backToList": {
    en: "Back to Runs",
    ar: "العودة إلى عمليات التشغيل",
  },
  "admin.runs.noMatchHint": {
    en: "Try widening the filters above.",
    ar: "جرّب توسيع عوامل التصفية أعلاه.",
  },

  /* ---------- Admin console: alerts ---------- */
  "admin.alerts.title": { en: "Platform Alerts", ar: "تنبيهات المنصة" },
  "admin.alerts.subtitle": {
    en: "Monitor alerts across all clients and executions.",
    ar: "راقب التنبيهات عبر جميع العملاء وعمليات التشغيل.",
  },
  "admin.alerts.openCritical": {
    en: "{open} open · {critical} critical",
    ar: "{open} مفتوح · {critical} حرج",
  },
  "admin.alerts.severityError": { en: "Error", ar: "خطأ" },
  "admin.alerts.severityWarning": { en: "Warning", ar: "تحذير" },
  "admin.alerts.errorsLabel": { en: "Errors", ar: "أخطاء" },
  "admin.alerts.backToList": {
    en: "Back to Alerts",
    ar: "العودة إلى التنبيهات",
  },

  /* ---------- Admin console: AI analysis ---------- */
  "admin.ai.title": {
    en: "Platform AI Analysis",
    ar: "تحليل الذكاء الاصطناعي للمنصة",
  },
  "admin.ai.subtitle": {
    en: "AI-powered failure analysis across all clients.",
    ar: "تحليل الإخفاقات بالذكاء الاصطناعي عبر جميع العملاء.",
  },
  "admin.ai.poweredByGroq": { en: "Powered by Groq", ar: "مدعوم بواسطة Groq" },
  "admin.ai.failureAnalysis": {
    en: "AI Failure Analysis",
    ar: "تحليل الإخفاقات بالذكاء الاصطناعي",
  },
  "admin.ai.detailEyebrow": {
    en: "AI Failure Analysis · Powered by Groq",
    ar: "تحليل الإخفاقات بالذكاء الاصطناعي · مدعوم بواسطة Groq",
  },
  "admin.ai.noMatch": {
    en: "No analyses match these filters",
    ar: "لا توجد تحليلات تطابق عوامل التصفية هذه",
  },
  "admin.ai.viewAnalysis": { en: "View Analysis", ar: "عرض التحليل" },

  /* ---------- Admin console: onboarding requests ---------- */
  "admin.requests.subtitle": {
    en: "Review and manage client registration requests.",
    ar: "راجع طلبات تسجيل العملاء وأدرها.",
  },
  "admin.requests.back": { en: "Back to Requests", ar: "العودة إلى الطلبات" },
  "admin.requests.review": { en: "Review", ar: "مراجعة" },
  "admin.requests.noMatch": {
    en: "No requests match the selected filter.",
    ar: "لا توجد طلبات تطابق عامل التصفية المحدد.",
  },
  "admin.requests.submittedAt": {
    en: "Submitted {time}",
    ar: "تم التقديم في {time}",
  },
  "admin.requests.rejectionReason": { en: "Rejection reason", ar: "سبب الرفض" },
  "admin.requests.application": { en: "Application", ar: "التطبيق" },
  "admin.requests.passwordEncrypted": {
    en: "●●●●●●●● stored encrypted",
    ar: "●●●●●●●● مخزنة بشكل مشفر",
  },
  "admin.requests.details": { en: "Request Details", ar: "تفاصيل الطلب" },
  "admin.requests.requestId": { en: "Request ID", ar: "معرّف الطلب" },
  "admin.requests.currentStatus": {
    en: "Current Status",
    ar: "الحالة الحالية",
  },
  "admin.requests.approve": { en: "Approve Request", ar: "الموافقة على الطلب" },
  "admin.requests.approving": { en: "Approving…", ar: "جارٍ الموافقة…" },
  "admin.requests.reject": { en: "Reject Request", ar: "رفض الطلب" },
  "admin.requests.rejectionPlaceholder": {
    en: "Optional — explain why this request is being rejected.",
    ar: "اختياري — اشرح سبب رفض هذا الطلب.",
  },
  "admin.requests.confirmReject": { en: "Confirm Reject", ar: "تأكيد الرفض" },
  "admin.requests.rejecting": { en: "Rejecting…", ar: "جارٍ الرفض…" },
  "admin.requests.approvedNote": {
    en: "This request has been approved. The client workspace is active.",
    ar: "تمت الموافقة على هذا الطلب. مساحة عمل العميل نشطة.",
  },
  "admin.requests.approveModalTitle": {
    en: "Approve Onboarding Request",
    ar: "الموافقة على طلب التسجيل",
  },
  "admin.requests.approveModalDesc": {
    en: "Provide the base URL of the client application to provision their workspace.",
    ar: "أدخل الرابط الأساسي لتطبيق العميل لتهيئة مساحة عمله.",
  },
  "admin.requests.baseUrlLabel": {
    en: "Application Base URL",
    ar: "الرابط الأساسي للتطبيق",
  },
  "admin.requests.baseUrlPlaceholder": {
    en: "https://app.example.com",
    ar: "https://app.example.com",
  },
  "admin.requests.baseUrlRequired": {
    en: "Base URL is required to provision the client.",
    ar: "الرابط الأساسي مطلوب لتهيئة العميل.",
  },
  "admin.requests.confirmApprove": {
    en: "Confirm Approve",
    ar: "تأكيد الموافقة",
  },
  "admin.requests.approvedTitle": {
    en: "Onboarding approved",
    ar: "تمت الموافقة على طلب التسجيل",
  },
  "admin.requests.approvedDesc": {
    en: 'Client "{name}" provisioned successfully.',
    ar: "تمت تهيئة العميل «{name}» بنجاح.",
  },
  "admin.requests.rejectedTitle": {
    en: "Onboarding rejected",
    ar: "تم رفض طلب التسجيل",
  },
  "admin.requests.rejectedDesc": {
    en: "Request #{id} has been rejected.",
    ar: "تم رفض الطلب #{id}.",
  },
  "admin.requests.approveFailedTitle": {
    en: "Failed to approve request",
    ar: "تعذّرت الموافقة على الطلب",
  },
  "admin.requests.rejectFailedTitle": {
    en: "Failed to reject request",
    ar: "تعذّر رفض الطلب",
  },
  "admin.requests.loadFailedTitle": {
    en: "Could not load onboarding requests",
    ar: "تعذّر تحميل طلبات التسجيل",
  },
  "admin.requests.loadFailed": {
    en: "Failed to load onboarding requests from server.",
    ar: "تعذّر تحميل طلبات التسجيل من الخادم.",
  },
  "admin.requests.emptyTitle": {
    en: "No onboarding requests",
    ar: "لا توجد طلبات تسجيل",
  },
  "admin.requests.emptyDesc": {
    en: "New registration requests from prospective clients will appear here.",
    ar: "ستظهر طلبات التسجيل الجديدة من العملاء المحتملين هنا.",
  },
  "admin.requests.provisionedClient": {
    en: "Provisioned Client",
    ar: "العميل المهيأ",
  },
  "admin.requests.provisionedClientDesc": {
    en: "Client workspace #{id} is created and active.",
    ar: "تم إنشاء مساحة عمل العميل #{id} وهي نشطة الآن.",
  },
  "admin.requests.viewInClients": {
    en: "View in Clients",
    ar: "عرض في قائمة العملاء",
  },
  "admin.requests.applicantEmail": {
    en: "Applicant Email",
    ar: "بريد مقدّم الطلب",
  },
  "admin.requests.company": { en: "Company", ar: "الشركة" },
  "admin.requests.reviewedBy": { en: "Reviewed By", ar: "تمت المراجعة بواسطة" },
  "admin.requests.reviewedAt": { en: "Reviewed At", ar: "تاريخ المراجعة" },
  "errors.baseUrlRequired": {
    en: "Base URL is required to provision the client",
    ar: "رابط الأساس مطلوب لتهيئة العميل",
  },
  "errors.invalidCompanyName": {
    en: "The company name contains an invalid path component",
    ar: "اسم الشركة يحتوي على مسار غير صالح",
  },

  /* ---------- Admin console: asset requests ---------- */
  "admin.navAssetRequests": { en: "Asset Requests", ar: "طلبات الأصول" },
  "admin.clients.activatedTitle": {
    en: "Client activated",
    ar: "تم تنشيط العميل",
  },
  "admin.clients.suspendedTitle": {
    en: "Client suspended",
    ar: "تم إيقاف العميل",
  },
  "admin.clients.statusUpdatedDesc": {
    en: "{name} has been updated. The change is now live.",
    ar: "تم تحديث {name}. التغيير ساري الآن.",
  },
  "admin.clients.updateFailedTitle": {
    en: "Failed to update client",
    ar: "تعذّر تحديث العميل",
  },
  "admin.clients.empty": { en: "No clients yet", ar: "لا يوجد عملاء بعد" },
  "admin.clients.noRuns": {
    en: "No runs recorded for this client yet.",
    ar: "لا توجد عمليات تشغيل مسجلة لهذا العميل بعد.",
  },
  "admin.create.duplicateName": {
    en: "A client with this name already exists",
    ar: "يوجد عميل بهذا الاسم بالفعل",
  },
  "admin.create.failedTitle": {
    en: "Could not create client",
    ar: "تعذّر إنشاء العميل",
  },
  "admin.asset.title": { en: "Asset Requests", ar: "طلبات الأصول" },
  "admin.asset.subtitle": {
    en: "Review and action client requests for Flow and Test changes.",
    ar: "راجع ونفّذ طلبات العملاء لتغييرات التدفقات والاختبارات.",
  },
  "admin.asset.pendingBanner": {
    en: "{count} requests awaiting review.",
    ar: "{count} طلبات بانتظار المراجعة.",
  },
  "admin.asset.pendingBannerOne": {
    en: "1 request awaiting review.",
    ar: "طلب واحد بانتظار المراجعة.",
  },
  "admin.asset.searchPlaceholder": {
    en: "Search ID, client, flow…",
    ar: "ابحث بالمعرّف أو العميل أو التدفق…",
  },
  "admin.asset.allTypes": { en: "All Types", ar: "جميع الأنواع" },
  "admin.asset.allClients": { en: "All Clients", ar: "جميع العملاء" },
  "admin.asset.noMatch": {
    en: "No requests match filters",
    ar: "لا توجد طلبات مطابقة لعوامل التصفية",
  },
  "admin.asset.resetFilters": {
    en: "Reset filters",
    ar: "إعادة تعيين العوامل",
  },
  "admin.asset.thRequest": { en: "Request", ar: "الطلب" },
  "admin.asset.back": {
    en: "Back to Asset Requests",
    ar: "العودة إلى طلبات الأصول",
  },
  "admin.asset.target": { en: "Target", ar: "الهدف" },
  "admin.asset.flow": { en: "Flow", ar: "التدفق" },
  "admin.asset.test": { en: "Test", ar: "الاختبار" },
  "admin.asset.requestedBy": { en: "Requested By", ar: "مقدّم الطلب" },
  "admin.asset.description": { en: "Description", ar: "الوصف" },
  "admin.asset.steps": { en: "Steps", ar: "الخطوات" },
  "admin.asset.tests": { en: "Tests", ar: "الاختبارات" },
  "admin.asset.testCount": { en: "{n} tests", ar: "{n} اختبارات" },
  "admin.asset.reason": { en: "Reason for Change", ar: "سبب التغيير" },
  "admin.asset.info": { en: "Request Info", ar: "معلومات الطلب" },
  "admin.asset.lastUpdated": { en: "Last updated", ar: "آخر تحديث" },
  "admin.asset.reviewedBy": { en: "Reviewed by", ar: "راجعها" },
  "admin.asset.reviewedAt": { en: "Reviewed at", ar: "تاريخ المراجعة" },
  "admin.asset.approveTitle": {
    en: "Approve this request?",
    ar: "الموافقة على هذا الطلب؟",
  },
  "admin.asset.rejectTitle": { en: "Reject this request", ar: "رفض هذا الطلب" },
  "admin.asset.implementTitle": {
    en: "Implement this approved request?",
    ar: "تنفيذ هذا الطلب المعتمد؟",
  },
  "admin.asset.implementDesc": {
    en: "This marks the request as implemented. Ensure the asset changes have been applied.",
    ar: "سيتم وسم الطلب كمنفَّذ. تأكد من تطبيق تغييرات الأصل أولاً.",
  },
  "admin.asset.confirmApprove": { en: "Approve", ar: "موافقة" },
  "admin.asset.confirmImplement": { en: "Implement", ar: "تنفيذ" },
  "admin.asset.approveShort": { en: "Approve", ar: "موافقة" },
  "admin.asset.rejectShort": { en: "Reject", ar: "رفض" },
  "admin.asset.markImplemented": {
    en: "Mark Implemented",
    ar: "وضع علامة منفَّذ",
  },
  "admin.asset.approvedTitle": {
    en: "Request approved",
    ar: "تمت الموافقة على الطلب",
  },
  "admin.asset.rejectedTitle": { en: "Request rejected", ar: "تم رفض الطلب" },
  "admin.asset.implementedTitle": {
    en: "Request implemented",
    ar: "تم تنفيذ الطلب",
  },
  "admin.asset.actionSuccessDesc": {
    en: "Request #{id} is up to date.",
    ar: "الطلب #{id} محدَّث الآن.",
  },
  "admin.asset.approveFailedTitle": {
    en: "Failed to approve",
    ar: "تعذّرت الموافقة",
  },
  "admin.asset.rejectFailedTitle": { en: "Failed to reject", ar: "تعذّر الرفض" },
  "admin.asset.implementFailedTitle": {
    en: "Failed to implement",
    ar: "تعذّر التنفيذ",
  },
  "errors.requestStateChanged": {
    en: "Request state changed. Refreshing…",
    ar: "تغيّرت حالة الطلب. جارٍ التحديث…",
  },
  "errors.requestStateChangedDesc": {
    en: "The request was updated by someone else. The latest state has been loaded.",
    ar: "تم تحديث الطلب من قِبل شخص آخر. تم تحميل الحالة الأحدث.",
  },
  "errors.requestNotExist": {
    en: "This request does not exist",
    ar: "هذا الطلب غير موجود",
  },
  "errors.adminNotesRequired": {
    en: "Rejection notes are required",
    ar: "ملاحظات الرفض مطلوبة",
  },
  "common.justNow": { en: "Just now", ar: "الآن" },

  /* ---------- Admin console: settings ---------- */
  "admin.settings.title": { en: "Admin Settings", ar: "إعدادات المسؤول" },
  "admin.settings.subtitle": {
    en: "Configure platform-level settings and integrations.",
    ar: "تهيئة الإعدادات والتكاملات على مستوى المنصة.",
  },
  "admin.section.platform": { en: "Platform", ar: "المنصة" },
  "admin.section.notifications": { en: "Notifications", ar: "الإشعارات" },
  "admin.section.integrations": { en: "Integrations", ar: "التكاملات" },
  "admin.section.security": { en: "Security", ar: "الأمان" },
  "admin.settings.platformConfig": {
    en: "Platform Configuration",
    ar: "تهيئة المنصة",
  },
  "admin.settings.aiDesc": {
    en: "Enable Groq-powered failure analysis for all client executions.",
    ar: "تفعيل تحليل الإخفاقات المدعوم من Groq لجميع عمليات تشغيل العملاء.",
  },
  "admin.settings.alertSystem": { en: "Alert System", ar: "نظام التنبيهات" },
  "admin.settings.alertSystemDesc": {
    en: "Enable platform-wide alerting for failed executions.",
    ar: "تفعيل التنبيهات على مستوى المنصة لعمليات التشغيل الفاشلة.",
  },
  "admin.settings.scheduler": { en: "Scheduler", ar: "المجدول" },
  "admin.settings.schedulerDesc": {
    en: "Allow scheduled test executions across all clients.",
    ar: "السماح بعمليات تنفيذ الاختبارات المجدولة عبر جميع العملاء.",
  },
  "admin.settings.maintenance": { en: "Maintenance Mode", ar: "وضع الصيانة" },
  "admin.settings.maintenanceDesc": {
    en: "Suspend all client executions while maintenance is in progress.",
    ar: "تعليق جميع عمليات تشغيل العملاء أثناء إجراء الصيانة.",
  },
  "admin.settings.regionDesc": {
    en: "Primary deployment region for the Assuredia platform.",
    ar: "منطقة النشر الأساسية لمنصة Assuredia.",
  },
  "admin.settings.defaultTimeout": {
    en: "Default Timeout",
    ar: "المهلة الافتراضية",
  },
  "admin.settings.defaultTimeoutDesc": {
    en: "Default execution timeout applied to all client runs.",
    ar: "مهلة التنفيذ الافتراضية المطبقة على جميع عمليات تشغيل العملاء.",
  },
  "admin.settings.notifConfig": {
    en: "Notification Settings",
    ar: "إعدادات الإشعارات",
  },
  "admin.settings.emailNotif": {
    en: "Email Notifications",
    ar: "إشعارات البريد الإلكتروني",
  },
  "admin.settings.emailNotifDesc": {
    en: "Send admin alert emails for critical platform events.",
    ar: "إرسال رسائل بريد إلكتروني للمسؤول عند الأحداث الحرجة في المنصة.",
  },
  "admin.settings.adminEmail": { en: "Admin Email", ar: "بريد المسؤول" },
  "admin.settings.adminEmailDesc": {
    en: "Email address for platform-level notifications.",
    ar: "عنوان البريد الإلكتروني لإشعارات مستوى المنصة.",
  },
  "admin.settings.slackNotif": {
    en: "Slack Notifications",
    ar: "إشعارات Slack",
  },
  "admin.settings.slackNotifDesc": {
    en: "Send platform alerts to a Slack channel.",
    ar: "إرسال تنبيهات المنصة إلى قناة Slack.",
  },
  "admin.settings.slackWebhook": {
    en: "Slack Webhook URL",
    ar: "رابط Slack Webhook",
  },
  "admin.settings.slackWebhookDesc": {
    en: "Incoming webhook URL for the target channel.",
    ar: "رابط webhook الوارد للقناة المستهدفة.",
  },
  "admin.settings.alertOnCritical": {
    en: "Alert on Critical",
    ar: "تنبيه عند الحرج",
  },
  "admin.settings.alertOnCriticalDesc": {
    en: "Send immediate notification for Critical severity events.",
    ar: "إرسال إشعار فوري للأحداث ذات الخطورة الحرجة.",
  },
  "admin.settings.dailyDigest": { en: "Daily digest", ar: "الملخص اليومي" },
  "admin.settings.dailyDigestDesc": {
    en: "Send a daily summary of platform activity to admins.",
    ar: "إرسال ملخص يومي بنشاط المنصة إلى المسؤولين.",
  },
  "admin.settings.groqDesc": {
    en: "AI provider for failure analysis. Currently active.",
    ar: "مزود الذكاء الاصطناعي لتحليل الإخفاقات. نشط حالياٌ.",
  },
  "admin.settings.aiModel": { en: "AI Model", ar: "نموذج الذكاء الاصطناعي" },
  "admin.settings.aiModelDesc": {
    en: "Groq model used for execution failure analysis.",
    ar: "نموذج Groq المستخدم لتحليل إخفاقات التنفيذ.",
  },
  "admin.settings.browserEngine": { en: "Browser Engine", ar: "محرك المتصفح" },
  "admin.settings.browserEngineDesc": {
    en: "Default browser engine for test execution.",
    ar: "محرك المتصفح الافتراضي لتنفيذ الاختبارات.",
  },
  "admin.settings.auditLog": { en: "Audit Log", ar: "سجل التدقيق" },
  "admin.settings.auditLogDesc": {
    en: "Record all admin actions and configuration changes.",
    ar: "تسجيل جميع إجراءات المسؤول وتغييرات التهيئة.",
  },
  "admin.settings.mfa": { en: "MFA Required", ar: "طلب التحقق متعدد العوامل" },
  "admin.settings.mfaDesc": {
    en: "Require multi-factor authentication for all admin users.",
    ar: "اشتراط التحقق متعدد العوامل لجميع مستخدمي المسؤول.",
  },
  "admin.settings.sessionTimeout": { en: "Session Timeout", ar: "مهلة الجلسة" },
  "admin.settings.sessionTimeoutDesc": {
    en: "Automatically sign out inactive admin sessions.",
    ar: "تسجيل خروج جلسات المسؤول غير النشطة تلقائيًا.",
  },
  "admin.settings.ipAllowlist": {
    en: "IP Allowlist",
    ar: "قائمة عناوين IP المسموح بها",
  },
  "admin.settings.ipAllowlistDesc": {
    en: "Restrict admin console access to specific IP ranges.",
    ar: "تقييد الوصول إلى وحدة تحكم المسؤول بنطاقات IP محددة.",
  },

  /* ---------- Admin console: create client ---------- */
  "admin.create.eyebrow": { en: "Client Management", ar: "إدارة العملاء" },
  "admin.create.title": { en: "Create Client", ar: "إنشاء عميل" },
  "admin.create.subtitle": {
    en: "Set up a new client environment and configure its testing defaults.",
    ar: "أنشئ بيئة عميل جديدة وهيّئ إعدادات الاختبار الافتراضية لها.",
  },
  "admin.create.step1": { en: "Client Information", ar: "معلومات العميل" },
  "admin.create.step1Desc": {
    en: "Name, ID, website",
    ar: "الاسم، المعرّف، الموقع",
  },
  "admin.create.step2": {
    en: "Runtime Configuration",
    ar: "تهيئة بيئة التشغيل",
  },
  "admin.create.step2Desc": {
    en: "Browser, device, timeouts",
    ar: "المتصفح، الجهاز، المهل",
  },
  "admin.create.step3": { en: "Application Access", ar: "الوصول إلى التطبيق" },
  "admin.create.step3Desc": {
    en: "Monitored app credentials",
    ar: "بيانات اعتماد التطبيق المراقب",
  },
  "admin.create.step4": { en: "Review & Create", ar: "المراجعة والإنشاء" },
  "admin.create.step4Desc": {
    en: "Confirm and create",
    ar: "التأكيد والإنشاء",
  },
  "admin.create.progress": { en: "Progress", ar: "التقدم" },
  "admin.create.soFar": {
    en: "Configuration so far",
    ar: "الإعدادات حتى الآن",
  },
  "admin.create.appUser": { en: "App user", ar: "مستخدم التطبيق" },
  "admin.create.s1Desc": {
    en: "Basic information about the client and their environment.",
    ar: "معلومات أساسية عن العميل وبيئته.",
  },
  "admin.create.clientName": { en: "Client Name", ar: "اسم العميل" },
  "admin.create.clientNameHint": {
    en: "The display name for this client workspace.",
    ar: "الاسم المعروض لمساحة عمل هذا العميل.",
  },
  "admin.create.clientId": { en: "Client Identifier", ar: "معرّف العميل" },
  "admin.create.clientIdHint": {
    en: "Lowercase slug used internally to identify this client. Auto-derived from the client name.",
    ar: "معرّف بأحرف صغيرة يُستخدم داخليًا لتحديد هذا العميل. يُشتق تلقائيًا من اسم العميل.",
  },
  "admin.create.websiteUrl": {
    en: "Website / Application URL",
    ar: "الموقع الإلكتروني / رابط التطبيق",
  },
  "admin.create.websiteHint": {
    en: "The base URL of the application being monitored.",
    ar: "الرابط الأساسي للتطبيق الذي تتم مراقبته.",
  },
  "admin.create.s2Desc": {
    en: "Define the default environment used when executing tests.",
    ar: "حدد البيئة الافتراضية المستخدمة عند تنفيذ الاختبارات.",
  },
  "admin.create.credTitle": {
    en: "Application credentials — not your Assuredia account",
    ar: "بيانات اعتماد التطبيق — وليست حساب Assuredia الخاص بك",
  },
  "admin.create.credNote": {
    en: "These credentials are used by Assuredia to authenticate with the monitored application. They are stored encrypted and never displayed after saving.",
    ar: "تُستخدم بيانات الاعتماد هذه من قبل Assuredia للمصادقة مع التطبيق المراقب. يتم تخزينها مشفرة ولا تُعرض أبدًا بعد الحفظ.",
  },
  "admin.create.s3Desc": {
    en: "Configure the credentials Assuredia will use to access the monitored application.",
    ar: "هيّئ بيانات الاعتماد التي ستستخدمها Assuredia للوصول إلى التطبيق المراقب.",
  },
  "admin.create.s4Desc": {
    en: "Review the configuration before creating this client environment.",
    ar: "راجع الإعدادات قبل إنشاء بيئة هذا العميل.",
  },
  "admin.create.notConfigured": { en: "Not configured", ar: "غير مهيأ" },
  "admin.create.showPassword": { en: "Show", ar: "إظهار" },
  "admin.create.hidePassword": { en: "Hide", ar: "إخفاء" },
  "admin.create.successTitle": {
    en: "Client created successfully",
    ar: "تم إنشاء العميل بنجاح",
  },
  "admin.create.successDesc": {
    en: "{name} is ready. Configure flows and schedules to start monitoring.",
    ar: "{name} جاهز. هيّئ التدفقات والجداول لبدء المراقبة.",
  },
  "admin.create.openClient": { en: "Open Client", ar: "فتح العميل" },
  "admin.create.nextFlows": {
    en: "Add flows to define test journeys",
    ar: "أضف تدفقات لتحديد مسارات الاختبار",
  },
  "admin.create.nextSchedules": {
    en: "Configure schedules to automate runs",
    ar: "هيّئ الجداول لأتمتة عمليات التشغيل",
  },
  "admin.create.creating": { en: "Creating client…", ar: "جارٍ إنشاء العميل…" },
  "admin.create.clientNameRequired": {
    en: "Client name is required.",
    ar: "اسم العميل مطلوب.",
  },
  "admin.create.clientIdRequired": {
    en: "Client identifier is required.",
    ar: "معرّف العميل مطلوب.",
  },
  "admin.create.websiteRequired": {
    en: "Website URL is required.",
    ar: "رابط الموقع مطلوب.",
  },

  /* ---------- Page chrome (Phase 9 language coverage) ---------- */
  "common.edit": { en: "Edit", ar: "تعديل" },
  "common.viewAll": { en: "View all", ar: "عرض الكل" },
  "common.workspace": { en: "Workspace", ar: "مساحة العمل" },
  "common.user": { en: "User", ar: "مستخدم" },
  "brand.tagline": { en: "Always On", ar: "دائماً في الخدمة" },
  "sidebar.planLabel": { en: "Enterprise · Prod", ar: "مؤسسات · بيئة الإنتاج" },
  "sidebar.open": { en: "Open sidebar", ar: "فتح الشريط الجانبي" },
  "sidebar.close": { en: "Close sidebar", ar: "إغلاق الشريط الجانبي" },
  "common.delete": { en: "Delete", ar: "حذف" },
  "common.pause": { en: "Pause", ar: "إيقاف مؤقت" },
  "common.resume": { en: "Resume", ar: "استئناف" },

  "page.dashboard.testHealth": { en: "Test Health", ar: "صحة الاختبارات" },
  "page.dashboard.testHealthDesc": {
    en: "Pass / fail distribution over time",
    ar: "توزيع النجاح / الإخفاق عبر الزمن",
  },
  /* Chart metric selector (Figma delta) — tokens stay English, labels translate. */
  "dashboard.metric.label": { en: "Metric:", ar: "المقياس:" },
  "dashboard.metric.passFail": { en: "Pass / Fail", ar: "الناجح / الفاشل" },
  "dashboard.metric.totalRuns": {
    en: "Total Runs",
    ar: "إجمالي عمليات التشغيل",
  },
  "dashboard.metric.successRate": { en: "Success Rate", ar: "معدل النجاح" },
  "dashboard.metric.duration": { en: "Duration", ar: "المدة" },
  "dashboard.metricDesc.totalRuns": {
    en: "Total executions per day",
    ar: "إجمالي عمليات التنفيذ لكل يوم",
  },
  "dashboard.metricDesc.successRate": {
    en: "Percentage of passing executions",
    ar: "نسبة عمليات التنفيذ الناجحة",
  },
  "dashboard.metricDesc.duration": {
    en: "Average execution duration per day",
    ar: "متوسط مدة التنفيذ لكل يوم",
  },
  "dashboard.metric.durationEmpty": {
    en: "No duration data yet",
    ar: "لا توجد بيانات مدة بعد",
  },
  "dashboard.metric.durationEmptyDesc": {
    en: "None of the executions in this period reported a duration.",
    ar: "لم تُسجَّل مدة لأي عملية تشغيل خلال هذه الفترة.",
  },
  "page.dashboard.recentRuns": {
    en: "Recent Runs",
    ar: "عمليات التشغيل الأخيرة",
  },
  "page.dashboard.recentRunsDesc": {
    en: "Latest flow executions across your workspace",
    ar: "أحدث عمليات تنفيذ التدفقات في مساحة عملك",
  },
  "page.dashboard.recentFailures": {
    en: "Recent Failures",
    ar: "الإخفاقات الأخيرة",
  },
  "page.dashboard.inspectRun": { en: "Inspect run", ar: "فحص العملية" },

  "page.flows.eyebrow": { en: "Flow Registry", ar: "سجل التدفقات" },
  "page.flows.title": { en: "Automation checkpoints", ar: "نقاط فحص الأتمتة" },
  "page.flows.subtitle": {
    en: "Run complete flows or choose individual tests to execute.",
    ar: "شغّل التدفقات كاملة أو اختر اختبارات فردية لتنفيذها.",
  },
  "page.flows.activeCount": {
    en: "{active} of {total} active",
    ar: "{active} من {total} نشطة",
  },
  "page.flows.addFlow": { en: "Add Flow", ar: "إضافة تدفق" },
  "page.flows.emptyTitle": {
    en: "No flows configured",
    ar: "لا توجد تدفقات مُهيأة",
  },
  "page.flows.emptyDesc": {
    en: "Add your first flow to make this client runnable.",
    ar: "أضف أول تدفق لجعل هذا العميل قابلاً للتشغيل.",
  },

  /* ---------- Flows page (cards, actions, toasts) ---------- */
  "flows.loadFailed": {
    en: "Unable to load flows right now.",
    ar: "تعذّر تحميل التدفقات الآن.",
  },
  "flows.testsLoadFailed": {
    en: "Unable to load tests.",
    ar: "تعذّر تحميل الاختبارات.",
  },
  "flows.testsUnavailable": {
    en: "Tests unavailable",
    ar: "الاختبارات غير متاحة",
  },
  "flows.viewInAutomations": {
    en: "View in Automations",
    ar: "عرض في الأتمتة",
  },
  "flows.nextRun": { en: "Next run: {time}", ar: "التشغيل التالي: {time}" },
  "flows.loadingTests": { en: "Loading tests…", ar: "جارٍ تحميل الاختبارات…" },
  "flows.noTestsYet": {
    en: "This flow has no tests yet. Use Edit to add tests.",
    ar: "لا يحتوي هذا التدفق على اختبارات بعد. استخدم التعديل لإضافة اختبارات.",
  },
  "flows.selectAll": { en: "Select all", ar: "تحديد الكل" },
  "flows.deselectAll": { en: "Deselect all", ar: "إلغاء تحديد الكل" },
  "flows.selectedCount": { en: "{count} selected", ar: "{count} محدد" },
  "flows.runFullFlow": { en: "Run full flow", ar: "تشغيل التدفق الكامل" },
  "flows.runSelected": {
    en: "Run Selected ({count})",
    ar: "تشغيل المحدد ({count})",
  },
  "flows.createdTitle": { en: "Flow created", ar: "تم إنشاء التدفق" },
  "flows.createdDesc": {
    en: "{name} is ready to run.",
    ar: "التدفق {name} جاهز للتشغيل.",
  },
  "flows.updatedDesc": {
    en: "{name} has been updated.",
    ar: "تم تحديث {name}.",
  },
  "flows.deletedTitle": { en: "Flow deleted", ar: "تم حذف التدفق" },
  "flows.deletedDesc": { en: "{name} was removed.", ar: "تمت إزالة {name}." },
  "flows.alreadyDeletedTitle": {
    en: "Flow already deleted",
    ar: "التدفق محذوف بالفعل",
  },
  "flows.alreadyDeletedDesc": {
    en: "{name} no longer exists.",
    ar: "التدفق {name} لم يعد موجوداً.",
  },
  "flows.deleteFailedTitle": {
    en: "Could not delete flow",
    ar: "تعذّر حذف التدفق",
  },
  "flows.noTestsSelectedTitle": {
    en: "No tests selected",
    ar: "لم يتم تحديد أي اختبار",
  },
  "flows.noTestsSelectedDesc": {
    en: "Select at least one test to run, or use Run full flow.",
    ar: "حدد اختباراً واحداً على الأقل للتشغيل، أو استخدم تشغيل التدفق الكامل.",
  },
  "flows.testsLoadFailedTitle": {
    en: "Could not load the flow's tests",
    ar: "تعذّر تحميل اختبارات التدفق",
  },
  "flows.tryAgain": { en: "Please try again.", ar: "يرجى المحاولة مرة أخرى." },
  "flows.runInProgressTitle": {
    en: "Run already in progress",
    ar: "يوجد تشغيل قيد التنفيذ بالفعل",
  },
  "flows.runInProgressDesc": {
    en: "Another run is already in progress for this client.",
    ar: "يوجد تشغيل آخر قيد التنفيذ لهذا العميل.",
  },
  "flows.runStartFailedTitle": {
    en: "Could not start the run",
    ar: "تعذّر بدء التشغيل",
  },
  "flows.deleteModalTitle": { en: "Delete flow", ar: "حذف التدفق" },
  "flows.deleteModalDesc": {
    en: '"{name}" and its tests will be removed from this client.',
    ar: "ستتم إزالة «{name}» واختباراته من هذا العميل.",
  },
  "flows.deleting": { en: "Deleting…", ar: "جارٍ الحذف…" },
  "flows.deleteFlow": { en: "Delete Flow", ar: "حذف التدفق" },
  "flows.requestNewFlow": { en: "Request New Flow", ar: "طلب تدفق جديد" },
  "flows.requestChange": { en: "Request Change", ar: "طلب تعديل" },
  "flows.requestDeleteShort": { en: "Request Deletion", ar: "طلب حذف" },
  "flows.requestDeletion": { en: "Request Deletion", ar: "طلب الحذف" },
  "flows.requesting": { en: "Submitting…", ar: "جارٍ الإرسال…" },
  "flows.deleteRequestModalTitle": {
    en: "Request flow deletion",
    ar: "طلب حذف التدفق",
  },
  "flows.deleteRequestModalDesc": {
    en: '"{name}" will NOT be deleted immediately. A deletion request will be submitted for administrator review first.',
    ar: "لن يتم حذف «{name}» فوراً. سيتم إرسال طلب حذف لمراجعة المسؤول أولاً.",
  },
  "flows.requestDeleteDefaultReason": {
    en: "Requested from the Flows page",
    ar: "طلب من صفحة التدفقات",
  },
  "flows.deleteRequestedTitle": {
    en: "Deletion request submitted",
    ar: "تم إرسال طلب الحذف",
  },
  "flows.deleteRequestedDesc": {
    en: '"{name}" will be removed only after an administrator approves the request.',
    ar: "ستتم إزالة «{name}» فقط بعد موافقة المسؤول على الطلب.",
  },
  "flows.deleteRequestFailedTitle": {
    en: "Could not submit the request",
    ar: "تعذّر إرسال الطلب",
  },
  "flows.noClientDesc": {
    en: "This account is not linked to a client environment. Contact your administrator.",
    ar: "هذا الحساب غير مرتبط ببيئة عميل. تواصل مع المسؤول.",
  },

  /* ---------- Requests (Asset Requests) ---------- */
  "requests.eyebrow": { en: "Change Management", ar: "إدارة التغييرات" },
  "requests.title": { en: "Requests", ar: "الطلبات" },
  "requests.subtitle": {
    en: "Manage and track your requests for Flow and Test changes.",
    ar: "إدارة ومتابعة طلباتك لتغييرات التدفقات والاختبارات.",
  },
  "requests.newRequest": { en: "New Request", ar: "طلب جديد" },
  "requests.createRequest": { en: "Create Request", ar: "إنشاء طلب" },
  "requests.backToList": { en: "Back to Requests", ar: "العودة إلى الطلبات" },
  "requests.pendingBanner": {
    en: "{count} request(s) pending administrator review.",
    ar: "{count} طلبات في انتظار مراجعة المسؤول.",
  },
  "requests.emptyTitle": { en: "No requests yet", ar: "لا توجد طلبات بعد" },
  "requests.emptyDesc": {
    en: "Requests for new flows, tests, and changes are reviewed by the Assuredia team before they are applied. Create your first request to get started.",
    ar: "تخضع طلبات التدفقات والاختبارات والتغييرات الجديدة لمراجعة فريق Assuredia قبل تطبيقها. أنشئ طلبك الأول للبدء.",
  },
  "requests.noMatchTitle": {
    en: "No requests match this filter",
    ar: "لا توجد طلبات تطابق هذا التصفية",
  },
  "requests.loadFailedTitle": {
    en: "Could not load requests",
    ar: "تعذّر تحميل الطلبات",
  },

  "requests.filter.all": { en: "All", ar: "الكل" },
  "requests.filter.viewAll": { en: "View all", ar: "عرض الكل" },
  "requests.col.target": { en: "Request / Target", ar: "الطلب / الهدف" },
  "requests.col.type": { en: "Type", ar: "النوع" },
  "requests.col.status": { en: "Status", ar: "الحالة" },
  "requests.col.description": { en: "Description", ar: "الوصف" },
  "requests.col.submitted": { en: "Submitted", ar: "تاريخ التقديم" },
  "requests.col.action": { en: "Action", ar: "إجراء" },

  "requests.type.addFlow": { en: "Add Flow", ar: "إضافة تدفق" },
  "requests.type.modifyFlow": { en: "Modify Flow", ar: "تعديل تدفق" },
  "requests.type.addTest": { en: "Add Test", ar: "إضافة اختبار" },
  "requests.type.modifyTest": { en: "Modify Test", ar: "تعديل اختبار" },
  "requests.type.deleteFlow": { en: "Delete Flow", ar: "حذف تدفق" },
  "requests.type.deleteTest": { en: "Delete Test", ar: "حذف اختبار" },

  "requests.typeDesc.addFlow": {
    en: "Request a new automation flow",
    ar: "طلب تدفق أتمتة جديد",
  },
  "requests.typeDesc.modifyFlow": {
    en: "Request changes to an existing flow",
    ar: "طلب تعديلات على تدفق موجود",
  },
  "requests.typeDesc.addTest": {
    en: "Request a new test within a flow",
    ar: "طلب اختبار جديد داخل تدفق",
  },
  "requests.typeDesc.modifyTest": {
    en: "Request changes to an existing test",
    ar: "طلب تعديلات على اختبار موجود",
  },
  "requests.typeDesc.deleteFlow": {
    en: "Request removal of a flow",
    ar: "طلب إزالة تدفق",
  },
  "requests.typeDesc.deleteTest": {
    en: "Request removal of a test",
    ar: "طلب إزالة اختبار",
  },

  "requests.status.pending": { en: "Pending", ar: "قيد الانتظار" },
  "requests.status.approved": { en: "Approved", ar: "تمت الموافقة" },
  "requests.status.rejected": { en: "Rejected", ar: "مرفوض" },
  "requests.status.implemented": { en: "Implemented", ar: "تم التنفيذ" },
  "requests.status.cancelled": { en: "Cancelled", ar: "ملغى" },

  "requests.detail.submittedAt": {
    en: "Submitted {time}",
    ar: "تم التقديم {time}",
  },
  "requests.detail.updatedAt": { en: "Updated {time}", ar: "آخر تحديث {time}" },
  "requests.detail.target": { en: "Target", ar: "الهدف" },
  "requests.detail.flow": { en: "Flow", ar: "التدفق" },
  "requests.detail.test": { en: "Test", ar: "الاختبار" },
  "requests.detail.requestedTests": {
    en: "Requested Tests ({count})",
    ar: "الاختبارات المطلوبة ({count})",
  },
  "requests.detail.description": { en: "Description", ar: "الوصف" },
  "requests.detail.expectedBehavior": {
    en: "Expected Behavior",
    ar: "السلوك المتوقع",
  },
  "requests.detail.steps": { en: "Steps", ar: "الخطوات" },
  "requests.detail.reason": { en: "Reason for Change", ar: "سبب التغيير" },
  "requests.detail.adminNotes": { en: "Reviewer Notes", ar: "ملاحظات المراجع" },
  "requests.detail.timeline": {
    en: "Status Timeline",
    ar: "الخط الزمني للحالة",
  },
  "requests.detail.info": { en: "Request Info", ar: "معلومات الطلب" },
  "requests.detail.requestId": { en: "Request ID", ar: "معرّف الطلب" },
  "requests.detail.typeLabel": { en: "Type", ar: "النوع" },
  "requests.detail.submittedLabel": { en: "Submitted", ar: "تاريخ التقديم" },
  "requests.detail.updatedLabel": { en: "Last updated", ar: "آخر تحديث" },
  "requests.detail.reviewedLabel": { en: "Reviewed", ar: "تاريخ المراجعة" },
  "requests.detail.implementedLabel": {
    en: "Implemented",
    ar: "تاريخ التنفيذ",
  },

  "requests.timeline.submitted": { en: "Submitted", ar: "تم التقديم" },
  "requests.timeline.approved": { en: "Approved", ar: "الموافقة" },
  "requests.timeline.implemented": { en: "Implemented", ar: "التنفيذ" },

  "requests.cancel.button": { en: "Cancel Request", ar: "إلغاء الطلب" },
  "requests.cancel.successTitle": {
    en: "Request cancelled",
    ar: "تم إلغاء الطلب",
  },
  "requests.cancel.successDesc": {
    en: "Request #{id} has been cancelled.",
    ar: "تم إلغاء الطلب رقم {id}.",
  },
  "requests.cancel.conflictTitle": {
    en: "Request is no longer pending",
    ar: "الطلب لم يعد قيد الانتظار",
  },
  "requests.cancel.conflictDesc": {
    en: "The request was updated by a reviewer. The list now shows its current status.",
    ar: "تم تحديث الطلب بواسطة المراجع. تعرض القائمة الآن حالته الحالية.",
  },
  "requests.cancel.failedTitle": {
    en: "Could not cancel the request",
    ar: "تعذّر إلغاء الطلب",
  },

  "requests.form.selectType": {
    en: "Select the type of change you need.",
    ar: "اختر نوع التغيير الذي تحتاجه.",
  },
  "requests.form.changeType": { en: "Change type", ar: "تغيير النوع" },
  "requests.form.flowName": { en: "Flow Name", ar: "اسم التدفق" },
  "requests.form.flowNamePlaceholder": {
    en: "e.g. Password Reset",
    ar: "مثال: إعادة تعيين كلمة المرور",
  },
  "requests.form.flowDescPlaceholder": {
    en: "Describe what this flow should accomplish…",
    ar: "صف ما يجب أن يحققه هذا التدفق…",
  },
  "requests.form.description": { en: "Description", ar: "الوصف" },
  "requests.form.changeDescPlaceholder": {
    en: "Describe what this change should accomplish…",
    ar: "صف ما يجب أن يحققه هذا التغيير…",
  },
  "requests.form.expectedPlaceholder": {
    en: "What should pass after this change is implemented?",
    ar: "ما الذي يجب أن ينجح بعد تنفيذ هذا التغيير؟",
  },
  "requests.form.reason": { en: "Reason for Change", ar: "سبب التغيير" },
  "requests.form.reasonPlaceholder": {
    en: "Why is this change needed?",
    ar: "لماذا هذا التغيير مطلوب؟",
  },
  "requests.form.selectFlow": { en: "Flow", ar: "التدفق" },
  "requests.form.flowPlaceholder": { en: "Select a flow…", ar: "اختر تدفقاً…" },
  "requests.form.selectTest": { en: "Test", ar: "الاختبار" },
  "requests.form.testPlaceholder": {
    en: "Select a test…",
    ar: "اختر اختباراً…",
  },
  "requests.form.testName": {
    en: "Test Name / Purpose",
    ar: "اسم الاختبار / الغرض",
  },
  "requests.form.testNamePlaceholder": {
    en: "e.g. testValidPasswordReset",
    ar: "مثال: testValidPasswordReset",
  },
  "requests.form.testDescPlaceholder": {
    en: "Describe what this test should verify…",
    ar: "صف ما يجب أن يتحقق منه هذا الاختبار…",
  },
  "requests.form.addStep": { en: "Add Step", ar: "إضافة خطوة" },
  "requests.form.removeStep": { en: "Remove step", ar: "إزالة الخطوة" },
  "requests.form.stepPlaceholder": { en: "Step {n}", ar: "الخطوة {n}" },
  "requests.form.testsN": { en: "Tests ({count})", ar: "الاختبارات ({count})" },
  "requests.form.testN": { en: "Test {n}", ar: "الاختبار {n}" },
  "requests.form.addTest": { en: "Add Test", ar: "إضافة اختبار" },
  "requests.form.removeTest": { en: "Remove Test", ar: "إزالة الاختبار" },
  "requests.form.deleteWarning": {
    en: "This request requires administrator review before any asset is removed. Nothing is deleted immediately.",
    ar: "يتطلب هذا الطلب مراجعة المسؤول قبل إزالة أي عنصر. لا يتم حذف أي شيء فوراً.",
  },
  "requests.form.submit": { en: "Submit Request", ar: "إرسال الطلب" },
  "requests.form.testsLoadFailed": {
    en: "Could not load the tests of this flow.",
    ar: "تعذّر تحميل اختبارات هذا التدفق.",
  },

  "requests.submit.successTitle": {
    en: "Request submitted",
    ar: "تم إرسال الطلب",
  },
  "requests.submit.successDesc": {
    en: "Your request is now pending administrator review.",
    ar: "طلبك الآن في انتظار مراجعة المسؤول.",
  },
  "requests.submit.conflictTitle": {
    en: "Request rejected by the server",
    ar: "تم رفض الطلب من الخادم",
  },
  "requests.submit.failedTitle": {
    en: "Could not submit the request",
    ar: "تعذّر إرسال الطلب",
  },

  "requests.validation.title": {
    en: "Please complete the form",
    ar: "يرجى إكمال النموذج",
  },
  "requests.validation.flowName": {
    en: "Enter a flow name.",
    ar: "أدخل اسم التدفق.",
  },
  "requests.validation.flowRequired": {
    en: "Select a flow.",
    ar: "اختر تدفقاً.",
  },
  "requests.validation.testRequired": {
    en: "Select a test.",
    ar: "اختر اختباراً.",
  },
  "requests.validation.testNameRequired": {
    en: "Enter a test name.",
    ar: "أدخل اسم الاختبار.",
  },
  "requests.validation.testsRequired": {
    en: "Add at least one test with a name and one step.",
    ar: "أضف اختباراً واحداً على الأقل مع اسم وخطوة واحدة.",
  },
  "requests.validation.testIncomplete": {
    en: "Every test needs a name and at least one step.",
    ar: "كل اختبار يحتاج إلى اسم وخطوة واحدة على الأقل.",
  },
  "requests.validation.duplicateTest": {
    en: "Two tests share the same name — test names must be unique within the flow.",
    ar: "هناك اختباران بنفس الاسم — يجب أن تكون أسماء الاختبارات فريدة داخل التدفق.",
  },
  "requests.validation.stepsRequired": {
    en: "Add at least one step.",
    ar: "أضف خطوة واحدة على الأقل.",
  },
  "requests.validation.reasonRequired": {
    en: "Explain the reason for this change.",
    ar: "اشرح سبب هذا التغيير.",
  },

  /* ---------- Flow create/edit form ---------- */
  "flowform.eyebrow": { en: "Flow Management", ar: "إدارة التدفقات" },
  "flowform.editTitle": { en: "Edit Flow", ar: "تعديل التدفق" },
  "flowform.createTitle": { en: "Create Flow", ar: "إنشاء تدفق" },
  "flowform.subtitle": {
    en: "Define a customer journey and the tests Assuredia will execute.",
    ar: "حدّد رحلة العميل والاختبارات التي ستنفّذها Assuredia.",
  },
  "flowform.backToFlows": { en: "Back to Flows", ar: "العودة إلى التدفقات" },
  "flowform.infoTitle": { en: "Flow Information", ar: "معلومات التدفق" },
  "flowform.infoDesc": {
    en: "Basic information about this flow.",
    ar: "معلومات أساسية عن هذا التدفق.",
  },
  "flowform.nameLabel": { en: "Flow Name", ar: "اسم التدفق" },
  "flowform.namePlaceholder": { en: "Login Flow", ar: "تدفق تسجيل الدخول" },
  "flowform.nameEditHint": {
    en: "The flow name cannot be renamed.",
    ar: "لا يمكن تغيير اسم التدفق.",
  },
  "flowform.nameHint": {
    en: "A descriptive name for this test journey.",
    ar: "اسم وصفي لرحلة الاختبار هذه.",
  },
  "flowform.descLabel": { en: "Description", ar: "الوصف" },
  "flowform.descPlaceholder": {
    en: "Describe the customer journey this flow covers…",
    ar: "صف رحلة العميل التي يغطيها هذا التدفق…",
  },
  "flowform.flowId": { en: "Flow ID", ar: "معرّف التدفق" },
  "flowform.testsTitle": { en: "Tests", ar: "الاختبارات" },
  "flowform.testsDesc": {
    en: "Add the tests that belong to this flow.",
    ar: "أضف الاختبارات التي تنتمي إلى هذا التدفق.",
  },
  "flowform.noTestsTitle": {
    en: "No tests added yet",
    ar: "لم تُضف أي اختبارات بعد",
  },
  "flowform.noTestsDesc": {
    en: "Select from the test pool or create a new test below.",
    ar: "اختر من مجمّع الاختبارات أو أنشئ اختباراً جديداً أدناه.",
  },
  "flowform.addTest": { en: "Add Test", ar: "إضافة اختبار" },
  "flowform.nameRequired": {
    en: "Flow name is required.",
    ar: "اسم التدفق مطلوب.",
  },
  "flowform.saveFailedEdit": {
    en: "Could not save changes",
    ar: "تعذّر حفظ التغييرات",
  },
  "flowform.saveFailedCreate": {
    en: "Could not create flow",
    ar: "تعذّر إنشاء التدفق",
  },
  "flowform.saving": { en: "Saving…", ar: "جارٍ الحفظ…" },
  "flowform.selectFromPool": { en: "Select from pool", ar: "اختيار من المجمّع" },
  "flowform.createManually": { en: "Create manually", ar: "إنشاء يدوياً" },
  "flowform.searchTests": {
    en: "Search tests by name or class…",
    ar: "ابحث عن الاختبارات بالاسم أو الفئة…",
  },
  "flowform.noMatchingTests": {
    en: "No tests match your search.",
    ar: "لا توجد اختبارات تطابق بحثك.",
  },
  "flowform.poolEmpty": {
    en: "No selectable tests are available for this client. Use the “Create manually” tab to add one.",
    ar: "لا تتوفر اختبارات قابلة للاختيار لهذا العميل. استخدم تبويب «إنشاء يدوياً» لإضافة اختبار.",
  },
  "flowform.clear": { en: "Clear", ar: "مسح التحديد" },
  "flowform.addTests": { en: "Add tests", ar: "إضافة اختبارات" },
  "flowform.addSelected": {
    en: "Add {count} tests",
    ar: "إضافة {count} من الاختبارات",
  },
  "flowform.testNameLabel": { en: "Test Name", ar: "اسم الاختبار" },
  "flowform.testSuiteLabel": {
    en: "Test Class / Suite",
    ar: "فئة / مجموعة الاختبار",
  },
  "flowform.testDescPlaceholder": {
    en: "What does this test verify?",
    ar: "ما الذي يتحقق منه هذا الاختبار؟",
  },
  "flowform.testExpectedLabel": {
    en: "Expected Result",
    ar: "النتيجة المتوقعة",
  },
  "flowform.testExpectedPlaceholder": {
    en: "What should happen when this test passes?",
    ar: "ما الذي يجب أن يحدث عند نجاح هذا الاختبار؟",
  },
  "flowform.testNameRequired": {
    en: "Test name is required.",
    ar: "اسم الاختبار مطلوب.",
  },
  "flowform.testSuiteRequired": {
    en: "Test class / suite is required.",
    ar: "فئة / مجموعة الاختبار مطلوبة.",
  },
  "flowform.testNameExists": {
    en: "A test with this name already exists in the flow.",
    ar: "يوجد بالفعل اختبار بهذا الاسم في التدفق.",
  },
  "flowform.editTest": { en: "Edit test", ar: "تعديل الاختبار" },
  "flowform.removeTest": { en: "Remove test", ar: "إزالة الاختبار" },
  "flowform.summaryTitle": { en: "Flow Summary", ar: "ملخص التدفق" },
  "flowform.untitledFlow": { en: "Untitled Flow", ar: "تدفق بدون اسم" },
  "flowform.suitesStat": { en: "Suites", ar: "المجموعات" },
  "flowform.ready": { en: "Ready", ar: "جاهز" },
  "flowform.noTests": { en: "No tests", ar: "لا توجد اختبارات" },
  "flowform.testSuites": { en: "Test Suites", ar: "مجموعات الاختبارات" },
  "flowform.summaryEmpty": {
    en: 'No tests added yet. Use "Add Test" below to get started.',
    ar: "لم تُضف أي اختبارات بعد. استخدم «إضافة اختبار» أدناه للبدء.",
  },
  "flowform.successEditTitle": { en: "Changes saved", ar: "تم حفظ التغييرات" },
  "flowform.successCreateTitle": {
    en: "Flow created successfully",
    ar: "تم إنشاء التدفق بنجاح",
  },
  "flowform.successEditSuffix": { en: "has been updated.", ar: "تم تحديثه." },
  "flowform.successCreateSuffix": {
    en: "is ready to run. Configure a schedule to automate execution.",
    ar: "جاهز للتشغيل. قم بتهيئة جدول زمني لأتمتة التنفيذ.",
  },
  "flowform.openFlow": { en: "Open Flow", ar: "فتح التدفق" },

  "page.automations.title": { en: "Automations", ar: "الأتمتة" },
  "page.automations.subtitle": {
    en: "Run your flows manually or on a schedule.",
    ar: "شغّل تدفقاتك يدوياً أو وفق جدول زمني.",
  },
  "page.automations.create": { en: "Create Automation", ar: "إنشاء أتمتة" },
  "page.automations.back": {
    en: "Back to Automations",
    ar: "العودة إلى الأتمتة",
  },
  "page.automations.runNow": { en: "Run Now", ar: "تشغيل الآن" },
  "page.automations.starting": { en: "Starting…", ar: "جارٍ البدء…" },
  "page.automations.editSchedule": { en: "Edit Schedule", ar: "تعديل الجدول" },

  "page.runHistory.eyebrow": { en: "Execution History", ar: "سجل التنفيذ" },
  "page.runHistory.title": { en: "Run History", ar: "سجل التشغيل" },
  "page.runHistory.subtitle": {
    en: "Review test executions, results, failures, and execution details.",
    ar: "راجع عمليات تنفيذ الاختبارات والنتائج والإخفاقات وتفاصيل التنفيذ.",
  },
  "page.runHistory.loadError": {
    en: "Could not load run history",
    ar: "تعذّر تحميل سجل التشغيل",
  },
  "page.runHistory.emptyTitle": {
    en: "No runs yet",
    ar: "لا توجد عمليات تشغيل بعد",
  },
  "page.runHistory.emptyDesc": {
    en: "Your test executions will appear here.",
    ar: "ستظهر عمليات تنفيذ اختباراتك هنا.",
  },
  "page.runHistory.goToFlows": {
    en: "Go to Flows",
    ar: "الانتقال إلى التدفقات",
  },

  /* ---------- Run History screen ---------- */
  "history.viewLive": { en: "View Live", ar: "عرض مباشر" },
  "history.packageBadge": { en: "Package", ar: "حزمة" },
  "history.time.allTime": { en: "All time", ar: "كل الوقت" },
  "history.time.last7": { en: "Last 7 days", ar: "آخر 7 أيام" },
  "history.time.last30": { en: "Last 30 days", ar: "آخر 30 يوماً" },
  "history.time.custom": { en: "Custom range", ar: "نطاق مخصص" },
  "history.triggerAll": { en: "All triggers", ar: "كل طرق التشغيل" },
  "history.flowAll": { en: "All flows", ar: "كل التدفقات" },
  "history.testAll": { en: "All tests", ar: "كل الاختبارات" },
  "history.testLabel": { en: "Test", ar: "الاختبار" },
  "history.totalRuns": { en: "Total Runs", ar: "إجمالي عمليات التشغيل" },
  "history.successRate": { en: "Success Rate", ar: "معدل النجاح" },
  "history.testOrTests": { en: "Test / Tests", ar: "الاختبار / الاختبارات" },
  "history.started": { en: "Started", ar: "وقت البدء" },
  "history.result": { en: "Result", ar: "النتيجة" },
  "history.noMatch": {
    en: "No runs match these filters",
    ar: "لا توجد عمليات تشغيل تطابق عوامل التصفية هذه",
  },
  "history.noMatchDesc": {
    en: "Try widening the filters above.",
    ar: "جرّب توسيع عوامل التصفية أعلاه.",
  },
  "history.exportCsv": { en: "Export CSV", ar: "تصدير CSV" },
  "history.exportEmpty": {
    en: "Nothing to export yet.",
    ar: "لا يوجد ما يمكن تصديره بعد.",
  },
  "history.exportDone": {
    en: "Exported {count} runs.",
    ar: "تم تصدير {count} عملية تشغيل.",
  },
  "history.capNote": {
    en: "Showing the {limit} most recent runs for the current filters. The history endpoint returns at most {limit} rows per request and has no page or cursor support — narrow the time range to reach older runs.",
    ar: "يتم عرض أحدث {limit} عملية تشغيل وفق عوامل التصفية الحالية. لا تُرجع واجهة السجل أكثر من {limit} صف لكل طلب ولا تدعم الترقيم بين الصفحات — ضيّق النطاق الزمني للوصول إلى عمليات أقدم.",
  },
  "history.rangeInvalid": {
    en: 'The "from" date must be before the "to" date.',
    ar: "يجب أن يسبق تاريخ «من» تاريخ «إلى».",
  },
  "history.to": { en: "to", ar: "إلى" },
  "history.fromDate": { en: "From date", ar: "من تاريخ" },
  "history.toDate": { en: "To date", ar: "إلى تاريخ" },
  "history.runNotFound": {
    en: "Run not found",
    ar: "لم يتم العثور على عملية التشغيل",
  },
  "history.runNotFoundDesc": {
    en: "This run is no longer available in Run History.",
    ar: "لم تعد عملية التشغيل هذه متاحة في سجل التشغيل.",
  },
  "history.openRunFailed": {
    en: "Could not open the run",
    ar: "تعذّر فتح عملية التشغيل",
  },
  "history.backToHistory": {
    en: "Back to Run History",
    ar: "العودة إلى سجل التشغيل",
  },
  "history.runUnavailable": {
    en: "Run unavailable",
    ar: "عملية التشغيل غير متاحة",
  },

  "page.alerts.eyebrow": { en: "Monitoring", ar: "المراقبة" },
  "page.alerts.title": { en: "Alerts", ar: "التنبيهات" },
  "page.alerts.subtitle": {
    en: "Review failure alerts from your monitored test executions.",
    ar: "راجع تنبيهات الإخفاق من عمليات تنفيذ اختباراتك المُراقَبة.",
  },
  "page.alerts.markAllRead": {
    en: "Mark all as read",
    ar: "تعليم الكل كمقروء",
  },
  "page.alerts.emptyTitle": { en: "No alerts yet", ar: "لا توجد تنبيهات بعد" },
  "page.alerts.emptyDesc": {
    en: "When a monitored test fails, an alert will appear here.",
    ar: "عند إخفاق اختبار مُراقَب، سيظهر تنبيه هنا.",
  },
  "page.alerts.loadError": {
    en: "Could not load alerts",
    ar: "تعذّر تحميل التنبيهات",
  },

  /* ---------- Alerts screen ---------- */
  "alerts.testFailed": { en: "Test Failed", ar: "فشل اختبار" },
  "alerts.runFailed": { en: "Run Failed", ar: "فشل تشغيل" },
  "alerts.unread": { en: "Unread", ar: "غير مقروء" },
  "alerts.read": { en: "Read", ar: "مقروء" },
  "alerts.failures": { en: "Failures", ar: "الإخفاقات" },
  "alerts.critical": { en: "Critical", ar: "حرجة" },
  "alerts.range.last24": { en: "Last 24 hours", ar: "آخر 24 ساعة" },
  "alerts.range.allTime": { en: "All time", ar: "كل الوقت" },
  "alerts.hiddenUnread": {
    en: "{count} unread alerts are outside the current time filter.",
    ar: "{count} تنبيهًا غير مقروء خارج نطاق الوقت الحالي.",
  },
  "alerts.showAllTime": { en: "Show all alerts", ar: "عرض كل التنبيهات" },
  "alerts.clientFallback": { en: "Client {id}", ar: "العميل {id}" },
  "alerts.allClients": { en: "All clients", ar: "كل العملاء" },
  "alerts.goneTitle": {
    en: "Alert no longer available",
    ar: "التنبيه لم يعد متاحاً",
  },
  "alerts.goneDesc": {
    en: "It may have been removed. The list will refresh.",
    ar: "ربما تمت إزالته. سيتم تحديث القائمة.",
  },
  "alerts.markReadFailedTitle": {
    en: "Could not mark the alert as read",
    ar: "تعذّر تعليم التنبيه كمقروء",
  },
  "alerts.resolvedTitle": {
    en: "Alert marked as resolved",
    ar: "تم تعليم التنبيه على أنه محلول",
  },
  "alerts.resolvedDesc": {
    en: "The execution stays FAILED — only the alert state changed to RESOLVED.",
    ar: "يبقى التنفيذ بحالة فشل — تغيرت حالة التنبيه فقط إلى «تم الحل».",
  },
  "alerts.resolveFailedTitle": {
    en: "Unable to resolve alert",
    ar: "تعذّر حل التنبيه",
  },
  "alerts.allReadTitle": {
    en: "All alerts marked as read",
    ar: "تم تعليم جميع التنبيهات كمقروءة",
  },
  "alerts.markAllReadFailedTitle": {
    en: "Could not mark alerts as read",
    ar: "تعذّر تعليم التنبيهات كمقروءة",
  },
  "alerts.you": { en: "You", ar: "أنت" },
  "alerts.userFallback": { en: "User #{id}", ar: "المستخدم #{id}" },
  "alerts.executionTime": { en: "Execution time", ar: "وقت التنفيذ" },
  "alerts.manuallyResolved": { en: "Manually resolved", ar: "تم الحل يدوياً" },
  "alerts.resolvedBy": { en: "Resolved by", ar: "تم الحل بواسطة" },
  "alerts.resolvedAt": { en: "Resolved at", ar: "وقت الحل" },
  "alerts.failureReason": { en: "Failure reason", ar: "سبب الإخفاق" },
  "alerts.policyNote": {
    en: "A notification for this failure is sent according to this client's Notification Policy.",
    ar: "يُرسل إشعار لهذا الإخفاق وفقا لسياسة الإشعارات الخاصة بهذا العميل.",
  },
  "alerts.noFailureDetails": {
    en: "No failure details were recorded.",
    ar: "لم يتم تسجيل تفاصيل الإخفاق.",
  },
  "alerts.openRun": { en: "Open Run", ar: "فتح التشغيل" },
  "alerts.markResolved": { en: "Mark as Resolved", ar: "تعليم كمحلول" },
  "alerts.markRead": { en: "Mark as Read", ar: "تعليم كمقروء" },
  "alerts.noMatch": {
    en: "No alerts match these filters",
    ar: "لا توجد تنبيهات تطابق عوامل التصفية هذه",
  },
  "alerts.resolveModalTitle": {
    en: "Mark alert as resolved?",
    ar: "تعليم التنبيه كمحلول؟",
  },
  "alerts.resolveModalDesc": {
    en: "Confirm that the underlying issue has been fixed.",
    ar: "أكّد أنه تم إصلاح المشكلة الأساسية.",
  },
  "alerts.resolveModalRemain": {
    en: "The execution result will remain",
    ar: "ستبقى نتيجة التنفيذ بحالة",
  },
  "alerts.resolveModalOnly": {
    en: "— only the alert state will be updated to",
    ar: "— سيتم تحديث حالة التنبيه فقط إلى",
  },
  "alerts.resolveModalNote": {
    en: "This indicates the underlying issue has been manually confirmed as fixed.",
    ar: "يشير هذا إلى أنه تم التأكد يدوياً من إصلاح المشكلة الأساسية.",
  },

  "page.ai.eyebrow": {
    en: "AI Reliability Intelligence",
    ar: "تحليلات الموثوقية بالذكاء الاصطناعي",
  },
  "page.ai.back": {
    en: "Back to AI Analysis",
    ar: "العودة إلى تحليل الذكاء الاصطناعي",
  },
  "admin.ai.empty": {
    en: "No AI analyses recorded yet",
    ar: "لا توجد تحليلات ذكاء اصطناعي مسجلة بعد",
  },
  "admin.ai.backToList": {
    en: "Back to AI Analysis",
    ar: "العودة إلى تحليل الذكاء الاصطناعي",
  },
  "page.ai.tagline": {
    en: "Interpretation layer over execution data",
    ar: "طبقة تفسير فوق بيانات التنفيذ",
  },
  "page.ai.packageExecution": { en: "Package execution", ar: "تنفيذ الحزمة" },
  "page.ai.executionSummary": { en: "Execution summary", ar: "ملخص التنفيذ" },

  /* ---------- AI Analysis page + AI card ---------- */
  "ai.listEyebrow": { en: "Intelligence", ar: "التحليل الذكي" },
  "ai.listTitle": { en: "AI Analysis", ar: "تحليل الذكاء الاصطناعي" },
  "ai.listSubtitle": {
    en: "Understand failures faster with AI-powered execution analysis.",
    ar: "افهم الإخفاقات بشكل أسرع مع تحليل التنفيذ بالذكاء الاصطناعي.",
  },
  "ai.refresh": { en: "Refresh", ar: "تحديث" },
  "ai.analyses": { en: "Analyses", ar: "التحليلات" },
  "ai.criticalIssues": { en: "Critical Issues", ar: "مشاكل حرجة" },
  "ai.highRisk": { en: "High Risk", ar: "خطورة مرتفعة" },
  "ai.recentFailures": { en: "Recent Failures", ar: "الإخفاقات الأخيرة" },
  "ai.riskLabel": { en: "Risk", ar: "الخطورة" },
  "ai.reliability": { en: "Reliability", ar: "درجة الموثوقية" },
  "ai.trendLabel": { en: "Trend", ar: "الاتجاه" },
  "ai.analyzed": { en: "Analyzed", ar: "تاريخ التحليل" },
  "ai.flowOrExecution": { en: "Flow / Execution", ar: "التدفق / التنفيذ" },
  "ai.viewAnalysis": { en: "View Analysis", ar: "عرض التحليل" },
  "ai.viewRunHistory": { en: "View Run History", ar: "عرض سجل التشغيل" },
  "ai.emptyTitle": {
    en: "No AI analyses yet",
    ar: "لا توجد تحليلات ذكاء اصطناعي بعد",
  },
  "ai.emptyDesc": {
    en: "Analyses appear here once your runs have been analyzed by the AI engine.",
    ar: "ستظهر التحليلات هنا بعد تحليل عمليات التشغيل بواسطة محرك الذكاء الاصطناعي.",
  },
  "ai.noMatch": {
    en: "No analyses match these filters",
    ar: "لا توجد تحليلات تطابق عوامل التصفية هذه",
  },
  "ai.clearFilters": { en: "Clear filters", ar: "مسح عوامل التصفية" },
  "ai.recentCap": {
    en: "Showing analyses from your {limit} most recent runs.",
    ar: "تُعرض التحليلات من أحدث {limit} عملية تشغيل.",
  },
  "ai.analysisUnavailable": {
    en: "Analysis unavailable",
    ar: "التحليل غير متاح",
  },
  "ai.loadError": {
    en: "Could not load AI analyses right now.",
    ar: "تعذّر تحميل تحليلات الذكاء الاصطناعي الآن.",
  },
  "ai.analyzing": { en: "Analyzing execution…", ar: "جارٍ تحليل التنفيذ…" },
  "ai.analyzingShort": { en: "Analyzing…", ar: "جارٍ التحليل…" },
  "ai.analyzingDesc": {
    en: "The AI analysis is running on the backend. This page refreshes automatically when it finishes.",
    ar: "يعمل تحليل الذكاء الاصطناعي على الخادم. يتم تحديث هذه الصفحة تلقائياً عند الانتهاء.",
  },

  /* Risk levels (backend report values → display labels) */
  "ai.risk.critical": { en: "Critical", ar: "حرج" },
  "ai.risk.high": { en: "High", ar: "مرتفع" },
  "ai.risk.medium": { en: "Medium", ar: "متوسط" },
  "ai.risk.low": { en: "Low", ar: "منخفض" },
  "ai.riskLevelLabel": { en: "Risk level", ar: "مستوى الخطورة" },
  "ai.riskScoreNote": {
    en: "Backend risk score {score}/100 (0 = perfect)",
    ar: "درجة الخطورة من الخادم {score}/100 (0 = مثالي)",
  },

  /* Reliability score bands */
  "ai.score.excellent": { en: "Excellent", ar: "ممتازة" },
  "ai.score.good": { en: "Good", ar: "جيدة" },
  "ai.score.atRisk": { en: "At Risk", ar: "في خطر" },
  "ai.score.low": { en: "Low", ar: "منخفضة" },

  /* Trend directions (backend report values → display labels) */
  "ai.trend.stable": { en: "Stable", ar: "مستقر" },
  "ai.trend.improving": { en: "Improving", ar: "في تحسن" },
  "ai.trend.degrading": { en: "Degrading", ar: "في تدهور" },
  "ai.trend.recurring": { en: "Recurring", ar: "متكرر" },
  "ai.trend.new": { en: "New", ar: "جديد" },
  "ai.trend.insufficient": { en: "Insufficient", ar: "غير كافٍ" },
  "ai.insufficientData": {
    en: "Insufficient historical data",
    ar: "بيانات تاريخية غير كافية",
  },
  "ai.confidence": { en: "{level} confidence", ar: "ثقة {level}" },
  "ai.confidence.high": { en: "High", ar: "عالية" },
  "ai.confidence.medium": { en: "Medium", ar: "متوسطة" },
  "ai.confidence.low": { en: "Low", ar: "منخفضة" },

  /* Impact categories (backend report values → display labels) */
  "ai.impact.customerAccess": { en: "Customer Access", ar: "وصول العملاء" },
  "ai.impact.revenue": { en: "Revenue Impact", ar: "تأثير على الإيرادات" },
  "ai.impact.dataIntegrity": { en: "Data Integrity", ar: "سلامة البيانات" },

  /* Detail sections */
  "ai.businessImpact": { en: "Business Impact", ar: "تأثير الأعمال" },
  "ai.assessment": { en: "Assessment", ar: "التقييم" },
  "ai.historicalTrend": { en: "Historical Trend", ar: "الاتجاه التاريخي" },
  "ai.browserInsight": { en: "Browser Insight", ar: "رؤية المتصفح" },
  "ai.recommendedActions": {
    en: "Recommended Actions",
    ar: "الإجراءات المقترحة",
  },
  "ai.observedPattern": { en: "Observed Pattern", ar: "النمط المرصود" },
  "ai.affectedFlows": { en: "Affected Flows", ar: "التدفقات المتأثرة" },
  "ai.failureContext": { en: "Failure Context", ar: "سياق الإخفاق" },
  "ai.noImpact": {
    en: "The analysis did not include a business impact statement.",
    ar: "لم يتضمن التحليل بياناً لتأثير الأعمال.",
  },
  "ai.noAssessment": {
    en: "The analysis did not include an assessment.",
    ar: "لم يتضمن التحليل تقييماً.",
  },
  "ai.noTrendYet": {
    en: "Not enough execution history yet. Trend will become available after additional executions.",
    ar: "لا يوجد سجل تنفيذ كافٍ بعد. سيتوفر الاتجاه بعد عمليات تنفيذ إضافية.",
  },
  "ai.noBrowserInsightPackage": {
    en: "Browser-level insights are not produced for package executions.",
    ar: "لا يتم إنشاء رؤى على مستوى المتصفح لتنفيذ الحزم.",
  },
  "ai.noBrowserInsight": {
    en: "The analysis did not identify a browser-specific pattern.",
    ar: "لم يحدد التحليل نمطاً خاصاً بالمتصفح.",
  },
  "ai.noActions": {
    en: "The analysis did not include recommended actions.",
    ar: "لم يتضمن التحليل إجراءات مقترحة.",
  },
  "ai.noReliabilityScore": {
    en: "The report does not include a reliability score.",
    ar: "لا يتضمن التقرير درجة موثوقية.",
  },
  "ai.noRiskLevel": {
    en: "The report does not include a risk level.",
    ar: "لا يتضمن التقرير مستوى خطورة.",
  },
  "ai.priorExecutions": {
    en: "Prior executions analyzed by the AI:",
    ar: "عمليات التنفيذ السابقة التي حللها الذكاء الاصطناعي:",
  },
  "ai.countPassed": { en: "{count} passed", ar: "نجح {count}" },
  "ai.countFailed": { en: "{count} failed", ar: "فشل {count}" },
  "ai.countSkipped": { en: "{count} skipped", ar: "تخطّى {count}" },

  /* Execution summary fields */
  "ai.executionId": { en: "Execution", ar: "التنفيذ" },
  "ai.typeLabel": { en: "Type", ar: "النوع" },
  "ai.singleFlowRun": { en: "Single flow run", ar: "تشغيل تدفق فردي" },
  "ai.browserLabel": { en: "Browser", ar: "المتصفح" },
  "ai.actionsHeader": { en: "Actions", ar: "إجراءات" },

  /* Failure context evidence */
  "ai.failuresLoadError": {
    en: "Failure details could not be loaded.",
    ar: "تعذّر تحميل تفاصيل الإخفاق.",
  },
  "ai.failedFlows": { en: "Failed flows", ar: "التدفقات الفاشلة" },
  "ai.noFailureEvidence": {
    en: "No failure details were recorded for this execution.",
    ar: "لم يتم تسجيل تفاصيل إخفاق لهذا التنفيذ.",
  },

  /* AI card (run views) */
  "ai.card.notStarted": { en: "Analysis not started", ar: "لم يبدأ التحليل" },
  "ai.card.notStartedDesc": {
    en: "No reliability analysis has been run for this execution yet.",
    ar: "لم يتم تشغيل تحليل الموثوقية لهذا التنفيذ بعد.",
  },
  "ai.card.runAnalysis": { en: "Run Analysis", ar: "تشغيل التحليل" },
  "ai.card.starting": { en: "Starting…", ar: "جارٍ البدء…" },
  "ai.card.analyzingDesc": {
    en: "The reliability analysis runs automatically after the execution finishes and can take up to a minute. Results appear here when ready.",
    ar: "يعمل تحليل الموثوقية تلقائياً بعد انتهاء التنفيذ وقد يستغرق حتى دقيقة. تظهر النتائج هنا عند جاهزيتها.",
  },
  "ai.card.disabled": {
    en: "AI analysis disabled",
    ar: "تحليل الذكاء الاصطناعي معطّل",
  },
  "ai.card.disabledDesc": {
    en: "AI analysis is not enabled for this account, so no reliability report was produced. The execution result itself is unaffected.",
    ar: "تحليل الذكاء الاصطناعي غير مفعّل لهذا الحساب، لذا لم يتم إنشاء تقرير موثوقية. نتيجة التنفيذ نفسها غير متأثرة.",
  },
  "ai.card.rateLimited": {
    en: "The AI provider is limiting analysis requests right now. The analysis can be retried in a little while.",
    ar: "يقوم مزود الذكاء الاصطناعي بتقييد طلبات التحليل حالياً. يمكن إعادة محاولة التحليل بعد قليل.",
  },
  "ai.card.analysisFailed": {
    en: "The reliability analysis could not be completed. This does not affect the execution result.",
    ar: "تعذّر إكمال تحليل الموثوقية. هذا لا يؤثر على نتيجة التنفيذ.",
  },
  "ai.card.retryAnalysis": { en: "Retry Analysis", ar: "إعادة محاولة التحليل" },
  "ai.card.reportUnreadable": {
    en: "The analysis completed, but no report could be read for this execution.",
    ar: "اكتمل التحليل، لكن تعذّرت قراءة التقرير لهذا التنفيذ.",
  },
  "ai.card.viewFull": {
    en: "View AI Analysis",
    ar: "عرض تحليل الذكاء الاصطناعي",
  },

  /* ---------- Support navigation (Figma: sidebar "Support" group) ---------- */
  "nav.support": { en: "Support", ar: "الدعم" },
  "nav.feedback": { en: "Feedback", ar: "الملاحظات" },
  "nav.help": { en: "Help", ar: "المساعدة" },
  "header.help": { en: "Help", ar: "المساعدة" },

  /* ---------- Feedback page (Figma: client Feedback, UI-only) ---------- */
  "page.feedback.title": { en: "Feedback", ar: "الملاحظات" },
  "page.feedback.subtitle": {
    en: "Help us improve Assuredia",
    ar: "ساعدنا في تحسين أسيوريا",
  },
  "feedback.intro": {
    en: "Share your experience, suggestions, or ideas — we read every submission.",
    ar: "شاركنا تجربتك أو اقتراحاتك أو أفكارك — نقرأ كل مشاركة.",
  },
  "feedback.ratingQuestion": {
    en: "How would you rate your experience?",
    ar: "كيف تقيّم تجربتك؟",
  },
  "feedback.ratingGroupLabel": { en: "Experience rating", ar: "تقييم التجربة" },
  "feedback.rate1": { en: "Very dissatisfied", ar: "غير راضٍ جداً" },
  "feedback.rate2": { en: "Dissatisfied", ar: "غير راضٍ" },
  "feedback.rate3": { en: "Neutral", ar: "محايد" },
  "feedback.rate4": { en: "Satisfied", ar: "راضٍ" },
  "feedback.rate5": { en: "Very satisfied", ar: "راضٍ جداً" },
  "feedback.messageLabel": {
    en: "What would you like us to improve?",
    ar: "ما الذي تودّ أن نحسّنه؟",
  },
  "feedback.messagePlaceholder": {
    en: "Tell us about your experience, suggestion, or idea...",
    ar: "أخبرنا عن تجربتك أو اقتراحك أو فكرتك...",
  },
  "feedback.categoryLabel": { en: "Category", ar: "الفئة" },
  "feedback.category.general": { en: "General", ar: "عام" },
  "feedback.category.featureRequest": { en: "Feature Request", ar: "طلب ميزة" },
  "feedback.category.uiux": { en: "UI / UX", ar: "واجهة الاستخدام وتجربتها" },
  "feedback.category.performance": { en: "Performance", ar: "الأداء" },
  "feedback.category.monitoring": { en: "Monitoring", ar: "المراقبة" },
  "feedback.category.aiAnalysis": {
    en: "AI Analysis",
    ar: "تحليل الذكاء الاصطناعي",
  },
  "feedback.category.other": { en: "Other", ar: "أخرى" },
  "feedback.submit": { en: "Submit Feedback", ar: "إرسال الملاحظات" },
  "feedback.successTitle": {
    en: "Feedback submitted",
    ar: "تم إرسال الملاحظات",
  },
  "feedback.successDesc": {
    en: "Thanks for helping us improve Assuredia.",
    ar: "شكراً لمساعدتك في تحسين أسيوريا.",
  },
  "feedback.sendMore": { en: "Send More Feedback", ar: "إرسال ملاحظات أخرى" },

  /* ---------- Help page (Figma: client Help Center, UI-only) ---------- */
  "page.help.title": { en: "Help", ar: "المساعدة" },
  "page.help.subtitle": {
    en: "Find answers and learn how to get the most out of Assuredia.",
    ar: "اعثر على الإجابات وتعلّم كيف تحصل على أقصى استفادة من أسيوريا.",
  },
  "help.howCanWeHelp": { en: "How can we help?", ar: "كيف يمكننا المساعدة؟" },
  "help.searchPlaceholder": {
    en: "Search help articles...",
    ar: "ابحث في مقالات المساعدة...",
  },
  "help.searchAria": {
    en: "Search help articles",
    ar: "البحث في مقالات المساعدة",
  },
  "help.clearSearch": { en: "Clear search", ar: "مسح البحث" },
  "help.browseByCategory": { en: "Browse by category", ar: "تصفّح حسب الفئة" },
  "help.resultForOne": {
    en: "1 result for “{query}”",
    ar: "نتيجة واحدة لـ «{query}»",
  },
  "help.resultsFor": {
    en: "{count} results for “{query}”",
    ar: "{count} نتائج لـ «{query}»",
  },
  "help.noResultsTitle": {
    en: "No articles found",
    ar: "لم يتم العثور على مقالات",
  },
  "help.noResultsDesc": {
    en: "Try a different search term.",
    ar: "جرّب مصطلح بحث مختلفاً.",
  },
  "help.oneArticle": { en: "1 article", ar: "مقال واحد" },
  "help.articlesCount": { en: "{count} articles", ar: "{count} مقالات" },
  "help.backToHelp": { en: "Back to Help", ar: "العودة إلى المساعدة" },
  "help.related": { en: "Related articles", ar: "مقالات ذات صلة" },
  "help.stillNeedHelp": {
    en: "Still need help?",
    ar: "ما زلت بحاجة إلى مساعدة؟",
  },
  "help.stillNeedHelpDesc": {
    en: "Can't find what you're looking for? Our support team can help you with questions, problems, or anything that needs further investigation.",
    ar: "لم تجد ما تبحث عنه؟ يمكن لفريق الدعم مساعدتك في الأسئلة أو المشكلات أو أي شيء يحتاج إلى مزيد من التحقيق.",
  },
  "help.contactSupport": { en: "Contact Support", ar: "اتصل بالدعم" },
  "help.cat.gettingStarted.title": { en: "Getting Started", ar: "البدء" },
  "help.cat.gettingStarted.desc": {
    en: "New to Assuredia? Start here to get up and running quickly.",
    ar: "جديد على أسيوريا؟ ابدأ من هنا للانطلاق بسرعة.",
  },
  "help.cat.flowsTests.title": {
    en: "Flows & Tests",
    ar: "التدفقات والاختبارات",
  },
  "help.cat.flowsTests.desc": {
    en: "Understand how automated tests are organized and executed.",
    ar: "افهم كيف يتم تنظيم الاختبارات الآلية وتنفيذها.",
  },
  "help.cat.automations.title": { en: "Automations", ar: "الأتمتة" },
  "help.cat.automations.desc": {
    en: "Configure scheduled and automated monitoring executions.",
    ar: "اضبط عمليات المراقبة المجدولة والآلية.",
  },
  "help.cat.runsHistory.title": {
    en: "Runs & History",
    ar: "عمليات التشغيل والسجل",
  },
  "help.cat.runsHistory.desc": {
    en: "Review past executions and investigate test results.",
    ar: "راجع عمليات التنفيذ السابقة وتحقّق من نتائج الاختبارات.",
  },
  "help.cat.alerts.title": {
    en: "Alerts & Notifications",
    ar: "التنبيهات والإشعارات",
  },
  "help.cat.alerts.desc": {
    en: "Understand how failure alerts and notifications work.",
    ar: "افهم كيف تعمل تنبيهات الإخفاق والإشعارات.",
  },
  "help.cat.requests.title": { en: "Requests", ar: "الطلبات" },
  "help.cat.requests.desc": {
    en: "Learn when and how to submit asset change requests.",
    ar: "تعلّم متى وكيف تُرسل طلبات تعديل الأصول.",
  },
  "help.cat.feedback.title": { en: "Feedback", ar: "الملاحظات" },
  "help.cat.feedback.desc": {
    en: "Share your experience and suggestions with the Assuredia team.",
    ar: "شارك تجربتك واقتراحاتك مع فريق أسيوريا.",
  },
  "admin.navFeedback": { en: "Feedback", ar: "الملاحظات" },

  /* ---------- Test Definitions (PR 5: declarative definition lifecycle) ---------- */
  "nav.testDefinitions": { en: "Test Definitions", ar: "تعريفات الاختبار" },
  "admin.navTestDefinitions": {
    en: "Test Definitions",
    ar: "تعريفات الاختبار",
  },

  /* ---------- Test Creation (PR10A: unified manual creation workflow) ---------- */
  "nav.testCreation": { en: "Test Creation", ar: "إنشاء الاختبار" },
  "nav.newTest": { en: "New Test", ar: "اختبار جديد" },
  "nav.creationRequests": { en: "Creation Requests", ar: "طلبات الإنشاء" },
  "admin.navCreationQueue": { en: "Review Queue", ar: "قائمة المراجعة" },

  /* ---------- Sidebar IA (PR10C FIX 9: TESTS + RUNS & RESULTS) ---------- */
  "nav.tests": { en: "TESTS", ar: "الاختبارات" },
  "nav.runsResults": { en: "RUNS & RESULTS", ar: "التشغيل والنتائج" },
  "nav.activeTests": { en: "Active Tests", ar: "اختبارات نشطة" },
  "nav.draftsReviews": { en: "Drafts & Reviews", ar: "المسودات والمراجعات" },
  "nav.testRequests": { en: "Test Requests", ar: "طلبات الاختبار" },
  "nav.createTest": { en: "Create Test", ar: "إنشاء اختبار" },
  "nav.liveRuns": { en: "Live Runs", ar: "تشغيل مباشر" },
  "nav.scheduledRuns": { en: "Scheduled Runs", ar: "تشغيل مجدول" },
  "nav.history": { en: "History", ar: "السجل" },
  "nav.assetRequests": { en: "Asset Requests", ar: "طلبات الأصول" },

  "testdef.activeSubtitle": {
    en: "Activated tests that are operational. Tests awaiting activation live under Drafts & Reviews.",
    ar: "الاختبارات المُفعّلة والجاهزة للتشغيل. الاختبارات بانتظار التفعيل في المسودات والمراجعات.",
  },
  "testdef.draftsSubtitle": {
    en: "Tests in review: drafts and reviewed definitions awaiting activation.",
    ar: "اختبارات قيد المراجعة: مسودات وتعريفات تمت مراجعتها بانتظار التفعيل.",
  },
  "testdef.filterNote": {
    en: "Showing {shown} of {total} on this page matching this view.",
    ar: "عرض {shown} من {total} في هذه الصفحة ضمن هذا العرض.",
  },
  "testdef.filterResolving": {
    en: "Reading definition statuses…",
    ar: "جارٍ قراءة حالات التعريفات…",
  },
  "testdef.noReadyOnPage": { en: "No Active tests on this page", ar: "لا توجد اختبارات نشطة في هذه الصفحة" },
  "testdef.noReadyOnPageHint": {
    en: "None of the definitions on this page are active yet. Try the next page or clear the search.",
    ar: "لا توجد اختبارات نشطة في هذه الصفحة بعد. جرّب الصفحة التالية أو امسح البحث.",
  },
  "testdef.noActiveOnPage": { en: "No Active tests on this page", ar: "لا توجد اختبارات نشطة في هذه الصفحة" },
  "testdef.noActiveOnPageHint": {
    en: "None of the definitions on this page are activated yet. Try the next page or clear the search.",
    ar: "لم يتم تفعيل أي من التعريفات في هذه الصفحة بعد. جرّب الصفحة التالية أو امسح البحث.",
  },
  "testdef.active": { en: "Active", ar: "نشط" },
  "testdef.noDraftsOnPage": { en: "No drafts on this page", ar: "لا توجد مسودات في هذه الصفحة" },
  "testdef.noDraftsOnPageHint": {
    en: "None of the definitions on this page are drafts. Try the next page or clear the search.",
    ar: "لا توجد مسودات في هذه الصفحة. جرّب الصفحة التالية أو امسح البحث.",
  },

  "testdef.eyebrow": { en: "Quality Assets", ar: "أصول الجودة" },
  "testdef.title": { en: "Test Definitions", ar: "تعريفات الاختبار" },
  "testdef.subtitle": {
    en: "Author, validate and prove declarative test definitions before they go live.",
    ar: "أنشئ تعريفات اختبار وصفية وتحقّق منها وأثبتها قبل تشغيلها.",
  },
  "testdef.admin.subtitle": {
    en: "Review and promote declarative test definitions for any client environment.",
    ar: "راجع تعريفات الاختبار الوصفية واعتمدها لأي بيئة عميل.",
  },
  "testdef.new": { en: "New Definition", ar: "تعريف جديد" },
  "testdef.searchPlaceholder": { en: "Search by name…", ar: "ابحث بالاسم…" },

  "testdef.status.draft": { en: "Draft", ar: "مسودة" },
  "testdef.status.validated": { en: "Validated", ar: "تم التحقق" },
  "testdef.status.approved": { en: "Approved", ar: "معتمد" },
  "testdef.status.ready": { en: "Ready", ar: "جاهز" },
  "testdef.status.archived": { en: "Archived", ar: "مؤرشف" },

  "testdef.th.name": { en: "Definition", ar: "التعريف" },
  "testdef.th.client": { en: "Client", ar: "العميل" },
  "testdef.th.flow": { en: "Flow", ar: "التدفق" },
  "testdef.th.version": { en: "Version", ar: "الإصدار" },
  "testdef.th.status": { en: "Status", ar: "الحالة" },
  "testdef.th.implementation": { en: "Type", ar: "النوع" },
  "testdef.th.updated": { en: "Last updated", ar: "آخر تحديث" },
  "testdef.th.actions": { en: "Actions", ar: "الإجراءات" },

  "testdef.implementation.testDefinition": {
    en: "Definition JSON",
    ar: "تعريف JSON",
  },
  "testdef.noFlow": { en: "Not linked", ar: "غير مرتبط" },
  "testdef.flowNumber": { en: "Flow #{id}", ar: "تدفق #{id}" },
  "testdef.versionNumber": { en: "v{number}", ar: "الإصدار {number}" },
  "testdef.noVersions": { en: "No versions", ar: "لا إصدارات" },

  "testdef.empty": {
    en: "No test definitions yet",
    ar: "لا توجد تعريفات اختبار بعد",
  },
  "testdef.emptyHint": {
    en: "Create a definition to describe a user journey in JSON and prove it before release.",
    ar: "أنشئ تعريفاً لوصف رحلة مستخدم بصيغة JSON وأثبتها قبل الإصدار.",
  },
  "testdef.noMatch": {
    en: "No definitions match this search",
    ar: "لا توجد تعريفات تطابق هذا البحث",
  },
  "testdef.noMatchHint": {
    en: "Try a shorter search term.",
    ar: "جرّب مصطلح بحث أقصر.",
  },
  "testdef.loadFailed": {
    en: "Could not load test definitions",
    ar: "تعذّر تحميل تعريفات الاختبار",
  },
  "testdef.back": {
    en: "Back to Test Definitions",
    ar: "العودة إلى تعريفات الاختبار",
  },
  "testdef.prevPage": { en: "Previous", ar: "السابق" },
  "testdef.nextPage": { en: "Next", ar: "التالي" },
  "testdef.pageRange": {
    en: "{from}–{to} of {total}",
    ar: "{from}–{to} من {total}",
  },

  /* Create form */
  "testdef.create.title": {
    en: "New Test Definition",
    ar: "تعريف اختبار جديد",
  },
  "testdef.create.subtitle": {
    en: "A definition starts as a DRAFT you can edit freely until it is validated.",
    ar: "يبدأ التعريف كمسودة يمكنك تعديلها بحرية حتى يتم التحقق منها.",
  },
  "testdef.create.name": { en: "Definition name", ar: "اسم التعريف" },
  "testdef.create.namePlaceholder": {
    en: "Checkout happy path",
    ar: "مسار الشراء الناجح",
  },
  "testdef.create.nameHint": {
    en: "Up to 120 characters, unique within this client.",
    ar: "حتى 120 حرفاً، وفريد داخل هذا العميل.",
  },
  "testdef.create.nameRequired": {
    en: "A definition name is required",
    ar: "اسم التعريف مطلوب",
  },
  "testdef.create.nameTooLong": {
    en: "The name cannot exceed 120 characters",
    ar: "لا يمكن أن يتجاوز الاسم 120 حرفاً",
  },
  "testdef.create.duplicateName": {
    en: "A definition with this name already exists for this client",
    ar: "يوجد بالفعل تعريف بهذا الاسم لهذا العميل",
  },
  "testdef.create.description": { en: "Description", ar: "الوصف" },
  "testdef.create.descriptionPlaceholder": {
    en: "What this journey proves (optional)",
    ar: "ما تثبته هذه الرحلة (اختياري)",
  },
  "testdef.create.descriptionTooLong": {
    en: "The description cannot exceed 2000 characters",
    ar: "لا يمكن أن يتجاوز الوصف 2000 حرف",
  },
  "testdef.create.client": { en: "Client environment", ar: "بيئة العميل" },
  "testdef.create.flow": { en: "Flow binding", ar: "ارتباط التدفق" },
  "testdef.create.flowNone": { en: "Not linked yet", ar: "غير مرتبط بعد" },
  "testdef.create.flowHint": {
    en: "A flow binding is required before a trial or proving run.",
    ar: "ارتباط التدفق مطلوب قبل تشغيل تجريبي أو إثبات.",
  },
  "testdef.create.flowLoadFailed": {
    en: "Flows could not be loaded; you can bind one later.",
    ar: "تعذّر تحميل التدفقات؛ يمكنك الربط لاحقاً.",
  },
  "testdef.create.source": {
    en: "Definition source (JSON)",
    ar: "مصدر التعريف (JSON)",
  },
  "testdef.create.sourceHint": {
    en: "Schema 1.0. Leave the starter document to fill it in after creating.",
    ar: "المخطط 1.0. اترك المستند المبدئي لإكماله بعد الإنشاء.",
  },
  "testdef.create.insertStarter": {
    en: "Insert starter document",
    ar: "إدراج مستند مبدئي",
  },
  "testdef.create.format": { en: "Format JSON", ar: "تنسيق JSON" },
  "testdef.create.formatFailed": {
    en: "Fix the JSON syntax before formatting",
    ar: "أصلح صيغة JSON قبل التنسيق",
  },
  "testdef.create.submit": { en: "Create definition", ar: "إنشاء التعريف" },
  "testdef.create.submitting": { en: "Creating…", ar: "جارٍ الإنشاء…" },
  "testdef.create.createdTitle": {
    en: "Definition created",
    ar: "تم إنشاء التعريف",
  },
  "testdef.create.createdDesc": {
    en: '"{name}" is a DRAFT at version {version}.',
    ar: '"{name}" مسودة في الإصدار {version}.',
  },
  "testdef.create.failedTitle": {
    en: "Could not create the definition",
    ar: "تعذّر إنشاء التعريف",
  },

  /* Validation panel */
  "testdef.validation.localTitle": {
    en: "Checked in your browser",
    ar: "تم التحقق في متصفحك",
  },
  "testdef.validation.localHint": {
    en: "A local schema pre-check. The engine's validation is the one that counts.",
    ar: "تحقّق أولي محلي من المخطط. تحقّق المحرك هو المُعتبر.",
  },
  "testdef.validation.engineTitle": {
    en: "Engine validation",
    ar: "تحقّق المحرك",
  },
  "testdef.validation.passed": {
    en: "No problems found",
    ar: "لم تُكتشف أي مشكلات",
  },
  "testdef.validation.errorCount": {
    en: "{count} error(s)",
    ar: "{count} خطأ",
  },
  "testdef.validation.warningCount": {
    en: "{count} warning(s)",
    ar: "{count} تحذير",
  },
  "testdef.validation.atRoot": { en: "document", ar: "المستند" },
  "testdef.validation.notRunYet": {
    en: "This version has not been validated yet.",
    ar: "لم يتم التحقق من هذا الإصدار بعد.",
  },

  /* Detail + editor */
  "testdef.detail.metadata": { en: "Definition", ar: "التعريف" },
  "testdef.detail.versions": { en: "Version history", ar: "سجل الإصدارات" },
  "testdef.detail.currentVersion": {
    en: "Selected version",
    ar: "الإصدار المحدد",
  },
  "testdef.detail.source": { en: "Definition source", ar: "مصدر التعريف" },
  "testdef.detail.readOnly": {
    en: "Read-only: content is immutable once a version leaves DRAFT.",
    ar: "للقراءة فقط: المحتوى غير قابل للتغيير بعد خروج الإصدار من المسودة.",
  },
  "testdef.detail.archivedReadOnly": {
    en: "This definition is archived and cannot be changed or executed.",
    ar: "هذا التعريف مؤرشف ولا يمكن تغييره أو تنفيذه.",
  },
  "testdef.detail.provingRun": { en: "Proving run", ar: "تشغيل الإثبات" },
  "testdef.detail.provingRunNone": { en: "Not proven yet", ar: "لم يُثبت بعد" },
  "testdef.detail.activation": { en: "Activation", ar: "التفعيل" },
  "testdef.detail.notActivated": { en: "Not activated", ar: "غير مُفعّل" },
  "testdef.detail.created": { en: "Created", ar: "أُنشئ" },
  "testdef.detail.validatedAt": { en: "Validated", ar: "تم التحقق" },
  "testdef.detail.approvedAt": { en: "Approved", ar: "تم الاعتماد" },
  "testdef.detail.readyAt": { en: "Ready", ar: "أصبح جاهزاً" },
  "testdef.detail.archivedAt": { en: "Archived", ar: "أُرشف" },
  "testdef.detail.versionLock": { en: "Lock", ar: "قفل التزامن" },
  "testdef.detail.loadFailed": {
    en: "Could not load this definition",
    ar: "تعذّر تحميل هذا التعريف",
  },
  "testdef.detail.versionLoadFailed": {
    en: "Could not load this version",
    ar: "تعذّر تحميل هذا الإصدار",
  },
  "testdef.detail.save": { en: "Save draft", ar: "حفظ المسودة" },
  "testdef.detail.saving": { en: "Saving…", ar: "جارٍ الحفظ…" },
  "testdef.detail.savedTitle": { en: "Draft saved", ar: "تم حفظ المسودة" },
  "testdef.detail.savedDesc": {
    en: "Validation was cleared, so validate the draft again.",
    ar: "تم إلغاء نتيجة التحقق، لذا تحقّق من المسودة مرة أخرى.",
  },
  "testdef.detail.saveFailedTitle": {
    en: "Could not save the draft",
    ar: "تعذّر حفظ المسودة",
  },
  "testdef.detail.revert": { en: "Discard changes", ar: "تجاهل التغييرات" },
  "testdef.detail.unsavedBadge": {
    en: "Unsaved changes",
    ar: "تغييرات غير محفوظة",
  },
  "testdef.detail.unsavedTitle": {
    en: "Leave without saving?",
    ar: "الخروج دون حفظ؟",
  },
  "testdef.detail.unsavedDesc": {
    en: "The edits to this draft have not been sent to the engine and will be lost.",
    ar: "لم تُرسل تعديلات هذه المسودة إلى المحرك وسيتم فقدانها.",
  },
  "testdef.detail.unsavedConfirm": {
    en: "Discard and leave",
    ar: "تجاهل واخرج",
  },
  "testdef.detail.unsavedStay": { en: "Keep editing", ar: "متابعة التعديل" },
  "testdef.detail.jsonInvalid": {
    en: "Fix the JSON syntax before saving",
    ar: "أصلح صيغة JSON قبل الحفظ",
  },

  /* Lifecycle actions */
  "testdef.action.validate": { en: "Validate", ar: "تحقّق" },
  "testdef.action.validating": { en: "Validating…", ar: "جارٍ التحقق…" },
  "testdef.action.trial": { en: "Run trial", ar: "تشغيل تجريبي" },
  "testdef.action.trialRunning": {
    en: "Running trial…",
    ar: "جارٍ التشغيل التجريبي…",
  },
  "testdef.action.approve": { en: "Approve", ar: "اعتماد" },
  "testdef.action.approving": { en: "Approving…", ar: "جارٍ الاعتماد…" },
  "testdef.action.proving": { en: "Run proving", ar: "تشغيل الإثبات" },
  "testdef.action.provingRunning": {
    en: "Running proving…",
    ar: "جارٍ تشغيل الإثبات…",
  },
  "testdef.action.archive": { en: "Archive", ar: "أرشفة" },
  "testdef.action.archiving": { en: "Archiving…", ar: "جارٍ الأرشفة…" },
  "testdef.action.newVersion": {
    en: "New draft version",
    ar: "إصدار مسودة جديد",
  },
  "testdef.action.newVersionWorking": {
    en: "Creating version…",
    ar: "جارٍ إنشاء الإصدار…",
  },
  "testdef.action.adminBadge": { en: "Admin", ar: "مسؤول" },
  "testdef.action.schedule": { en: "Schedule", ar: "جدولة" },
  "testdef.action.activate": { en: "Activate test", ar: "تفعيل الاختبار" },
  "testdef.action.activating": { en: "Activating…", ar: "جارٍ التفعيل…" },
  "testdef.action.addToFlow": { en: "Add to flow", ar: "إضافة إلى تدفق" },

  /* Activation (Draft-Activation phase) */
  "testdef.activated.title": { en: "Test activated", ar: "تم تفعيل الاختبار" },
  "testdef.activated.desc": {
    en: "It now appears under Active Tests and can be added to a flow, run, monitored and scheduled.",
    ar: "أصبح الآن ضمن الاختبارات النشطة ويمكن إضافته إلى تدفق وتشغيله ومراقبته وجدولته.",
  },
  "testdef.activated.alreadyTitle": { en: "Already active", ar: "نشط بالفعل" },
  "testdef.activated.failedTitle": { en: "Unable to activate test.", ar: "تعذّر تفعيل الاختبار." },

  /* Add to Flow (Draft-Activation phase) */
  "testdef.addToFlow.title": { en: "Add “{name}” to a flow", ar: "إضافة «{name}» إلى تدفق" },
  "testdef.addToFlow.subtitle": {
    en: "Add this test to an existing flow, or create a new flow and add it.",
    ar: "أضف هذا الاختبار إلى تدفق قائم، أو أنشئ تدفقًا جديدًا وأضفه إليه.",
  },
  "testdef.addToFlow.mode": { en: "Choose how to add", ar: "اختر طريقة الإضافة" },
  "testdef.addToFlow.existing": { en: "Existing flow", ar: "تدفق قائم" },
  "testdef.addToFlow.createNew": { en: "Create new flow", ar: "إنشاء تدفق جديد" },
  "testdef.addToFlow.existingLabel": { en: "Flow", ar: "التدفق" },
  "testdef.addToFlow.selectPlaceholder": { en: "Select a flow…", ar: "اختر تدفقًا…" },
  "testdef.addToFlow.currentSuffix": { en: "(current)", ar: "(الحالي)" },
  "testdef.addToFlow.newNameLabel": { en: "Flow name", ar: "اسم التدفق" },
  "testdef.addToFlow.newNameHint": {
    en: "A new flow is created for this client and this test is added to it.",
    ar: "يُنشأ تدفق جديد لهذا العميل ويُضاف هذا الاختبار إليه.",
  },
  "testdef.addToFlow.newNamePlaceholder": { en: "Login & Checkout Regression", ar: "اختبار تسجيل الدخول والدفع" },
  "testdef.addToFlow.addExisting": { en: "Add to flow", ar: "إضافة إلى التدفق" },
  "testdef.addToFlow.createAndAdd": { en: "Create flow & add test", ar: "إنشاء التدفق وإضافة الاختبار" },
  "testdef.addToFlow.noFlows": {
    en: "This client has no flows yet. Create a new one instead.",
    ar: "لا توجد تدفقات لهذا العميل بعد. أنشئ تدفقًا جديدًا بدلاً من ذلك.",
  },
  "testdef.addToFlow.loadFailed": { en: "Unable to load flows.", ar: "تعذّر تحميل التدفقات." },
  "testdef.addToFlow.failed": { en: "Unable to add test to flow.", ar: "تعذّر إضافة الاختبار إلى التدفق." },

  "testdef.schedule.title": { en: "Schedule this test", ar: "جدولة هذا الاختبار" },
  "testdef.schedule.subtitle": {
    en: "Run “{name}” automatically. The version is resolved each time it fires, so the schedule follows the test as it evolves.",
    ar: "شغّل «{name}» تلقائيًا. يُحدَّد الإصدار في كل تشغيل، فتتبع الجدولة الاختبار مع تطوره.",
  },
  "testdef.schedule.create": { en: "Create schedule", ar: "إنشاء الجدولة" },
  "testdef.schedule.frequency": { en: "Frequency", ar: "التكرار" },
  "testdef.schedule.time": { en: "Time", ar: "الوقت" },
  "testdef.schedule.timezone": { en: "Timezone", ar: "المنطقة الزمنية" },
  "testdef.schedule.timezoneHint": {
    en: "The timezone the times above are read in.",
    ar: "المنطقة الزمنية التي تُقرأ بها الأوقات أعلاه.",
  },
  "testdef.schedule.notify": { en: "Notifications", ar: "الإشعارات" },
  "testdef.schedule.notifyHint": {
    en: "Only gates the outbound webhook. Results and alerts are always recorded.",
    ar: "يقتصر تأثيره على النداء الخارجي. تُسجَّل النتائج والتنبيهات دائمًا.",
  },
  "testdef.schedule.notifyInherit": { en: "Inherit the client's setting", ar: "وراثة إعداد العميل" },
  "testdef.schedule.name": { en: "Schedule name", ar: "اسم الجدولة" },
  "testdef.schedule.nameHint": {
    en: "Optional — “{name} schedule” is used if left blank.",
    ar: "اختياري — يُستخدم «{name} schedule» إذا تُرك فارغًا.",
  },
  "testdef.schedule.namePlaceholder": { en: "{name} schedule", ar: "{name} schedule" },
  "testdef.schedule.existing": { en: "Existing schedules", ar: "الجدولات الحالية" },
  "testdef.schedule.liveCount": { en: "{live} of {total} active", ar: "{live} من {total} نشطة" },
  "testdef.schedule.none": {
    en: "This test has no schedule yet.",
    ar: "لا يوجد جدول لهذا الاختبار بعد.",
  },
  "testdef.schedule.live": { en: "Active", ar: "نشط" },
  "testdef.schedule.paused": { en: "Paused", ar: "متوقف" },
  "testdef.schedule.remove": { en: "Remove", ar: "إزالة" },
  "testdef.schedule.createFailed": { en: "The schedule was not created", ar: "لم تُنشأ الجدولة" },
  "testdef.schedule.errorCron": {
    en: "That is not a valid schedule time.",
    ar: "هذا ليس وقت جدولة صالحًا.",
  },
  "testdef.schedule.errorTime": { en: "Choose a time of day.", ar: "اختر وقتًا من اليوم." },
  "testdef.schedule.errorTimezone": { en: "Choose a timezone.", ar: "اختر منطقة زمنية." },
  "testdef.schedule.versionNote": {
    en: "Each time it fires, the engine runs the definition's latest version and records the run in History with the SCHEDULED trigger.",
    ar: "في كل تشغيل، ينفّذ المحرك أحدث إصدار للتعريف ويسجّل التشغيل في السجل بمُشغِّل SCHEDULED.",
  },

  "testdef.reason.adminOnly": {
    en: "Only an administrator can perform this step",
    ar: "لا يمكن تنفيذ هذه الخطوة إلا لمسؤول",
  },
  "testdef.reason.archived": {
    en: "Archived definitions are read-only",
    ar: "التعريفات المؤرشفة للقراءة فقط",
  },
  "testdef.reason.wrongStatus": {
    en: "Not available while this version is {status}",
    ar: "غير متاح وحالة هذا الإصدار {status}",
  },
  "testdef.reason.noFlow": {
    en: "Link this definition to a flow first",
    ar: "اربط هذا التعريف بتدفق أولاً",
  },
  "testdef.reason.alreadyActive": {
    en: "This test is already active",
    ar: "هذا الاختبار نشط بالفعل",
  },
  "testdef.reason.loading": {
    en: "Loading the active version…",
    ar: "جارٍ تحميل الإصدار النشط…",
  },
  "testdef.action.unavailable": {
    en: "That action is not available yet",
    ar: "هذا الإجراء غير متاح بعد",
  },
  "testdef.readyHint": {
    en: "READY is reached only by a passing proving run — it is never set by hand.",
    ar: 'لا يتم الوصول إلى "جاهز" إلا بتشغيل إثبات ناجح — ولا يُحدد يدوياً.',
  },

  /* Lifecycle confirmations and outcomes */
  "testdef.confirm.approveTitle": {
    en: "Approve this version?",
    ar: "اعتماد هذا الإصدار؟",
  },
  "testdef.confirm.approveDesc": {
    en: 'Approving "{name}" v{version} allows a proving run, which is the only way it can become READY.',
    ar: 'اعتماد "{name}" الإصدار {version} يسمح بتشغيل إثبات، وهو الطريق الوحيد ليصبح جاهزاً.',
  },
  "testdef.confirm.provingTitle": {
    en: "Run the proving execution?",
    ar: "تشغيل تنفيذ الإثبات؟",
  },
  "testdef.confirm.provingDesc": {
    en: 'This runs "{name}" v{version} against the client\'s real environment. A passing run promotes it to READY.',
    ar: 'سيتم تشغيل "{name}" الإصدار {version} على بيئة العميل الحقيقية. التشغيل الناجح يرفعه إلى "جاهز".',
  },
  "testdef.confirm.archiveTitle": {
    en: "Archive this definition?",
    ar: "أرشفة هذا التعريف؟",
  },
  "testdef.confirm.archiveDesc": {
    en: 'Archiving "{name}" is permanent: the version and the whole definition become read-only and can no longer run.',
    ar: 'أرشفة "{name}" نهائية: يصبح الإصدار والتعريف بالكامل للقراءة فقط ولا يمكن تشغيلهما.',
  },
  "testdef.validated.title": {
    en: "Version validated",
    ar: "تم التحقق من الإصدار",
  },
  "testdef.validated.invalidTitle": {
    en: "Validation found problems",
    ar: "اكتشف التحقق مشكلات",
  },
  "testdef.validated.invalidDesc": {
    en: "The version stays in DRAFT until the reported errors are fixed.",
    ar: "يبقى الإصدار مسودة حتى إصلاح الأخطاء المذكورة.",
  },
  "testdef.approved.title": { en: "Version approved", ar: "تم اعتماد الإصدار" },
  "testdef.archived.title": {
    en: "Definition archived",
    ar: "تم أرشفة التعريف",
  },
  "testdef.newVersion.title": {
    en: "Draft version created",
    ar: "تم إنشاء إصدار مسودة",
  },
  "testdef.newVersion.desc": {
    en: "Version {version} is a DRAFT copied from the version you were viewing.",
    ar: "الإصدار {version} مسودة منسوخة من الإصدار الذي كنت تعرضه.",
  },
  "testdef.actionFailed": {
    en: "The action did not complete",
    ar: "لم يكتمل الإجراء",
  },
  "testdef.reloadNeeded": {
    en: "This definition changed on the server. Reloading the latest state.",
    ar: "تغيّر هذا التعريف على الخادم. جارٍ تحميل أحدث حالة.",
  },

  /* Run results and evidence */
  "testdef.run.title": { en: "Run result", ar: "نتيجة التشغيل" },
  "testdef.run.trial": { en: "Trial", ar: "تجريبي" },
  "testdef.run.proving": { en: "Proving", ar: "إثبات" },
  "testdef.run.runId": { en: "Run", ar: "التشغيل" },
  "testdef.run.startedAt": { en: "Started", ar: "بدأ" },
  "testdef.run.duration": { en: "Duration", ar: "المدة" },
  "testdef.run.replayed": { en: "Replayed result", ar: "نتيجة معادة" },
  "testdef.run.replayedHint": {
    en: "This request repeated an earlier operation, so the original run is shown.",
    ar: "أعاد هذا الطلب عملية سابقة، لذا يتم عرض التشغيل الأصلي.",
  },
  "testdef.run.becameReady": {
    en: "The proving run passed and the version is now READY.",
    ar: "نجح تشغيل الإثبات وأصبح الإصدار جاهزاً.",
  },
  "testdef.run.notReady": {
    en: "The proving run did not pass, so the version stays APPROVED.",
    ar: "لم ينجح تشغيل الإثبات، لذا يبقى الإصدار معتمداً.",
  },
  "testdef.run.pending": {
    en: "Waiting for the engine…",
    ar: "في انتظار المحرك…",
  },
  "testdef.run.steps": { en: "Steps", ar: "الخطوات" },
  "testdef.run.noSteps": {
    en: "The engine reported no steps",
    ar: "لم يبلّغ المحرك عن أي خطوات",
  },
  "testdef.run.thStep": { en: "#", ar: "#" },
  "testdef.run.thAction": { en: "Action", ar: "الإجراء" },
  "testdef.run.thStatus": { en: "Status", ar: "الحالة" },
  "testdef.run.thDetail": { en: "Detail", ar: "التفاصيل" },
  "testdef.run.thDuration": { en: "Took", ar: "استغرق" },
  "testdef.run.expectedOutcome": {
    en: "Expected outcome",
    ar: "النتيجة المتوقعة",
  },
  "testdef.run.status.passed": { en: "Passed", ar: "نجح" },
  "testdef.run.status.failed": { en: "Failed", ar: "فشل" },
  "testdef.run.status.error": { en: "Error", ar: "خطأ" },
  "testdef.run.status.cancelled": { en: "Cancelled", ar: "أُلغي" },
  "testdef.run.status.notExecuted": { en: "Not executed", ar: "لم يُنفّذ" },
  "testdef.run.status.unknown": { en: "Unknown", ar: "غير معروف" },
  "testdef.run.reload": { en: "Refresh run", ar: "تحديث التشغيل" },
  "testdef.run.loadFailed": {
    en: "Could not load the run",
    ar: "تعذّر تحميل التشغيل",
  },
  "runPanel.analysis.title": { en: "AI Failure Analysis", ar: "تحليل فشل الذكاء الاصطناعي" },
  "runPanel.analysis.loading": { en: "Loading analysis...", ar: "جارٍ تحميل التحليل..." },
  "runPanel.analysis.unavailable": { en: "Analysis is unavailable for this run.", ar: "التحليل غير متاح لهذا التشغيل." },
  "runPanel.analysis.error": { en: "Could not load AI failure analysis.", ar: "تعذّر تحميل تحليل فشل الذكاء الاصطناعي." },

  "testdef.artifacts.title": { en: "Evidence", ar: "الأدلة" },
  "testdef.artifacts.none": {
    en: "This run produced no evidence files",
    ar: "لم يُنتج هذا التشغيل أي ملفات أدلة",
  },
  "testdef.artifacts.unknown": {
    en: "Evidence is recorded with the stored run. Refresh the run to list it.",
    ar: "تُسجَّل الأدلة مع التشغيل المخزّن. حدّث التشغيل لعرضها.",
  },
  "testdef.artifacts.download": { en: "Download", ar: "تنزيل" },
  "testdef.artifacts.downloading": { en: "Downloading…", ar: "جارٍ التنزيل…" },
  "testdef.artifacts.step": { en: "Step {index}", ar: "الخطوة {index}" },
  "testdef.artifacts.runScope": { en: "Whole run", ar: "التشغيل بالكامل" },
  "testdef.artifacts.missingTitle": {
    en: "Evidence file unavailable",
    ar: "ملف الأدلة غير متاح",
  },
  "testdef.artifacts.missingDesc": {
    en: "The engine has the record but could not return the file.",
    ar: "لدى المحرك السجل لكنه لم يتمكن من إرجاع الملف.",
  },
  "testdef.artifacts.deniedTitle": {
    en: "Evidence access denied",
    ar: "تم رفض الوصول إلى الأدلة",
  },
  "testdef.artifacts.failedTitle": { en: "Download failed", ar: "فشل التنزيل" },

  /* ---------- Run History → Execution Evidence panel ---------- */
  "runEvidence.title": { en: "Execution Evidence", ar: "أدلة التنفيذ" },
  "runEvidence.subtitle": {
    en: "What actually happened during this run.",
    ar: "ما الذي حدث فعليًا أثناء هذا التشغيل.",
  },
  "runEvidence.loading": { en: "Loading execution evidence…", ar: "جارٍ تحميل أدلة التنفيذ…" },
  "runEvidence.error": { en: "Unable to load execution evidence.", ar: "تعذّر تحميل أدلة التنفيذ." },
  "runEvidence.retry": { en: "Try again", ar: "حاول مرة أخرى" },
  "runEvidence.empty": {
    en: "No execution evidence is available for this run.",
    ar: "لا تتوفر أدلة تنفيذ لهذا التشغيل.",
  },
  "runEvidence.unavailable": {
    en: "Structured execution evidence is not available for this run.",
    ar: "لا تتوفر أدلة تنفيذ مُنظَّمة لهذا التشغيل.",
  },
  "runEvidence.unavailableHint": {
    en: "This run is not linked to a Test Definition, so per-step evidence and artifacts were not recorded.",
    ar: "هذا التشغيل غير مرتبط بتعريف اختبار، لذا لم تُسجَّل أدلة الخطوات أو الملفات.",
  },
  "runEvidence.timeline": { en: "Execution Timeline", ar: "الجدول الزمني للتنفيذ" },
  "runEvidence.noSteps": {
    en: "No per-step results were recorded for this run.",
    ar: "لم تُسجَّل نتائج لكل خطوة في هذا التشغيل.",
  },
  "runEvidence.screenshots": { en: "Screenshots", ar: "لقطات الشاشة" },
  "runEvidence.screenshotUnavailable": {
    en: "Evidence artifact unavailable.",
    ar: "ملف الدليل غير متاح.",
  },
  "runEvidence.viewScreenshot": { en: "View", ar: "عرض" },
  "runEvidence.closeViewer": { en: "Close", ar: "إغلاق" },
  "runEvidence.summary": { en: "Run Summary", ar: "ملخّص التشغيل" },

  /* Admin client scope */
  "testdef.admin.pickClient": { en: "Client environment", ar: "بيئة العميل" },
  "testdef.admin.pickClientHint": {
    en: "Test definitions belong to one client environment. Choose which one to work in.",
    ar: "تنتمي تعريفات الاختبار إلى بيئة عميل واحدة. اختر البيئة التي تعمل فيها.",
  },
  "testdef.admin.noClients": {
    en: "No client environments exist yet",
    ar: "لا توجد بيئات عملاء بعد",
  },
  "testdef.admin.clientsFailed": {
    en: "Could not load client environments",
    ar: "تعذّر تحميل بيئات العملاء",
  },

  /* ---------- Test Creation (PR10B: discovery and structured editors) ---------- */
  "pr10b.review.title": { en: "Review Test", ar: "مراجعة الاختبار" },
  "pr10b.success.title": { en: "Draft Created", ar: "تم إنشاء المسودة" },
  "pr10b.success.description": {
    en: "Your Test Definition Draft is ready for review.",
    ar: "مسودة تعريف الاختبار جاهزة للمراجعة.",
  },
  "pr10b.success.viewDrafts": {
    en: "View in Drafts & Reviews",
    ar: "عرض في المسودات والمراجعات",
  },

  /* Discovery compatibility keys are intentionally un-namespaced. */
  "discovery.title": { en: "Discovery", ar: "الاستكشاف" },
  "discovery.subtitle": {
    en: "Discover testable elements in the target application.",
    ar: "اكتشف العناصر القابلة للاختبار في التطبيق المستهدف.",
  },
  "discovery.ready.title": {
    en: "Ready to discover your application?",
    ar: "هل أنت جاهز لاستكشاف تطبيقك؟",
  },
  "discovery.ready.description": {
    en: "Assuredia will open the configured target, read its page structure, and suggest elements for your test.",
    ar: "ستفتح Assuredia الهدف المُعدّ، وتقرأ بنية الصفحة، وتقترح عناصر لاختبارك.",
  },
  "discovery.ready.security": {
    en: "Discovery reads page structure only. Do not expose secrets or personal data on the target page.",
    ar: "يقرأ الاستكشاف بنية الصفحة فقط. لا تعرض أسراراً أو بيانات شخصية في الصفحة المستهدفة.",
  },
  "discovery.run": { en: "Run Discovery", ar: "تشغيل الاستكشاف" },
  "discovery.running": {
    en: "Discovering application…",
    ar: "جاري استكشاف التطبيق...",
  },
  "discovery.running.title": {
    en: "Discovering your application…",
    ar: "جاري استكشاف تطبيقك...",
  },
  "discovery.running.description": {
    en: "This can take up to 30 seconds. Keep this page open.",
    ar: "قد يستغرق ذلك حتى 30 ثانية. أبقِ هذه الصفحة مفتوحة.",
  },
  "discovery.progress.connecting": {
    en: "Connecting to the application",
    ar: "جارٍ الاتصال بالتطبيق",
  },
  "discovery.progress.navigating": {
    en: "Opening the target page",
    ar: "جارٍ فتح الصفحة المستهدفة",
  },
  "discovery.progress.reading": {
    en: "Reading the page structure",
    ar: "جارٍ قراءة بنية الصفحة",
  },
  "discovery.progress.processing": {
    en: "Preparing discovered elements",
    ar: "جارٍ إعداد العناصر المكتشفة",
  },
  "discovery.results.title": { en: "Discovery Results", ar: "نتائج الاستكشاف" },
  "discovery.results.count": {
    en: "{count} elements discovered",
    ar: "تم اكتشاف {count} عنصر",
  },
  "discovery.results.pageCount": { en: "{count} pages", ar: "{count} صفحة" },
  "discovery.results.page": { en: "Page", ar: "الصفحة" },
  "discovery.results.target": { en: "Target", ar: "الهدف" },
  "discovery.results.scope": { en: "Scope", ar: "النطاق" },
  "discovery.results.origin": { en: "Origin", ar: "النطاق الأصلي" },
  "discovery.results.elements": {
    en: "Discovered Elements",
    ar: "العناصر المكتشفة",
  },
  "discovery.results.filter": { en: "Filter elements", ar: "تصفية العناصر" },
  "discovery.results.filterPlaceholder": {
    en: "Filter by name, role, or locator…",
    ar: "صفِّ حسب الاسم أو الدور أو محدد العنصر…",
  },
  "discovery.results.selectAll": { en: "Select All", ar: "تحديد الكل" },
  "discovery.results.deselectAll": {
    en: "Deselect All",
    ar: "إلغاء تحديد الكل",
  },
  "discovery.results.selected": {
    en: "{count} selected",
    ar: "تم تحديد {count}",
  },
  "discovery.results.truncated": {
    en: "Results were truncated",
    ar: "تم اقتطاع النتائج",
  },
  "discovery.results.truncatedDescription": {
    en: "Only part of the page structure could be returned. Review the available elements before continuing.",
    ar: "تعذّر إرجاع بنية الصفحة كاملة. راجع العناصر المتاحة قبل المتابعة.",
  },
  "discovery.results.unverified": { en: "Unverified", ar: "غير متحقق منه" },
  "discovery.results.strong": { en: "Strong", ar: "قوي" },
  "discovery.results.medium": { en: "Medium", ar: "متوسط" },
  "discovery.results.empty": {
    en: "No elements were discovered on this page.",
    ar: "لم يتم اكتشاف أي عناصر في هذه الصفحة.",
  },
  "discovery.results.filterEmpty": {
    en: "No discovered elements match this filter.",
    ar: "لا توجد عناصر مكتشفة تطابق عامل التصفية هذا.",
  },
  "discovery.results.retry": {
    en: "Run Discovery Again",
    ar: "تشغيل الاستكشاف مرة أخرى",
  },
  "discovery.results.review": { en: "Review Selection", ar: "مراجعة التحديد" },
  "discovery.results.createDraft": { en: "Create Draft", ar: "إنشاء مسودة" },
  "discovery.results.noSelection": {
    en: "Select at least one element to continue.",
    ar: "حدّد عنصراً واحداً على الأقل للمتابعة.",
  },
  "discovery.review.title": {
    en: "Review Discovered Elements",
    ar: "مراجعة العناصر المكتشفة",
  },
  "discovery.review.description": {
    en: "Confirm the selected elements before creating the Test Definition Draft.",
    ar: "أكّد العناصر المحددة قبل إنشاء مسودة تعريف الاختبار.",
  },
  "discovery.review.back": { en: "Back to Results", ar: "العودة إلى النتائج" },
  "discovery.review.createDraft": { en: "Create Draft", ar: "إنشاء مسودة" },
  "discovery.error.title": {
    en: "Discovery could not be completed",
    ar: "تعذّر إكمال الاستكشاف",
  },
  "discovery.error.generic": {
    en: "Discovery failed. Try again.",
    ar: "فشل الاستكشاف. حاول مرة أخرى.",
  },
  "discovery.retry": { en: "Retry Discovery", ar: "إعادة محاولة الاستكشاف" },
  "discovery.errors.mcp_unavailable": {
    en: "Discovery is not available right now.",
    ar: "الاستكشاف غير متاح الآن.",
  },
  "discovery.errors.mcp_initialization_failed": {
    en: "Discovery could not start.",
    ar: "تعذّر بدء الاستكشاف.",
  },
  "discovery.errors.mcp_navigation_failed": {
    en: "Could not reach the target application.",
    ar: "تعذّر الوصول إلى التطبيق المستهدف.",
  },
  "discovery.errors.mcp_snapshot_failed": {
    en: "Could not read the page structure.",
    ar: "تعذّرت قراءة بنية الصفحة.",
  },
  "discovery.errors.mcp_call_timeout": {
    en: "Discovery took too long. Try again.",
    ar: "استغرق الاستكشاف وقتاً طويلاً. حاول مرة أخرى.",
  },
  "discovery.errors.origin_rejected": {
    en: "The target application origin is not allowed.",
    ar: "نطاق التطبيق المستهدف غير مسموح به.",
  },
  "discovery.errors.client_configuration_invalid": {
    en: "Target URL is not configured. Configure it in Settings.",
    ar: "لم يتم إعداد الرابط المستهدف. قم بإعداده في الإعدادات.",
  },
  "discovery.errors.discovery_failed": {
    en: "Discovery failed. Try again.",
    ar: "فشل الاستكشاف. حاول مرة أخرى.",
  },

  /* AI builder compatibility keys. */
  "ai.builder.title": { en: "AI Test Builder", ar: "منشئ الاختبارات الذكي" },
  "ai.builder.subtitle": {
    en: "Describe a journey and let AI prepare a structured test.",
    ar: "صِف رحلة ودع الذكاء الاصطناعي يُعد اختباراً منظماً.",
  },
  "ai.builder.description": {
    en: "Describe the test you want to build",
    ar: "صِف الاختبار الذي تريد إنشاءه",
  },
  "ai.builder.placeholder": {
    en: "Describe the user journey, important data, and expected result…",
    ar: "صِف رحلة المستخدم والبيانات المهمة والنتيجة المتوقعة…",
  },
  "ai.builder.build": { en: "Build Test", ar: "بناء الاختبار" },
  "ai.builder.building": { en: "Building Test…", ar: "جارٍ بناء الاختبار…" },
  "ai.builder.review": {
    en: "Review Generated Test",
    ar: "مراجعة الاختبار المُنشأ",
  },
  "ai.builder.error": {
    en: "The test could not be built. Try again.",
    ar: "تعذّر بناء الاختبار. حاول مرة أخرى.",
  },
  /* Structured manual editor compatibility keys. */
  "manualEditor.title": { en: "Manual Editor", ar: "المحرر اليدوي" },
  "manualEditor.subtitle": {
    en: "Build the test journey step by step.",
    ar: "أنشئ رحلة الاختبار خطوة بخطوة.",
  },
  "manualEditor.ui.title": {
    en: "User Journey Editor",
    ar: "محرر رحلة المستخدم",
  },
  "manualEditor.ui.subtitle": {
    en: "Add browser actions and UI assertions in execution order.",
    ar: "أضف إجراءات المتصفح وعمليات التحقق من الواجهة بترتيب التنفيذ.",
  },
  "manualEditor.ui.steps": { en: "UI Steps", ar: "خطوات الواجهة" },
  "manualEditor.ui.step": { en: "UI Step {index}", ar: "خطوة الواجهة {index}" },
  "manualEditor.ui.addStep": { en: "Add UI Step", ar: "إضافة خطوة واجهة" },
  "manualEditor.ui.removeStep": {
    en: "Remove UI Step",
    ar: "إزالة خطوة الواجهة",
  },
  "manualEditor.ui.actionType": { en: "Action Type", ar: "نوع الإجراء" },
  "manualEditor.ui.locatorStrategy": {
    en: "Locator Strategy",
    ar: "استراتيجية تحديد العنصر",
  },
  "manualEditor.ui.locatorValue": {
    en: "Locator Value",
    ar: "قيمة محدد العنصر",
  },
  "manualEditor.ui.value": { en: "Value", ar: "القيمة" },
  "manualEditor.ui.expected": { en: "Expected Value", ar: "القيمة المتوقعة" },
  "manualEditor.ui.url": { en: "URL", ar: "الرابط" },
  "manualEditor.ui.option": { en: "Option", ar: "الخيار" },
  "manualEditor.ui.duration": { en: "Duration (ms)", ar: "المدة (مللي ثانية)" },
  "manualEditor.ui.variable": { en: "Variable Name", ar: "اسم المتغير" },
  "manualEditor.ui.attribute": { en: "Attribute", ar: "السمة" },
  "manualEditor.ui.types.navigate": { en: "Navigate", ar: "انتقال" },
  "manualEditor.ui.types.click": { en: "Click", ar: "نقر" },
  "manualEditor.ui.types.fill": { en: "Fill", ar: "تعبئة" },
  "manualEditor.ui.types.select": { en: "Select", ar: "اختيار" },
  "manualEditor.ui.types.hover": { en: "Hover", ar: "تمرير المؤشر" },
  "manualEditor.ui.types.check": { en: "Check", ar: "تحديد" },
  "manualEditor.ui.types.uncheck": { en: "Uncheck", ar: "إلغاء التحديد" },
  "manualEditor.ui.types.wait": { en: "Wait", ar: "انتظار" },
  "manualEditor.ui.types.extract": { en: "Extract Value", ar: "استخراج قيمة" },
  "manualEditor.ui.types.screenshot": {
    en: "Take Screenshot",
    ar: "التقاط صورة شاشة",
  },
  "manualEditor.ui.types.assertVisible": {
    en: "Assert Visible",
    ar: "التحقق من الظهور",
  },
  "manualEditor.ui.types.assertHidden": {
    en: "Assert Hidden",
    ar: "التحقق من الإخفاء",
  },
  "manualEditor.ui.types.assertEnabled": {
    en: "Assert Enabled",
    ar: "التحقق من التفعيل",
  },
  "manualEditor.ui.types.assertDisabled": {
    en: "Assert Disabled",
    ar: "التحقق من التعطيل",
  },
  "manualEditor.ui.types.assertText": {
    en: "Assert Text",
    ar: "التحقق من النص",
  },
  "manualEditor.ui.types.assertValue": {
    en: "Assert Value",
    ar: "التحقق من القيمة",
  },
  "manualEditor.ui.types.assertUrl": {
    en: "Assert URL",
    ar: "التحقق من الرابط",
  },
  "manualEditor.ui.types.assertTitle": {
    en: "Assert Page Title",
    ar: "التحقق من عنوان الصفحة",
  },
  "manualEditor.locator.role": { en: "Role", ar: "الدور" },
  "manualEditor.locator.label": { en: "Label", ar: "التسمية" },
  "manualEditor.locator.text": { en: "Text", ar: "النص" },
  "manualEditor.locator.testId": { en: "Test ID", ar: "معرّف الاختبار" },
  "manualEditor.locator.placeholder": {
    en: "Placeholder",
    ar: "النص الإرشادي",
  },
  "manualEditor.locator.css": { en: "CSS Selector", ar: "محدد CSS" },
  "manualEditor.api.title": {
    en: "Backend Check Editor",
    ar: "محرر فحص الخلفية",
  },
  "manualEditor.api.subtitle": {
    en: "Configure HTTP requests and response assertions.",
    ar: "اضبط طلبات HTTP وعمليات التحقق من الاستجابة.",
  },
  "manualEditor.api.steps": { en: "API Steps", ar: "خطوات API" },
  "manualEditor.api.step": { en: "API Step {index}", ar: "خطوة API {index}" },
  "manualEditor.api.addStep": { en: "Add API Step", ar: "إضافة خطوة API" },
  "manualEditor.api.removeStep": {
    en: "Remove API Step",
    ar: "إزالة خطوة API",
  },
  "manualEditor.api.method": { en: "Method", ar: "الطريقة" },
  "manualEditor.api.endpoint": { en: "Endpoint", ar: "نقطة النهاية" },
  "manualEditor.api.endpointPlaceholder": {
    en: "/api/resource",
    ar: "/api/resource",
  },
  "manualEditor.api.query": { en: "Query Parameters", ar: "معلمات الاستعلام" },
  "manualEditor.api.queryKey": { en: "Parameter", ar: "المعلمة" },
  "manualEditor.api.queryValue": { en: "Value", ar: "القيمة" },
  "manualEditor.api.addQuery": {
    en: "Add Query Parameter",
    ar: "إضافة معلمة استعلام",
  },
  "manualEditor.api.removeQuery": {
    en: "Remove Query Parameter",
    ar: "إزالة معلمة الاستعلام",
  },
  "manualEditor.api.headers": { en: "Headers", ar: "الترويسات" },
  "manualEditor.api.headerName": { en: "Header Name", ar: "اسم الترويسة" },
  "manualEditor.api.headerValue": { en: "Header Value", ar: "قيمة الترويسة" },
  "manualEditor.api.addHeader": { en: "Add Header", ar: "إضافة ترويسة" },
  "manualEditor.api.removeHeader": {
    en: "Remove Header",
    ar: "إزالة الترويسة",
  },
  "manualEditor.api.body": { en: "Request Body", ar: "نص الطلب" },
  "manualEditor.api.bodyPlaceholder": {
    en: "Enter a JSON request body",
    ar: "أدخل نص طلب بصيغة JSON",
  },
  "manualEditor.api.expectedStatus": {
    en: "Expected Status",
    ar: "الحالة المتوقعة",
  },
  "manualEditor.api.assertions": { en: "Assertions", ar: "عمليات التحقق" },
  "manualEditor.api.assertion": {
    en: "Assertion {index}",
    ar: "عملية التحقق {index}",
  },
  "manualEditor.api.assertionType": { en: "Assertion Type", ar: "نوع التحقق" },
  "manualEditor.api.assertionPath": { en: "JSON Path", ar: "مسار JSON" },
  "manualEditor.api.assertionExpected": {
    en: "Expected Value",
    ar: "القيمة المتوقعة",
  },
  "manualEditor.api.addAssertion": {
    en: "Add Assertion",
    ar: "إضافة عملية تحقق",
  },
  "manualEditor.api.removeAssertion": {
    en: "Remove Assertion",
    ar: "إزالة عملية التحقق",
  },
  "manualEditor.api.assertStatus": { en: "Status Code", ar: "رمز الحالة" },
  "manualEditor.api.assertHeader": {
    en: "Response Header",
    ar: "ترويسة الاستجابة",
  },
  "manualEditor.api.assertJsonPath": {
    en: "JSON Path Value",
    ar: "قيمة مسار JSON",
  },
  "manualEditor.api.assertResponseTime": {
    en: "Response Time",
    ar: "زمن الاستجابة",
  },
  "manualEditor.api.validation.methodRequired": {
    en: "Select an HTTP method.",
    ar: "اختر طريقة HTTP.",
  },
  "manualEditor.api.validation.endpointRequired": {
    en: "Endpoint is required.",
    ar: "نقطة النهاية مطلوبة.",
  },
  "manualEditor.api.validation.endpointInvalid": {
    en: "Enter a valid endpoint.",
    ar: "أدخل نقطة نهاية صالحة.",
  },
  "manualEditor.api.validation.bodyInvalid": {
    en: "Request body must be valid JSON.",
    ar: "يجب أن يكون نص الطلب JSON صالحاً.",
  },
  "manualEditor.api.validation.statusInvalid": {
    en: "Enter a status code from 100 to 599.",
    ar: "أدخل رمز حالة من 100 إلى 599.",
  },
  "manualEditor.api.validation.pathRequired": {
    en: "JSON path is required.",
    ar: "مسار JSON مطلوب.",
  },
  "manualEditor.review.title": { en: "Review Test", ar: "مراجعة الاختبار" },
  "manualEditor.review.subtitle": {
    en: "Review the ordered steps before creating the draft.",
    ar: "راجع الخطوات المرتبة قبل إنشاء المسودة.",
  },
  "manualEditor.review.back": { en: "Back to Editor", ar: "العودة إلى المحرر" },
  "manualEditor.review.createDraft": { en: "Create Draft", ar: "إنشاء مسودة" },
  "manualEditor.errors.title": {
    en: "Some details need attention",
    ar: "بعض التفاصيل تحتاج إلى مراجعة",
  },
  "manualEditor.errors.description": {
    en: "Fix the highlighted fields before continuing.",
    ar: "أصلح الحقول المميزة قبل المتابعة.",
  },
  "manualEditor.errors.noSteps": {
    en: "Add at least one test step.",
    ar: "أضف خطوة اختبار واحدة على الأقل.",
  },
  "manualEditor.errors.invalidSteps": {
    en: "Review the test steps and fix the highlighted errors.",
    ar: "راجع خطوات الاختبار وأصلح الأخطاء المميزة.",
  },
  "manualEditor.success.title": { en: "Draft Created", ar: "تم إنشاء المسودة" },
  "manualEditor.success.description": {
    en: "Your Test Definition Draft is ready for review.",
    ar: "مسودة تعريف الاختبار جاهزة للمراجعة.",
  },
  "manualEditor.success.openDefinition": {
    en: "Open Test Definition",
    ar: "فتح تعريف الاختبار",
  },
  "manualEditor.success.createAnother": {
    en: "Create Another Test",
    ar: "إنشاء اختبار آخر",
  },
  "manualEditor.success.viewDrafts": {
    en: "View in Drafts & Reviews",
    ar: "عرض في المسودات والمراجعات",
  },

  /* Dotted aliases used by editor modules introduced with PR10B. */
  "manual.editor.title": { en: "Manual Editor", ar: "المحرر اليدوي" },
  "manual.editor.ui.title": {
    en: "User Journey Editor",
    ar: "محرر رحلة المستخدم",
  },
  "manual.editor.ui.addStep": { en: "Add UI Step", ar: "إضافة خطوة واجهة" },
  "manual.editor.ui.removeStep": {
    en: "Remove UI Step",
    ar: "إزالة خطوة الواجهة",
  },
  "manual.editor.api.title": {
    en: "Backend Check Editor",
    ar: "محرر فحص الخلفية",
  },
  "manual.editor.api.addStep": { en: "Add API Step", ar: "إضافة خطوة API" },
  "manual.editor.api.removeStep": {
    en: "Remove API Step",
    ar: "إزالة خطوة API",
  },
  "manual.editor.review.title": { en: "Review Test", ar: "مراجعة الاختبار" },
  "manual.editor.review.back": {
    en: "Back to Editor",
    ar: "العودة إلى المحرر",
  },
  "manual.editor.review.createDraft": { en: "Create Draft", ar: "إنشاء مسودة" },
  "manual.editor.errors.title": {
    en: "Some details need attention",
    ar: "بعض التفاصيل تحتاج إلى مراجعة",
  },

  /* PR10E internal-only aliases retained for DiscoveryFlow. The flow is not
   * mounted in the customer Create Test path; do not reuse these in customer UI. */
  "pr10b.discovery.title": { en: "Discovery", ar: "الاستكشاف" },
  "pr10b.discovery.results": { en: "Discovery Results", ar: "نتائج الاستكشاف" },
  "pr10b.discovery.retry": {
    en: "Retry Discovery",
    ar: "إعادة محاولة الاستكشاف",
  },

  /* Stable keys consumed by the PR10B structured editor flow. */
  "pr10b.editor.title": {
    en: "Manual Test Editor",
    ar: "محرر الاختبار اليدوي",
  },
  "pr10b.editor.subtitle": {
    en: "Build a structured UI or API test journey.",
    ar: "أنشئ رحلة اختبار منظمة للواجهة أو لواجهة API.",
  },
  "pr10b.editor.details": { en: "Test Details", ar: "تفاصيل الاختبار" },
  "pr10b.editor.uiActions": { en: "UI Actions", ar: "إجراءات الواجهة" },
  "pr10b.editor.apiRequest": { en: "API Request", ar: "طلب API" },
  "pr10b.editor.actionNumber": {
    en: "Action {number}",
    ar: "الإجراء {number}",
  },
  "pr10b.editor.mixedTitle": { en: "Mixed journey", ar: "رحلة مختلطة" },
  "pr10b.editor.mixedDescription": {
    en: "The draft starts with ordered API and UI steps that you can refine in the Test Definition editor.",
    ar: "تبدأ المسودة بخطوات API وواجهة مرتبة يمكنك تحسينها في محرر تعريف الاختبار.",
  },
  "pr10b.progress.editor": { en: "Editor", ar: "المحرر" },
  "pr10b.progress.review": { en: "Review", ar: "المراجعة" },
  "pr10b.fields.name": { en: "Test name", ar: "اسم الاختبار" },
  "pr10b.fields.journeyType": { en: "Journey type", ar: "نوع الرحلة" },
  "pr10b.fields.description": { en: "Description", ar: "الوصف" },
  "pr10b.fields.role": { en: "Role", ar: "الدور" },
  "pr10b.fields.locator": { en: "Locator", ar: "محدد العنصر" },
  "pr10b.fields.value": { en: "Value", ar: "القيمة" },
  "pr10b.fields.method": { en: "Method", ar: "الطريقة" },
  "pr10b.fields.endpoint": { en: "Endpoint", ar: "نقطة النهاية" },
  "pr10b.fields.query": { en: "Query Parameters", ar: "معلمات الاستعلام" },
  "pr10b.fields.headers": { en: "Headers", ar: "الترويسات" },
  "pr10b.fields.body": { en: "Request Body", ar: "نص الطلب" },
  "pr10b.fields.expectedStatus": {
    en: "Expected Status",
    ar: "الحالة المتوقعة",
  },
  "pr10b.fields.assertions": { en: "Assertions", ar: "عمليات التحقق" },
  "pr10b.journey.ui": { en: "UI", ar: "واجهة المستخدم" },
  "pr10b.journey.api": { en: "API", ar: "واجهة API" },
  "pr10b.journey.mixed": { en: "Mixed", ar: "مختلط" },
  "pr10b.hints.keyValueLines": {
    en: "Enter one key: value pair per line.",
    ar: "أدخل زوج مفتاح: قيمة واحداً في كل سطر.",
  },
  "pr10b.hints.assertionLines": {
    en: "Enter one JSON path = expected value per line.",
    ar: "أدخل مسار JSON = القيمة المتوقعة واحداً في كل سطر.",
  },
  "pr10b.review.mixedStarter": {
    en: "A mixed starter draft will preserve the API-to-UI execution order for further editing.",
    ar: "ستحافظ المسودة المختلطة المبدئية على ترتيب التنفيذ من API إلى الواجهة لمتابعة التعديل.",
  },
  "pr10b.actions.back": { en: "Back", ar: "رجوع" },
  "pr10b.actions.cancel": { en: "Cancel", ar: "إلغاء" },
  "pr10b.actions.edit": { en: "Edit", ar: "تعديل" },
  "pr10b.actions.remove": { en: "Remove", ar: "إزالة" },
  "pr10b.actions.addAction": { en: "Add Action", ar: "إضافة إجراء" },
  "pr10b.actions.review": { en: "Review", ar: "مراجعة" },
  "pr10b.actions.backToEditor": {
    en: "Back to Editor",
    ar: "العودة إلى المحرر",
  },
  "pr10b.actions.createDraft": { en: "Create Draft", ar: "إنشاء مسودة" },
  "pr10b.actions.retry": { en: "Try Again", ar: "حاول مرة أخرى" },
  "pr10b.validation.nameRequired": {
    en: "Test name is required.",
    ar: "اسم الاختبار مطلوب.",
  },
  "pr10b.validation.nameLong": {
    en: "Test name must be 120 characters or fewer.",
    ar: "يجب ألا يتجاوز اسم الاختبار 120 حرفاً.",
  },
  "pr10b.validation.descriptionLong": {
    en: "Description must be 2000 characters or fewer.",
    ar: "يجب ألا يتجاوز الوصف 2000 حرف.",
  },
  "pr10b.validation.urlRequired": {
    en: "URL is required for a navigation action.",
    ar: "الرابط مطلوب لإجراء الانتقال.",
  },
  "pr10b.validation.locatorRequired": {
    en: "A locator is required for this action.",
    ar: "محدد العنصر مطلوب لهذا الإجراء.",
  },
  "pr10b.validation.valueRequired": {
    en: "A value is required for this action.",
    ar: "القيمة مطلوبة لهذا الإجراء.",
  },
  "pr10b.validation.endpointRequired": {
    en: "Endpoint is required.",
    ar: "نقطة النهاية مطلوبة.",
  },
  "pr10b.validation.statusInvalid": {
    en: "Enter a status code from 100 to 599.",
    ar: "أدخل رمز حالة من 100 إلى 599.",
  },
  "pr10b.errors.validation": {
    en: "Some details need attention",
    ar: "بعض التفاصيل تحتاج إلى مراجعة",
  },
  "pr10b.errors.duplicate": {
    en: "A Test Definition with this name already exists",
    ar: "يوجد بالفعل تعريف اختبار بهذا الاسم",
  },
  "pr10b.errors.unavailable": {
    en: "Assuredia is temporarily unavailable",
    ar: "Assuredia غير متاحة مؤقتاً",
  },
  "pr10b.errors.network": {
    en: "Connection lost. You can safely try again.",
    ar: "انقطع الاتصال. يمكنك المحاولة مرة أخرى بأمان.",
  },
  "pr10b.errors.unexpected": {
    en: "Could not create the draft",
    ar: "تعذّر إنشاء المسودة",
  },
  "pr10b.success.definitionId": {
    en: "Test Definition #{id}",
    ar: "تعريف الاختبار #{id}",
  },
  "pr10b.success.open": {
    en: "Open Test Definition",
    ar: "فتح تعريف الاختبار",
  },
  "pr10b.success.another": {
    en: "Create Another Test",
    ar: "إنشاء اختبار آخر",
  },
  /* PR10E internal dictionary: DiscoveryFlow is retained for the future
   * recorder/internal capability and is intentionally not customer-mounted.
   * Keep these translations available for that internal flow; do not reuse them
   * in the current AI-first Create Test UI. */
  "pr10b.discovery.noOrigin": {
    en: "Target URL is not configured. Configure it in Settings.",
    ar: "لم يتم إعداد الرابط المستهدف. قم بإعداده في الإعدادات.",
  },
  "pr10b.discovery.clientLoadFailed": {
    en: "Could not load the target application details.",
    ar: "تعذّر تحميل تفاصيل التطبيق المستهدف.",
  },
  "pr10b.discovery.failed": {
    en: "Discovery failed. Try again.",
    ar: "فشل الاستكشاف. حاول مرة أخرى.",
  },
  "pr10b.discovery.subtitle": {
    en: "Discover testable elements in the configured target application.",
    ar: "اكتشف العناصر القابلة للاختبار في التطبيق المستهدف المُعدّ.",
  },
  "pr10b.discovery.origin": {
    en: "Target Application",
    ar: "التطبيق المستهدف",
  },
  "pr10b.discovery.originHint": {
    en: "Discovery is limited to this configured origin.",
    ar: "يقتصر الاستكشاف على هذا النطاق المُعدّ.",
  },
  "pr10b.discovery.loading": {
    en: "Discovering application…",
    ar: "جاري استكشاف التطبيق...",
  },
  "pr10b.discovery.loadingHint": {
    en: "Reading the page structure. This can take up to 30 seconds.",
    ar: "جارٍ قراءة بنية الصفحة. قد يستغرق ذلك حتى 30 ثانية.",
  },
  "pr10b.discovery.start": { en: "Run Discovery", ar: "تشغيل الاستكشاف" },
  "pr10b.discovery.errorTitle": {
    en: "Discovery could not be completed",
    ar: "تعذّر إكمال الاستكشاف",
  },
  "pr10b.discovery.truncatedTitle": {
    en: "Results were truncated",
    ar: "تم اقتطاع النتائج",
  },
  "pr10b.discovery.truncatedDescription": {
    en: "Only part of the page structure was returned. Review the available elements before continuing.",
    ar: "تم إرجاع جزء فقط من بنية الصفحة. راجع العناصر المتاحة قبل المتابعة.",
  },
  "pr10b.discovery.emptyTitle": {
    en: "No elements discovered",
    ar: "لم يتم اكتشاف عناصر",
  },
  "pr10b.discovery.selectedCount": {
    en: "{count} selected",
    ar: "تم تحديد {count}",
  },
  "pr10b.discovery.filter": { en: "Filter Elements", ar: "تصفية العناصر" },
  "pr10b.discovery.untitledPage": { en: "Untitled Page", ar: "صفحة بلا عنوان" },
  "pr10b.discovery.draftDetails": { en: "Draft Details", ar: "تفاصيل المسودة" },
  "pr10b.discovery.elements": {
    en: "Selected Elements",
    ar: "العناصر المحددة",
  },
  "pr10b.validation.selectionRequired": {
    en: "Select at least one discovered element.",
    ar: "حدّد عنصراً مكتشفاً واحداً على الأقل.",
  },

  /* General controls needed throughout the PR10B workflow. */
  "common.add": { en: "Add", ar: "إضافة" },
  "common.remove": { en: "Remove", ar: "إزالة" },
  "common.continue": { en: "Continue", ar: "متابعة" },
  "common.previous": { en: "Previous", ar: "السابق" },
  "common.selectAll": { en: "Select All", ar: "تحديد الكل" },
  "common.deselectAll": { en: "Deselect All", ar: "إلغاء تحديد الكل" },

  /* ---------- Landing (Figma: public marketing entry) ---------- */
  "landing.badge": { en: "Continuous QA Monitoring", ar: "مراقبة جودة مستمرة" },
  "landing.heroAlways": { en: "Always", ar: "دائماً" },
  "landing.heroOn": { en: "On.", ar: "في الخدمة." },
  "landing.heroQuality": { en: "Quality Assured.", ar: "الجودة مضمونة." },
  "landing.heroCopy": {
    en: "Monitor systems, detect failures, and act instantly with enterprise-grade QA automation and real-time insights.",
    ar: "راقب الأنظمة، واكتشف الإخفاقات، وتصرّف فوراً مع أتمتة اختبار جودة بمستوى المؤسسات ورؤى فورية.",
  },
  "landing.getStarted": { en: "Get Started", ar: "ابدأ الآن" },
  "landing.logIn": { en: "Log In", ar: "تسجيل الدخول" },
  "landing.step.test": { en: "Test", ar: "اختبر" },
  "landing.step.testDesc": {
    en: "Automated UI & API tests run 24/7",
    ar: "اختبارات واجهات وواجهات برمجية آلية تعمل على مدار الساعة",
  },
  "landing.step.detect": { en: "Detect", ar: "اكتشف" },
  "landing.step.detectDesc": {
    en: "Issues detected in real-time",
    ar: "يتم اكتشاف المشكلات في الوقت الفعلي",
  },
  "landing.step.inform": { en: "Inform", ar: "أبلغ" },
  "landing.step.informDesc": {
    en: "Instant alerts with rich context",
    ar: "تنبيهات فورية مع سياق غني",
  },
  "landing.step.action": { en: "Action", ar: "تصرّف" },
  "landing.step.actionDesc": {
    en: "Resolve faster with insights & automation",
    ar: "حُلّ أسرع مع الرؤى والأتمتة",
  },
  "landing.systemStatus": { en: "System Status", ar: "حالة النظام" },
  "landing.allSystems": {
    en: "All Systems Operational",
    ar: "جميع الأنظمة تعمل",
  },
  "landing.uptime": { en: "Uptime", ar: "زمن التشغيل" },
  "landing.feature.ai.title": {
    en: "AI-Powered Insights",
    ar: "رؤى مدعومة بالذكاء الاصطناعي",
  },
  "landing.feature.ai.desc": {
    en: "Smart analysis and self-healing capabilities to keep your tests resilient and up to date.",
    ar: "تحليل ذكي وقدرات إصلاح ذاتي للحفاظ على اختباراتك مرنة ومحدّثة.",
  },
  "landing.feature.monitoring.title": {
    en: "24/7 Monitoring",
    ar: "مراقبة على مدار الساعة",
  },
  "landing.feature.monitoring.desc": {
    en: "Round-the-clock monitoring across all environments to ensure system stability.",
    ar: "مراقبة متواصلة على مدار الساعة عبر جميع البيئات لضمان استقرار النظام.",
  },
  "landing.feature.notifications.title": {
    en: "Instant Notifications",
    ar: "إشعارات فورية",
  },
  "landing.feature.notifications.desc": {
    en: "Real-time alerts via Telegram with rich details and screenshots for faster response.",
    ar: "تنبيهات فورية عبر تيليجرام مع تفاصيل ولقطات شاشة غنية لاستجابة أسرع.",
  },
  "landing.feature.scalable.title": {
    en: "Scalable & Reliable",
    ar: "قابل للتوسع وموثوق",
  },
  "landing.feature.scalable.desc": {
    en: "Built with Docker and AWS for high availability, scalability, and performance.",
    ar: "مبني بتقنيتي Docker و AWS لتوفّر عالٍ وقابلية توسع وأداء ممتاز.",
  },
  "landing.techHeading": {
    en: "Built with best-in-class technologies",
    ar: "مبني بأفضل التقنيات في فئتها",
  },
  "landing.techBlurb": {
    en: "Everything you need to ensure quality, reliability, and confidence in every release.",
    ar: "كل ما تحتاجه لضمان الجودة والموثوقية والثقة في كل إصدار.",
  },
  "pr10b.discovery.selectAll": { en: "Select All", ar: "تحديد الكل" },
  "pr10b.discovery.deselectAll": {
    en: "Deselect All",
    ar: "إلغاء تحديد الكل",
  },
  "pr10b.discovery.emptyDescription": {
    en: "No elements were discovered on this page.",
    ar: "لم يتم اكتشاف أي عناصر في هذه الصفحة.",
  },
  "pr10b.discovery.filterEmpty": {
    en: "No matching elements",
    ar: "لا توجد عناصر مطابقة",
  },
  "pr10b.discovery.filterEmptyHint": {
    en: "Try a different name, role, or locator.",
    ar: "جرّب اسماً أو دوراً أو محدد عنصر مختلفاً.",
  },
  "pr10b.editor.actionType": { en: "Action type", ar: "نوع الإجراء" },
  "pr10b.fields.url": { en: "URL", ar: "الرابط" },
  "pr10b.fields.strategy": {
    en: "Locator strategy",
    ar: "استراتيجية تحديد العنصر",
  },
  "pr10b.fields.duration": { en: "Duration (ms)", ar: "المدة (مللي ثانية)" },
  "pr10b.fields.expectedResult": {
    en: "Expected result (optional)",
    ar: "النتيجة المتوقعة (اختياري)",
  },

  "landing.copyright": {
    en: "© 2026 Assuredia QA Monitoring. All rights reserved.",
    ar: "© 2026 Assuredia QA Monitoring. All rights reserved.",
  },

  /* ---------- PR10C AI Test Builder ---------- */
  "pr10c.page.eyebrow": { en: "AI Test Builder", ar: "منشئ الاختبارات الذكي" },
  "pr10c.page.title": { en: "Create a Test", ar: "إنشاء اختبار" },
  "pr10c.page.subtitle": {
    en: "Describe what you want to verify. Assuredia will help build the test for you.",
    ar: "صف ما تريد التحقق منه. ستساعدك Assuredia في بناء الاختبار.",
  },
  "pr10c.page.subtitleBuilding": {
    en: "Assuredia is building your test.",
    ar: "تقوم Assuredia ببناء اختبارك.",
  },
  "pr10c.page.subtitleReview": {
    en: "Review and refine your proposed test.",
    ar: "راجع الاختبار المقترح وقم بتحسينه.",
  },
  "pr10c.page.secureNotice": {
    en: "Secure credentials are stored and managed in Settings. Assuredia never exposes credential values.",
    ar: "تُخزن بيانات الاعتماد الآمنة وتُدار في الإعدادات. لا تعرض Assuredia قيم بيانات الاعتماد أبدًا.",
  },
  "pr10c.page.otherWays": {
    en: "Other ways to create a test",
    ar: "طرق أخرى لإنشاء اختبار",
  },
  "pr10c.type.userJourney": { en: "User Journey", ar: "رحلة المستخدم" },
  "pr10c.type.backendCheck": { en: "Backend Check", ar: "فحص الواجهة الخلفية" },
  "pr10c.type.endToEnd": { en: "End-to-End", ar: "شامل" },
  "pr10c.composer.placeholder": {
    en: "Describe what you want to verify...",
    ar: "صف ما تريد التحقق منه...",
  },
  "pr10c.composer.intentLabel": {
    en: "Test intent description",
    ar: "وصف الغرض من الاختبار",
  },
  "pr10c.composer.build": { en: "Build Test", ar: "بناء الاختبار" },
  "pr10c.composer.minLengthHint": {
    en: "Describe your test in at least 11 characters.",
    ar: "اوصف اختبارك بما لا يقل عن 11 حرفًا.",
  },
  "pr10c.composer.addCredential": { en: "Add credential", ar: "إضافة بيانات اعتماد" },
  "pr10c.composer.typeLabel": { en: "Test type", ar: "نوع الاختبار" },
  "pr10c.composer.tryExample": { en: "Try an example", ar: "جرّب مثالًا" },
  "pr10c.composer.credentialLabel": {
    en: "Secure credential selection",
    ar: "اختيار بيانات الاعتماد الآمنة",
  },
  "pr10c.credential.configured": { en: "Configured", ar: "مُعد" },
  "pr10c.credential.notConfigured": { en: "Not configured", ar: "غير مُعد" },
  "pr10c.credential.notConfiguredHint": {
    en: "Not configured — set up in Settings.",
    ar: "غير مُعد — قم بالإعداد في الإعدادات.",
  },
  "pr10c.credential.none": { en: "No credential", ar: "بدون بيانات اعتماد" },
  "pr10c.credential.managedNote": {
    en: "Managed in Settings · values never shown",
    ar: "تُدار في الإعدادات · لا تُعرض القيم أبدًا",
  },
  "pr10c.credential.defaultName": {
    en: "Secure Credential",
    ar: "بيانات اعتماد آمنة",
  },
  "pr10c.stages.understanding": {
    en: "Understanding your test...",
    ar: "جارٍ فهم اختبارك...",
  },
  "pr10c.stages.exploring": {
    en: "Exploring the application...",
    ar: "جارٍ استكشاف التطبيق...",
  },
  "pr10c.stages.planning": {
    en: "Planning the test...",
    ar: "جارٍ تخطيط الاختبار...",
  },
  "pr10c.stages.validating": {
    en: "Validating the proposed flow...",
    ar: "جارٍ التحقق من التدفق المقترح...",
  },
  "pr10c.building.aiBadge": { en: "AI", ar: "AI" },
  "pr10c.building.title": { en: "Building your {type}", ar: "جارٍ بناء {type}" },
  "pr10c.building.subtitle": {
    en: "Assuredia is planning your test — no technical input required.",
    ar: "تخطط Assuredia لاختبارك — لا يلزم أي إدخال تقني.",
  },
  "pr10c.building.cancel": { en: "Cancel", ar: "إلغاء" },
  "pr10c.live.header": { en: "Live Discovery in Progress", ar: "الاكتشاف المباشر قيد التقدم" },
  "pr10c.live.target": { en: "Target:", ar: "الهدف:" },
  "pr10c.live.active": { en: "Active", ar: "نشط" },
  "pr10c.live.failed": { en: "Failed", ar: "فشل" },
  "pr10c.live.cancel": { en: "Cancel Discovery", ar: "إلغاء الاكتشاف" },
  "pr10c.live.sandbox_note": { en: "Protected execution sandbox", ar: "بيئة تنفيذ آمنة ومحميّة" },
  "pr10c.live.still_working": { en: "Still working securely…", ar: "لا يزال العمل جارياً بأمان…" },
  "pr10c.live.try_again": { en: "Try Again", ar: "حاول مرة أخرى" },
  "pr10c.live.edit_intent": { en: "Edit Intent", ar: "تعديل الغرض" },
  "pr10c.live.error_hint": { en: "Could not reach the application", ar: "تعذر الوصول إلى التطبيق" },
  "pr10c.live.cancel_title": { en: "Cancel planning?", ar: "إلغاء التخطيط؟" },
  "pr10c.live.cancel_body": { en: "Your current progress will be lost.", ar: "سيتم فقدان تقدمك الحالي." },
  "pr10c.live.cancel_no": { en: "Continue", ar: "متابعة" },
  "pr10c.live.cancel_yes": { en: "Cancel", ar: "إلغاء" },
  // Localized stage titles for the live discovery feed (PR10C.6). The backend
  // sends business-safe English phrases; the frontend maps the stage token to
  // these keys and falls back to the wire message for unknown stages.
  "pr10c.live.stage.start": { en: "Reading your request", ar: "قراءة طلبك" },
  "pr10c.live.stage.mcp_warmup": { en: "Warming up the sandbox", ar: "تهيئة بيئة التشغيل الآمنة" },
  "pr10c.live.stage.mcp_ready": { en: "Sandbox ready", ar: "البيئة الآمنة جاهزة" },
  "pr10c.live.stage.navigate_start": { en: "Opening your application", ar: "فتح تطبيقك" },
  "pr10c.live.stage.navigate_done": { en: "Application loaded", ar: "تم تحميل التطبيق" },
  "pr10c.live.stage.snapshot_done": { en: "Page structure captured", ar: "تم التقاط بنية الصفحة" },
  "pr10c.live.stage.elements_parsed": { en: "Identifying key actions", ar: "تحديد الإجراءات الرئيسية" },
  "pr10c.live.stage.locators_start": { en: "Computing reliable element targets", ar: "حساب أهداف العناصر الموثوقة" },
  "pr10c.live.stage.locators_done": { en: "Element targets ready", ar: "أهداف العناصر جاهزة" },
  "pr10c.live.stage.ui_discovery_warning": { en: "Opening your application", ar: "فتح تطبيقك" },
  "pr10c.live.stage.api_probe_start": { en: "Checking for API documentation", ar: "التحقق من توثيق API" },
  "pr10c.live.stage.api_probe_done": { en: "API catalog discovered", ar: "تم اكتشاف كتالوج API" },
  "pr10c.live.stage.api_probe_warning": { en: "No API spec found", ar: "لم يتم العثور على مواصفات API" },
  "pr10c.live.stage.api_probe_failed": { en: "No API spec found", ar: "لم يتم العثور على مواصفات API" },
  "pr10c.live.stage.evidence_start": { en: "Capturing evidence", ar: "التقاط الأدلة" },
  "pr10c.live.stage.evidence_done": { en: "Evidence captured", ar: "تم التقاط الأدلة" },
  "pr10c.live.stage.ai_start": { en: "Planning your test journey", ar: "تخطيط رحلة اختبارك" },
  "pr10c.live.stage.ai_done": { en: "Plan designed", ar: "تم تصميم الخطة" },
  "pr10c.live.stage.validate_start": { en: "Verifying the plan works", ar: "التحقق من صلاحية الخطة" },
  "pr10c.live.stage.validate_done": { en: "Plan is executable", ar: "الخطة قابلة للتنفيذ" },
  "pr10c.live.stage.ready": { en: "Your test is ready to review", ar: "اختبارك جاهز للمراجعة" },
  "pr10c.plan.needsDiscovery": {
    en: "Application exploration needed",
    ar: "يلزم استكشاف التطبيق",
  },
  "pr10c.plan.bound": { en: "Bound", ar: "مرتبط" },
  "pr10c.plan.boundHint": {
    en: "Auto-bound to an element found during exploration",
    ar: "تم ربطه تلقائيًا بعنصر تم العثور عليه أثناء الاستكشاف",
  },
  "pr10c.plan.needsBinding": { en: "Needs binding", ar: "يحتاج ربطًا" },
  "pr10c.plan.needsBindingHint": {
    en: "No matching element was found, so this action has no target yet. Edit the definition source to bind it.",
    ar: "لم يتم العثور على عنصر مطابق، لذا لا يوجد هدف لهذا الإجراء بعد. حرّر مصدر التعريف لربطه.",
  },
  "pr10c.review.bindingSummary": {
    en: "{bound} of {total} actions bound automatically",
    ar: "تم ربط {bound} من {total} إجراءً تلقائيًا",
  },
  "pr10c.review.bindingAllBound": {
    en: "Every action is bound and ready to run.",
    ar: "كل الإجراءات مرتبطة وجاهزة للتشغيل.",
  },
  "pr10c.review.bindingUnbound": {
    en: "Still needs a target:",
    ar: "لا يزال يحتاج هدفًا:",
  },
  "pr10c.review.bindingStillUsable": {
    en: "You can create the draft now — an unbound action fails its run visibly rather than passing silently, and can be bound in the definition source.",
    ar: "يمكنك إنشاء المسودة الآن — الإجراء غير المرتبط يفشل في تشغيله بشكل ظاهر بدلًا من النجاح الصامت، ويمكن ربطه في مصدر التعريف.",
  },
  "pr10c.advanced.title": {
    en: "Advanced Options",
    ar: "خيارات متقدمة",
  },
  "pr10c.advanced.manualJourney": {
    en: "Manual User Journey",
    ar: "رحلة مستخدم يدوية",
  },
  "pr10c.advanced.manualBackend": {
    en: "Manual Backend Check",
    ar: "فحص خلفية يدوي",
  },
  "pr10c.plan.actionLabel": { en: "Action", ar: "إجراء" },
  "pr10c.plan.moveUp": { en: "Move action up", ar: "نقل الإجراء لأعلى" },
  "pr10c.plan.moveDown": { en: "Move action down", ar: "نقل الإجراء لأسفل" },
  "pr10c.plan.delete": { en: "Delete", ar: "حذف" },
  "pr10c.plan.deleteAction": { en: "Delete action", ar: "حذف الإجراء" },
  "pr10c.plan.addAction": { en: "+ Add action manually", ar: "+ إضافة إجراء يدويًا" },
  "pr10c.plan.expectedResults": {
    en: "Expected Results",
    ar: "النتائج المتوقعة",
  },
  "pr10c.plan.actionsProposed": {
    en: "{count} actions proposed",
    ar: "تم اقتراح {count} من الإجراءات",
  },
  "pr10c.plan.actionsCount": {
    en: "{count} actions",
    ar: "{count} من الإجراءات",
  },
  "pr10c.plan.proposedTitle": {
    en: "Here's what Assuredia proposes",
    ar: "إليك ما تقترحه Assuredia",
  },
  "pr10c.plan.testName": { en: "Test name", ar: "اسم الاختبار" },
  "pr10c.plan.reviseTitle": {
    en: "Ask Assuredia to revise this test",
    ar: "اطلب من Assuredia مراجعة هذا الاختبار",
  },
  "pr10c.plan.revisePlaceholder": {
    en: 'E.g. "Also verify that the order total is correct."',
    ar: 'مثال: "تحقق أيضًا من صحة إجمالي الطلب."',
  },
  "pr10c.plan.reviseAction": { en: "Update Test", ar: "تحديث الاختبار" },
  "pr10c.plan.editIntent": { en: "Edit intent", ar: "تحرير الغرض" },
  "pr10c.plan.review": { en: "Review Test", ar: "مراجعة الاختبار" },
  "pr10c.review.title": { en: "Review your test", ar: "راجع اختبارك" },
  "pr10c.review.subtitle": {
    en: "Confirm the details before creating your Test Draft.",
    ar: "أكّد التفاصيل قبل إنشاء مسودة الاختبار.",
  },
  "pr10c.review.testInformation": {
    en: "Test Information",
    ar: "معلومات الاختبار",
  },
  "pr10c.review.name": { en: "Name", ar: "الاسم" },
  "pr10c.review.type": { en: "Type", ar: "النوع" },
  "pr10c.review.targetApplication": {
    en: "Target Application",
    ar: "التطبيق المستهدف",
  },
  "pr10c.review.targetMissing": {
    en: "Not configured — set it in Settings.",
    ar: "غير مُعد — قم بإعداده في الإعدادات.",
  },
  "pr10c.review.authentication": { en: "Authentication", ar: "المصادقة" },
  "pr10c.review.notRequired": { en: "Not required", ar: "غير مطلوب" },
  "pr10c.review.creation": { en: "Creation", ar: "الإنشاء" },
  "pr10c.review.aiTestBuilder": {
    en: "AI Test Builder",
    ar: "منشئ الاختبارات الذكي",
  },
  "pr10c.review.executionPlan": { en: "Execution Plan", ar: "خطة التنفيذ" },
  "pr10c.review.draftNote": {
    en: "This test will be saved as a Test Draft and will not be activated automatically. It follows the standard review and approval process.",
    ar: "سيُحفظ هذا الاختبار كمسودة اختبار ولن يتم تفعيله تلقائيًا. وهو يتبع عملية المراجعة والاعتماد المعيارية.",
  },
  "pr10c.review.back": { en: "Back to proposed", ar: "رجوع إلى المقترح" },
  "pr10c.review.create": { en: "Create Test Draft", ar: "إنشاء مسودة اختبار" },
  "pr10c.success.title": { en: "Test Draft Created", ar: "تم إنشاء مسودة الاختبار" },
  "pr10c.success.subtitle": {
    en: "Your test has been saved as a draft and is ready for review.",
    ar: "تم حفظ اختبارك كمسودة وهو جاهز للمراجعة.",
  },
  "pr10c.success.draftBadge": { en: "DRAFT", ar: "مسودة" },
  "pr10c.success.openTest": { en: "Open Test", ar: "فتح الاختبار" },
  "pr10c.success.viewDrafts": {
    en: "View in Drafts & Reviews",
    ar: "عرض في المسودات والمراجعات",
  },
  "pr10c.success.createAnother": {
    en: "Create Another Test",
    ar: "إنشاء اختبار آخر",
  },
  "pr10c.clarification.title": {
    en: "I need a bit more detail",
    ar: "أحتاج إلى مزيد من التفاصيل",
  },
  "pr10c.clarification.subtitle": {
    en: "Answer below and continue planning.",
    ar: "أجب أدناه وتابع التخطيط.",
  },
  "pr10c.clarification.answerPlaceholder": {
    en: "Type your answer...",
    ar: "اكتب إجابتك...",
  },
  "pr10c.clarification.continue": {
    en: "Continue Planning",
    ar: "متابعة التخطيط",
  },
  "pr10c.category.missingObjective": {
    en: "Missing Objective",
    ar: "هدف مفقود",
  },
  "pr10c.category.missingApplication": {
    en: "Missing Application",
    ar: "تطبيق مفقود",
  },
  "pr10c.category.missingCredential": {
    en: "Missing Credential",
    ar: "بيانات اعتماد مفقودة",
  },
  "pr10c.category.unclearOutcome": {
    en: "Unclear Outcome",
    ar: "نتيجة غير واضحة",
  },
  "pr10c.category.unsupportedCapability": {
    en: "Unsupported Capability",
    ar: "قدرة غير مدعومة",
  },
  "pr10c.category.default": { en: "Clarification", ar: "توضيح" },
  "pr10c.preflight.targetMissingTitle": {
    en: "Target application not configured",
    ar: "التطبيق المستهدف غير مُعد",
  },
  "pr10c.preflight.targetMissingBody": {
    en: "Before Assuredia can explore your application, configure the target application in Settings.",
    ar: "قبل أن تتمكن Assuredia من استكشاف تطبيقك، قم بإعداد التطبيق المستهدف في الإعدادات.",
  },
  "pr10c.auth.requiredTitle": {
    en: "Authentication required",
    ar: "المصادقة مطلوبة",
  },
  "pr10c.auth.requiredBody": {
    en: "The selected Secure Credential is not configured. Set it up in Settings, or continue without a credential.",
    ar: "بيانات الاعتماد الآمنة المحددة غير مُعدة. قم بإعدادها في الإعدادات، أو تابع بدون بيانات اعتماد.",
  },
  "pr10c.auth.continueWithout": {
    en: "Continue without credential",
    ar: "المتابعة بدون بيانات اعتماد",
  },
  "pr10c.confirm.creating": {
    en: "Creating your Test Draft...",
    ar: "جارٍ إنشاء مسودة الاختبار...",
  },
  "pr10c.confirm.creatingHint": {
    en: "This usually takes a few seconds.",
    ar: "يستغرق هذا عادة بضع ثوانٍ.",
  },
  "pr10c.confirm.networkError": {
    en: "Could not reach Assuredia. Check your connection and try again.",
    ar: "تعذّر الوصول إلى Assuredia. تحقق من اتصالك وحاول مجددًا.",
  },
  "pr10c.confirm.tryAgain": { en: "Try again", ar: "حاول مجددًا" },
  "pr10c.confirm.dismiss": { en: "Dismiss", ar: "إغلاق" },
  "pr10c.duplicate.title": {
    en: "Already confirmed",
    ar: "تم التأكيد مسبقًا",
  },
  "pr10c.duplicate.body": {
    en: "This plan was already confirmed. You can find the draft in Drafts & Reviews.",
    ar: "تم تأكيد هذه الخطة مسبقًا. يمكنك العثور على المسودة في المسودات والمراجعات.",
  },
  "pr10c.errors.network": {
    en: "Could not reach Assuredia. Check your connection and try again.",
    ar: "تعذّر الوصول إلى Assuredia. تحقق من اتصالك وحاول مجددًا.",
  },
  "pr10c.errors.unexpected": {
    en: "Something went wrong. Please try again.",
    ar: "حدث خطأ ما. يرجى المحاولة مجددًا.",
  },
  "pr10c.other.recordTitle": { en: "Record a Journey", ar: "تسجيل رحلة" },
  "pr10c.other.recordDescription": {
    en: "Interact with your application while Assuredia records the journey.",
    ar: "تفاعل مع تطبيقك بينما تسجل Assuredia الرحلة.",
  },
  "pr10c.other.recordCta": { en: "Start Recording", ar: "بدء التسجيل" },
  "pr10c.other.importTitle": {
    en: "Import API Specification",
    ar: "استيراد مواصفات API",
  },
  "pr10c.other.importDescription": {
    en: "Create backend tests from an existing API specification.",
    ar: "إنشاء اختبارات خلفية من مواصفات API موجودة.",
  },
  "pr10c.other.importCta": {
    en: "Import Specification",
    ar: "استيراد المواصفات",
  },
  "pr10c.other.engineerTitle": { en: "Ask an Engineer", ar: "اسأل مهندسًا" },
  "pr10c.other.engineerDescription": {
    en: "Need help creating a test? Request assistance from an Assuredia engineer.",
    ar: "تحتاج مساعدة في إنشاء اختبار؟ اطلب المساعدة من مهندس Assuredia.",
  },
  "pr10c.other.engineerCta": { en: "Submit Request", ar: "إرسال الطلب" },
  "pr10c.other.existingTitle": {
    en: "Use an Existing Test",
    ar: "استخدام اختبار موجود",
  },
  "pr10c.other.existingDescription": {
    en: "Create a new test from an existing test definition.",
    ar: "إنشاء اختبار جديد من تعريف اختبار موجود.",
  },
  "pr10c.other.existingCta": { en: "Browse Tests", ar: "تصفح الاختبارات" },
  "pr10c.other.comingSoon": { en: "Coming soon", ar: "قريبًا" },
  "pr10c.home.aiTitle": { en: "Build with AI", ar: "أنشئ بالذكاء الاصطناعي" },
  "pr10c.home.aiDescription": {
    en: "Describe what to verify and let the AI Test Builder draft the test for review.",
    ar: "صف ما تريد التحقق منه ودع منشئ الاختبارات الذكي يعد المسودة للمراجعة.",
  },
  "pr10c.home.aiAction": { en: "Start Building", ar: "بدء البناء" },

  /* ---------- Evidence Panel ---------- */
  "evidence.title": { en: "Discovery Evidence", ar: "دليل الاستكشاف" },
  "evidence.subtitle": {
    en: "What Assuredia observed during planning",
    ar: "ما رصدته Assuredia أثناء التخطيط",
  },
  "evidence.toggle": { en: "View Evidence", ar: "عرض الدليل" },
  "evidence.close": { en: "Close evidence", ar: "إغلاق الدليل" },
  "evidence.summary.backendOperations": { en: "{count} backend operations", ar: "{count} عملية خلفية" },
  "evidence.summary.networkRequests": { en: "{count} network requests", ar: "{count} طلب شبكة" },
  "evidence.overview": { en: "Overview", ar: "نظرة عامة" },
  "evidence.app": { en: "App Discovery", ar: "استكشاف التطبيق" },
  "evidence.backend": { en: "Backend Discovery", ar: "استكشاف الواجهة الخلفية" },
  "evidence.network": { en: "Network Activity", ar: "نشاط الشبكة" },
  "evidence.header.origin": { en: "Target Application", ar: "التطبيق المستهدف" },
  "evidence.header.pageTitle": { en: "Page Title", ar: "عنوان الصفحة" },
  "evidence.header.pageUrl": { en: "Page URL", ar: "رابط الصفحة" },
  "evidence.header.duration": { en: "Discovery Duration", ar: "مدة الاستكشاف" },
  "evidence.elements.title": { en: "Elements Discovered", ar: "العناصر المكتشفة" },
  "evidence.elements.count": { en: "{count} elements found", ar: "تم العثور على {count} عنصر" },
  "evidence.elements.truncated": { en: "Showing first {shown} of {total}", ar: "عرض أول {shown} من أصل {total}" },
  "evidence.elements.candidate": { en: "Suggested Target", ar: "الهدف المقترح" },
  "evidence.elements.suggested": { en: "Suggested", ar: "مقترح" },
  "evidence.elements.noCandidate": { en: "Container element — no candidate", ar: "عنصر حاوية — لا يوجد هدف مقترح" },
  "evidence.elements.empty": { en: "No elements were discovered on this page.", ar: "لم يتم اكتشاف عناصر في هذه الصفحة." },
  "evidence.backend.method": { en: "Method", ar: "الطريقة" },
  "evidence.backend.path": { en: "Path", ar: "المسار" },
  "evidence.backend.summary": { en: "Summary", ar: "الملخص" },
  "evidence.backend.tags": { en: "Tags", ar: "الوسوم" },
  "evidence.backend.statuses": { en: "Expected Statuses", ar: "الحالات المتوقعة" },
  "evidence.backend.empty": { en: "No backend operations were cataloged.", ar: "لم يتم فهرسة عمليات للواجهة الخلفية." },
  "evidence.network.failed": { en: "Failed", ar: "فشل" },
  "evidence.network.empty": { en: "No network requests were captured.", ar: "لم يتم التقاط طلبات شبكة." },
  "evidence.empty.title": { en: "No Evidence Available", ar: "لا يوجد دليل متاح" },
  "evidence.empty.body": { en: "Discovery produced no observable results.", ar: "لم ينتج الاستكشاف نتائج قابلة للرصد." },
  "evidence.partial": { en: "Partial evidence", ar: "دليل جزئي" },
  "evidence.degrade.spec_not_found": { en: "No API spec found — API steps need manual endpoint binding.", ar: "لم يتم العثور على مواصفات API — تحتاج خطوات الواجهة الخلفية إلى ربط يدوي." },
  "evidence.degrade.spec_invalid": { en: "The API spec couldn't be read — API steps need manual endpoint binding.", ar: "تعذّرت قراءة مواصفات API — تحتاج خطوات الواجهة الخلفية إلى ربط يدوي." },
  "evidence.degrade.target_unreachable": { en: "The API host was unreachable — API steps need manual endpoint binding.", ar: "تعذّر الوصول إلى مضيف API — تحتاج خطوات الواجهة الخلفية إلى ربط يدوي." },
  "evidence.degrade.discovery_timeout": { en: "API discovery timed out — API steps need manual endpoint binding.", ar: "انتهت مهلة استكشاف API — تحتاج خطوات الواجهة الخلفية إلى ربط يدوي." },
  "evidence.degrade.discovery_failed": { en: "API endpoints couldn't be discovered — API steps need manual endpoint binding.", ar: "تعذّر اكتشاف نقاط API — تحتاج خطوات الواجهة الخلفية إلى ربط يدوي." },
}

type LangContextValue = {
  lang: Lang
  setLang: (l: Lang) => void
  /** Translate a static UI key. `{var}` placeholders are interpolated. Backend values must never be passed through here. */
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LangCtx = createContext<LangContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* ignore storage failures */
    }
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const entry = dict[key]
      let text = entry ? entry[lang] : key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(value))
        }
      }
      return text
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangCtx)
  if (!ctx) throw new Error("useLang must be used inside <LanguageProvider>")
  return ctx
}

/**
 * Non-reactive translation for code paths outside React render (data
 * mappers, API error mapping). Reads the persisted language directly from
 * localStorage — the same source LanguageProvider initializes from.
 * Components should prefer useLang().t so they re-render on language change.
 */
export function translate(
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = dict[key]
  let text = entry ? entry[readLang()] : key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

/** BCP-47 locale matching the persisted language (Latin numerals in Arabic). */
export function langLocale(): string {
  return readLang() === "ar" ? "ar-u-nu-latn" : "en-US"
}
