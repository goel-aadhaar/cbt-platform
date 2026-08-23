/**
 * The exam-edit diff, checked in isolation.
 *
 * Run: `npx tsx qa/uat/exam-edit-plan-checks.ts` (from apps/web, or with the
 * repo root as cwd — the import below is relative).
 *
 * The web app has no test runner and this did not seem worth adding one for, so
 * this is a standalone script in the same spirit as the browser suites next to
 * it. What it guards is the one thing about editing an exam that is genuinely
 * easy to get wrong and expensive when it is: a question moved between sections
 * must be removed before it is re-added, or the add is refused as a duplicate
 * and the remove then takes it off the paper altogether.
 */
import {
  planExamEdit,
  type PlannedSection,
} from "../../apps/web/src/lib/exam-edit-plan";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(
    `[${ok ? "PASS" : "**FAIL**"}] ${name}${detail ? " - " + detail : ""}`,
  );
};

const section = (
  id: string,
  name: string,
  questionIds: string[],
): Required<PlannedSection> => ({
  id,
  name,
  marksCorrect: 4,
  marksWrong: 1,
  questionIds,
});

/* ---- nothing changed ---------------------------------------------------- */
{
  const before = {
    sections: [section("s1", "Physics", ["q1"])],
    batchIds: ["b1"],
  };
  const plan = planExamEdit(before, {
    sections: [{ ...before.sections[0] }],
    batchIds: ["b1"],
  });
  check("an untouched exam plans no work", plan.empty);
}

/* ---- a question moved between sections ---------------------------------- */
{
  const before = {
    sections: [
      section("s1", "Physics", ["q1", "q2"]),
      section("s2", "Chemistry", []),
    ],
    batchIds: [],
  };
  const plan = planExamEdit(before, {
    sections: [
      { ...before.sections[0], questionIds: ["q1"] },
      { ...before.sections[1], questionIds: ["q2"] },
    ],
    batchIds: [],
  });

  check(
    "the move is one removal and one addition",
    plan.removeQuestions.length === 1 && plan.addQuestions.length === 1,
    `${plan.removeQuestions.length} removed, ${plan.addQuestions.length} added`,
  );
  check(
    "it is removed from the section it left",
    plan.removeQuestions[0]?.sectionId === "s1" &&
      plan.removeQuestions[0]?.questionId === "q2",
  );
  check(
    "it is added to the section it joined",
    plan.addQuestions[0]?.sectionId === "s2" &&
      plan.addQuestions[0]?.questionId === "q2",
  );
  // The guarantee the caller relies on. The plan is executed in field order:
  // removeQuestions before addQuestions. If that ever inverts, the add is
  // refused as a duplicate and the remove then loses the question entirely.
  const fields = Object.keys(plan);
  check(
    "removals are planned before additions",
    fields.indexOf("removeQuestions") < fields.indexOf("addQuestions") &&
      fields.indexOf("removeSections") < fields.indexOf("createSections"),
    fields.join(" → "),
  );
}

/* ---- a section dropped -------------------------------------------------- */
{
  const before = {
    sections: [section("s1", "Physics", ["q1"]), section("s2", "Chem", ["q2"])],
    batchIds: [],
  };
  const plan = planExamEdit(before, {
    sections: [{ ...before.sections[0] }],
    batchIds: [],
  });
  check("the dropped section is removed", plan.removeSections[0] === "s2");
  check(
    "its questions are not removed one by one first",
    // Deleting the section takes its placements with it; listing them
    // separately would be a wasted round-trip per question and would 404
    // once the section is gone.
    plan.removeQuestions.length === 0,
  );
}

/* ---- a section added ---------------------------------------------------- */
{
  const before = { sections: [section("s1", "Physics", ["q1"])], batchIds: [] };
  const plan = planExamEdit(before, {
    sections: [
      { ...before.sections[0] },
      {
        name: "Maths",
        marksCorrect: 4,
        marksWrong: 1,
        questionIds: ["q9", "q8"],
      },
    ],
    batchIds: [],
  });
  check("the new section is created", plan.createSections.length === 1);
  check(
    "its questions ride along with the creation",
    plan.createSections[0]?.questionIds.join(",") === "q9,q8" &&
      plan.addQuestions.length === 0,
    "there is no section id to add them to until it exists",
  );
}

/* ---- marks corrected ---------------------------------------------------- */
{
  const before = { sections: [section("s1", "Physics", ["q1"])], batchIds: [] };
  const plan = planExamEdit(before, {
    sections: [{ ...before.sections[0], marksWrong: 2 }],
    batchIds: [],
  });
  check(
    "a changed marking scheme is an update",
    plan.updateSections.length === 1 && plan.updateSections[0].marksWrong === 2,
  );
  check("and nothing else moves", plan.addQuestions.length === 0);
}

/* ---- renaming only ------------------------------------------------------ */
{
  const before = { sections: [section("s1", "Physics", ["q1"])], batchIds: [] };
  const plan = planExamEdit(before, {
    sections: [{ ...before.sections[0], name: "Physics I" }],
    batchIds: [],
  });
  check(
    "a rename does not disturb the questions",
    plan.updateSections.length === 1 &&
      plan.addQuestions.length === 0 &&
      plan.removeQuestions.length === 0,
  );
}

/* ---- batches ------------------------------------------------------------ */
{
  const plan = planExamEdit(
    { sections: [], batchIds: ["b1", "b2"] },
    { sections: [], batchIds: ["b2", "b3"] },
  );
  check(
    "batch changes are a diff, not a rewrite",
    plan.batches.add.join() === "b3" && plan.batches.remove.join() === "b1",
    `add=${plan.batches.add} remove=${plan.batches.remove}`,
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
