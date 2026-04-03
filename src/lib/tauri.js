import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Executes a Tauri command and returns a standardized response shape.
 * @template T
 * @param {string} cmd
 * @param {Object} [args={}]
 * @returns {Promise<{data: T | null, error: string | null}>}
 */
const safeInvoke = async (cmd, args = {}) => {
  try {
    const data = await invoke(cmd, args);
    return { data, error: null };
  } catch (err) {
    console.error(`Tauri CMD Error (${cmd}):`, err);
    return { data: null, error: typeof err === 'string' ? err : err.message || JSON.stringify(err) };
  }
};

export const tauriApi = {
  // ── Scanner ────────────────────────────────────────────────────────────────
  /**
   * Scans a directory and returns files with diagnostic counters.
   * @returns {Promise<{data: {path: string, files: any[], root_boundary: string, enumerated_count: number, skipped_count: number, inaccessible_count: number, truncated: boolean} | null, error: string | null}>}
   */
  scanDirectory: (path) => safeInvoke('scan_directory', { path }),

  // ── Classifier ────────────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').Classification[] | null, error: string | null}>} */
  classifyBatch: (files, rootPath = null) => safeInvoke('classify_batch', { files, root_path: rootPath }),

  /** Records a user correction for the Layer 4 local model. */
  addCorrection: (path, correctBucket) =>
    safeInvoke('add_correction', { path, correct_bucket: correctBucket }),

  // ── Organizer ─────────────────────────────────────────────────────────────
  /**
   * Resolves bucket assignments into validated MoveActions on the backend.
   * @param {import('./contracts').PlanItem[]} items
   * @param {string} rootPath
   * @param {string|null} [destinationOverride]
   * @returns {Promise<{data: import('./contracts').BuildPlanResult | null, error: string | null}>}
   */
  buildPlan: (items, rootPath, destinationOverride = null) =>
    safeInvoke('build_plan_cmd', { items, rootPath, destinationOverride }),

  /** @returns {Promise<{data: import('./contracts').OpSummary | null, error: string | null}>} */
  applyPlan: (actions) => safeInvoke('apply_plan_cmd', { actions }),

  /**
   * Phase 5 alias: execute_moves maps to apply_plan.
   * Accepts items + sessionId; sessionId is used as operation_id hint.
   */
  executeMoves: (items, sessionId) =>
    safeInvoke('execute_moves', { items, session_id: sessionId }),

  // ── Rollback ──────────────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').RollbackResult | null, error: string | null}>} */
  rollbackMoves: (operationIds = null, itemIds = null) =>
    safeInvoke('rollback_moves_cmd', {
      operation_id: operationIds,
      item_ids: itemIds,
    }),

  /** Phase 5 alias: rollback_session by sessionId string. */
  rollbackSession: (sessionId) =>
    safeInvoke('rollback_session', { session_id: sessionId }),

  // ── Settings ──────────────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').SettingsPayload | null, error: string | null}>} */
  getSettings: () => safeInvoke('get_settings_cmd'),

  /** @returns {Promise<{data: import('./contracts').SettingsPayload | null, error: string | null}>} */
  updateSettings: (patch) => safeInvoke('update_settings_cmd', { patch }),

  /** Phase 5 alias: save_settings maps to update_settings. */
  saveSettings: (settings) => safeInvoke('save_settings', { settings }),

  /** @returns {Promise<{data: import('./contracts').CommonPaths | null, error: string | null}>} */
  getCommonPaths: () => safeInvoke('get_common_paths_cmd'),

  /** Irreversibly wipes app data and closes the app. */
  factoryReset: () => safeInvoke('factory_reset_cmd'),

  // ── History & Move Log ────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').HistoryResult | null, error: string | null}>} */
  listHistory: (page, perPage) => safeInvoke('list_history_cmd', { page, perPage }),

  /** Returns recent move_log entries (Phase 5 wiring). */
  getMoveLog: (limit = 50) => safeInvoke('get_move_log', { limit }),

  // ── License ───────────────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').AuthResult | null, error: string | null}>} */
  validateLicense: (key) => safeInvoke('validate_license_cmd', { key }),

  // ── Gemini ────────────────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').ValidateKeyResult | null, error: string | null}>} */
  validateGeminiKey: (key) => safeInvoke('validate_gemini_key_cmd', { key }),

  // ── Ignore Rules ──────────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').IgnoreRule[] | null, error: string | null}>} */
  getIgnoreRules: () => safeInvoke('get_ignore_rules_cmd'),
  addIgnoreRule: (ruleType, value) => safeInvoke('add_ignore_rule_cmd', { ruleType, value }),
  removeIgnoreRule: (id) => safeInvoke('remove_ignore_rule_cmd', { id }),

  // ── Watchers ──────────────────────────────────────────────────────────────
  /** @returns {Promise<{data: import('./contracts').WatchedFolder[] | null, error: string | null}>} */
  getWatchedFolders: () => safeInvoke('get_watched_folders_cmd'),
  getWatcherStatus: () => safeInvoke('get_watcher_status_cmd'),
  refreshWatcherStatus: () => safeInvoke('refresh_watcher_status_cmd'),

  /** @returns {Promise<{data: import('./contracts').WatchedFolder | null, error: string | null}>} */
  addWatchedFolder: (path, autoOrganise) =>
    safeInvoke('add_watched_folder_cmd', { path, autoOrganise }),
  removeWatchedFolder: (id) => safeInvoke('remove_watched_folder_cmd', { id }),
  toggleWatcher: (id, isActive) => safeInvoke('toggle_watcher_cmd', { id, isActive }),
  updateWatcherSettings: (id, autoOrganise, autoOrganiseMode) =>
    safeInvoke('update_watcher_settings_cmd', { id, autoOrganise, autoOrganiseMode }),

  /** @returns {Promise<{data: import('./contracts').PendingFile[] | null, error: string | null}>} */
  getPendingFiles: () => safeInvoke('get_pending_files_cmd'),
  resolvePendingFiles: (paths) => safeInvoke('resolve_pending_files_cmd', { paths }),

  // ── Events ────────────────────────────────────────────────────────────────
  /** @param {(payload: import('./contracts').ScanProgress) => void} callback */
  onScanProgress: (callback) => listen('scan-progress', event => callback(event.payload)),

  /** @param {(payload: import('./contracts').ApplyProgress) => void} callback */
  onApplyProgress: (callback) => listen('apply-progress', event => callback(event.payload)),

  /** @param {(payload: import('./contracts').WatcherEvent) => void} callback */
  onWatcherEvent: (callback) => listen('watcher-event', event => callback(event.payload)),

  /** @param {(payload: import('./contracts').WatcherStatus) => void} callback */
  onWatchersStateChanged: (callback) =>
    listen('watchers-state-changed', event => callback(event.payload)),
};
