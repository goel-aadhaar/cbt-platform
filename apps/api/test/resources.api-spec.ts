import {
  addStudent,
  api,
  ensureChapterId,
  ensureSubjectId,
  expectStatus,
  setupTenant,
  type TenantFixture,
} from './support/client';

/**
 * Study material end to end (§2.12).
 *
 * The unit specs beside the service pin the visibility ALGEBRA; this pins the
 * things only a real database can answer — that the batch filter survives an
 * actual Prisma join, that a chapter from another subject is refused by a real
 * lookup, and that one institute's material is not merely hidden from another
 * but unreachable.
 *
 * Everything here goes through HTTP, so the role guards, the DTO validation
 * and the tenant context are all in the path being tested.
 */

interface ResourceRow {
  id: string;
  title: string;
  type: 'FILE' | 'YOUTUBE';
  mediaKey: string | null;
  youtubeVideoId: string | null;
  subject: { id: string; name: string };
  chapter: { id: string; name: string } | null;
  batches: { id: string; name: string }[];
  file: { fileName: string; size: number; mimeType: string } | null;
}

/** A tiny but genuine PDF — the media module checks the declared MIME type. */
function pdfUpload(name: string): FormData {
  const bytes = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    'utf8',
  );
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    name,
  );
  form.append('kind', 'DOCUMENT');
  return form;
}

/**
 * The second institute, built once and shared.
 *
 * Every cross-tenant assertion needs "somewhere else" to exist, and each
 * setupTenant() is roughly twenty round trips (institute, two invites, two
 * OTP logins, a program, a class, a batch). Creating a fresh one per test blew
 * the 120s hook budget and left twenty throwaway institutes behind per run —
 * which also eats into the 4-digit institute code space.
 *
 * Memoised on the promise, not the value, so concurrent callers share the one
 * in flight rather than starting a second.
 */
let foreignTenant: Promise<TenantFixture> | null = null;
const otherInstitute = (): Promise<TenantFixture> =>
  (foreignTenant ??= setupTenant('resx'));

/** Tenant setup is slow enough to need its own budget; see above. */
const SETUP_TIMEOUT = 300_000;

