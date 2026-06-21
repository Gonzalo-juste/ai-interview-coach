import { shouldEndSession } from "./categories";
import type { Turn } from "./transcript";

export type SessionStatus =
  | "pending"
  | "active"
  | "finalizing"  // last main-interview question asked; next answer starts the wrap-up
  | "wrap_0"      // wrap-up prompt given ("any questions?"); 0 exchanges answered
  | "wrap_1"      // 1 exchange answered; model must close after the next
  | "completed";

/**
 * What the turn route should do for the current candidate answer.
 *
 * "normal"               Regular interview turn. No status change.
 * "generateFinalQ"       shouldEndSession just became true. Generate the last
 *                        main-interview question; set status → "finalizing".
 * "generateWrapUpPrompt" Candidate answered the last main question. Generate
 *                        the "any other questions before we wrap?" prompt;
 *                        set status → "wrap_0".
 * "wrapUpContinue"       0 exchanges done. Model may answer Q1 (→ wrap_1) OR
 *                        call end_interview if candidate declines (→ completed).
 * "wrapUpForceClose"     1 exchange done; this is the last. Model MUST call
 *                        end_interview after answering Q2 (→ completed).
 */
export type TurnKind =
  | "normal"
  | "generateFinalQ"
  | "generateWrapUpPrompt"
  | "wrapUpContinue"
  | "wrapUpForceClose";

/**
 * Invariant: the candidate's turn is always appended and read back BEFORE this
 * function is called, so any transition that leads to sessionEnded:true is only
 * reached after the candidate's answer is already durable in the database.
 */
export function computeTurnKind(
  currentStatus: SessionStatus,
  turns: Turn[]
): TurnKind {
  switch (currentStatus) {
    case "finalizing":
      return "generateWrapUpPrompt";
    case "wrap_0":
      return "wrapUpContinue";
    case "wrap_1":
      return "wrapUpForceClose";
    case "active":
      return shouldEndSession(turns) ? "generateFinalQ" : "normal";
    default:
      return "normal";
  }
}
