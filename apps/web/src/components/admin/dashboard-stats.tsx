"use client";

import type { ComponentType, SVGProps } from "react";

import { useAdminData } from "@/hooks/use-admin-data";
import { examDisplayStatus, listExams } from "@/lib/exams";
import { listQuestions } from "@/lib/questions";
import { listStudents } from "@/lib/students";
import { BarChartIcon, ClipboardIcon, DatabaseIcon, UsersIcon } from "./icons";

interface Agg {
  students: number;
  activeExams: number;
  questions: number;
  completedExams: number;
}

/** The dashboard's 4 KPI cards, backed by live API counts. */
export function DashboardStats() {
  const { data, loading } = useAdminData<Agg>(async () => {
    const [students, exams, questions] = await Promise.all([
      listStudents({ limit: 1 }),
      listExams(),
      listQuestions({ limit: 1 }),
    ]);
    const active = exams.filter((e) =>
      ["LIVE", "SCHEDULED"].includes(examDisplayStatus(e)),
    ).length;
    const completed = exams.filter(
      (e) => examDisplayStatus(e) === "COMPLETED",
    ).length;
    return {
      students: students.total,
      activeExams: active,
      questions: questions.total,
      completedExams: completed,
    };
  });

  const cards: {
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    label: string;
    value: number | undefined;
  }[] = [
    { icon: UsersIcon, label: "Total Students", value: data?.students },
    { icon: ClipboardIcon, label: "Active Exams", value: data?.activeExams },
    { icon: DatabaseIcon, label: "Question Bank", value: data?.questions },
    {
      icon: BarChartIcon,
      label: "Completed Exams",
      value: data?.completedExams,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-admin-line/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <div className="flex items-start justify-between">
            <span className="flex size-12 items-center justify-center rounded-full bg-admin-surface text-admin-muted">
              <c.icon className="size-5" />
            </span>
            <span className="rounded-full bg-admin-mint/50 px-2.5 py-1 text-xs font-semibold text-admin">
              Live
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold text-admin-ink">
            {loading || c.value === undefined
              ? "…"
              : c.value.toLocaleString("en-IN")}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-admin-muted">
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}
