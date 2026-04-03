import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Bot, CheckCircle2, XCircle, ShieldAlert, Trash2, Sun, Moon, Monitor, FolderOpen, MapPin } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { tauriApi } from '../lib/tauri';
import { useSettings } from '../lib/SettingsContext';
import { Toggle } from '../components/Toggle';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';

function StatusMessage({ status }) {
  if (!status) return null;
  const isSuccess = status.ok === true || status === 'Valid Connection';
  const isError   = status.ok === false || status === 'Invalid Key' || status === 'Network Error';
  const text      = typeof status === 'string' ? status : status.msg;

  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-2 text-xs font-medium flex items-center gap-1.5 ${
        isSuccess ? 'text-accent-dark' : isError ? 'text-red-500' : 'text-ink-light'
      }`}
    >
      {isSuccess && <CheckCircle2 size={12} />}
      {isError   && <XCircle size={12} />}
      {text}
    </motion.p>
  );
}

export function Settings() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { settings, updateSettings, refreshSettings } = useSettings();

  // ── Smart Mode ──────────────────────────────────────────────────────────────
  const [smartMode, setSmartMode]       = useState(settings.smartModeEnabled);
  const [geminiKey, setGeminiKey]       = useState('');
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [savingKey, setSavingKey]       = useState(false);

  const geminiKeyIsSet = settings.geminiKeyIsSet;

  useEffect(() => {
    setSmartMode(settings.smartModeEnabled);
  }, [settings.smartModeEnabled]);

  // ── License ─────────────────────────────────────────────────────────────────
  const [licenseKey, setLicenseKey]       = useState('');
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [activating, setActivating]       = useState(false);

  // ── Organisation ────────────────────────────────────────────────────────────
  const [destinationMode, setDestinationMode] = useState(settings.destinationMode || 'alongside');
  const [destinationPath, setDestinationPath]  = useState(settings.destinationPath || '');

  useEffect(() => {
    setDestinationMode(settings.destinationMode || 'alongside');
    setDestinationPath(settings.destinationPath || '');
  }, [settings.destinationMode, settings.destinationPath]);

  // ── Ignore Rules ────────────────────────────────────────────────────────────
  const [ignoreRules, setIgnoreRules]   = useState([]);
  const [newRuleType, setNewRuleType]   = useState('extension');
  const [newRuleValue, setNewRuleValue] = useState('');

  useEffect(() => { loadIgnoreRules(); }, []);

  const loadIgnoreRules = async () => {
    const res = await tauriApi.getIgnoreRules();
    if (res.data) setIgnoreRules(res.data);
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleSmartMode = async () => {
    const next = !smartMode;
    setSmartMode(next);
    await updateSettings({ smartModeEnabled: next });
  };

  const testGemini = async () => {
    if (!geminiKey.trim()) return;
    setSavingKey(true);
    setGeminiStatus('Testing…');
    try {
      const res = await tauriApi.validateGeminiKey(geminiKey.trim());
      if (res.data?.is_valid) {
        setGeminiStatus('Valid Connection');
        await updateSettings({ smartModeEnabled: smartMode, smartApiKey: geminiKey.trim() });
        setGeminiKey('');
      } else {
        setGeminiStatus('Invalid Key');
      }
    } catch {
      setGeminiStatus('Network Error');
    }
    setSavingKey(false);
  };

  const activateLicense = async () => {
    const key = licenseKey.trim();
    if (!key) return;
    setActivating(true);
    setLicenseStatus(null);
    try {
      const res = await tauriApi.validateLicense(key);
      if (res.data?.is_valid) {
        setLicenseStatus({ ok: true, msg: `Activated — ${res.data.tier} tier` });
        await refreshSettings();
        setLicenseKey('');
      } else {
        setLicenseStatus({ ok: false, msg: res.data?.message ?? 'Invalid license key' });
      }
    } catch {
      setLicenseStatus({ ok: false, msg: 'Activation failed — check your connection' });
    }
    setActivating(false);
  };

  const handleDestinationMode = async (mode) => {
    setDestinationMode(mode);
    if (mode === 'alongside') {
      await updateSettings({ destinationMode: mode });
      return;
    }

    if (destinationPath.trim()) {
      await updateSettings({ destinationMode: mode, destinationPath: destinationPath.trim() });
      return;
    }

    toast.info('Destination required', 'Choose a destination folder before using this mode.');
  };

  const pickDestinationFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && !Array.isArray(selected)) {
        setDestinationPath(selected);
        await updateSettings({
          destinationMode,
          destinationPath: selected,
        });
      }
    } catch (e) {}
  };

  const handleAddRule = async () => {
    if (!newRuleValue.trim()) return;
    const { error } = await tauriApi.addIgnoreRule(newRuleType, newRuleValue.trim());
    if (error) { toast.error('Failed to add rule', error); return; }
    toast.success('Rule added', `Ignoring matches for ${newRuleValue.trim()}`);
    setNewRuleValue('');
    loadIgnoreRules();
  };

  const handleRemoveRule = async (id) => {
    const ok = await confirm({
      title: 'Remove Ignore Rule',
      message: 'This rule will be deleted. Previously ignored files matching this rule may be organised immediately.',
      confirmText: 'Remove Rule',
      variant: 'danger',
    });
    if (!ok) return;
    await tauriApi.removeIgnoreRule(id);
    loadIgnoreRules();
  };

  const DEST_OPTIONS = [
    { value: 'alongside',     label: 'Alongside source',    sub: 'Files sorted into subfolders next to the originals' },
    { value: 'single_folder', label: 'Single destination root',  sub: 'Keep category folders, but place them under one chosen location' },
    { value: 'custom',        label: 'Custom path',         sub: 'Choose any destination root manually' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="p-8 h-full flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-[1.75rem] font-display font-semibold text-ink-dark leading-none">Settings</h2>
        <p className="text-sm text-ink-light mt-1">Configure how urordo works for you.</p>
      </div>

      <div className="max-w-lg space-y-5 pb-12">

        {/* ── 1. Appearance ─────────────────────────────────────────────────── */}
        <section className="p-6 bg-paper-50 border border-paper-200 rounded-2xl shadow-warm-sm">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-paper-200/60 flex items-center justify-center">
              <Sun size={16} className="text-ink-light" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-semibold text-ink-dark text-sm">Appearance</h3>
              <p className="text-xs text-ink-light">Choose your preferred theme</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 p-1 bg-paper-100 border border-paper-200 rounded-xl shadow-inset-sm">
            {[
              { id: 'system', label: 'System', icon: <Monitor size={14} /> },
              { id: 'light',  label: 'Light',  icon: <Sun size={14} /> },
              { id: 'dark',   label: 'Dark',   icon: <Moon size={14} /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => updateSettings({ theme: t.id })}
                className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-all ${
                  (settings.theme || 'system') === t.id
                    ? 'bg-paper shadow-sm border border-paper-200 text-ink scale-[1.02]'
                    : 'text-ink-light hover:text-ink hover:bg-paper/50 grayscale'
                }`}
              >
                {t.icon}
                <span className="text-[10px] font-semibold uppercase tracking-wider">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── 2. Organisation ───────────────────────────────────────────────── */}
        <section className="p-6 bg-paper-50 border border-paper-200 rounded-2xl shadow-warm-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-paper-200/60 flex items-center justify-center">
              <MapPin size={16} className="text-ink-light" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-semibold text-ink-dark text-sm">Organisation</h3>
              <p className="text-xs text-ink-light">Control where organised files land</p>
            </div>
          </div>

          <p className="text-xs text-ink-light leading-relaxed mb-4">
            Choose where urordo places files after organising.
          </p>

          <div className="space-y-2">
            {DEST_OPTIONS.map(opt => {
              const isActive = destinationMode === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleDestinationMode(opt.value)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${
                    isActive
                      ? 'border-accent/50 bg-accent-light/20 text-ink-dark'
                      : 'border-paper-200 hover:bg-paper-100/60 text-ink'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 mt-0.5 rounded-full border-2 shrink-0 transition-colors ${
                    isActive ? 'border-accent bg-accent' : 'border-paper-300'
                  }`} />
                  <div>
                    <span className="block text-sm font-medium leading-snug">{opt.label}</span>
                    <span className="block text-xs text-ink-light mt-0.5">{opt.sub}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {destinationMode !== 'alongside' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-paper-200">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider block mb-2">
                    Destination Folder
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-paper-100 border border-paper-200 rounded-xl px-4 py-2.5 shadow-inset-sm min-w-0">
                      <FolderOpen size={14} className="text-ink-light shrink-0" strokeWidth={1.5} />
                      <span className={`flex-1 text-xs font-mono truncate ${destinationPath ? 'text-ink' : 'text-ink-light/50'}`}>
                        {destinationPath || 'No folder selected…'}
                      </span>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={pickDestinationFolder}
                      className="px-5 py-2.5 bg-paper-100 border border-paper-200 text-ink rounded-xl text-sm font-medium hover:bg-paper-200/60 hover:border-paper-300 transition-all shadow-warm-sm whitespace-nowrap"
                    >
                      Browse
                    </motion.button>
                  </div>
                  {!destinationPath && (
                    <p className="mt-2 text-2xs text-amber-600 font-medium">
                      ⚠ Select a destination folder to use this mode.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── 3. Intelligence ───────────────────────────────────────────────── */}
        <section className="p-6 bg-paper-50 border border-paper-200 rounded-2xl shadow-warm-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-light/40 flex items-center justify-center">
                <Bot size={16} className="text-accent" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-semibold text-ink-dark text-sm">Intelligence</h3>
                <p className="text-xs text-ink-light">AI-powered semantic classification</p>
              </div>
            </div>
            <Toggle enabled={smartMode} onToggle={toggleSmartMode} />
          </div>

          <p className="text-xs text-ink-light leading-relaxed mb-4">
            When enabled, filenames are sent to Google Gemini when built-in rules are ambiguous.
            Requires a free API key from Google AI Studio.
          </p>

          <AnimatePresence>
            {smartMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t border-paper-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink uppercase tracking-wider">Gemini API Key</label>
                    {geminiKeyIsSet && (
                      <span className="flex items-center gap-1 text-2xs font-mono text-accent-dark">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-dark inline-block" />
                        Key configured
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={e => { setGeminiKey(e.target.value); setGeminiStatus(null); }}
                      placeholder={geminiKeyIsSet ? 'Enter new key to replace…' : 'AIzaSyA…'}
                      className="flex-1 bg-paper-100 border border-paper-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent font-mono text-xs shadow-inset-sm transition-colors placeholder:text-ink-light/50"
                    />
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={testGemini}
                      disabled={savingKey || !geminiKey.trim()}
                      className="px-5 py-2 bg-ink-dark text-paper-25 font-medium rounded-xl hover:bg-ink transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-warm-sm"
                    >
                      {savingKey ? 'Wait…' : 'Validate'}
                    </motion.button>
                  </div>

                  <AnimatePresence>
                    {geminiStatus && <StatusMessage status={geminiStatus} />}
                  </AnimatePresence>

                  <p className="text-2xs text-amber-600 font-medium">
                    ⚠ Filenames leave your device when Intelligence is on.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── 4. Ignore Rules ───────────────────────────────────────────────── */}
        <section className="p-6 bg-paper-50 border border-paper-200 rounded-2xl shadow-warm-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-paper-200/60 flex items-center justify-center">
              <ShieldAlert size={16} className="text-ink-light" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-semibold text-ink-dark text-sm">Ignore Rules</h3>
              <p className="text-xs text-ink-light">Protect files from being organised</p>
            </div>
          </div>

          <p className="text-xs text-ink-light leading-relaxed mb-4">
            Files matching these rules will be completely ignored by the scanner, AI, and watcher engines.
          </p>

          <div className="flex gap-2 mb-4">
            <select
              value={newRuleType}
              onChange={e => setNewRuleType(e.target.value)}
              className="bg-paper-100 border border-paper-200 rounded-xl px-2 py-2.5 focus:outline-none focus:border-accent text-xs transition-colors"
            >
              <option value="extension">Extension</option>
              <option value="folder">Folder Name</option>
              <option value="keyword">Filename Keyword</option>
            </select>
            <input
              type="text"
              value={newRuleValue}
              onChange={e => setNewRuleValue(e.target.value)}
              placeholder="e.g. .git, node_modules, temp..."
              className="flex-1 bg-paper-100 border border-paper-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent font-mono text-xs shadow-inset-sm transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleAddRule()}
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleAddRule}
              disabled={!newRuleValue.trim()}
              className="px-5 py-2 bg-ink-dark text-paper-25 font-medium rounded-xl hover:bg-ink transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-warm-sm"
            >
              Add
            </motion.button>
          </div>

          {ignoreRules.length > 0 ? (
            <div className="space-y-2 mt-4 max-h-48 overflow-y-auto pr-1">
              {ignoreRules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between p-2.5 bg-paper rounded-lg border border-paper-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-ink-light/70 bg-paper-200 px-1.5 py-0.5 rounded">
                      {rule.rule_type}
                    </span>
                    <span className="text-xs font-mono font-medium text-ink">{rule.value}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveRule(rule.id)}
                    className="p-1 text-ink-light hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-paper border border-paper-200 rounded-xl border-dashed">
              <p className="text-xs text-ink-light">No ignore rules set.</p>
            </div>
          )}
        </section>

        {/* ── 5. License & Access ───────────────────────────────────────────── */}
        <section className="p-6 bg-paper-50 border border-paper-200 rounded-2xl shadow-warm-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-paper-200/60 flex items-center justify-center">
              <Key size={16} className="text-ink-light" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-semibold text-ink-dark text-sm">License &amp; Access</h3>
              <p className="text-xs text-ink-light">Lift the 500 file-per-scan limit</p>
            </div>
          </div>

          <p className="text-xs text-ink-light leading-relaxed mb-4">
            Your key is validated locally using a cryptographic signature — no internet required.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={licenseKey}
              onChange={e => setLicenseKey(e.target.value)}
              placeholder="pro:never:your-key-here"
              className="flex-1 bg-paper-100 border border-paper-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent font-mono text-xs uppercase shadow-inset-sm transition-colors placeholder:normal-case placeholder:text-ink-light/50"
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={activateLicense}
              disabled={activating || !licenseKey.trim()}
              className="px-5 py-2 bg-ink-dark text-paper-25 font-medium rounded-xl hover:bg-ink transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-warm-sm"
            >
              {activating ? 'Checking…' : 'Activate'}
            </motion.button>
          </div>

          <AnimatePresence>
            {licenseStatus && <StatusMessage status={licenseStatus} />}
          </AnimatePresence>
        </section>

        {/* ── 6. Danger Zone ────────────────────────────────────────────────── */}
        <section className="p-6 bg-red-50/50 border border-red-200/60 rounded-2xl shadow-warm-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-red-700 text-sm">Danger Zone</h3>
              <p className="text-xs text-red-600/70">Irreversible, destructive actions</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={async () => {
              const ok = await confirm({
                title: 'Factory Reset',
                message: 'This will irreversibly delete all your settings, AI API keys, ignore rules, and history logs. The app will close immediately. Are you absolutely sure?',
                confirmText: 'Yes, Wipe Everything',
                variant: 'danger',
              });
              if (ok) {
                await tauriApi.factoryReset();
              }
            }}
            className="w-full py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors text-sm shadow-warm-sm flex justify-center items-center gap-2"
          >
            <Trash2 size={16} /> Factory Reset (Wipe All Data)
          </motion.button>
        </section>

      </div>
    </motion.div>
  );
}
