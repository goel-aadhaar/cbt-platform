/** A subject as resource and DPP payloads carry it: the class is name-only. */
export interface SubjectRef {
  id: string;
  name: string;
  class?: { id: string; name: string } | null;
}

/**
 * Builds a labeller over the subjects visible in one list. The class is added
 * only when two different subjects in that list share a name ("Physics ·
 * Class 11"); everything else keeps the plain name.
 */
export function subjectNamer(
  visible: readonly (SubjectRef | null | undefined)[],
): (s: SubjectRef | null | undefined) => string | undefined {
  const idsByName = new Map<string, Set<string>>();
  for (const s of visible) {
    if (!s) continue;
    const ids = idsByName.get(s.name) ?? new Set<string>();
    ids.add(s.id);
    idsByName.set(s.name, ids);
  }
  return (s) => {
    if (!s) return undefined;
    const clash = (idsByName.get(s.name)?.size ?? 0) > 1;
    return clash && s.class ? `${s.name} · ${s.class.name}` : s.name;
  };
}
