"use client";

import { useSyncExternalStore } from "react";

import {
  getQuestionTaxonomyCatalogueSnapshot,
  subscribeQuestionTaxonomyCatalogue,
  type QuestionTaxonomyCatalogue,
} from "@/lib/admin";

/**
 * The active subjects + exam categories the Question Bank's filter bar and
 * author drawer both need, shared instead of each fetching its own copy
 * (§ duplicate-fetch fix). `null` until the first subscriber's fetch
 * resolves.
 */
export function useQuestionTaxonomyCatalogue(): QuestionTaxonomyCatalogue | null {
  return useSyncExternalStore(
    subscribeQuestionTaxonomyCatalogue,
    getQuestionTaxonomyCatalogueSnapshot,
    () => null,
  );
}
