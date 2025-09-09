// services/csoConstants.ts

// --- Fitness Penalties (Lower is better) ---
// This file provides a single source of truth for fitness penalties
// used by both the main CSO service and its web worker.

// High-priority "Hard" Violations
export const CONFLICT_PENALTY = 6000;
export const CREDENTIAL_MISMATCH_PENALTY = 1800;
export const CALLOUT_OVERLAP_PENALTY = 2200;
export const CLIENT_COVERAGE_GAP_PENALTY = 3000;
export const MISSING_LUNCH_PENALTY = 7000;
export const SESSION_DURATION_PENALTY = 5500;
export const MD_MEDICAID_LIMIT_PENALTY = 900;
export const BCBA_DIRECT_TIME_PENALTY = 500;

// Lower-priority "Soft" Violations
export const UNMET_AH_NEED_PENALTY = 150;
export const BASE_SCHEDULE_DEVIATION_PENALTY = 50;
export const TEAM_ALIGNMENT_PENALTY = 10;
export const MAX_NOTES_PENALTY = 1000;
export const LUNCH_OUTSIDE_WINDOW_PENALTY = 5;
