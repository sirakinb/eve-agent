import { defineState } from "eve/context";
import { getTenantId } from "./tenant";

export interface OpenLoop {
  id: string;
  item: string;
  owner: "aki" | "pentridge" | "agent";
  status: "open" | "waiting" | "done";
}

export interface Decision {
  id: string;
  decision: string;
  rationale: string;
  decidedAt: string;
}

export interface WorkingMemory {
  currentFocus: string | null;
  facts: Record<string, string>;
  preferences: Record<string, string>;
  openLoops: OpenLoop[];
  decisions: Decision[];
}

export const workingMemory = defineState<WorkingMemory>(
  `${getTenantId()}.working-memory`,
  () => ({
    currentFocus: null,
    facts: {},
    preferences: {},
    openLoops: [],
    decisions: [],
  }),
);

export function formatWorkingMemory(memory: WorkingMemory): string {
  const open = memory.openLoops.filter((loop) => loop.status !== "done");
  return JSON.stringify(
    {
      currentFocus: memory.currentFocus,
      facts: memory.facts,
      preferences: memory.preferences,
      openLoops: open.slice(-20),
      decisions: memory.decisions.slice(-20),
    },
    null,
    2,
  );
}
