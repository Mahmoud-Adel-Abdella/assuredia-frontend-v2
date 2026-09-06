import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

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

type Entry = { en: string; ar: string }

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
  "header.allSystems": { en: "All systems operational", ar: "جميع الأنظمة تعمل" },
  "header.switchToLight": { en: "Switch to light mode", ar: "التبديل إلى الوضع الفاتح" },
  "header.switchToDark": { en: "Switch to dark mode", ar: "التبديل إلى الوضع الداكن" },
  "header.unreadAlerts": { en: "{count} unread alerts", ar: "{count} تنبيهات غير مقروءة" },
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
  "common.saveFailed": { en: "Could not save changes", ar: "تعذّر حفظ التغييرات" },
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
  "common.nothingToDisplay": { en: "Nothing to display yet.", ar: "لا يوجد ما يُعرض بعد." },
  "common.aiAnalysisAvailable": { en: "AI Analysis Available", ar: "تحليل الذكاء الاصطناعي متاح" },
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
  "run.failedTestsCount": { en: "{count} tests failed.", ar: "فشل {count} اختبار." },
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
  "run.executionTimeline": { en: "Execution timeline", ar: "الخط الزمني للتنفيذ" },
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
  "dashboard.testHealthLoadFailed": { en: "Couldn't load test health", ar: "تعذّر تحميل صحة الاختبارات" },
  "dashboard.noTestActivity": { en: "No test activity yet", ar: "لا يوجد نشاط اختبار بعد" },
  "dashboard.noTestActivityDesc": {
    en: "Once your first flow run completes, the pass/fail trend for your workspace will appear here.",
    ar: "بمجرد اكتمال أول تشغيل لتدفق، سيظهر هنا اتجاه النجاح والفشل لمساحة عملك.",
  },
  "dashboard.recentRunsLoadFailed": { en: "Couldn't load recent runs", ar: "تعذّر تحميل عمليات التشغيل الأخيرة" },
  "dashboard.noRunsYet": { en: "No runs yet", ar: "لا توجد عمليات تشغيل بعد" },
  "dashboard.noRunsYetDesc": {
    en: "Run your first flow and the latest executions will show up here.",
    ar: "شغّل تدفقك الأول وستظهر أحدث عمليات التنفيذ هنا.",
  },
  "dashboard.noMatchingRuns": { en: "No matching runs", ar: "لا توجد عمليات تشغيل مطابقة" },
  "dashboard.noMatchingRunsDesc": {
    en: "None of the latest runs are {filter}. Try a different filter.",
    ar: "لا توجد عمليات تشغيل حديثة بحالة «{filter}». جرّب مرشحاً مختلفاً.",
  },
  "dashboard.recentFailuresLoadFailed": { en: "Couldn't load recent failures", ar: "تعذّر تحميل الإخفاقات الأخيرة" },
  "dashboard.noRecentFailures": { en: "No recent failures", ar: "لا توجد إخفاقات حديثة" },
  "dashboard.noRecentFailuresDesc": {
    en: "Good news — none of your latest runs have failed.",
    ar: "أخبار جيدة — لم تفشل أي من عمليات التشغيل الأخيرة.",
  },
  "dashboard.noClientLinked": { en: "No client environment linked", ar: "لا توجد بيئة عميل مرتبطة" },
  "dashboard.noClientLinkedDesc": {
    en: "This account isn't attached to a client workspace, so there is no dashboard data to show. Contact your administrator.",
    ar: "هذا الحساب غير مرتبط بمساحة عمل عميل، لذلك لا توجد بيانات للعرض في لوحة التحكم. تواصل مع المسؤول.",
  },
  "dashboard.loadFailed": { en: "Couldn't load dashboard data", ar: "تعذّر تحميل بيانات لوحة التحكم" },

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
  "schedule.runsEvery15m": { en: "Runs every 15 minutes", ar: "يعمل كل 15 دقيقة" },
  "schedule.runsEvery30m": { en: "Runs every 30 minutes", ar: "يعمل كل 30 دقيقة" },
  "schedule.runsEvery2h": { en: "Runs every 2 hours", ar: "يعمل كل ساعتين" },
  "schedule.runsEvery6h": { en: "Runs every 6 hours", ar: "يعمل كل 6 ساعات" },
  "schedule.dailyAt": { en: "Daily at {time}", ar: "يومياً في {time}" },
  "schedule.weeklyMonAt": { en: "Weekly (Mon) at {time}", ar: "أسبوعياً (الاثنين) في {time}" },
  "schedule.freqAt": { en: "{frequency} at {time}", ar: "{frequency} في {time}" },
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
  "automations.form.nameLabel": { en: "Automation name *", ar: "اسم الأتمتة *" },
  "automations.form.namePlaceholder": { en: "e.g. Regression Suite", ar: "مثال: حزمة اختبار التراجع" },
  "automations.form.nameRequired": { en: "Automation name is required.", ar: "اسم الأتمتة مطلوب." },
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
  "automations.form.allFlowsAdded": { en: "All available flows have been added.", ar: "تمت إضافة جميع التدفقات المتاحة." },
  "automations.form.flowsRequired": { en: "Every flow entry needs a selected flow.", ar: "كل إدخال تدفق يحتاج إلى تدفق محدد." },
  "automations.form.selectTestsRequired": {
    en: "Select at least one test for every flow that uses Selected Tests.",
    ar: "اختر اختباراً واحداً على الأقل لكل تدفق يستخدم الاختبارات المحددة.",
  },
  "automations.form.flowN": { en: "Flow {index}", ar: "التدفق {index}" },
  "automations.form.flowLabel": { en: "Flow", ar: "التدفق" },
  "automations.form.moveUp": { en: "Move up", ar: "نقل لأعلى" },
  "automations.form.moveDown": { en: "Move down", ar: "نقل لأسفل" },
  "automations.form.removeFlow": { en: "Remove flow", ar: "إزالة التدفق" },
  "automations.form.selectFlowPlaceholder": { en: "Select a flow…", ar: "اختر تدفقاً…" },
  "automations.form.runScope": { en: "Run scope", ar: "نطاق التشغيل" },
  "automations.form.selectTests": { en: "Select tests", ar: "اختيار الاختبارات" },
  "automations.form.selectedCount": { en: "{selected} / {total} selected", ar: "{selected} / {total} محدد" },
  "automations.form.loadingTests": { en: "Loading tests…", ar: "جارٍ تحميل الاختبارات…" },
  "automations.form.testsLoadFailed": {
    en: "Could not load this flow's tests.",
    ar: "تعذّر تحميل اختبارات هذا التدفق.",
  },
  "automations.form.noTestsInFlow": {
    en: "This flow has no tests. Add tests to the flow first, or use Full Flow.",
    ar: "لا توجد اختبارات لهذا التدفق. أضف اختبارات إلى التدفق أولاً، أو استخدم التدفق الكامل.",
  },
  "automations.form.summaryTitle": { en: "Automation Summary", ar: "ملخص الأتمتة" },
  "automations.form.untitled": { en: "Untitled", ar: "بدون عنوان" },
  "automations.form.testsLabel": { en: "Tests", ar: "الاختبارات" },
  "automations.form.noFlow": { en: "No flow", ar: "لا يوجد تدفق" },
  "automations.form.fullScopeShort": { en: "Full", ar: "كامل" },
  "automations.form.scheduleTitle": { en: "Schedule", ar: "الجدول" },
  "automations.form.scheduleHint": { en: "Optionally run on a recurring schedule.", ar: "يمكن التشغيل اختيارياً حسب جدول متكرر." },
  "automations.form.enable": { en: "Enable", ar: "تفعيل" },
  "automations.form.notScheduledHintBefore": { en: "Not scheduled — run manually using ", ar: "غير مجدول — شغّل يدوياً باستخدام " },
  "automations.form.notScheduledSummary": { en: "Not scheduled", ar: "غير مجدول" },
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
  "automations.form.useAccountTz": { en: "Use account timezone", ar: "استخدام المنطقة الزمنية للحساب" },
  "automations.form.customTz": { en: "Custom timezone", ar: "منطقة زمنية مخصصة" },
  "automations.form.fromSettingsTzBefore": { en: "From Settings ", ar: "من الإعدادات " },
  "automations.form.fromSettingsTzAfter": { en: " Timezone", ar: " المنطقة الزمنية" },
  "automations.form.notificationsTitle": { en: "Notifications", ar: "الإشعارات" },
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
  "automations.form.saveAutomation": { en: "Save Automation", ar: "حفظ الأتمتة" },
  "automations.form.loadingFlows": { en: "Loading flows…", ar: "جارٍ تحميل التدفقات…" },
  "automations.form.flowsLoadFailed": { en: "Could not load flows", ar: "تعذّر تحميل التدفقات" },
  "automations.form.flowsLoadError": { en: "Could not load flows.", ar: "تعذّر تحميل التدفقات." },
  "automations.form.executionLabel": { en: "Execution", ar: "التنفيذ" },
  "automations.form.execManualScheduled": { en: "Manual + Scheduled", ar: "يدوي + مجدول" },

  /* ---------- Automations list / detail ---------- */
  "automations.moreOptions": { en: "More options", ar: "مزيد من الخيارات" },
  "automations.menu.pauseSchedule": { en: "Pause Schedule", ar: "إيقاف الجدول مؤقتاً" },
  "automations.menu.resumeSchedule": { en: "Resume Schedule", ar: "استئناف الجدول" },
  "automations.menu.deleteAutomation": { en: "Delete Automation", ar: "حذف الأتمتة" },
  "automations.flowsCount": { en: "{count} flows", ar: "{count} تدفقات" },
  "automations.accountTimezone": { en: "Account timezone", ar: "المنطقة الزمنية للحساب" },
  "automations.detail.info": { en: "Info", ar: "معلومات" },
  "automations.detail.recentExecutions": { en: "Recent Executions", ar: "عمليات التنفيذ الأخيرة" },
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
  "automations.loadFailed": { en: "Could not load automations.", ar: "تعذّر تحميل الأتمتة." },
  "automations.loadFailedTitle": { en: "Could not load automations", ar: "تعذّر تحميل الأتمتة" },
  "automations.emptyTitle": { en: "No automations yet", ar: "لا توجد أتمتة بعد" },
  "automations.emptyDesc": {
    en: "Combine multiple flows, pick which tests to run, then execute now or on a schedule.",
    ar: "اجمع عدة تدفقات، واختر الاختبارات التي تريد تشغيلها، ثم نفّذ الآن أو وفق جدول زمني.",
  },
  "automations.pausedTitle": { en: "Schedule paused", ar: "تم إيقاف الجدول مؤقتاً" },
  "automations.pausedDesc": {
    en: "\"{name}\" will not run until resumed.",
    ar: "لن يتم تشغيل «{name}» حتى استئناف الجدول.",
  },
  "automations.resumedTitle": { en: "Schedule resumed", ar: "تم استئناف الجدول" },
  "automations.resumedDesc": {
    en: "\"{name}\" will run on its next scheduled time.",
    ar: "سيتم تشغيل «{name}» في موعده المجدول التالي.",
  },
  "automations.pauseFailedTitle": { en: "Could not pause the schedule", ar: "تعذّر إيقاف الجدول مؤقتاً" },
  "automations.resumeFailedTitle": { en: "Could not resume the schedule", ar: "تعذّر استئناف الجدول" },
  "automations.deletedTitle": { en: "Automation deleted", ar: "تم حذف الأتمتة" },
  "automations.deletedDesc": { en: "\"{name}\" has been removed.", ar: "تمت إزالة «{name}»." },
  "automations.deleteFailedTitle": { en: "Could not delete the automation", ar: "تعذّر حذف الأتمتة" },
  "automations.updatedTitle": { en: "Automation updated", ar: "تم تحديث الأتمتة" },
  "automations.createdTitle": { en: "Automation created", ar: "تم إنشاء الأتمتة" },
  "automations.savedDesc": { en: "\"{name}\" has been saved.", ar: "تم حفظ «{name}»." },
  "automations.savedWarningTitle": { en: "Saved with a warning", ar: "تم الحفظ مع تحذير" },
  "automations.updateFailedTitle": { en: "Could not update the automation", ar: "تعذّر تحديث الأتمتة" },
  "automations.createFailedTitle": { en: "Could not create the automation", ar: "تعذّر إنشاء الأتمتة" },
  "automations.deleteModalTitle": { en: "Delete automation?", ar: "حذف الأتمتة؟" },
  "automations.deleteModalDesc": {
    en: "\"{name}\" will be permanently removed. This cannot be undone.",
    ar: "سيتم حذف «{name}» نهائياً. لا يمكن التراجع عن هذا الإجراء.",
  },

  /* ---------- Automation run view (aggregate execution) ---------- */
  "autrun.passedOfTotal": { en: "{passed}/{total} passed", ar: "نجح {passed}/{total}" },
  "autrun.failedCount": { en: "{count} failed", ar: "فشل {count}" },
  "autrun.skippedCount": { en: "{count} skipped", ar: "تم تخطي {count}" },
  "autrun.noTestsReported": { en: "No tests reported", ar: "لا توجد اختبارات مبلّغ عنها" },
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
  "autrun.cancelRequestedTitle": { en: "Cancellation requested", ar: "تم طلب الإلغاء" },
  "autrun.cancelRequestedDesc": {
    en: "The execution is being stopped. The status updates once the engine confirms it.",
    ar: "يجري إيقاف التنفيذ. سيتم تحديث الحالة بمجرد تأكيد المحرك.",
  },
  "autrun.runAlreadyFinishedTitle": { en: "Run already finished", ar: "انتهى التشغيل بالفعل" },
  "autrun.runAlreadyFinishedDesc": {
    en: "There is nothing left to cancel — the execution has already completed.",
    ar: "لا يوجد ما يمكن إلغاؤه — اكتمل التنفيذ بالفعل.",
  },
  "autrun.cancelFailedTitle": { en: "Could not cancel the run", ar: "تعذّر إلغاء التشغيل" },
  "autrun.openChildFailedTitle": { en: "Could not open the flow run", ar: "تعذّر فتح تشغيل التدفق" },
  "autrun.eyebrow": { en: "Automation execution", ar: "تنفيذ الأتمتة" },
  "autrun.scheduledAutomation": { en: "scheduled automation", ar: "أتمتة مجدولة" },
  "autrun.cancelRun": { en: "Cancel Run", ar: "إلغاء التشغيل" },
  "autrun.cancelling": { en: "Cancelling…", ar: "جارٍ الإلغاء…" },
  "autrun.passedLabel": { en: "passed", ar: "ناجح" },
  "autrun.failedLabel": { en: "failed", ar: "فاشل" },
  "autrun.skippedLabel": { en: "skipped", ar: "متخطّى" },
  "autrun.durationLabel": { en: "Duration: {duration}", ar: "المدة: {duration}" },
  "autrun.flowsInExecution": { en: "Flows in this execution", ar: "التدفقات في هذا التنفيذ" },
  "autrun.stateUnavailableTitle": { en: "Execution state unavailable", ar: "حالة التنفيذ غير متاحة" },
  "autrun.cancelModalTitle": { en: "Cancel this execution?", ar: "إلغاء هذا التنفيذ؟" },
  "autrun.cancelModalDesc": {
    en: "The engine will stop the execution after the current test finishes. Results already collected are kept.",
    ar: "سيوقف المحرك التنفيذ بعد انتهاء الاختبار الحالي. سيتم الاحتفاظ بالنتائج المجمّعة.",
  },
  "autrun.keepRunning": { en: "Keep Running", ar: "مواصلة التشغيل" },
  "autrun.cancelExecution": { en: "Cancel Execution", ar: "إلغاء التنفيذ" },
  "autrun.backToAutomationRun": { en: "Back to Automation Run", ar: "العودة إلى تشغيل الأتمتة" },

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
  "errors.runNotFound": { en: "Run not found.", ar: "لم يتم العثور على التشغيل." },
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
  "settings.section.environment": { en: "Client Environment", ar: "بيئة العميل" },
  "settings.section.execution": { en: "Test Execution", ar: "تنفيذ الاختبارات" },
  "settings.section.notifications": { en: "Notifications", ar: "الإشعارات" },
  "settings.section.timezone": { en: "Timezone", ar: "المنطقة الزمنية" },
  "settings.section.preferences": { en: "Preferences", ar: "التفضيلات" },
  "settings.noClient": {
    en: "No client environment is linked to this account. Client configuration settings are not available.",
    ar: "لا توجد بيئة عميل مرتبطة بهذا الحساب. إعدادات تهيئة العميل غير متاحة.",
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
  "settings.security.description": { en: "How is my account protected?", ar: "كيف يُحمى حسابي؟" },
  "settings.security.password": { en: "Password", ar: "كلمة المرور" },
  "settings.security.passwordHint": {
    en: "For your security, your password is never displayed.",
    ar: "لأمانك، لا تُعرض كلمة المرور أبداً.",
  },
  "settings.security.passwordManaged": {
    en: "Password changes are handled by your Assuredia administrator.",
    ar: "يتم تغيير كلمة المرور بواسطة مسؤول Assuredia لديك.",
  },
  "settings.security.currentSession": { en: "Current session", ar: "الجلسة الحالية" },
  "settings.security.signedInAs": { en: "Signed in as", ar: "مسجّل الدخول باسم" },
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
  "settings.env.clientStatus": { en: "Client status", ar: "حالة العميل" },
  "settings.env.clientStatusDesc": {
    en: "Inactive clients are excluded from scheduled runs.",
    ar: "يُستبعد العملاء غير النشطين من عمليات التشغيل المجدولة.",
  },
  "settings.env.siteCredentials": { en: "Site credentials", ar: "بيانات اعتماد الموقع" },
  "settings.env.siteCredentialsHint": {
    en: "Credentials are encrypted at rest and never displayed. Enter a new value to replace them.",
    ar: "تُشفّر بيانات الاعتماد عند التخزين ولا تُعرض أبداً. أدخل قيمة جديدة لاستبدالها.",
  },
  "settings.env.siteUsernamePlaceholder": { en: "Site username", ar: "اسم مستخدم الموقع" },
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
  "settings.exec.device.custom": { en: "Custom viewport", ar: "نافذة عرض مخصصة" },
  "settings.exec.viewportWidth": { en: "Viewport width (px)", ar: "عرض نافذة العرض (بكسل)" },
  "settings.exec.viewportHeight": { en: "Viewport height (px)", ar: "ارتفاع نافذة العرض (بكسل)" },
  "settings.exec.headless": { en: "Headless mode", ar: "الوضع غير المرئي (Headless)" },
  "settings.exec.headlessDesc": {
    en: "Run without a visible browser window for faster execution.",
    ar: "التشغيل دون نافذة متصفح مرئية لتنفيذ أسرع.",
  },
  "settings.exec.runTimeout": { en: "Run timeout (minutes)", ar: "مهلة التشغيل (بالدقائق)" },
  "settings.exec.runTimeoutHint": {
    en: "Force-stop a run that exceeds this duration.",
    ar: "إيقاف التشغيل قسراً إذا تجاوز هذه المدة.",
  },
  "settings.exec.timeout": { en: "Implicit wait (seconds)", ar: "الانتظار الضمني (بالثواني)" },
  "settings.exec.timeoutHint": {
    en: "How long WebDriver waits for elements to appear before failing a step.",
    ar: "مدة انتظار WebDriver لعناصر الصفحة قبل اعتبار الخطوة فاشلة.",
  },
  "settings.exec.aiReports": { en: "AI reports", ar: "تقارير الذكاء الاصطناعي" },
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
  "settings.notify.description": { en: "When should I be notified?", ar: "متى يجب أن أُخطر؟" },
  "settings.notify.policy": { en: "Notification policy", ar: "سياسة الإشعارات" },
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
  "settings.notify.telegramNotConnected": { en: "Not connected", ar: "غير متصل" },
  "settings.notify.telegramChatId": { en: "Chat ID", ar: "معرّف المحادثة" },
  "settings.notify.telegramConnectDesc": {
    en: "Connect Telegram to receive alerts in your chat.",
    ar: "اربط تيليجرام لتلقي التنبيهات في محادثتك.",
  },
  "settings.notify.connectTelegram": { en: "Connect Telegram", ar: "ربط تيليجرام" },
  "settings.notify.disconnect": { en: "Disconnect", ar: "قطع الاتصال" },
  "settings.notify.sendTest": { en: "Send test notification", ar: "إرسال إشعار تجريبي" },
  "settings.notify.testSent": { en: "Test notification dispatched", ar: "تم إرسال الإشعار التجريبي" },
  "settings.notify.connectTitle": { en: "Connect your Telegram chat", ar: "اربط محادثة تيليجرام" },
  "settings.notify.connectSteps": {
    en: "Open the link below and press Start in the Telegram bot. Your chat is connected automatically once the bot registers it.",
    ar: "افتح الرابط أدناه واضغط ابدأ في روبوت تيليجرام. سيتم ربط محادثتك تلقائياً بمجرد تسجيلها لدى الروبوت.",
  },
  "settings.notify.openBotLink": { en: "Open Telegram bot", ar: "فتح روبوت تيليجرام" },
  "settings.notify.checkStatus": { en: "Check connection", ar: "التحقق من الاتصال" },
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
  "settings.tz.autoDetect": { en: "Auto-detect timezone", ar: "اكتشاف المنطقة الزمنية تلقائياً" },
  "settings.tz.autoDetectDesc": {
    en: "Use your browser to automatically determine your local timezone.",
    ar: "استخدم متصفحك لتحديد منطقتك الزمنية المحلية تلقائياً.",
  },
  "settings.tz.detected": { en: "Detected timezone", ar: "المنطقة الزمنية المكتشفة" },
  "settings.tz.selected": { en: "Selected timezone", ar: "المنطقة الزمنية المحددة" },
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
  "settings.tz.schedulingDefault": { en: "Scheduling default: ", ar: "الافتراضي للجدولة: " },

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
  "login.passwordRequired": { en: "Please enter your password.", ar: "يرجى إدخال كلمة المرور." },
  "login.invalidCredentials": {
    en: "Invalid email or password.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  "login.signInFailed": {
    en: "Sign-in failed. Please try again.",
    ar: "فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.",
  },
  "login.continueGoogle": { en: "Continue with Google", ar: "المتابعة عبر Google" },
  "login.continueGitHub": { en: "Continue with GitHub", ar: "المتابعة عبر GitHub" },
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
  "signup.fullNameRequired": { en: "Full name is required.", ar: "الاسم الكامل مطلوب." },
  "signup.emailRequired": {
    en: "Email address is required.",
    ar: "عنوان البريد الإلكتروني مطلوب.",
  },
  "signup.invalidEmail": {
    en: "Please enter a valid email address.",
    ar: "يرجى إدخال عنوان بريد إلكتروني صالح.",
  },
  "signup.passwordRequired": { en: "Password is required.", ar: "كلمة المرور مطلوبة." },
  "signup.passwordMin": {
    en: "Password must be at least 8 characters.",
    ar: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
  },
  "signup.confirmRequired": {
    en: "Please confirm your password.",
    ar: "يرجى تأكيد كلمة المرور.",
  },
  "signup.passwordMismatch": { en: "Passwords do not match.", ar: "كلمتا المرور غير متطابقتين." },
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
  "oauth.connectingGoogle": { en: "Connecting your Google account…", ar: "جارٍ ربط حساب Google الخاص بك…" },
  "oauth.connectingGitHub": { en: "Connecting your GitHub account…", ar: "جارٍ ربط حساب GitHub الخاص بك…" },
  "oauth.cancelled": {
    en: "{provider} sign-in was cancelled",
    ar: "تم إلغاء تسجيل الدخول عبر {provider}",
  },
  "oauth.cancelledDesc": {
    en: "No changes were made to your account. You can try again whenever you're ready.",
    ar: "لم تُجرَ أي تغييرات على حسابك. يمكنك المحاولة مرة أخرى في أي وقت.",
  },
  "oauth.invalidSession": { en: "Invalid OAuth session", ar: "جلسة تسجيل الدخول غير صالحة" },
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
  "oauth.onboardingTitle": { en: "Complete your profile", ar: "أكمل ملفك الشخصي" },
  "oauth.onboardingDesc": {
    en: "Tell us your company name to submit your application.",
    ar: "أخبرنا باسم شركتك لإرسال طلبك.",
  },
  "oauth.onboardingNote": {
    en: "Your application will be reviewed before your workspace is activated.",
    ar: "ستتم مراجعة طلبك قبل تفعيل مساحة العمل الخاصة بك.",
  },
  "oauth.submitFailed": { en: "Could not submit your application", ar: "تعذّر إرسال طلبك" },
  "oauth.rejectedTitle": {
    en: "This application was not approved",
    ar: "لم تتم الموافقة على هذا الطلب",
  },
  "oauth.rejectedDesc": {
    en: "Your application was reviewed and not approved. Approval by an administrator is the only way to activate this account.",
    ar: "تمت مراجعة طلبك ولم تتم الموافقة عليه. موافقة المسؤول هي الطريقة الوحيدة لتفعيل هذا الحساب.",
  },
  "oauth.linkedGoogle": { en: "Google account linked", ar: "تم ربط حساب Google" },
  "oauth.linkedGitHub": { en: "GitHub account linked", ar: "تم ربط حساب GitHub" },
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
  "oauth.linkStartFailed": { en: "Could not start the linking process", ar: "تعذّر بدء عملية الربط" },
  "oauth.goToSignIn": { en: "Go to sign in", ar: "الانتقال إلى تسجيل الدخول" },
  "oauth.tryAgain": { en: "Try again", ar: "حاول مرة أخرى" },
  "signup.passwordPlaceholder": { en: "Min. 8 characters", ar: "8 أحرف على الأقل" },
  "signup.confirmPassword": { en: "Confirm Password", ar: "تأكيد كلمة المرور" },
  "signup.confirmPlaceholder": { en: "Repeat your password", ar: "أعد كتابة كلمة المرور" },
  "signup.creating": { en: "Creating account…", ar: "جارٍ إنشاء الحساب…" },
  "signup.submit": { en: "Create Account", ar: "إنشاء الحساب" },
  "signup.haveAccount": { en: "Already have an account?", ar: "هل لديك حساب بالفعل؟" },
  "signup.signIn": { en: "Sign in", ar: "تسجيل الدخول" },
  "signup.stepAccount": { en: "Account", ar: "الحساب" },
  "signup.stepClient": { en: "Client", ar: "العميل" },
  "signup.stepApplication": { en: "Application", ar: "التطبيق" },
  "signup.stepRuntime": { en: "Runtime", ar: "بيئة التشغيل" },
  "signup.stepReview": { en: "Review", ar: "المراجعة" },

  /* ---------- Self-service onboarding ---------- */
  "onb.eyebrow": { en: "Self-Service Onboarding", ar: "التأهيل الذاتي" },
  "onb.title": { en: "Create your Assuredia account", ar: "أنشئ حساب Assuredia الخاص بك" },
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
  "onb.s4Desc": { en: "Default test execution environment.", ar: "بيئة تنفيذ الاختبار الافتراضية." },
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
  "onb.passwordConfigured": { en: "●●●●●●●● configured", ar: "●●●●●●●● تم الإعداد" },
  "onb.timeoutShort": { en: "Timeout", ar: "المهلة" },
  "onb.seconds": { en: "{n} seconds", ar: "{n} ثانية" },
  "onb.secondsShort": { en: "s", ar: "ث" },
  "onb.continue": { en: "Continue", ar: "متابعة" },
  "onb.submitting": { en: "Submitting…", ar: "جارٍ الإرسال…" },
  "onb.submitForApproval": { en: "Submit for Approval", ar: "إرسال للموافقة" },
  "onb.companyRequired": { en: "Company name is required.", ar: "اسم الشركة مطلوب." },
  "onb.websiteRequired": { en: "Website is required.", ar: "الموقع الإلكتروني مطلوب." },
  "onb.invalidUrl": { en: "Please enter a valid URL.", ar: "يرجى إدخال رابط صالح." },
  "onb.appUrlRequired": { en: "Application URL is required.", ar: "رابط التطبيق مطلوب." },
  "onb.appUsernameRequired": {
    en: "Application username is required.",
    ar: "اسم مستخدم التطبيق مطلوب.",
  },
  "onb.appPasswordRequired": {
    en: "Application password is required.",
    ar: "كلمة مرور التطبيق مطلوبة.",
  },
  "onb.timeoutRange": { en: "Must be 10–600 seconds.", ar: "يجب أن يكون بين 10 و600 ثانية." },
  "onb.retryRange": { en: "Must be 0–5.", ar: "يجب أن يكون بين 0 و5." },
  "onb.signupFailed": { en: "Signup failed", ar: "فشل التسجيل" },
  "onb.stillPending": { en: "Still pending approval", ar: "لا يزال بانتظار الموافقة" },
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
  "onb.workspaceReady": { en: "Your workspace is ready", ar: "مساحة عملك جاهزة" },
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
  "admin.exitToClient": { en: "Exit to Client Dashboard", ar: "الخروج إلى لوحة تحكم العميل" },
  "admin.platformHealthy": { en: "Platform healthy", ar: "المنصة تعمل بشكل سليم" },
  "admin.platformAdmin": { en: "Platform Admin", ar: "مسؤول المنصة" },
  "admin.superAdminGlobal": { en: "Super Admin · Global", ar: "مسؤول رئيسي · عام" },
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
  "admin.table.flowExecution": { en: "Flow / Execution", ar: "التدفق / التنفيذ" },
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
  "admin.dash.execHealth": { en: "Execution health · Now", ar: "صحة التنفيذ · الآن" },
  "admin.dash.viewAllRuns": { en: "View all runs", ar: "عرض كل عمليات التشغيل" },
  "admin.dash.manageClients": { en: "Manage clients", ar: "إدارة العملاء" },
  "admin.dash.chart7": { en: "Executions · Last 7 days", ar: "عمليات التنفيذ · آخر 7 أيام" },
  "admin.dash.chartTip": {
    en: "{label}: {passed} passed, {failed} failed",
    ar: "{label}: نجح {passed}، فشل {failed}",
  },
  "admin.dash.recentActivity": { en: "Recent Activity", ar: "النشاط الأخير" },
  "admin.dash.noActivity": { en: "No recent activity recorded yet.", ar: "لا يوجد نشاط أخير مسجل بعد." },
  "admin.dash.noClients": { en: "No clients registered yet.", ar: "لا يوجد عملاء مسجلون بعد." },
  "admin.dash.loadFailed": { en: "Failed to load platform overview.", ar: "تعذّر تحميل النظرة العامة للمنصة." },

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
  "admin.runs.noMatch": { en: "No runs match these filters", ar: "لا توجد عمليات تشغيل تطابق عوامل التصفية هذه" },
  "admin.runs.empty": { en: "No runs recorded yet", ar: "لا توجد عمليات تشغيل مسجلة بعد" },
  "admin.runs.emptyHint": { en: "Runs will appear here once clients execute their flows.", ar: "ستظهر عمليات التشغيل هنا بمجرد أن ينفذ العملاء تدفقاتهم." },
  "admin.runs.backToList": { en: "Back to Runs", ar: "العودة إلى عمليات التشغيل" },
  "admin.runs.noMatchHint": { en: "Try widening the filters above.", ar: "جرّب توسيع عوامل التصفية أعلاه." },

  /* ---------- Admin console: alerts ---------- */
  "admin.alerts.title": { en: "Platform Alerts", ar: "تنبيهات المنصة" },
  "admin.alerts.subtitle": {
    en: "Monitor alerts across all clients and executions.",
    ar: "راقب التنبيهات عبر جميع العملاء وعمليات التشغيل.",
  },
  "admin.alerts.openCritical": { en: "{open} open · {critical} critical", ar: "{open} مفتوح · {critical} حرج" },
  "admin.alerts.severityError": { en: "Error", ar: "خطأ" },
  "admin.alerts.severityWarning": { en: "Warning", ar: "تحذير" },
  "admin.alerts.errorsLabel": { en: "Errors", ar: "أخطاء" },
  "admin.alerts.backToList": { en: "Back to Alerts", ar: "العودة إلى التنبيهات" },

  /* ---------- Admin console: AI analysis ---------- */
  "admin.ai.title": { en: "Platform AI Analysis", ar: "تحليل الذكاء الاصطناعي للمنصة" },
  "admin.ai.subtitle": {
    en: "AI-powered failure analysis across all clients.",
    ar: "تحليل الإخفاقات بالذكاء الاصطناعي عبر جميع العملاء.",
  },
  "admin.ai.poweredByGroq": { en: "Powered by Groq", ar: "مدعوم بواسطة Groq" },
  "admin.ai.failureAnalysis": { en: "AI Failure Analysis", ar: "تحليل الإخفاقات بالذكاء الاصطناعي" },
  "admin.ai.detailEyebrow": {
    en: "AI Failure Analysis · Powered by Groq",
    ar: "تحليل الإخفاقات بالذكاء الاصطناعي · مدعوم بواسطة Groq",
  },
  "admin.ai.noMatch": { en: "No analyses match these filters", ar: "لا توجد تحليلات تطابق عوامل التصفية هذه" },
  "admin.ai.viewAnalysis": { en: "View Analysis", ar: "عرض التحليل" },

  /* ---------- Admin console: onboarding requests ---------- */
  "admin.requests.subtitle": {
    en: "Review and manage client registration requests.",
    ar: "راجع طلبات تسجيل العملاء وأدرها.",
  },
  "admin.requests.back": { en: "Back to Requests", ar: "العودة إلى الطلبات" },
  "admin.requests.review": { en: "Review", ar: "مراجعة" },
  "admin.requests.noMatch": { en: "No requests match the selected filter.", ar: "لا توجد طلبات تطابق عامل التصفية المحدد." },
  "admin.requests.submittedAt": { en: "Submitted {time}", ar: "تم التقديم في {time}" },
  "admin.requests.rejectionReason": { en: "Rejection reason", ar: "سبب الرفض" },
  "admin.requests.application": { en: "Application", ar: "التطبيق" },
  "admin.requests.passwordEncrypted": {
    en: "●●●●●●●● stored encrypted",
    ar: "●●●●●●●● مخزنة بشكل مشفر",
  },
  "admin.requests.details": { en: "Request Details", ar: "تفاصيل الطلب" },
  "admin.requests.requestId": { en: "Request ID", ar: "معرّف الطلب" },
  "admin.requests.currentStatus": { en: "Current Status", ar: "الحالة الحالية" },
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
  "admin.requests.approveModalTitle": { en: "Approve Onboarding Request", ar: "الموافقة على طلب التسجيل" },
  "admin.requests.approveModalDesc": {
    en: "Provide the base URL of the client application to provision their workspace.",
    ar: "أدخل الرابط الأساسي لتطبيق العميل لتهيئة مساحة عمله.",
  },
  "admin.requests.baseUrlLabel": { en: "Application Base URL", ar: "الرابط الأساسي للتطبيق" },
  "admin.requests.baseUrlPlaceholder": { en: "https://app.example.com", ar: "https://app.example.com" },
  "admin.requests.baseUrlRequired": { en: "Base URL is required to provision the client.", ar: "الرابط الأساسي مطلوب لتهيئة العميل." },
  "admin.requests.confirmApprove": { en: "Confirm Approve", ar: "تأكيد الموافقة" },
  "admin.requests.approvedTitle": { en: "Onboarding approved", ar: "تمت الموافقة على طلب التسجيل" },
  "admin.requests.approvedDesc": {
    en: "Client \"{name}\" provisioned successfully.",
    ar: "تمت تهيئة العميل «{name}» بنجاح.",
  },
  "admin.requests.rejectedTitle": { en: "Onboarding rejected", ar: "تم رفض طلب التسجيل" },
  "admin.requests.rejectedDesc": {
    en: "Request #{id} has been rejected.",
    ar: "تم رفض الطلب #{id}.",
  },
  "admin.requests.approveFailedTitle": { en: "Failed to approve request", ar: "تعذّرت الموافقة على الطلب" },
  "admin.requests.rejectFailedTitle": { en: "Failed to reject request", ar: "تعذّر رفض الطلب" },
  "admin.requests.loadFailedTitle": { en: "Could not load onboarding requests", ar: "تعذّر تحميل طلبات التسجيل" },
  "admin.requests.loadFailed": { en: "Failed to load onboarding requests from server.", ar: "تعذّر تحميل طلبات التسجيل من الخادم." },
  "admin.requests.emptyTitle": { en: "No onboarding requests", ar: "لا توجد طلبات تسجيل" },
  "admin.requests.emptyDesc": {
    en: "New registration requests from prospective clients will appear here.",
    ar: "ستظهر طلبات التسجيل الجديدة من العملاء المحتملين هنا.",
  },
  "admin.requests.provisionedClient": { en: "Provisioned Client", ar: "العميل المهيأ" },
  "admin.requests.provisionedClientDesc": {
    en: "Client workspace #{id} is created and active.",
    ar: "تم إنشاء مساحة عمل العميل #{id} وهي نشطة الآن.",
  },
  "admin.requests.viewInClients": { en: "View in Clients", ar: "عرض في قائمة العملاء" },
  "admin.requests.applicantEmail": { en: "Applicant Email", ar: "بريد مقدّم الطلب" },
  "admin.requests.company": { en: "Company", ar: "الشركة" },
  "admin.requests.reviewedBy": { en: "Reviewed By", ar: "تمت المراجعة بواسطة" },
  "admin.requests.reviewedAt": { en: "Reviewed At", ar: "تاريخ المراجعة" },
  "errors.baseUrlRequired": { en: "Base URL is required to provision the client", ar: "رابط الأساس مطلوب لتهيئة العميل" },
  "errors.invalidCompanyName": { en: "The company name contains an invalid path component", ar: "اسم الشركة يحتوي على مسار غير صالح" },

  /* ---------- Admin console: asset requests ---------- */
  "admin.navAssetRequests": { en: "Asset Requests", ar: "طلبات الأصول" },
  "admin.clients.activatedTitle": { en: "Client activated", ar: "تم تنشيط العميل" },
  "admin.clients.suspendedTitle": { en: "Client suspended", ar: "تم إيقاف العميل" },
  "admin.clients.statusUpdatedDesc": {
    en: "{name} has been updated. The change is now live.",
    ar: "تم تحديث {name}. التغيير ساري الآن.",
  },
  "admin.clients.updateFailedTitle": { en: "Failed to update client", ar: "تعذّر تحديث العميل" },
  "admin.clients.empty": { en: "No clients yet", ar: "لا يوجد عملاء بعد" },
  "admin.clients.noRuns": { en: "No runs recorded for this client yet.", ar: "لا توجد عمليات تشغيل مسجلة لهذا العميل بعد." },
  "admin.create.duplicateName": { en: "A client with this name already exists", ar: "يوجد عميل بهذا الاسم بالفعل" },
  "admin.create.failedTitle": { en: "Could not create client", ar: "تعذّر إنشاء العميل" },
  "admin.asset.title": { en: "Asset Requests", ar: "طلبات الأصول" },
  "admin.asset.subtitle": {
    en: "Review and action client requests for Flow and Test changes.",
    ar: "راجع ونفّذ طلبات العملاء لتغييرات التدفقات والاختبارات.",
  },
  "admin.asset.pendingBanner": {
    en: "{count} requests awaiting review.",
    ar: "{count} طلبات بانتظار المراجعة.",
  },
  "admin.asset.pendingBannerOne": { en: "1 request awaiting review.", ar: "طلب واحد بانتظار المراجعة." },
  "admin.asset.searchPlaceholder": { en: "Search ID, client, flow…", ar: "ابحث بالمعرّف أو العميل أو التدفق…" },
  "admin.asset.allTypes": { en: "All Types", ar: "جميع الأنواع" },
  "admin.asset.allClients": { en: "All Clients", ar: "جميع العملاء" },
  "admin.asset.noMatch": { en: "No requests match filters", ar: "لا توجد طلبات مطابقة لعوامل التصفية" },
  "admin.asset.resetFilters": { en: "Reset filters", ar: "إعادة تعيين العوامل" },
  "admin.asset.thRequest": { en: "Request", ar: "الطلب" },
  "admin.asset.back": { en: "Back to Asset Requests", ar: "العودة إلى طلبات الأصول" },
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
  "admin.asset.approveTitle": { en: "Approve this request?", ar: "الموافقة على هذا الطلب؟" },
  "admin.asset.rejectTitle": { en: "Reject this request", ar: "رفض هذا الطلب" },
  "admin.asset.implementTitle": { en: "Implement this approved request?", ar: "تنفيذ هذا الطلب المعتمد؟" },
  "admin.asset.implementDesc": {
    en: "This marks the request as implemented. Ensure the asset changes have been applied.",
    ar: "سيتم وسم الطلب كمنفَّذ. تأكد من تطبيق تغييرات الأصل أولاً.",
  },
  "admin.asset.confirmApprove": { en: "Approve", ar: "موافقة" },
  "admin.asset.confirmImplement": { en: "Implement", ar: "تنفيذ" },
  "admin.asset.approveShort": { en: "Approve", ar: "موافقة" },
  "admin.asset.rejectShort": { en: "Reject", ar: "رفض" },
  "admin.asset.markImplemented": { en: "Mark Implemented", ar: "وضع علامة منفَّذ" },
  "admin.asset.approvedTitle": { en: "Request approved", ar: "تمت الموافقة على الطلب" },
  "admin.asset.rejectedTitle": { en: "Request rejected", ar: "تم رفض الطلب" },
  "admin.asset.implementedTitle": { en: "Request implemented", ar: "تم تنفيذ الطلب" },
  "admin.asset.actionSuccessDesc": { en: "Request #{id} is up to date.", ar: "الطلب #{id} محدَّث الآن." },
  "admin.asset.approveFailedTitle": { en: "Failed to approve", ar: "تعذّرت الموافقة" },
  "admin.asset.rejectFailedTitle": { en: "Failed to reject", ar: "تعذّر الرفض" },
  "admin.asset.implementFailedTitle": { en: "Failed to implement", ar: "تعذّر التنفيذ" },
  "errors.requestStateChanged": { en: "Request state changed. Refreshing…", ar: "تغيّرت حالة الطلب. جارٍ التحديث…" },
  "errors.requestStateChangedDesc": {
    en: "The request was updated by someone else. The latest state has been loaded.",
    ar: "تم تحديث الطلب من قِبل شخص آخر. تم تحميل الحالة الأحدث.",
  },
  "errors.requestNotExist": { en: "This request does not exist", ar: "هذا الطلب غير موجود" },
  "errors.adminNotesRequired": { en: "Rejection notes are required", ar: "ملاحظات الرفض مطلوبة" },
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
  "admin.settings.platformConfig": { en: "Platform Configuration", ar: "تهيئة المنصة" },
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
  "admin.settings.defaultTimeout": { en: "Default Timeout", ar: "المهلة الافتراضية" },
  "admin.settings.defaultTimeoutDesc": {
    en: "Default execution timeout applied to all client runs.",
    ar: "مهلة التنفيذ الافتراضية المطبقة على جميع عمليات تشغيل العملاء.",
  },
  "admin.settings.notifConfig": { en: "Notification Settings", ar: "إعدادات الإشعارات" },
  "admin.settings.emailNotif": { en: "Email Notifications", ar: "إشعارات البريد الإلكتروني" },
  "admin.settings.emailNotifDesc": {
    en: "Send admin alert emails for critical platform events.",
    ar: "إرسال رسائل بريد إلكتروني للمسؤول عند الأحداث الحرجة في المنصة.",
  },
  "admin.settings.adminEmail": { en: "Admin Email", ar: "بريد المسؤول" },
  "admin.settings.adminEmailDesc": {
    en: "Email address for platform-level notifications.",
    ar: "عنوان البريد الإلكتروني لإشعارات مستوى المنصة.",
  },
  "admin.settings.slackNotif": { en: "Slack Notifications", ar: "إشعارات Slack" },
  "admin.settings.slackNotifDesc": {
    en: "Send platform alerts to a Slack channel.",
    ar: "إرسال تنبيهات المنصة إلى قناة Slack.",
  },
  "admin.settings.slackWebhook": { en: "Slack Webhook URL", ar: "رابط Slack Webhook" },
  "admin.settings.slackWebhookDesc": {
    en: "Incoming webhook URL for the target channel.",
    ar: "رابط webhook الوارد للقناة المستهدفة.",
  },
  "admin.settings.alertOnCritical": { en: "Alert on Critical", ar: "تنبيه عند الحرج" },
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
  "admin.settings.ipAllowlist": { en: "IP Allowlist", ar: "قائمة عناوين IP المسموح بها" },
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
  "admin.create.step1Desc": { en: "Name, ID, website", ar: "الاسم، المعرّف، الموقع" },
  "admin.create.step2": { en: "Runtime Configuration", ar: "تهيئة بيئة التشغيل" },
  "admin.create.step2Desc": { en: "Browser, device, timeouts", ar: "المتصفح، الجهاز، المهل" },
  "admin.create.step3": { en: "Application Access", ar: "الوصول إلى التطبيق" },
  "admin.create.step3Desc": { en: "Monitored app credentials", ar: "بيانات اعتماد التطبيق المراقب" },
  "admin.create.step4": { en: "Review & Create", ar: "المراجعة والإنشاء" },
  "admin.create.step4Desc": { en: "Confirm and create", ar: "التأكيد والإنشاء" },
  "admin.create.progress": { en: "Progress", ar: "التقدم" },
  "admin.create.soFar": { en: "Configuration so far", ar: "الإعدادات حتى الآن" },
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
  "admin.create.successTitle": { en: "Client created successfully", ar: "تم إنشاء العميل بنجاح" },
  "admin.create.successDesc": {
    en: "{name} is ready. Configure flows and schedules to start monitoring.",
    ar: "{name} جاهز. هيّئ التدفقات والجداول لبدء المراقبة.",
  },
  "admin.create.openClient": { en: "Open Client", ar: "فتح العميل" },
  "admin.create.nextFlows": { en: "Add flows to define test journeys", ar: "أضف تدفقات لتحديد مسارات الاختبار" },
  "admin.create.nextSchedules": { en: "Configure schedules to automate runs", ar: "هيّئ الجداول لأتمتة عمليات التشغيل" },
  "admin.create.creating": { en: "Creating client…", ar: "جارٍ إنشاء العميل…" },
  "admin.create.clientNameRequired": { en: "Client name is required.", ar: "اسم العميل مطلوب." },
  "admin.create.clientIdRequired": { en: "Client identifier is required.", ar: "معرّف العميل مطلوب." },
  "admin.create.websiteRequired": { en: "Website URL is required.", ar: "رابط الموقع مطلوب." },

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
  "dashboard.metric.totalRuns": { en: "Total Runs", ar: "إجمالي عمليات التشغيل" },
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
  "page.dashboard.recentRuns": { en: "Recent Runs", ar: "عمليات التشغيل الأخيرة" },
  "page.dashboard.recentRunsDesc": {
    en: "Latest flow executions across your workspace",
    ar: "أحدث عمليات تنفيذ التدفقات في مساحة عملك",
  },
  "page.dashboard.recentFailures": { en: "Recent Failures", ar: "الإخفاقات الأخيرة" },
  "page.dashboard.inspectRun": { en: "Inspect run", ar: "فحص العملية" },

  "page.flows.eyebrow": { en: "Flow Registry", ar: "سجل التدفقات" },
  "page.flows.title": { en: "Automation checkpoints", ar: "نقاط فحص الأتمتة" },
  "page.flows.subtitle": {
    en: "Run complete flows or choose individual tests to execute.",
    ar: "شغّل التدفقات كاملة أو اختر اختبارات فردية لتنفيذها.",
  },
  "page.flows.activeCount": { en: "{active} of {total} active", ar: "{active} من {total} نشطة" },
  "page.flows.addFlow": { en: "Add Flow", ar: "إضافة تدفق" },
  "page.flows.emptyTitle": { en: "No flows configured", ar: "لا توجد تدفقات مُهيأة" },
  "page.flows.emptyDesc": {
    en: "Add your first flow to make this client runnable.",
    ar: "أضف أول تدفق لجعل هذا العميل قابلاً للتشغيل.",
  },

  /* ---------- Flows page (cards, actions, toasts) ---------- */
  "flows.loadFailed": { en: "Unable to load flows right now.", ar: "تعذّر تحميل التدفقات الآن." },
  "flows.testsLoadFailed": { en: "Unable to load tests.", ar: "تعذّر تحميل الاختبارات." },
  "flows.testsUnavailable": { en: "Tests unavailable", ar: "الاختبارات غير متاحة" },
  "flows.viewInAutomations": { en: "View in Automations", ar: "عرض في الأتمتة" },
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
  "flows.runSelected": { en: "Run Selected ({count})", ar: "تشغيل المحدد ({count})" },
  "flows.createdTitle": { en: "Flow created", ar: "تم إنشاء التدفق" },
  "flows.createdDesc": { en: "{name} is ready to run.", ar: "التدفق {name} جاهز للتشغيل." },
  "flows.updatedDesc": { en: "{name} has been updated.", ar: "تم تحديث {name}." },
  "flows.deletedTitle": { en: "Flow deleted", ar: "تم حذف التدفق" },
  "flows.deletedDesc": { en: "{name} was removed.", ar: "تمت إزالة {name}." },
  "flows.alreadyDeletedTitle": { en: "Flow already deleted", ar: "التدفق محذوف بالفعل" },
  "flows.alreadyDeletedDesc": { en: "{name} no longer exists.", ar: "التدفق {name} لم يعد موجوداً." },
  "flows.deleteFailedTitle": { en: "Could not delete flow", ar: "تعذّر حذف التدفق" },
  "flows.noTestsSelectedTitle": { en: "No tests selected", ar: "لم يتم تحديد أي اختبار" },
  "flows.noTestsSelectedDesc": {
    en: "Select at least one test to run, or use Run full flow.",
    ar: "حدد اختباراً واحداً على الأقل للتشغيل، أو استخدم تشغيل التدفق الكامل.",
  },
  "flows.testsLoadFailedTitle": { en: "Could not load the flow's tests", ar: "تعذّر تحميل اختبارات التدفق" },
  "flows.tryAgain": { en: "Please try again.", ar: "يرجى المحاولة مرة أخرى." },
  "flows.runInProgressTitle": { en: "Run already in progress", ar: "يوجد تشغيل قيد التنفيذ بالفعل" },
  "flows.runInProgressDesc": {
    en: "Another run is already in progress for this client.",
    ar: "يوجد تشغيل آخر قيد التنفيذ لهذا العميل.",
  },
  "flows.runStartFailedTitle": { en: "Could not start the run", ar: "تعذّر بدء التشغيل" },
  "flows.deleteModalTitle": { en: "Delete flow", ar: "حذف التدفق" },
  "flows.deleteModalDesc": {
    en: "\"{name}\" and its tests will be removed from this client.",
    ar: "ستتم إزالة «{name}» واختباراته من هذا العميل.",
  },
  "flows.deleting": { en: "Deleting…", ar: "جارٍ الحذف…" },
  "flows.deleteFlow": { en: "Delete Flow", ar: "حذف التدفق" },
  "flows.requestNewFlow": { en: "Request New Flow", ar: "طلب تدفق جديد" },
  "flows.requestChange": { en: "Request Change", ar: "طلب تعديل" },
  "flows.requestDeleteShort": { en: "Request Deletion", ar: "طلب حذف" },
  "flows.requestDeletion": { en: "Request Deletion", ar: "طلب الحذف" },
  "flows.requesting": { en: "Submitting…", ar: "جارٍ الإرسال…" },
  "flows.deleteRequestModalTitle": { en: "Request flow deletion", ar: "طلب حذف التدفق" },
  "flows.deleteRequestModalDesc": {
    en: "\"{name}\" will NOT be deleted immediately. A deletion request will be submitted for administrator review first.",
    ar: "لن يتم حذف «{name}» فوراً. سيتم إرسال طلب حذف لمراجعة المسؤول أولاً.",
  },
  "flows.requestDeleteDefaultReason": {
    en: "Requested from the Flows page",
    ar: "طلب من صفحة التدفقات",
  },
  "flows.deleteRequestedTitle": { en: "Deletion request submitted", ar: "تم إرسال طلب الحذف" },
  "flows.deleteRequestedDesc": {
    en: "\"{name}\" will be removed only after an administrator approves the request.",
    ar: "ستتم إزالة «{name}» فقط بعد موافقة المسؤول على الطلب.",
  },
  "flows.deleteRequestFailedTitle": { en: "Could not submit the request", ar: "تعذّر إرسال الطلب" },
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
  "requests.noMatchTitle": { en: "No requests match this filter", ar: "لا توجد طلبات تطابق هذا التصفية" },
  "requests.loadFailedTitle": { en: "Could not load requests", ar: "تعذّر تحميل الطلبات" },

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

  "requests.typeDesc.addFlow": { en: "Request a new automation flow", ar: "طلب تدفق أتمتة جديد" },
  "requests.typeDesc.modifyFlow": { en: "Request changes to an existing flow", ar: "طلب تعديلات على تدفق موجود" },
  "requests.typeDesc.addTest": { en: "Request a new test within a flow", ar: "طلب اختبار جديد داخل تدفق" },
  "requests.typeDesc.modifyTest": { en: "Request changes to an existing test", ar: "طلب تعديلات على اختبار موجود" },
  "requests.typeDesc.deleteFlow": { en: "Request removal of a flow", ar: "طلب إزالة تدفق" },
  "requests.typeDesc.deleteTest": { en: "Request removal of a test", ar: "طلب إزالة اختبار" },

  "requests.status.pending": { en: "Pending", ar: "قيد الانتظار" },
  "requests.status.approved": { en: "Approved", ar: "تمت الموافقة" },
  "requests.status.rejected": { en: "Rejected", ar: "مرفوض" },
  "requests.status.implemented": { en: "Implemented", ar: "تم التنفيذ" },
  "requests.status.cancelled": { en: "Cancelled", ar: "ملغى" },

  "requests.detail.submittedAt": { en: "Submitted {time}", ar: "تم التقديم {time}" },
  "requests.detail.updatedAt": { en: "Updated {time}", ar: "آخر تحديث {time}" },
  "requests.detail.target": { en: "Target", ar: "الهدف" },
  "requests.detail.flow": { en: "Flow", ar: "التدفق" },
  "requests.detail.test": { en: "Test", ar: "الاختبار" },
  "requests.detail.requestedTests": { en: "Requested Tests ({count})", ar: "الاختبارات المطلوبة ({count})" },
  "requests.detail.description": { en: "Description", ar: "الوصف" },
  "requests.detail.expectedBehavior": { en: "Expected Behavior", ar: "السلوك المتوقع" },
  "requests.detail.steps": { en: "Steps", ar: "الخطوات" },
  "requests.detail.reason": { en: "Reason for Change", ar: "سبب التغيير" },
  "requests.detail.adminNotes": { en: "Reviewer Notes", ar: "ملاحظات المراجع" },
  "requests.detail.timeline": { en: "Status Timeline", ar: "الخط الزمني للحالة" },
  "requests.detail.info": { en: "Request Info", ar: "معلومات الطلب" },
  "requests.detail.requestId": { en: "Request ID", ar: "معرّف الطلب" },
  "requests.detail.typeLabel": { en: "Type", ar: "النوع" },
  "requests.detail.submittedLabel": { en: "Submitted", ar: "تاريخ التقديم" },
  "requests.detail.updatedLabel": { en: "Last updated", ar: "آخر تحديث" },
  "requests.detail.reviewedLabel": { en: "Reviewed", ar: "تاريخ المراجعة" },
  "requests.detail.implementedLabel": { en: "Implemented", ar: "تاريخ التنفيذ" },

  "requests.timeline.submitted": { en: "Submitted", ar: "تم التقديم" },
  "requests.timeline.approved": { en: "Approved", ar: "الموافقة" },
  "requests.timeline.implemented": { en: "Implemented", ar: "التنفيذ" },

  "requests.cancel.button": { en: "Cancel Request", ar: "إلغاء الطلب" },
  "requests.cancel.successTitle": { en: "Request cancelled", ar: "تم إلغاء الطلب" },
  "requests.cancel.successDesc": {
    en: "Request #{id} has been cancelled.",
    ar: "تم إلغاء الطلب رقم {id}.",
  },
  "requests.cancel.conflictTitle": { en: "Request is no longer pending", ar: "الطلب لم يعد قيد الانتظار" },
  "requests.cancel.conflictDesc": {
    en: "The request was updated by a reviewer. The list now shows its current status.",
    ar: "تم تحديث الطلب بواسطة المراجع. تعرض القائمة الآن حالته الحالية.",
  },
  "requests.cancel.failedTitle": { en: "Could not cancel the request", ar: "تعذّر إلغاء الطلب" },

  "requests.form.selectType": { en: "Select the type of change you need.", ar: "اختر نوع التغيير الذي تحتاجه." },
  "requests.form.changeType": { en: "Change type", ar: "تغيير النوع" },
  "requests.form.flowName": { en: "Flow Name", ar: "اسم التدفق" },
  "requests.form.flowNamePlaceholder": { en: "e.g. Password Reset", ar: "مثال: إعادة تعيين كلمة المرور" },
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
  "requests.form.reasonPlaceholder": { en: "Why is this change needed?", ar: "لماذا هذا التغيير مطلوب؟" },
  "requests.form.selectFlow": { en: "Flow", ar: "التدفق" },
  "requests.form.flowPlaceholder": { en: "Select a flow…", ar: "اختر تدفقاً…" },
  "requests.form.selectTest": { en: "Test", ar: "الاختبار" },
  "requests.form.testPlaceholder": { en: "Select a test…", ar: "اختر اختباراً…" },
  "requests.form.testName": { en: "Test Name / Purpose", ar: "اسم الاختبار / الغرض" },
  "requests.form.testNamePlaceholder": { en: "e.g. testValidPasswordReset", ar: "مثال: testValidPasswordReset" },
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

  "requests.submit.successTitle": { en: "Request submitted", ar: "تم إرسال الطلب" },
  "requests.submit.successDesc": {
    en: "Your request is now pending administrator review.",
    ar: "طلبك الآن في انتظار مراجعة المسؤول.",
  },
  "requests.submit.conflictTitle": { en: "Request rejected by the server", ar: "تم رفض الطلب من الخادم" },
  "requests.submit.failedTitle": { en: "Could not submit the request", ar: "تعذّر إرسال الطلب" },

  "requests.validation.title": { en: "Please complete the form", ar: "يرجى إكمال النموذج" },
  "requests.validation.flowName": { en: "Enter a flow name.", ar: "أدخل اسم التدفق." },
  "requests.validation.flowRequired": { en: "Select a flow.", ar: "اختر تدفقاً." },
  "requests.validation.testRequired": { en: "Select a test.", ar: "اختر اختباراً." },
  "requests.validation.testNameRequired": { en: "Enter a test name.", ar: "أدخل اسم الاختبار." },
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
  "requests.validation.stepsRequired": { en: "Add at least one step.", ar: "أضف خطوة واحدة على الأقل." },
  "requests.validation.reasonRequired": { en: "Explain the reason for this change.", ar: "اشرح سبب هذا التغيير." },

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
  "flowform.infoDesc": { en: "Basic information about this flow.", ar: "معلومات أساسية عن هذا التدفق." },
  "flowform.nameLabel": { en: "Flow Name", ar: "اسم التدفق" },
  "flowform.namePlaceholder": { en: "Login Flow", ar: "تدفق تسجيل الدخول" },
  "flowform.nameEditHint": { en: "The flow name cannot be renamed.", ar: "لا يمكن تغيير اسم التدفق." },
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
  "flowform.noTestsTitle": { en: "No tests added yet", ar: "لم تُضف أي اختبارات بعد" },
  "flowform.noTestsDesc": {
    en: "Select from the test pool or create a new test below.",
    ar: "اختر من مجمّع الاختبارات أو أنشئ اختباراً جديداً أدناه.",
  },
  "flowform.addTest": { en: "Add Test", ar: "إضافة اختبار" },
  "flowform.nameRequired": { en: "Flow name is required.", ar: "اسم التدفق مطلوب." },
  "flowform.saveFailedEdit": { en: "Could not save changes", ar: "تعذّر حفظ التغييرات" },
  "flowform.saveFailedCreate": { en: "Could not create flow", ar: "تعذّر إنشاء التدفق" },
  "flowform.saving": { en: "Saving…", ar: "جارٍ الحفظ…" },
  "flowform.selectFromPool": { en: "Select from pool", ar: "اختيار من المجمّع" },
  "flowform.createManually": { en: "Create manually", ar: "إنشاء يدوياً" },
  "flowform.searchTests": {
    en: "Search tests by name or class…",
    ar: "ابحث عن الاختبارات بالاسم أو الفئة…",
  },
  "flowform.noMatchingTests": { en: "No tests match your search.", ar: "لا توجد اختبارات تطابق بحثك." },
  "flowform.poolEmpty": {
    en: "No selectable tests are available for this client. Use the “Create manually” tab to add one.",
    ar: "لا تتوفر اختبارات قابلة للاختيار لهذا العميل. استخدم تبويب «إنشاء يدوياً» لإضافة اختبار.",
  },
  "flowform.clear": { en: "Clear", ar: "مسح التحديد" },
  "flowform.addTests": { en: "Add tests", ar: "إضافة اختبارات" },
  "flowform.addSelected": { en: "Add {count} tests", ar: "إضافة {count} من الاختبارات" },
  "flowform.testNameLabel": { en: "Test Name", ar: "اسم الاختبار" },
  "flowform.testSuiteLabel": { en: "Test Class / Suite", ar: "فئة / مجموعة الاختبار" },
  "flowform.testDescPlaceholder": {
    en: "What does this test verify?",
    ar: "ما الذي يتحقق منه هذا الاختبار؟",
  },
  "flowform.testExpectedLabel": { en: "Expected Result", ar: "النتيجة المتوقعة" },
  "flowform.testExpectedPlaceholder": {
    en: "What should happen when this test passes?",
    ar: "ما الذي يجب أن يحدث عند نجاح هذا الاختبار؟",
  },
  "flowform.testNameRequired": { en: "Test name is required.", ar: "اسم الاختبار مطلوب." },
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
    en: "No tests added yet. Use \"Add Test\" below to get started.",
    ar: "لم تُضف أي اختبارات بعد. استخدم «إضافة اختبار» أدناه للبدء.",
  },
  "flowform.successEditTitle": { en: "Changes saved", ar: "تم حفظ التغييرات" },
  "flowform.successCreateTitle": { en: "Flow created successfully", ar: "تم إنشاء التدفق بنجاح" },
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
  "page.automations.back": { en: "Back to Automations", ar: "العودة إلى الأتمتة" },
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
  "page.runHistory.emptyTitle": { en: "No runs yet", ar: "لا توجد عمليات تشغيل بعد" },
  "page.runHistory.emptyDesc": {
    en: "Your test executions will appear here.",
    ar: "ستظهر عمليات تنفيذ اختباراتك هنا.",
  },
  "page.runHistory.goToFlows": { en: "Go to Flows", ar: "الانتقال إلى التدفقات" },

  /* ---------- Run History screen ---------- */
  "history.viewLive": { en: "View Live", ar: "عرض مباشر" },
  "history.packageBadge": { en: "Package", ar: "حزمة" },
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
  "history.noMatch": { en: "No runs match these filters", ar: "لا توجد عمليات تشغيل تطابق عوامل التصفية هذه" },
  "history.noMatchDesc": { en: "Try widening the filters above.", ar: "جرّب توسيع عوامل التصفية أعلاه." },
  "history.exportCsv": { en: "Export CSV", ar: "تصدير CSV" },
  "history.exportEmpty": { en: "Nothing to export yet.", ar: "لا يوجد ما يمكن تصديره بعد." },
  "history.exportDone": { en: "Exported {count} runs.", ar: "تم تصدير {count} عملية تشغيل." },
  "history.capNote": {
    en: "Showing the {limit} most recent runs for the current filters. The history endpoint returns at most {limit} rows per request and has no page or cursor support — narrow the time range to reach older runs.",
    ar: "يتم عرض أحدث {limit} عملية تشغيل وفق عوامل التصفية الحالية. لا تُرجع واجهة السجل أكثر من {limit} صف لكل طلب ولا تدعم الترقيم بين الصفحات — ضيّق النطاق الزمني للوصول إلى عمليات أقدم.",
  },
  "history.rangeInvalid": {
    en: "The \"from\" date must be before the \"to\" date.",
    ar: "يجب أن يسبق تاريخ «من» تاريخ «إلى».",
  },
  "history.to": { en: "to", ar: "إلى" },
  "history.fromDate": { en: "From date", ar: "من تاريخ" },
  "history.toDate": { en: "To date", ar: "إلى تاريخ" },
  "history.runNotFound": { en: "Run not found", ar: "لم يتم العثور على عملية التشغيل" },
  "history.runNotFoundDesc": {
    en: "This run is no longer available in Run History.",
    ar: "لم تعد عملية التشغيل هذه متاحة في سجل التشغيل.",
  },
  "history.openRunFailed": { en: "Could not open the run", ar: "تعذّر فتح عملية التشغيل" },
  "history.backToHistory": { en: "Back to Run History", ar: "العودة إلى سجل التشغيل" },
  "history.runUnavailable": { en: "Run unavailable", ar: "عملية التشغيل غير متاحة" },

  "page.alerts.eyebrow": { en: "Monitoring", ar: "المراقبة" },
  "page.alerts.title": { en: "Alerts", ar: "التنبيهات" },
  "page.alerts.subtitle": {
    en: "Review failure alerts from your monitored test executions.",
    ar: "راجع تنبيهات الإخفاق من عمليات تنفيذ اختباراتك المُراقَبة.",
  },
  "page.alerts.markAllRead": { en: "Mark all as read", ar: "تعليم الكل كمقروء" },
  "page.alerts.emptyTitle": { en: "No alerts yet", ar: "لا توجد تنبيهات بعد" },
  "page.alerts.emptyDesc": {
    en: "When a monitored test fails, an alert will appear here.",
    ar: "عند إخفاق اختبار مُراقَب، سيظهر تنبيه هنا.",
  },
  "page.alerts.loadError": { en: "Could not load alerts", ar: "تعذّر تحميل التنبيهات" },

  /* ---------- Alerts screen ---------- */
  "alerts.testFailed": { en: "Test Failed", ar: "فشل اختبار" },
  "alerts.runFailed": { en: "Run Failed", ar: "فشل تشغيل" },
  "alerts.unread": { en: "Unread", ar: "غير مقروء" },
  "alerts.read": { en: "Read", ar: "مقروء" },
  "alerts.failures": { en: "Failures", ar: "الإخفاقات" },
  "alerts.critical": { en: "Critical", ar: "حرجة" },
  "alerts.range.last24": { en: "Last 24 hours", ar: "آخر 24 ساعة" },
  "alerts.range.allTime": { en: "All time", ar: "كل الوقت" },
  "alerts.clientFallback": { en: "Client {id}", ar: "العميل {id}" },
  "alerts.allClients": { en: "All clients", ar: "كل العملاء" },
  "alerts.goneTitle": { en: "Alert no longer available", ar: "التنبيه لم يعد متاحاً" },
  "alerts.goneDesc": {
    en: "It may have been removed. The list will refresh.",
    ar: "ربما تمت إزالته. سيتم تحديث القائمة.",
  },
  "alerts.markReadFailedTitle": { en: "Could not mark the alert as read", ar: "تعذّر تعليم التنبيه كمقروء" },
  "alerts.resolvedTitle": { en: "Alert marked as resolved", ar: "تم تعليم التنبيه على أنه محلول" },
  "alerts.resolvedDesc": {
    en: "The execution stays FAILED — only the alert state changed to RESOLVED.",
    ar: "يبقى التنفيذ بحالة فشل — تغيرت حالة التنبيه فقط إلى «تم الحل».",
  },
  "alerts.resolveFailedTitle": { en: "Unable to resolve alert", ar: "تعذّر حل التنبيه" },
  "alerts.allReadTitle": { en: "All alerts marked as read", ar: "تم تعليم جميع التنبيهات كمقروءة" },
  "alerts.markAllReadFailedTitle": { en: "Could not mark alerts as read", ar: "تعذّر تعليم التنبيهات كمقروءة" },
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
  "alerts.noMatch": { en: "No alerts match these filters", ar: "لا توجد تنبيهات تطابق عوامل التصفية هذه" },
  "alerts.resolveModalTitle": { en: "Mark alert as resolved?", ar: "تعليم التنبيه كمحلول؟" },
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
  "page.ai.back": { en: "Back to AI Analysis", ar: "العودة إلى تحليل الذكاء الاصطناعي" },
  "admin.ai.empty": { en: "No AI analyses recorded yet", ar: "لا توجد تحليلات ذكاء اصطناعي مسجلة بعد" },
  "admin.ai.backToList": { en: "Back to AI Analysis", ar: "العودة إلى تحليل الذكاء الاصطناعي" },
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
  "ai.emptyTitle": { en: "No AI analyses yet", ar: "لا توجد تحليلات ذكاء اصطناعي بعد" },
  "ai.emptyDesc": {
    en: "Analyses appear here once your runs have been analyzed by the AI engine.",
    ar: "ستظهر التحليلات هنا بعد تحليل عمليات التشغيل بواسطة محرك الذكاء الاصطناعي.",
  },
  "ai.noMatch": { en: "No analyses match these filters", ar: "لا توجد تحليلات تطابق عوامل التصفية هذه" },
  "ai.clearFilters": { en: "Clear filters", ar: "مسح عوامل التصفية" },
  "ai.recentCap": {
    en: "Showing analyses from your {limit} most recent runs.",
    ar: "تُعرض التحليلات من أحدث {limit} عملية تشغيل.",
  },
  "ai.analysisUnavailable": { en: "Analysis unavailable", ar: "التحليل غير متاح" },
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
  "ai.recommendedActions": { en: "Recommended Actions", ar: "الإجراءات المقترحة" },
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
  "ai.card.disabled": { en: "AI analysis disabled", ar: "تحليل الذكاء الاصطناعي معطّل" },
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
  "ai.card.viewFull": { en: "View AI Analysis", ar: "عرض تحليل الذكاء الاصطناعي" },

  /* ---------- Support navigation (Figma: sidebar "Support" group) ---------- */
  "nav.support": { en: "Support", ar: "الدعم" },
  "nav.feedback": { en: "Feedback", ar: "الملاحظات" },
  "nav.help": { en: "Help", ar: "المساعدة" },
  "header.help": { en: "Help", ar: "المساعدة" },

  /* ---------- Feedback page (Figma: client Feedback, UI-only) ---------- */
  "page.feedback.title": { en: "Feedback", ar: "الملاحظات" },
  "page.feedback.subtitle": { en: "Help us improve Assuredia", ar: "ساعدنا في تحسين أسيوريا" },
  "feedback.intro": {
    en: "Share your experience, suggestions, or ideas — we read every submission.",
    ar: "شاركنا تجربتك أو اقتراحاتك أو أفكارك — نقرأ كل مشاركة.",
  },
  "feedback.ratingQuestion": { en: "How would you rate your experience?", ar: "كيف تقيّم تجربتك؟" },
  "feedback.ratingGroupLabel": { en: "Experience rating", ar: "تقييم التجربة" },
  "feedback.rate1": { en: "Very dissatisfied", ar: "غير راضٍ جداً" },
  "feedback.rate2": { en: "Dissatisfied", ar: "غير راضٍ" },
  "feedback.rate3": { en: "Neutral", ar: "محايد" },
  "feedback.rate4": { en: "Satisfied", ar: "راضٍ" },
  "feedback.rate5": { en: "Very satisfied", ar: "راضٍ جداً" },
  "feedback.messageLabel": { en: "What would you like us to improve?", ar: "ما الذي تودّ أن نحسّنه؟" },
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
  "feedback.category.aiAnalysis": { en: "AI Analysis", ar: "تحليل الذكاء الاصطناعي" },
  "feedback.category.other": { en: "Other", ar: "أخرى" },
  "feedback.submit": { en: "Submit Feedback", ar: "إرسال الملاحظات" },
  "feedback.successTitle": { en: "Feedback submitted", ar: "تم إرسال الملاحظات" },
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
  "help.searchPlaceholder": { en: "Search help articles...", ar: "ابحث في مقالات المساعدة..." },
  "help.searchAria": { en: "Search help articles", ar: "البحث في مقالات المساعدة" },
  "help.clearSearch": { en: "Clear search", ar: "مسح البحث" },
  "help.browseByCategory": { en: "Browse by category", ar: "تصفّح حسب الفئة" },
  "help.resultForOne": { en: "1 result for “{query}”", ar: "نتيجة واحدة لـ «{query}»" },
  "help.resultsFor": { en: "{count} results for “{query}”", ar: "{count} نتائج لـ «{query}»" },
  "help.noResultsTitle": { en: "No articles found", ar: "لم يتم العثور على مقالات" },
  "help.noResultsDesc": { en: "Try a different search term.", ar: "جرّب مصطلح بحث مختلفاً." },
  "help.oneArticle": { en: "1 article", ar: "مقال واحد" },
  "help.articlesCount": { en: "{count} articles", ar: "{count} مقالات" },
  "help.backToHelp": { en: "Back to Help", ar: "العودة إلى المساعدة" },
  "help.related": { en: "Related articles", ar: "مقالات ذات صلة" },
  "help.stillNeedHelp": { en: "Still need help?", ar: "ما زلت بحاجة إلى مساعدة؟" },
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
  "help.cat.flowsTests.title": { en: "Flows & Tests", ar: "التدفقات والاختبارات" },
  "help.cat.flowsTests.desc": {
    en: "Understand how automated tests are organized and executed.",
    ar: "افهم كيف يتم تنظيم الاختبارات الآلية وتنفيذها.",
  },
  "help.cat.automations.title": { en: "Automations", ar: "الأتمتة" },
  "help.cat.automations.desc": {
    en: "Configure scheduled and automated monitoring executions.",
    ar: "اضبط عمليات المراقبة المجدولة والآلية.",
  },
  "help.cat.runsHistory.title": { en: "Runs & History", ar: "عمليات التشغيل والسجل" },
  "help.cat.runsHistory.desc": {
    en: "Review past executions and investigate test results.",
    ar: "راجع عمليات التنفيذ السابقة وتحقّق من نتائج الاختبارات.",
  },
  "help.cat.alerts.title": { en: "Alerts & Notifications", ar: "التنبيهات والإشعارات" },
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
  "admin.navTestDefinitions": { en: "Test Definitions", ar: "تعريفات الاختبار" },

  /* ---------- Test Creation (PR10A: unified manual creation workflow) ---------- */
  "nav.testCreation": { en: "Test Creation", ar: "إنشاء الاختبار" },
  "nav.newTest": { en: "New Test", ar: "اختبار جديد" },
  "nav.creationRequests": { en: "Creation Requests", ar: "طلبات الإنشاء" },
  "admin.navCreationQueue": { en: "Review Queue", ar: "قائمة المراجعة" },

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

  "testdef.implementation.testDefinition": { en: "Definition JSON", ar: "تعريف JSON" },
  "testdef.noFlow": { en: "Not linked", ar: "غير مرتبط" },
  "testdef.flowNumber": { en: "Flow #{id}", ar: "تدفق #{id}" },
  "testdef.versionNumber": { en: "v{number}", ar: "الإصدار {number}" },
  "testdef.noVersions": { en: "No versions", ar: "لا إصدارات" },

  "testdef.empty": { en: "No test definitions yet", ar: "لا توجد تعريفات اختبار بعد" },
  "testdef.emptyHint": {
    en: "Create a definition to describe a user journey in JSON and prove it before release.",
    ar: "أنشئ تعريفاً لوصف رحلة مستخدم بصيغة JSON وأثبتها قبل الإصدار.",
  },
  "testdef.noMatch": { en: "No definitions match this search", ar: "لا توجد تعريفات تطابق هذا البحث" },
  "testdef.noMatchHint": { en: "Try a shorter search term.", ar: "جرّب مصطلح بحث أقصر." },
  "testdef.loadFailed": { en: "Could not load test definitions", ar: "تعذّر تحميل تعريفات الاختبار" },
  "testdef.back": { en: "Back to Test Definitions", ar: "العودة إلى تعريفات الاختبار" },
  "testdef.prevPage": { en: "Previous", ar: "السابق" },
  "testdef.nextPage": { en: "Next", ar: "التالي" },
  "testdef.pageRange": { en: "{from}–{to} of {total}", ar: "{from}–{to} من {total}" },

  /* Create form */
  "testdef.create.title": { en: "New Test Definition", ar: "تعريف اختبار جديد" },
  "testdef.create.subtitle": {
    en: "A definition starts as a DRAFT you can edit freely until it is validated.",
    ar: "يبدأ التعريف كمسودة يمكنك تعديلها بحرية حتى يتم التحقق منها.",
  },
  "testdef.create.name": { en: "Definition name", ar: "اسم التعريف" },
  "testdef.create.namePlaceholder": { en: "Checkout happy path", ar: "مسار الشراء الناجح" },
  "testdef.create.nameHint": {
    en: "Up to 120 characters, unique within this client.",
    ar: "حتى 120 حرفاً، وفريد داخل هذا العميل.",
  },
  "testdef.create.nameRequired": { en: "A definition name is required", ar: "اسم التعريف مطلوب" },
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
  "testdef.create.source": { en: "Definition source (JSON)", ar: "مصدر التعريف (JSON)" },
  "testdef.create.sourceHint": {
    en: "Schema 1.0. Leave the starter document to fill it in after creating.",
    ar: "المخطط 1.0. اترك المستند المبدئي لإكماله بعد الإنشاء.",
  },
  "testdef.create.insertStarter": { en: "Insert starter document", ar: "إدراج مستند مبدئي" },
  "testdef.create.format": { en: "Format JSON", ar: "تنسيق JSON" },
  "testdef.create.formatFailed": {
    en: "Fix the JSON syntax before formatting",
    ar: "أصلح صيغة JSON قبل التنسيق",
  },
  "testdef.create.submit": { en: "Create definition", ar: "إنشاء التعريف" },
  "testdef.create.submitting": { en: "Creating…", ar: "جارٍ الإنشاء…" },
  "testdef.create.createdTitle": { en: "Definition created", ar: "تم إنشاء التعريف" },
  "testdef.create.createdDesc": {
    en: "\"{name}\" is a DRAFT at version {version}.",
    ar: "\"{name}\" مسودة في الإصدار {version}.",
  },
  "testdef.create.failedTitle": { en: "Could not create the definition", ar: "تعذّر إنشاء التعريف" },

  /* Validation panel */
  "testdef.validation.localTitle": { en: "Checked in your browser", ar: "تم التحقق في متصفحك" },
  "testdef.validation.localHint": {
    en: "A local schema pre-check. The engine's validation is the one that counts.",
    ar: "تحقّق أولي محلي من المخطط. تحقّق المحرك هو المُعتبر.",
  },
  "testdef.validation.engineTitle": { en: "Engine validation", ar: "تحقّق المحرك" },
  "testdef.validation.passed": { en: "No problems found", ar: "لم تُكتشف أي مشكلات" },
  "testdef.validation.errorCount": { en: "{count} error(s)", ar: "{count} خطأ" },
  "testdef.validation.warningCount": { en: "{count} warning(s)", ar: "{count} تحذير" },
  "testdef.validation.atRoot": { en: "document", ar: "المستند" },
  "testdef.validation.notRunYet": {
    en: "This version has not been validated yet.",
    ar: "لم يتم التحقق من هذا الإصدار بعد.",
  },

  /* Detail + editor */
  "testdef.detail.metadata": { en: "Definition", ar: "التعريف" },
  "testdef.detail.versions": { en: "Version history", ar: "سجل الإصدارات" },
  "testdef.detail.currentVersion": { en: "Selected version", ar: "الإصدار المحدد" },
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
  "testdef.detail.created": { en: "Created", ar: "أُنشئ" },
  "testdef.detail.validatedAt": { en: "Validated", ar: "تم التحقق" },
  "testdef.detail.approvedAt": { en: "Approved", ar: "تم الاعتماد" },
  "testdef.detail.readyAt": { en: "Ready", ar: "أصبح جاهزاً" },
  "testdef.detail.archivedAt": { en: "Archived", ar: "أُرشف" },
  "testdef.detail.versionLock": { en: "Lock", ar: "قفل التزامن" },
  "testdef.detail.loadFailed": { en: "Could not load this definition", ar: "تعذّر تحميل هذا التعريف" },
  "testdef.detail.versionLoadFailed": { en: "Could not load this version", ar: "تعذّر تحميل هذا الإصدار" },
  "testdef.detail.save": { en: "Save draft", ar: "حفظ المسودة" },
  "testdef.detail.saving": { en: "Saving…", ar: "جارٍ الحفظ…" },
  "testdef.detail.savedTitle": { en: "Draft saved", ar: "تم حفظ المسودة" },
  "testdef.detail.savedDesc": {
    en: "Validation was cleared, so validate the draft again.",
    ar: "تم إلغاء نتيجة التحقق، لذا تحقّق من المسودة مرة أخرى.",
  },
  "testdef.detail.saveFailedTitle": { en: "Could not save the draft", ar: "تعذّر حفظ المسودة" },
  "testdef.detail.revert": { en: "Discard changes", ar: "تجاهل التغييرات" },
  "testdef.detail.unsavedBadge": { en: "Unsaved changes", ar: "تغييرات غير محفوظة" },
  "testdef.detail.unsavedTitle": { en: "Leave without saving?", ar: "الخروج دون حفظ؟" },
  "testdef.detail.unsavedDesc": {
    en: "The edits to this draft have not been sent to the engine and will be lost.",
    ar: "لم تُرسل تعديلات هذه المسودة إلى المحرك وسيتم فقدانها.",
  },
  "testdef.detail.unsavedConfirm": { en: "Discard and leave", ar: "تجاهل واخرج" },
  "testdef.detail.unsavedStay": { en: "Keep editing", ar: "متابعة التعديل" },
  "testdef.detail.jsonInvalid": {
    en: "Fix the JSON syntax before saving",
    ar: "أصلح صيغة JSON قبل الحفظ",
  },

  /* Lifecycle actions */
  "testdef.action.validate": { en: "Validate", ar: "تحقّق" },
  "testdef.action.validating": { en: "Validating…", ar: "جارٍ التحقق…" },
  "testdef.action.trial": { en: "Run trial", ar: "تشغيل تجريبي" },
  "testdef.action.trialRunning": { en: "Running trial…", ar: "جارٍ التشغيل التجريبي…" },
  "testdef.action.approve": { en: "Approve", ar: "اعتماد" },
  "testdef.action.approving": { en: "Approving…", ar: "جارٍ الاعتماد…" },
  "testdef.action.proving": { en: "Run proving", ar: "تشغيل الإثبات" },
  "testdef.action.provingRunning": { en: "Running proving…", ar: "جارٍ تشغيل الإثبات…" },
  "testdef.action.archive": { en: "Archive", ar: "أرشفة" },
  "testdef.action.archiving": { en: "Archiving…", ar: "جارٍ الأرشفة…" },
  "testdef.action.newVersion": { en: "New draft version", ar: "إصدار مسودة جديد" },
  "testdef.action.newVersionWorking": { en: "Creating version…", ar: "جارٍ إنشاء الإصدار…" },
  "testdef.action.adminBadge": { en: "Admin", ar: "مسؤول" },

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
    ar: "لا يتم الوصول إلى \"جاهز\" إلا بتشغيل إثبات ناجح — ولا يُحدد يدوياً.",
  },

  /* Lifecycle confirmations and outcomes */
  "testdef.confirm.approveTitle": { en: "Approve this version?", ar: "اعتماد هذا الإصدار؟" },
  "testdef.confirm.approveDesc": {
    en: "Approving \"{name}\" v{version} allows a proving run, which is the only way it can become READY.",
    ar: "اعتماد \"{name}\" الإصدار {version} يسمح بتشغيل إثبات، وهو الطريق الوحيد ليصبح جاهزاً.",
  },
  "testdef.confirm.provingTitle": { en: "Run the proving execution?", ar: "تشغيل تنفيذ الإثبات؟" },
  "testdef.confirm.provingDesc": {
    en: "This runs \"{name}\" v{version} against the client's real environment. A passing run promotes it to READY.",
    ar: "سيتم تشغيل \"{name}\" الإصدار {version} على بيئة العميل الحقيقية. التشغيل الناجح يرفعه إلى \"جاهز\".",
  },
  "testdef.confirm.archiveTitle": { en: "Archive this definition?", ar: "أرشفة هذا التعريف؟" },
  "testdef.confirm.archiveDesc": {
    en: "Archiving \"{name}\" is permanent: the version and the whole definition become read-only and can no longer run.",
    ar: "أرشفة \"{name}\" نهائية: يصبح الإصدار والتعريف بالكامل للقراءة فقط ولا يمكن تشغيلهما.",
  },
  "testdef.validated.title": { en: "Version validated", ar: "تم التحقق من الإصدار" },
  "testdef.validated.invalidTitle": { en: "Validation found problems", ar: "اكتشف التحقق مشكلات" },
  "testdef.validated.invalidDesc": {
    en: "The version stays in DRAFT until the reported errors are fixed.",
    ar: "يبقى الإصدار مسودة حتى إصلاح الأخطاء المذكورة.",
  },
  "testdef.approved.title": { en: "Version approved", ar: "تم اعتماد الإصدار" },
  "testdef.archived.title": { en: "Definition archived", ar: "تم أرشفة التعريف" },
  "testdef.newVersion.title": { en: "Draft version created", ar: "تم إنشاء إصدار مسودة" },
  "testdef.newVersion.desc": {
    en: "Version {version} is a DRAFT copied from the version you were viewing.",
    ar: "الإصدار {version} مسودة منسوخة من الإصدار الذي كنت تعرضه.",
  },
  "testdef.actionFailed": { en: "The action did not complete", ar: "لم يكتمل الإجراء" },
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
  "testdef.run.pending": { en: "Waiting for the engine…", ar: "في انتظار المحرك…" },
  "testdef.run.steps": { en: "Steps", ar: "الخطوات" },
  "testdef.run.noSteps": { en: "The engine reported no steps", ar: "لم يبلّغ المحرك عن أي خطوات" },
  "testdef.run.thStep": { en: "#", ar: "#" },
  "testdef.run.thAction": { en: "Action", ar: "الإجراء" },
  "testdef.run.thStatus": { en: "Status", ar: "الحالة" },
  "testdef.run.thDetail": { en: "Detail", ar: "التفاصيل" },
  "testdef.run.thDuration": { en: "Took", ar: "استغرق" },
  "testdef.run.expectedOutcome": { en: "Expected outcome", ar: "النتيجة المتوقعة" },
  "testdef.run.status.passed": { en: "Passed", ar: "نجح" },
  "testdef.run.status.failed": { en: "Failed", ar: "فشل" },
  "testdef.run.status.error": { en: "Error", ar: "خطأ" },
  "testdef.run.status.cancelled": { en: "Cancelled", ar: "أُلغي" },
  "testdef.run.status.notExecuted": { en: "Not executed", ar: "لم يُنفّذ" },
  "testdef.run.status.unknown": { en: "Unknown", ar: "غير معروف" },
  "testdef.run.reload": { en: "Refresh run", ar: "تحديث التشغيل" },
  "testdef.run.loadFailed": { en: "Could not load the run", ar: "تعذّر تحميل التشغيل" },

  "testdef.artifacts.title": { en: "Evidence", ar: "الأدلة" },
  "testdef.artifacts.none": { en: "This run produced no evidence files", ar: "لم يُنتج هذا التشغيل أي ملفات أدلة" },
  "testdef.artifacts.unknown": {
    en: "Evidence is recorded with the stored run. Refresh the run to list it.",
    ar: "تُسجَّل الأدلة مع التشغيل المخزّن. حدّث التشغيل لعرضها.",
  },
  "testdef.artifacts.download": { en: "Download", ar: "تنزيل" },
  "testdef.artifacts.downloading": { en: "Downloading…", ar: "جارٍ التنزيل…" },
  "testdef.artifacts.step": { en: "Step {index}", ar: "الخطوة {index}" },
  "testdef.artifacts.runScope": { en: "Whole run", ar: "التشغيل بالكامل" },
  "testdef.artifacts.missingTitle": { en: "Evidence file unavailable", ar: "ملف الأدلة غير متاح" },
  "testdef.artifacts.missingDesc": {
    en: "The engine has the record but could not return the file.",
    ar: "لدى المحرك السجل لكنه لم يتمكن من إرجاع الملف.",
  },
  "testdef.artifacts.deniedTitle": { en: "Evidence access denied", ar: "تم رفض الوصول إلى الأدلة" },
  "testdef.artifacts.failedTitle": { en: "Download failed", ar: "فشل التنزيل" },

  /* Admin client scope */
  "testdef.admin.pickClient": { en: "Client environment", ar: "بيئة العميل" },
  "testdef.admin.pickClientHint": {
    en: "Test definitions belong to one client environment. Choose which one to work in.",
    ar: "تنتمي تعريفات الاختبار إلى بيئة عميل واحدة. اختر البيئة التي تعمل فيها.",
  },
  "testdef.admin.noClients": { en: "No client environments exist yet", ar: "لا توجد بيئات عملاء بعد" },
  "testdef.admin.clientsFailed": { en: "Could not load client environments", ar: "تعذّر تحميل بيئات العملاء" },

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
  "landing.allSystems": { en: "All Systems Operational", ar: "جميع الأنظمة تعمل" },
  "landing.uptime": { en: "Uptime", ar: "زمن التشغيل" },
  "landing.feature.ai.title": { en: "AI-Powered Insights", ar: "رؤى مدعومة بالذكاء الاصطناعي" },
  "landing.feature.ai.desc": {
    en: "Smart analysis and self-healing capabilities to keep your tests resilient and up to date.",
    ar: "تحليل ذكي وقدرات إصلاح ذاتي للحفاظ على اختباراتك مرنة ومحدّثة.",
  },
  "landing.feature.monitoring.title": { en: "24/7 Monitoring", ar: "مراقبة على مدار الساعة" },
  "landing.feature.monitoring.desc": {
    en: "Round-the-clock monitoring across all environments to ensure system stability.",
    ar: "مراقبة متواصلة على مدار الساعة عبر جميع البيئات لضمان استقرار النظام.",
  },
  "landing.feature.notifications.title": { en: "Instant Notifications", ar: "إشعارات فورية" },
  "landing.feature.notifications.desc": {
    en: "Real-time alerts via Telegram with rich details and screenshots for faster response.",
    ar: "تنبيهات فورية عبر تيليجرام مع تفاصيل ولقطات شاشة غنية لاستجابة أسرع.",
  },
  "landing.feature.scalable.title": { en: "Scalable & Reliable", ar: "قابل للتوسع وموثوق" },
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
  "landing.copyright": {
    en: "© 2026 Assuredia QA Monitoring. All rights reserved.",
    ar: "© 2026 أسيوريا لمراقبة جودة البرمجيات. جميع الحقوق محفوظة.",
  },
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
export function translate(key: string, vars?: Record<string, string | number>): string {
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
