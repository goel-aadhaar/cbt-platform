"use client";

import { useSyncExternalStore } from "react";

import { getUserSnapshot, subscribeSession } from "@/lib/auth";

function partOfDay(): "Morning" | "Afternoon" | "Evening" {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

/** "Good <part-of-day>, <first name> 👋" using the signed-in student. */
export function Greeting() {
  const user = useSyncExternalStore(
    subscribeSession,
    getUserSnapshot,
    () => null,
  );
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <h1 className="text-[32px] font-bold leading-tight tracking-[-0.72px] text-admin-ink">
      Good {partOfDay()}, <span className="text-admin">{firstName}</span> 👋
    </h1>
  );
}
