import {
  api,
  createApprovedQuestion,
  createPublishedExam,
  setupTenant,
  TenantFixture,
} from './support/client';

interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
interface QuestionRow {
  id: string;
  statement: string;
  type: string;
}

/**
 * Question bank (§2.4–§2.6): listing, full-text search, and the edit safeguard.
 *
 * Listing is paginated by contract necessity — the bank is specified to hold
 * 20,000+ questions per institute, so an uncapped list would serialise the whole
 * bank into one response.
 */
describe('Question bank', () => {
  let tenant: TenantFixture;

  beforeAll(async () => {
    tenant = await setupTenant('qb');
    await createApprovedQuestion(tenant, {
      statement: 'Force equals mass times acceleration',
      chapter: 'Mechanics',
    });
    await createApprovedQuestion(tenant, {
      statement: 'Photosynthesis converts light into chemical energy',
      subject: 'Biology',
      chapter: 'Botany',
    });
    await createApprovedQuestion(tenant, {
      statement: 'Quantum theory explains subatomic particles',
      chapter: 'Modern',
    });
  }, 180_000);

  describe('listing is paginated (§2.4 — 20,000+ questions per bank)', () => {
    it('returns a page envelope with a total', async () => {
      const res = await api<Page<QuestionRow>>('/questions', {
        token: tenant.teacherToken,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBe(3);
      expect(res.body.limit).toBe(50);
    });

    it('honours limit and offset', async () => {
      const first = await api<Page<QuestionRow>>('/questions', {
        token: tenant.teacherToken,
        query: { limit: 2, offset: 0 },
      });
      const second = await api<Page<QuestionRow>>('/questions', {
        token: tenant.teacherToken,
        query: { limit: 2, offset: 2 },
      });

      expect(first.body.items).toHaveLength(2);
      expect(second.body.items).toHaveLength(1);
      expect(first.body.total).toBe(3);
      // Pages must not overlap.
      const firstIds = first.body.items.map((q) => q.id);
      expect(second.body.items.some((q) => firstIds.includes(q.id))).toBe(
        false,
      );
    });

    it('refuses an absurd page size rather than dumping the bank', async () => {
      const res = await api('/questions', {
        token: tenant.teacherToken,
        query: { limit: 100_000 },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('full-text search (§2.6)', () => {
    it('finds a question by a word in its statement', async () => {
      const res = await api<Page<QuestionRow>>('/questions', {
        token: tenant.teacherToken,
        query: { search: 'acceleration' },
      });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].statement).toContain('acceleration');
    });

    it('stems English words (converting → converts)', async () => {
      const res = await api<Page<QuestionRow>>('/questions', {
        token: tenant.teacherToken,
        query: { search: 'converting' },
      });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].statement).toContain('Photosynthesis');
    });

    it('supports the websearch exclusion operator', async () => {
      const res = await api<Page<QuestionRow>>('/questions', {
        token: tenant.teacherToken,
        query: { search: 'quantum -subatomic' },
      });
      expect(res.body.items).toHaveLength(0);
    });

    it('returns nothing for a term that matches no question', async () => {
      const res = await api<Page<QuestionRow>>('/questions', {
        token: tenant.teacherToken,
        query: { search: 'zebrafish' },
      });
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });

  describe('edit safeguard (§2.5)', () => {
    it('lets an unused question be edited freely', async () => {
      const id = await createApprovedQuestion(tenant, {
        statement: 'Never used in an exam',
      });
      const res = await api(`/questions/${id}`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { statement: 'Edited freely' },
      });
      expect(res.status).toBe(200);
    });

    it('blocks editing a question already used in an exam, naming the exams', async () => {
      const id = await createApprovedQuestion(tenant, {
        statement: 'Used in a live paper',
      });
      await createPublishedExam(tenant, {
        title: 'Safeguard Paper',
        questionIds: [id],
      });

      const res = await api<{
        error: string;
        details: { affectedExams: { title: string }[] };
      }>(`/questions/${id}`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { statement: 'Sneaky edit' },
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('QuestionUsedInExams');
      // The admin must be told WHICH exams need remediating.
      expect(res.body.details.affectedExams.map((e) => e.title)).toContain(
        'Safeguard Paper',
      );
    });

    it('allows the edit once the admin confirms', async () => {
      const id = await createApprovedQuestion(tenant, {
        statement: 'Confirmed edit path',
      });
      await createPublishedExam(tenant, {
        title: 'Confirm Paper',
        questionIds: [id],
      });

      const res = await api(`/questions/${id}`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { statement: 'Edited after confirming', confirm: true },
      });
      expect(res.status).toBe(200);
    });
  });
});