describe('Resources', () => {
  let tenant: TenantFixture;

  // Alpha is the batch setupTenant creates; Beta is added here so the case
  // that actually matters — a student NOT seeing another batch's material —
  // is exercisable at all.
  let betaBatchId: string;
  let alphaStudent: string;
  let betaStudent: string;

  let physicsId: string;
  let kinematicsId: string;
  let chemistryId: string;
  let bondingId: string;

  let teacherUserId: string;

  beforeAll(async () => {
    tenant = await setupTenant('res');

    const beta = await api<{ id: string }>('/batches', {
      method: 'POST',
      token: tenant.adminToken,
      body: { classId: tenant.classId, name: 'Beta' },
    });
    expectStatus(beta, 201);
    betaBatchId = beta.body.id;

    [alphaStudent, betaStudent] = await Promise.all([
      addStudent(tenant, 'Alpha Candidate', 'RESA', tenant.batchId),
      addStudent(tenant, 'Beta Candidate', 'RESB', betaBatchId),
    ]);

    physicsId = await ensureSubjectId(tenant, 'Physics');
    kinematicsId = await ensureChapterId(tenant, physicsId, 'Kinematics');
    chemistryId = await ensureSubjectId(tenant, 'Chemistry');
    bondingId = await ensureChapterId(tenant, chemistryId, 'Chemical Bonding');

    const me = await api<{ id: string }>('/auth/me', {
      token: tenant.teacherToken,
    });
    expectStatus(me, 200);
    teacherUserId = me.body.id;
  }, SETUP_TIMEOUT);

  /* ------------------------------------------------------------------ */

  describe('sharing a YouTube lecture', () => {
    let resourceId: string;

    it('stores only the video id, never the URL that was pasted', async () => {
      const res = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Projectile motion — full lecture',
          description: 'Worked examples from the 2024 batch.',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ?t=90',
        },
      });
      expectStatus(res, 201);
      resourceId = res.body.id;

      expect(res.body.type).toBe('YOUTUBE');
      expect(res.body.youtubeVideoId).toBe('dQw4w9WgXcQ');
      expect(res.body.mediaKey).toBeNull();
      expect(res.body.batches.map((b) => b.id)).toEqual([tenant.batchId]);
    });

    it('reaches the student in that batch, with everything needed to play it', async () => {
      const res = await api<ResourceRow[]>('/resources', {
        token: alphaStudent,
      });
      expectStatus(res, 200);

      const row = res.body.find((r) => r.id === resourceId);
      expect(row).toBeDefined();
      // The player builds its embed from the id alone (§2.12) — if this were
      // null the student would see a title and nothing to watch.
      expect(row!.youtubeVideoId).toBe('dQw4w9WgXcQ');
      expect(row!.chapter?.id).toBe(kinematicsId);
    });

    it('does not reach a student in another batch', async () => {
      const list = await api<ResourceRow[]>('/resources', {
        token: betaStudent,
      });
      expectStatus(list, 200);
      expect(list.body.map((r) => r.id)).not.toContain(resourceId);

      // Not merely absent from the list — unreachable by id, and a 404 rather
      // than a 403 so the reply does not confirm it exists.
      const direct = await api(`/resources/${resourceId}`, {
        token: betaStudent,
      });
      expectStatus(direct, 404);
    });

    it('refuses the same video filed in the same chapter twice', async () => {
      const again = await api<{ message: string }>('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          // A different title and a different URL shape for the same video —
          // the guard is keyed on the video, not on what it was called.
          title: 'Projectile motion (re-upload)',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [betaBatchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(again, 409);
      expect(JSON.stringify(again.body)).toContain('already shared');
    });

    it('allows the same video in a different chapter', async () => {
      const res = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Projectile motion, revisited for Chemistry',
          type: 'YOUTUBE',
          subjectId: chemistryId,
          chapterId: bondingId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(res, 201);
    });

    it('refuses a link that is not a YouTube video', async () => {
      const res = await api('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Not a lecture',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://vimeo.com/12345678',
        },
      });
      expectStatus(res, 400);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('sharing a file', () => {
    let mediaKey: string;
    let resourceId: string;

    it('uploads to the media library first', async () => {
      const res = await api<{ key: string }>('/media', {
        method: 'POST',
        token: tenant.adminToken,
        form: pdfUpload('kinematics-notes.pdf'),
      });
      expectStatus(res, 201);
      mediaKey = res.body.key;
    });

    it('shares it with two batches at once', async () => {
      const res = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Kinematics notes',
          type: 'FILE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId, betaBatchId],
          mediaKey,
        },
      });
      expectStatus(res, 201);
      resourceId = res.body.id;
      expect(res.body.batches.map((b) => b.name).sort()).toEqual([
        'Alpha',
        'Beta',
      ]);
    });

    it('shows both students the file, with its name and size', async () => {
      for (const token of [alphaStudent, betaStudent]) {
        const res = await api<ResourceRow[]>('/resources', { token });
        expectStatus(res, 200);
        const row = res.body.find((r) => r.id === resourceId);
        expect(row).toBeDefined();
        expect(row!.file?.fileName).toBe('kinematics-notes.pdf');
        expect(row!.file?.size).toBeGreaterThan(0);
      }
    });

    it('lets a student in a shared batch actually download it', async () => {
      // The key contains a slash (institute/uuid.ext), so it has to be
      // encoded to survive routing — exactly what the web client does.
      const res = await api(`/media/file/${encodeURIComponent(mediaKey)}`, {
        token: alphaStudent,
      });
      expectStatus(res, 200);
    });

    it(
      'refuses a media key from another institute',
      async () => {
        const other = await otherInstitute();
        const foreign = await api<{ key: string }>('/media', {
          method: 'POST',
          token: other.adminToken,
          form: pdfUpload('theirs.pdf'),
        });
        expectStatus(foreign, 201);

        const res = await api('/resources', {
          method: 'POST',
          token: tenant.adminToken,
          body: {
            title: 'Borrowed file',
            type: 'FILE',
            subjectId: physicsId,
            chapterId: kinematicsId,
            batchIds: [tenant.batchId],
            mediaKey: foreign.body.key,
          },
        });
        expectStatus(res, 400);
      },
      SETUP_TIMEOUT,
    );

    it('unshares by replacing the batch list', async () => {
      const res = await api<ResourceRow>(`/resources/${resourceId}`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { batchIds: [tenant.batchId] },
      });
      expectStatus(res, 200);
      expect(res.body.batches.map((b) => b.id)).toEqual([tenant.batchId]);

      const beta = await api(`/resources/${resourceId}`, {
        token: betaStudent,
      });
      expectStatus(beta, 404);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('the Subject > Chapter hierarchy', () => {
    it('refuses a chapter that belongs to another subject', async () => {
      const res = await api<{ message: string }>('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Misfiled',
          type: 'YOUTUBE',
          subjectId: physicsId,
          // Chemistry's chapter under Physics: filing it would make the
          // material unreachable by the navigation this feature is built on.
          chapterId: bondingId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(res, 400);
      expect(JSON.stringify(res.body)).toContain('chapter');
    });

    it('refuses the same mismatch on an edit', async () => {
      const created = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Filed correctly, for now',
          type: 'YOUTUBE',
          subjectId: chemistryId,
          chapterId: bondingId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://www.youtube.com/shorts/LmNoPqRsTuV',
        },
      });
      expectStatus(created, 201);

      const moved = await api(`/resources/${created.body.id}`, {
        method: 'PATCH',
        token: tenant.adminToken,
        body: { subjectId: physicsId, chapterId: bondingId },
      });
      expectStatus(moved, 400);
    });

    it('counts subjects and chapters from what the caller may see', async () => {
      const subjects = await api<
        {
          id: string;
          name: string;
          chapterCount: number;
          resourceCount: number;
        }[]
      >('/resources/subjects', { token: alphaStudent });
      expectStatus(subjects, 200);

      const physics = subjects.body.find((s) => s.id === physicsId);
      expect(physics).toBeDefined();
      expect(physics!.resourceCount).toBeGreaterThan(0);
      expect(physics!.chapterCount).toBeGreaterThan(0);

      const chapters = await api<
        { id: string | null; name: string; resourceCount: number }[]
      >(`/resources/subjects/${physicsId}/chapters`, { token: alphaStudent });
      expectStatus(chapters, 200);

      const kinematics = chapters.body.find((c) => c.id === kinematicsId);
      expect(kinematics).toBeDefined();

      // The count on the shelf must equal the number of rows behind it — a
      // student told a chapter holds 3 and shown 1 has been given a reason to
      // think the platform lost their material.
      const listed = await api<ResourceRow[]>('/resources', {
        token: alphaStudent,
        query: { subjectId: physicsId, chapterId: kinematicsId },
      });
      expectStatus(listed, 200);
      expect(listed.body.length).toBe(kinematics!.resourceCount);
    });

    it('gives a student in an empty batch no shelves at all', async () => {
      const empty = await api<{ id: string }>('/batches', {
        method: 'POST',
        token: tenant.adminToken,
        body: { classId: tenant.classId, name: 'Gamma' },
      });
      expectStatus(empty, 201);
      const lonely = await addStudent(
        tenant,
        'Gamma Candidate',
        'RESG',
        empty.body.id,
      );

      const subjects = await api<unknown[]>('/resources/subjects', {
        token: lonely,
      });
      expectStatus(subjects, 200);
      expect(subjects.body).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('what a teacher may publish', () => {
    beforeAll(async () => {
      // Assigned to Alpha only. A teacher with no batches at all sees nothing,
      // which the unit specs cover; this is the partial case.
      const res = await api(`/staff/${teacherUserId}/batches`, {
        method: 'PUT',
        token: tenant.adminToken,
        body: { batchIds: [tenant.batchId] },
      });
      expectStatus(res, 200);
    });

    it('lets them share with a batch they teach', async () => {
      const res = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Tutorial sheet 3',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=aBcDeFgHiJk',
        },
      });
      expectStatus(res, 201);
    });

    it('refuses a batch they do not teach', async () => {
      const res = await api('/resources', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Not mine to share',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [betaBatchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(res, 403);
    });

    it('refuses the whole request when only one batch is unauthorised', async () => {
      const before = await api<ResourceRow[]>('/resources', {
        token: tenant.adminToken,
      });
      expectStatus(before, 200);

      const res = await api('/resources', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Half allowed',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId, betaBatchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(res, 403);

      // All or nothing: a partial share would silently drop half of what the
      // teacher asked for, and they would never know.
      const after = await api<ResourceRow[]>('/resources', {
        token: tenant.adminToken,
      });
      expectStatus(after, 200);
      expect(after.body.length).toBe(before.body.length);
    });

    it('shows them their own batch only', async () => {
      const res = await api<ResourceRow[]>('/resources', {
        token: tenant.teacherToken,
      });
      expectStatus(res, 200);
      for (const row of res.body) {
        expect(row.batches.map((b) => b.id)).toContain(tenant.batchId);
      }
    });

    it('requires at least one batch', async () => {
      const res = await api('/resources', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Shared with nobody',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(res, 400);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('across institutes', () => {
    it('never shows one institute the material of another', async () => {
      const other = await otherInstitute();
      const theirSubject = await ensureSubjectId(other, 'Physics');
      const theirChapter = await ensureChapterId(
        other,
        theirSubject,
        'Kinematics',
      );

      const theirs = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: other.adminToken,
        body: {
          title: 'Their private notes',
          type: 'YOUTUBE',
          subjectId: theirSubject,
          chapterId: theirChapter,
          batchIds: [other.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(theirs, 201);

      const mine = await api<ResourceRow[]>('/resources', {
        token: tenant.adminToken,
      });
      expectStatus(mine, 200);
      expect(mine.body.map((r) => r.id)).not.toContain(theirs.body.id);
      expect(mine.body.map((r) => r.title)).not.toContain(
        'Their private notes',
      );

      // By id, by search, and by delete — every door, not just the list.
      expectStatus(
        await api(`/resources/${theirs.body.id}`, { token: tenant.adminToken }),
        404,
      );
      const searched = await api<ResourceRow[]>('/resources', {
        token: tenant.adminToken,
        query: { q: 'Their private notes' },
      });
      expectStatus(searched, 200);
      expect(searched.body).toEqual([]);
      expectStatus(
        await api(`/resources/${theirs.body.id}`, {
          method: 'DELETE',
          token: tenant.adminToken,
        }),
        404,
      );

      // And it is still there for the institute that owns it.
      expectStatus(
        await api(`/resources/${theirs.body.id}`, { token: other.adminToken }),
        200,
      );
    });

    it('refuses a batch from another institute', async () => {
      const other = await otherInstitute();
      const res = await api('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Cross-tenant share',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [other.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      });
      expectStatus(res, 400);
    });
  });

  /* ------------------------------------------------------------------ */

  describe('deleting', () => {
    it('stops students seeing it, and leaves the file in the library', async () => {
      const upload = await api<{ key: string }>('/media', {
        method: 'POST',
        token: tenant.adminToken,
        form: pdfUpload('temporary.pdf'),
      });
      expectStatus(upload, 201);

      const created = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.adminToken,
        body: {
          title: 'Withdrawn handout',
          type: 'FILE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId],
          mediaKey: upload.body.key,
        },
      });
      expectStatus(created, 201);

      expectStatus(
        await api(`/resources/${created.body.id}`, {
          method: 'DELETE',
          token: tenant.adminToken,
        }),
        200,
      );
      expectStatus(
        await api(`/resources/${created.body.id}`, { token: alphaStudent }),
        404,
      );

      // Media is shared infrastructure — the same key can back a question
      // diagram, so unsharing must not delete the bytes.
      const library = await api<{ items: { key: string }[] }>('/media', {
        token: tenant.adminToken,
      });
      expectStatus(library, 200);
      expect(library.body.items.map((m) => m.key)).toContain(upload.body.key);
    });

    it('does not let a student delete anything', async () => {
      const list = await api<ResourceRow[]>('/resources', {
        token: alphaStudent,
      });
      expectStatus(list, 200);
      expect(list.body.length).toBeGreaterThan(0);

      const res = await api(`/resources/${list.body[0].id}`, {
        method: 'DELETE',
        token: alphaStudent,
      });
      expectStatus(res, 403);
    });
  });
  /* ------------------------------------------------------------------ */

  /**
   * The whole journey, exactly as a person walks it (§64): a teacher shares,
   * and a student in that batch finds the material by NAVIGATING to it —
   * Resources > Physics > Kinematics — rather than by being handed an id.
   *
   * Worth doing as one flow even though the pieces are asserted above: the
   * failure this catches is a resource that exists, is visible to a direct
   * query, and yet never appears on the shelf the student actually opens,
   * because a count or a filter disagrees with the list.
   */
  describe('end to end: teacher shares, student finds it', () => {
    beforeAll(async () => {
      const res = await api(`/staff/${teacherUserId}/batches`, {
        method: 'PUT',
        token: tenant.adminToken,
        body: { batchIds: [tenant.batchId] },
      });
      expectStatus(res, 200);
    });

    /** Walks Subject > Chapter > Resource and returns what is on the shelf. */
    async function navigate(token: string, subject: string, chapter: string) {
      const subjects = await api<{ id: string; name: string }[]>(
        '/resources/subjects',
        { token },
      );
      expectStatus(subjects, 200);
      const foundSubject = subjects.body.find((x) => x.name === subject);
      expect(foundSubject).toBeDefined();

      const chapters = await api<{ id: string | null; name: string }[]>(
        `/resources/subjects/${foundSubject!.id}/chapters`,
        { token },
      );
      expectStatus(chapters, 200);
      const foundChapter = chapters.body.find((x) => x.name === chapter);
      expect(foundChapter).toBeDefined();

      const items = await api<ResourceRow[]>('/resources', {
        token,
        query: {
          subjectId: foundSubject!.id,
          chapterId: foundChapter!.id ?? undefined,
        },
      });
      expectStatus(items, 200);
      return items.body;
    }

    it('a PDF: uploaded, filed, then opened by the student', async () => {
      const upload = await api<{ key: string }>('/media', {
        method: 'POST',
        token: tenant.teacherToken,
        form: pdfUpload('projectile-problems.pdf'),
      });
      expectStatus(upload, 201);

      const shared = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Projectile problem set',
          type: 'FILE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId],
          mediaKey: upload.body.key,
        },
      });
      expectStatus(shared, 201);

      // The teacher sees it where they filed it.
      expect(
        (await navigate(tenant.teacherToken, 'Physics', 'Kinematics')).map(
          (r) => r.id,
        ),
      ).toContain(shared.body.id);

      // The student navigates to the same place and finds it.
      const onShelf = await navigate(alphaStudent, 'Physics', 'Kinematics');
      const row = onShelf.find((r) => r.id === shared.body.id);
      expect(row).toBeDefined();
      expect(row!.file?.fileName).toBe('projectile-problems.pdf');

      // And can actually open the bytes.
      expectStatus(
        await api(`/media/file/${encodeURIComponent(upload.body.key)}`, {
          token: alphaStudent,
        }),
        200,
      );

      // A student in another batch walking the same path does not find it.
      const otherShelf = await api<ResourceRow[]>('/resources', {
        token: betaStudent,
        query: { subjectId: physicsId, chapterId: kinematicsId },
      });
      expectStatus(otherShelf, 200);
      expect(otherShelf.body.map((r) => r.id)).not.toContain(shared.body.id);
    });

    it('a YouTube lecture: shared, then playable by the student', async () => {
      const shared = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Kinematics revision stream',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=ZyXwVuTsRqP&t=30s',
        },
      });
      expectStatus(shared, 201);

      const onShelf = await navigate(alphaStudent, 'Physics', 'Kinematics');
      const row = onShelf.find((r) => r.id === shared.body.id);
      expect(row).toBeDefined();
      // Everything the player needs, and nothing of what was typed: the
      // tracking parameter is gone and only the id survived.
      expect(row!.youtubeVideoId).toBe('ZyXwVuTsRqP');
      expect(row!.type).toBe('YOUTUBE');
      expect(row!.mediaKey).toBeNull();
    });
  });

  /* ------------------------------------------------------------------ */

  /**
   * The full cross-tenant matrix (§65) — both directions, every role.
   *
   * One-directional isolation tests pass just as happily when the filter is
   * accidentally "everything except the newest institute", so both sides are
   * asserted here.
   */
  describe('cross-tenant, both directions', () => {
    let other: TenantFixture;
    let theirTeacher: string;
    let theirStudent: string;
    let theirResourceId: string;
    let ourResourceId: string;

    beforeAll(async () => {
      other = await otherInstitute();
      theirStudent = await addStudent(other, 'Their Candidate', 'RESM');

      const me = await api<{ id: string }>('/auth/me', {
        token: other.teacherToken,
      });
      expectStatus(me, 200);
      expectStatus(
        await api(`/staff/${me.body.id}/batches`, {
          method: 'PUT',
          token: other.adminToken,
          body: { batchIds: [other.batchId] },
        }),
        200,
      );
      theirTeacher = other.teacherToken;

      const theirSubject = await ensureSubjectId(other, 'Physics');
      const theirChapter = await ensureChapterId(
        other,
        theirSubject,
        'Kinematics',
      );
      const theirs = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: theirTeacher,
        body: {
          title: 'Resource B',
          type: 'YOUTUBE',
          subjectId: theirSubject,
          chapterId: theirChapter,
          batchIds: [other.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=BbBbBbBbBbB',
        },
      });
      expectStatus(theirs, 201);
      theirResourceId = theirs.body.id;

      const ours = await api<ResourceRow>('/resources', {
        method: 'POST',
        token: tenant.teacherToken,
        body: {
          title: 'Resource A',
          type: 'YOUTUBE',
          subjectId: physicsId,
          chapterId: kinematicsId,
          batchIds: [tenant.batchId],
          youtubeUrl: 'https://www.youtube.com/watch?v=AaAaAaAaAaA',
        },
      });
      expectStatus(ours, 201);
      ourResourceId = ours.body.id;
    }, SETUP_TIMEOUT);

    it('each teacher sees their own institute and only that', async () => {
      const a = await api<ResourceRow[]>('/resources', {
        token: tenant.teacherToken,
      });
      expectStatus(a, 200);
      expect(a.body.map((r) => r.id)).toContain(ourResourceId);
      expect(a.body.map((r) => r.id)).not.toContain(theirResourceId);

      const b = await api<ResourceRow[]>('/resources', { token: theirTeacher });
      expectStatus(b, 200);
      expect(b.body.map((r) => r.id)).toContain(theirResourceId);
      expect(b.body.map((r) => r.id)).not.toContain(ourResourceId);
    });

    it('each student sees their own institute and only that', async () => {
      const a = await api<ResourceRow[]>('/resources', { token: alphaStudent });
      expectStatus(a, 200);
      expect(a.body.map((r) => r.id)).toContain(ourResourceId);
      expect(a.body.map((r) => r.id)).not.toContain(theirResourceId);

      const b = await api<ResourceRow[]>('/resources', { token: theirStudent });
      expectStatus(b, 200);
      expect(b.body.map((r) => r.id)).toContain(theirResourceId);
      expect(b.body.map((r) => r.id)).not.toContain(ourResourceId);
    });

    it('refuses direct access by id, in both directions and every role', async () => {
      const crossings: [string, string][] = [
        [tenant.teacherToken, theirResourceId],
        [alphaStudent, theirResourceId],
        [tenant.adminToken, theirResourceId],
        [theirTeacher, ourResourceId],
        [theirStudent, ourResourceId],
        [other.adminToken, ourResourceId],
      ];
      for (const [token, id] of crossings) {
        expectStatus(await api(`/resources/${id}`, { token }), 404);
      }
    });

    it('refuses to edit or delete across the boundary', async () => {
      expectStatus(
        await api(`/resources/${theirResourceId}`, {
          method: 'PATCH',
          token: tenant.teacherToken,
          body: { title: 'Renamed by an outsider' },
        }),
        404,
      );
      expectStatus(
        await api(`/resources/${theirResourceId}`, {
          method: 'DELETE',
          token: tenant.adminToken,
        }),
        404,
      );

      // Still intact for the institute that owns it.
      const check = await api<ResourceRow>(`/resources/${theirResourceId}`, {
        token: theirTeacher,
      });
      expectStatus(check, 200);
      expect(check.body.title).toBe('Resource B');
    });
  });
  /* ------------------------------------------------------------------ */

  describe('search', () => {
    it('escapes the hierarchy and matches titles', async () => {
      const res = await api<ResourceRow[]>('/resources', {
        token: alphaStudent,
        query: { q: 'projectile' },
      });
      expectStatus(res, 200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const row of res.body) {
        expect(
          `${row.title} ${row.subject.name} ${row.chapter?.name ?? ''}`.toLowerCase(),
        ).toContain('projectile');
      }
    });

    it('matches a chapter name, not only a title', async () => {
      const res = await api<ResourceRow[]>('/resources', {
        token: alphaStudent,
        query: { q: 'kinematics' },
      });
      expectStatus(res, 200);
      // Nothing shared here is TITLED "Kinematics …" alone, so a hit proves
      // the chapter name was searched.
      expect(res.body.length).toBeGreaterThan(0);
      expect(
        res.body.some((r) => !r.title.toLowerCase().includes('kinematics')),
      ).toBe(true);
    });

    it('narrows by type', async () => {
      const res = await api<ResourceRow[]>('/resources', {
        token: alphaStudent,
        query: { type: 'YOUTUBE' },
      });
      expectStatus(res, 200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const row of res.body) expect(row.type).toBe('YOUTUBE');
    });

    it('never reaches past the caller batch, however it is searched', async () => {
      const res = await api<ResourceRow[]>('/resources', {
        token: betaStudent,
        query: { q: 'projectile' },
      });
      expectStatus(res, 200);
      for (const row of res.body) {
        expect(row.batches.map((b) => b.id)).toContain(betaBatchId);
      }
    });
  });
});
