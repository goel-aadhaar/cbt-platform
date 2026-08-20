/**
 * Instruction template client (§ exam authoring) — mirrors
 * `apps/api/src/modules/instruction-templates`.
 *
 * Administrators curate the catalogue; teachers read it while authoring and
 * copy one into an exam's `instructions` — there is no live link back to the
 * template afterwards.
 */

import { apiFetch } from "./api";
import { getToken } from "./auth";

export interface InstructionTemplate {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

const auth = () => ({ token: getToken() ?? undefined });

export function listInstructionTemplates(
  activeOnly = false,
): Promise<{ items: InstructionTemplate[]; total: number }> {
  return apiFetch(
    `/instruction-templates${activeOnly ? "?activeOnly=true" : ""}`,
    auth(),
  );
}

export function createInstructionTemplate(body: {
  name: string;
  content: string;
}): Promise<InstructionTemplate> {
  return apiFetch("/instruction-templates", {
    method: "POST",
    body,
    ...auth(),
  });
}

export function updateInstructionTemplate(
  id: string,
  body: { name?: string; content?: string; isActive?: boolean },
): Promise<InstructionTemplate> {
  return apiFetch(`/instruction-templates/${id}`, {
    method: "PATCH",
    body,
    ...auth(),
  });
}

/** Archives the template (isActive: false) — never a hard delete, see the API. */
export function archiveInstructionTemplate(
  id: string,
): Promise<InstructionTemplate> {
  return apiFetch(`/instruction-templates/${id}`, {
    method: "DELETE",
    ...auth(),
  });
}
