"use client";

import { HelpAndSupport, type Faq } from "@/components/staff/help-and-support";
import { TeacherShell } from "@/components/staff/teacher-shell";

const CATEGORIES = ["All", "Exams", "Questions", "Students", "Account"];

/**
 * Staff-facing answers, not the candidate ones. These are the questions a
 * teacher actually arrives with — why an exam will not publish, why a batch is
 * missing from a picker — each answered with the rule the server enforces, so
 * the page explains the behaviour rather than apologising for it.
 */
const FAQS: Faq[] = [
  {
    q: "Why can't I publish my exam?",
    a: "Teachers author and submit; an administrator reviews and publishes. Once you submit for approval it leaves your hands until an admin approves or sends it back with a reason. An Assessment is the exception — you schedule and publish that yourself, with no admin step.",
    category: "Exams",
  },
  {
    q: "What is the difference between a Mock Test and an Assessment?",
    a: "A Mock Test goes through admin review, approval and scheduling before students sit it. An Assessment you schedule and publish directly, and it closes, evaluates and publishes its results automatically at the end of its window. Assessments also cap a candidate's time at whatever is left of the window, where a Mock Test always grants the full duration.",
    category: "Exams",
  },
  {
    q: "Why can't I see a batch when assigning one?",
    a: "You can only reach batches you are assigned to. An administrator manages that from Organization → Teachers; ask them to add the batch to your account and it will appear.",
    category: "Students",
  },
  {
    q: "Why was my question rejected?",
    a: "Questions enter the bank as drafts and need approval before an exam can use them. A rejection carries a reason — open the question in the Question Bank to read it, fix it, and submit again.",
    category: "Questions",
  },
  {
    q: "Can I edit a question that is already in an exam?",
    a: "Not silently. If the question is used by an exam the platform blocks the edit and names the exams affected, because changing a question under a paper people have already sat changes what their marks meant.",
    category: "Questions",
  },
  {
    q: "How do I tell my students something?",
    a: "Announcements. You can post to the batches you teach, either as a draft or published immediately. Broadcasting to other teachers is an administrator action.",
    category: "Students",
  },
  {
    q: "How do I change my password?",
    a: "From My Profile. Signing in also requires a one-time code sent to your email, so keep that address current — an administrator can update it if it is wrong.",
    category: "Account",
  },
];

export default function TeacherHelpPage() {
  return (
    <TeacherShell title="Help & Support">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-[-0.4px] text-admin-ink">
          Help &amp; Support
        </h1>
        <p className="mt-1 text-sm text-admin-muted">
          Answers for teaching staff, and a direct line to us.
        </p>
      </header>

      <HelpAndSupport
        faqs={FAQS}
        categories={CATEGORIES}
        subjectTag="Teacher console"
      />
    </TeacherShell>
  );
}
