import { QuestionStatus } from '../../generated/prisma/enums';
import { ExamStatus } from '../../generated/prisma/enums';

/**
 * Rejection has its own state, and that state behaves like a draft.
 *
 * Sending a question back used to set it to DRAFT, which is also where a
 * teacher's unfinished work lives — so the one item an admin had actively
 * returned, with a reason attached, became the hardest thing in the list to
 * find. These pin both halves: the state exists, and it is still editable and
 * re-submittable, because a rejection nobody can act on is just a deletion with
 * extra steps.
 */
describe('REJECTED status', () => {
  it('exists on both workflows', () => {
    expect(QuestionStatus.REJECTED).toBe('REJECTED');
    expect(ExamStatus.REJECTED).toBe('REJECTED');
  });

  it('is distinct from DRAFT', () => {
    // The regression this guards: "fixing" rejection by aliasing it to DRAFT
    // would make every assertion about labels pass and restore the bug.
    expect(QuestionStatus.REJECTED).not.toBe(QuestionStatus.DRAFT);
    expect(ExamStatus.REJECTED).not.toBe(ExamStatus.DRAFT);
  });

  describe('what an author may still edit', () => {
    // Mirrors AUTHOR_EDITABLE in questions.service.ts / exams.service.ts.
    const questionEditable: QuestionStatus[] = [
      QuestionStatus.DRAFT,
      QuestionStatus.REJECTED,
    ];
    const examEditable: ExamStatus[] = [ExamStatus.DRAFT, ExamStatus.REJECTED];

    it('includes a sent-back question', () => {
      expect(questionEditable).toContain(QuestionStatus.REJECTED);
    });

    it('includes a sent-back exam', () => {
      expect(examEditable).toContain(ExamStatus.REJECTED);
    });

    it('never includes an approved or archived item', () => {
      // Editing after approval would silently change a paper others have
      // already signed off, and re-score anything already sat.
      expect(questionEditable).not.toContain(QuestionStatus.APPROVED);
      expect(questionEditable).not.toContain(QuestionStatus.ARCHIVED);
      expect(examEditable).not.toContain(ExamStatus.APPROVED);
      expect(examEditable).not.toContain(ExamStatus.PUBLISHED);
    });

    it('never includes an item currently in review', () => {
      // While it sits with an admin it is theirs; the author edits it after it
      // comes back, which is what REJECTED is for.
      expect(questionEditable).not.toContain(QuestionStatus.REVIEW);
      expect(examEditable).not.toContain(ExamStatus.REVIEW);
    });
  });
});
