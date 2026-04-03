/**
 * @file SettingsContext.jsx
 * Phase 3 — Backend-Authoritative Settings System
 *
 * This context is the single source of truth for settings state in the
 * frontend. All screens consume settings through `useSettings()` — no
 * prop drilling, no scattered `?? false` fallbacks.
 *
 * Responsibilities:
 *  - Bootstrap settings from the backend on mount (single fetch)
 *  - Expose typed, guaranteed-default settings via the context value
 *  - Provide `updateSettings(patch)` with optimistic UI + backend settlement
 *  - Provide `refreshSettings()` for explicit reloads (e.g. post-license activation)
 *  - Never expose raw secrets or computed backend values beyond what the
 *    backend already guards in AppSettings
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { tauriApi } from './tauri';

// ── Default settings object ────────────────────────────────────────────────
// Mirrors AppSettings defaults from the Rust backend.
// Used as the initial UI state before the first backend response arrives.
// This prevents any undefined-field errors during the loading transition.
const DEFAULT_SETTINGS = {
  onboardingComplete: false,
  hasSeenWelcome: false,
  smartModeEnabled: false,
  destinationMode: 'alongside',
  destinationPath: '',
  // Computed — always false until backend responds
  geminiKeyIsSet: false,
  geminiKeyMasked: '',
  isLicensed: false,
  licenseTier: null,
};

// ── Context ────────────────────────────────────────────────────────────────
const SettingsContext = createContext(null);

// ── Provider ───────────────────────────────────────────────────────────────
/**
 * Wraps the app (or a subtree) with settings state.
 * Place this as high as possible in the tree — just below the error boundary.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    tauriApi.getSettings().then(({ data, error }) => {
      if (data?.settings) {
        setSettings(data.settings);
      }
      if (error) {
        console.error('[SettingsContext] Failed to load settings:', error);
      }
      setLoading(false);
    });
  }, []);

  // ── Optimistic update with backend settlement ──────────────────────────────
  /**
   * Updates settings both optimistically in the UI and persistently in the backend.
   *
   * The optimistic update ensures immediate UI responsiveness (toggle switches
   * feel instant). The backend response is the authoritative final state —
   * any computed fields (isLicensed, geminiKeyIsSet) in the response will
   * overwrite the optimistic values.
   *
   * @param {Partial<import('./contracts').AppSettings>} patch
   * @returns {Promise<import('./contracts').AppSettings | null>} The authoritative settings after update
   */
  const updateSettings = useCallback(async (patch) => {
    // Optimistic: reflect the patch immediately in the UI
    setSettings(prev => ({ ...prev, ...patch }));

    // Authoritative: settle with backend response
    const { data, error } = await tauriApi.updateSettings(patch);
    if (error) {
      console.error('[SettingsContext] Failed to save settings:', error);
      // On error, re-fetch to restore authoritative state
      const fallback = await tauriApi.getSettings();
      if (fallback.data?.settings) setSettings(fallback.data.settings);
      return null;
    }
    if (data?.settings) {
      // Backend response is canonical — replaces the optimistic values
      setSettings(data.settings);
      return data.settings;
    }
    return null;
  }, []);

  // ── Explicit refresh ───────────────────────────────────────────────────────
  /**
   * Forces a full re-fetch from the backend.
   * Use after operations that change computed fields (license activation,
   * API key save/delete) to ensure the UI reflects the new backend state.
   */
  const refreshSettings = useCallback(async () => {
    const { data, error } = await tauriApi.getSettings();
    if (data?.settings) {
      setSettings(data.settings);
    }
    if (error) {
      console.error('[SettingsContext] Failed to refresh settings:', error);
    }
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────
  const value = useMemo(
    () => ({ settings, loading, updateSettings, refreshSettings }),
    [settings, loading, updateSettings, refreshSettings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────
/**
 * Returns the settings context value.
 * Must be used within a `<SettingsProvider>`.
 *
 * @returns {{
 *   settings: import('./contracts').AppSettings,
 *   loading: boolean,
 *   updateSettings: (patch: Partial<import('./contracts').AppSettings>) => Promise<import('./contracts').AppSettings | null>,
 *   refreshSettings: () => Promise<void>,
 * }}
 */
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('[useSettings] Must be called within a <SettingsProvider>.');
  }
  return ctx;
}
