import Link from "next/link";

import { StudentShell } from "@/components/student/student-shell";
import { LockIcon, TrendingUpIcon } from "@/components/student/icons";

interface Topic {
  name: string;
  questions: number;
  description: string;
  mastery: number;
  wide?: boolean;
}

const TOPICS_BY_SUBJECT: Record<string, { chapter: string; topics: Topic[] }> =
  {
    physics: {
      chapter: "Laws of Motion",
      topics: [
        {
          name: "Newton's First Law",
          questions: 34,
          description:
            "Inertia, frames of reference, and equilibrium conditions.",
          mastery: 65,
        },
        {
          name: "Friction",
          questions: 42,
          description:
            "Static and kinetic friction, coefficients, and motion on rough surfaces.",
          mastery: 30,
        },
        {
          name: "Circular Motion",
          questions: 56,
          description:
            "Centripetal force, banked curves, and non-uniform circular dynamics.",
          mastery: 80,
          wide: true,
        },
      ],
    },
    chemistry: {
      chapter: "Chemical Bonding",
      topics: [
        {
          name: "Ionic Bonding",
          questions: 28,
          description:
            "Lattice energy, Born–Haber cycles, and ionic character.",
          mastery: 55,
        },
        {
          name: "Covalent Bonding",
          questions: 38,
          description: "VSEPR, hybridisation, and molecular geometry.",
          mastery: 40,
        },
        {
          name: "Intermolecular Forces",
          questions: 44,
          description:
            "Hydrogen bonding, dipole interactions, and physical properties.",
          mastery: 70,
          wide: true,
        },
      ],
    },
    biology: {
      chapter: "Genetics",
      topics: [
        {
          name: "Mendelian Inheritance",
          questions: 36,
          description: "Laws of segregation, dominance, and dihybrid crosses.",
          mastery: 75,
        },
        {
          name: "Molecular Genetics",
          questions: 48,
          description: "DNA replication, transcription, and the genetic code.",
          mastery: 60,
        },
        {
          name: "Human Genetics",
          questions: 52,
          description:
            "Pedigree analysis, sex-linked traits, and genetic disorders.",
          mastery: 85,
          wide: true,
        },
      ],
    },
  };

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function PracticeTopicsPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  const data = TOPICS_BY_SUBJECT[subject] ?? TOPICS_BY_SUBJECT.physics;
  const subjectName = titleCase(subject);

  return (
    <StudentShell breadcrumb={["Practice Library", subjectName]}>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-[-0.6px] text-admin-ink">
          {data.chapter} Topics
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-admin-muted">
          Select a topic below to focus your practice session. Consistent
          practice builds mastery and confidence.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {data.topics.map((topic) => (
          <TopicCard key={topic.name} subject={subject} topic={topic} />
        ))}

        {/* Locked placeholder */}
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-admin-line bg-admin/[0.03] p-6 text-center">
          <LockIcon className="size-6 text-admin-muted" />
          <p className="mt-2 font-semibold text-admin-muted">
            More topics unlocking soon
          </p>
          <p className="text-sm text-admin-muted/80">
            Complete current topics to progress.
          </p>
        </div>
      </div>
    </StudentShell>
  );
}

function TopicCard({ subject, topic }: { subject: string; topic: Topic }) {
  return (
    <Link
      href={`/student/practice/${subject}/start`}
      className={`group flex flex-col rounded-2xl border border-admin-line/40 bg-white p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] ${
        topic.wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl bg-admin-surface text-admin">
          <TrendingUpIcon className="size-5" />
        </span>
        <span className="rounded-full bg-admin-bg px-3 py-1 text-xs font-semibold text-admin-muted">
          {topic.questions} Questions
        </span>
      </div>
      <div
        className={
          topic.wide ? "mt-4 flex items-center justify-between gap-8" : "mt-4"
        }
      >
        <div className={topic.wide ? "max-w-md" : ""}>
          <h2 className="text-lg font-bold text-admin-ink">{topic.name}</h2>
          <p className="mt-1 text-sm text-admin-muted">{topic.description}</p>
        </div>
        <div className={topic.wide ? "w-72 shrink-0" : "mt-4"}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-admin-muted">Mastery Progress</span>
            <span className="font-semibold text-admin-ink">
              {topic.mastery}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e1e3e4]">
            <div
              className="h-full rounded-full bg-admin"
              style={{ width: `${topic.mastery}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
