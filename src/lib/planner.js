/**
 * @file planner.js
 * Frontend Utility Layer — Phases 3 & 4
 *
 * What this module owns:
 *  - `humanizeError`  — user-facing error message normalisation
 *  - `getFileName`    — display-only filename extraction
 *
 * What this module NO LONGER owns (moved to backend in Phase 4):
 *  - `detectSeparator`      → removed (OS path logic belongs in Rust)
 *  - `buildDestinationPath` → removed (PathBuf in build_plan_cmd)
 *  - `buildMoveActions`     → removed (tauriApi.buildPlan() in Review.jsx)
 *
 * The backend `build_plan_cmd` now owns:
 *  - OS-correct destination path construction via PathBuf
 *  - Ignore rule enforcement against active DB rules
 *  - Validation that all source paths are actionable
 */

/**
 * Extracts the final filename component from a full path.
 * Display-only — for path resolution, use the backend `build_plan_cmd`.
 * Works for both Windows and POSIX paths.
 * @param {string} path
 * @returns {string}
 */
export function getFileName(path) {
  if (!path) return '—';
  return path.split(/[/\\]/).pop() || path;
}

/**
 * Returns a human-readable error string from Tauri error values.
 * Centralised so all screens use consistent error messaging.
 * @param {string | Error | null | undefined} err
 * @returns {string}
 */
export function humanizeError(err) {
  if (!err) return 'An unknown error occurred.';
  const s = typeof err === 'string' ? err : err.toString();
  if (s.includes('NotFound') || s.includes('not found')) return 'Folder not found or inaccessible.';
  if (s.includes('PermissionDenied') || s.includes('Access is denied')) return 'Permission denied accessing folder.';
  if (s.includes('RateLimit') || s.includes('429')) return 'API rate limit exceeded. Check your plan.';
  if (s.includes('Timeout') || s.includes('timed out')) return 'Connection timed out. Check your network.';
  if (s.includes('unauthorized') || s.includes('API_KEY_INVALID') || s.includes('API key')) return 'Invalid Gemini API Key. Please check your Settings.';
  return s;
}

