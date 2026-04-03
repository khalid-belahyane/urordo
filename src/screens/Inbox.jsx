import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, ArrowRight, Loader2, AlertCircle, FolderSearch, Clock } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { tauriApi } from '../lib/tauri';
import { humanizeError } from '../lib/planner';
import { useSettings } from '../lib/SettingsContext';
import { Review } from './Review';
import { useToast } from '../components/ToastContext';

export function Inbox({ onNavigate, initialPath = '', onPathUsed }) {
  const toast = useToast();
  const { settings } = useSettings();
  const [path, setPath]                   = useState(initialPath);
  const [step, setStep]                   = useState('input');
  const [progress, setProgress]           = useState({ scanned: 0 });
  const [classifications, setClassifications] = useState([]);
  const [pendingFiles, setPendingFiles]   = useState([]);
  const [reviewRootDisplay, setReviewRootDisplay] = useState('');
  const [reviewPendingPaths, setReviewPendingPaths] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [scanDiagnostics, setScanDiagnostics] = useState(null);

  const isLicensed = settings.isLicensed === true;

  // Check for files pending review from the background watcher
  useEffect(() => {
    let unlisten = null;

    tauriApi.getPendingFiles().then(res => {
      if (res.data && res.data.length > 0) setPendingFiles(res.data);
    });

    tauriApi.listHistory(1, 3).then(res => {
      if (res.data?.items?.length > 0) setRecentActivity(res.data.items);
    });

    const listenPromise = tauriApi.onWatcherEvent(() => {
      tauriApi.getPendingFiles().then(res => {
        if (res.data) setPendingFiles(res.data);
      });
    });

    return () => {
      listenPromise.then(unlisten => { if(unlisten) unlisten(); });
    };
  }, []);

  // Consume the folder path passed from the onboarding flow
  useEffect(() => {
    if (initialPath) { setPath(initialPath); onPathUsed?.(); }
  }, [initialPath]); // eslint-disable-line

  const pickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && !Array.isArray(selected)) setPath(selected);
    } catch (e) {}
  };

  const handleScan = async () => {
    if (!path.trim()) return;
    setStep('scanning');
    setProgress({ scanned: 0 });
    setScanDiagnostics(null);

    let unlisten;
    try { unlisten = await tauriApi.onScanProgress(setProgress); } catch (e) {}

    const { data: result, error: scanErr } = await tauriApi.scanDirectory(path);
    if (unlisten) unlisten();

    if (scanErr || !result) {
      setStep('input');
      toast.error('Scan Failed', humanizeError(scanErr ?? 'Failed to scan the selected folder.'));
      return;
    }
    const diagnostics = {
      visible: result.files.length ?? 0,
      enumerated: result.enumerated_count ?? 0,
      skipped: result.skipped_count ?? 0,
      inaccessible: result.inaccessible_count ?? 0,
      truncated: result.truncated === true,
      rootBoundary: result.root_boundary ?? 'loose_file',
    };
    setScanDiagnostics(diagnostics);

    if (diagnostics.visible === 0) {
      setStep('input');
      if (diagnostics.rootBoundary === 'project_root' || diagnostics.rootBoundary === 'inside_project_tree') {
        toast.info(
          'Project folder protected',
          'urordo found a project boundary here and skipped its contents instead of reorganising them.'
        );
      } else if (diagnostics.enumerated === 0) {
        toast.info('Folder is empty', 'There are no items to organise in this folder.');
      } else {
        toast.info(
          'Nothing actionable found',
          'This folder contains only protected, ignored, hidden, or inaccessible items right now.'
        );
      }
      return;
    }

    setStep('classifying');
    const files = result.files.map(f => f.path);
    const { data: classRes, error: classErr } = await tauriApi.classifyBatch(files, path);

    if (classErr || !classRes) {
      setStep('input');
      toast.error('Classification Failed', humanizeError(classErr ?? 'Failed to classify files.'));
      return;
    }

    setReviewPendingPaths([]);
    setClassifications(classRes);
    setReviewRootDisplay(path);
    setStep('review');
  };

  const handleReviewSettled = async () => {
    const { data } = await tauriApi.getPendingFiles();
    if (data) setPendingFiles(data);
  };

  const noActionableScan =
    step === 'input' && scanDiagnostics && scanDiagnostics.visible === 0;
  const protectedProjectScan =
    scanDiagnostics?.rootBoundary === 'project_root' ||
    scanDiagnostics?.rootBoundary === 'inside_project_tree';
  const scanSummaryTitle = noActionableScan
    ? protectedProjectScan
      ? 'Project contents were protected'
      : scanDiagnostics?.enumerated === 0
        ? 'This folder is empty'
        : 'Nothing actionable was found'
    : 'Scan summary';
  const scanSummaryMessage = noActionableScan
    ? protectedProjectScan
      ? 'urordo detected a project boundary here and skipped the contents instead of reorganising them.'
      : scanDiagnostics?.enumerated === 0
        ? 'The selected folder does not contain any items yet.'
        : 'urordo found items, but all of them were skipped because they were protected, ignored, hidden, or inaccessible.'
    : 'urordo scanned this folder and filtered what it found before review.';

  if (step === 'review') {
    return (
      <Review
        classifications={classifications}
        originalPath={path || reviewRootDisplay}
        rootPath={path}
        pendingPaths={reviewPendingPaths}
        onCancel={() => {
          setStep('input');
          setReviewRootDisplay('');
          setReviewPendingPaths([]);
        }}
        onComplete={async () => {
          setStep('input');
          setReviewRootDisplay('');
          setReviewPendingPaths([]);
          await handleReviewSettled();
          onNavigate('history');
        }}
      />
    );
  }

  const isScanning = step === 'scanning' || step === 'classifying';

  return (
    <div className="p-10 h-full flex flex-col items-center max-w-xl mx-auto text-center overflow-y-auto justify-center">

      {/* Icon + Heading */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="mb-10 w-full"
      >
        <div className="w-16 h-16 rounded-2xl bg-accent-light/40 border border-accent-light flex items-center justify-center mx-auto mb-6">
          <FolderSearch size={30} className="text-accent" strokeWidth={1.5} />
        </div>
        <h2 className="text-[2rem] font-display font-semibold text-ink-dark leading-tight">
          Organise a Folder
        </h2>
        <p className="text-sm text-ink-light mt-2 leading-relaxed">
          Choose a directory and urordo will scan, classify,<br />
          and propose a clean structure for your review.
        </p>
      </motion.div>

      {/* Review Queue Banner */}
      <AnimatePresence>
        {pendingFiles.length > 0 && step === 'input' && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full mb-6 bg-accent-light/30 border border-accent/40 rounded-2xl p-4 flex items-center justify-between shadow-warm-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <AlertCircle size={16} className="text-accent-dark" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-accent-dark leading-tight">Review Queue</h4>
                <p className="text-xs text-accent/80 font-medium mt-0.5">
                  {pendingFiles.length} file{pendingFiles.length === 1 ? '' : 's'} pending auto-organisation
                </p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                setStep('classifying');
                // Group by root path so classifier knows the bounds for each batch
                const groups = {};
                for (const f of pendingFiles) {
                  const r = f.root_path || "";
                  if (!groups[r]) groups[r] = [];
                  groups[r].push(f.path);
                }

                let allData = [];
                let lastError = null;

                for (const [r, paths] of Object.entries(groups)) {
                  const { data, error } = await tauriApi.classifyBatch(paths, r === "" ? null : r);
                  if (data) {
                    allData.push(...data);
                  } else {
                    lastError = error;
                  }
                }

                if (allData.length > 0) {
                  const data = allData;
                  const pendingByPath = new Map(pendingFiles.map(file => [file.path, file]));
                  const withRoots = data.map(item => ({
                    ...item,
                    root_path: pendingByPath.get(item.path)?.root_path || '',
                  }));
                  const uniqueRoots = [...new Set(withRoots.map(item => item.root_path).filter(Boolean))];
                  setReviewRootDisplay(uniqueRoots.length === 1 ? uniqueRoots[0] : 'Background review queue');
                  setReviewPendingPaths(withRoots.map(item => item.path));
                  setClassifications(withRoots);
                  setStep('review');
                } else {
                  setStep('input');
                  toast.error('Review Failed', humanizeError(lastError ?? 'Failed to classify pending files.'));
                }
              }}
              className="px-5 py-2.5 bg-accent text-white font-medium rounded-xl hover:bg-accent-dark text-xs transition-colors shadow-sm whitespace-nowrap"
            >
              Start Review
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input group */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
        className="w-full flex flex-col gap-3"
      >
        {/* Path row */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-paper-100 border border-paper-200 rounded-xl px-4 py-3.5 shadow-inset-sm">
            <FolderOpen size={16} className="text-ink-light shrink-0" strokeWidth={1.5} />
            <span className={`flex-1 text-left text-sm font-mono truncate ${path ? 'text-ink' : 'text-ink-light/60'}`}>
              {path || 'No folder selected…'}
            </span>
          </div>
          <motion.button
            onClick={pickFolder}
            disabled={isScanning}
            whileTap={{ scale: 0.97 }}
            className="px-5 py-3.5 bg-paper-100 border border-paper-200 text-ink rounded-xl font-medium hover:bg-paper-200/60 hover:border-paper-300 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-warm-sm"
          >
            Browse
          </motion.button>
        </div>

        {/* Scan button */}
        <motion.button
          onClick={handleScan}
          disabled={isScanning || !path.trim()}
          whileTap={{ scale: !isScanning && path.trim() ? 0.98 : 1 }}
          className="w-full bg-ink-dark text-paper-25 rounded-xl py-3.5 font-medium hover:bg-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-warm-md text-sm"
        >
          {step === 'input' && <><span>Start Analysis</span><ArrowRight size={16} /></>}
          {step === 'scanning' && (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Scanning — {progress.scanned} items found</span>
            </>
          )}
          {step === 'classifying' && (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Classifying semantics…</span>
            </>
          )}
        </motion.button>

        {/* Free-mode notice */}
        {!isLicensed && (
          <p className="text-xs text-ink-light/70 font-medium tracking-wide text-center">
            Free mode · Scans limited to 500 files per run ·{' '}
            <button onClick={() => onNavigate('settings')} className="text-accent hover:text-accent-dark underline underline-offset-2 transition-colors">
              Activate license
            </button>
          </p>
        )}

        {/* Scan diagnostics notice */}
        {scanDiagnostics && step === 'input' && (
          <div className={`rounded-2xl border px-4 py-3 text-left shadow-warm-sm ${
            noActionableScan
              ? 'bg-amber-50/70 border-amber-200 text-amber-900'
              : 'bg-paper-50 border-paper-200 text-ink'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                noActionableScan ? 'bg-amber-100 text-amber-700' : 'bg-paper-100 text-ink-light'
              }`}>
                <AlertCircle size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{scanSummaryTitle}</p>
                <p className="text-xs leading-relaxed mt-1 text-ink-light">{scanSummaryMessage}</p>
                <p className="text-xs font-medium mt-2 leading-relaxed">
                  {scanDiagnostics.visible} actionable item{scanDiagnostics.visible === 1 ? '' : 's'}
                  {' · '}
                  {scanDiagnostics.skipped} skipped
                  {' · '}
                  {scanDiagnostics.inaccessible} inaccessible
                  {' · '}
                  {scanDiagnostics.enumerated} enumerated
                  {scanDiagnostics.truncated && ' · Scan limit reached'}
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Recent Activity widget */}
      <AnimatePresence>
        {recentActivity.length > 0 && step === 'input' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.15 }}
            className="w-full mt-8"
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock size={12} className="text-ink-light" />
              <span className="text-xs font-semibold text-ink-light uppercase tracking-wider">Recent Activity</span>
            </div>
            <div className="space-y-2">
              {recentActivity.map(op => {
                const diff = Date.now() - new Date(op.created_at).getTime();
                const mins = Math.floor(diff / 60000);
                const hrs  = Math.floor(diff / 3600000);
                const timeAgo = mins < 1 ? 'just now'
                  : mins < 60 ? `${mins}m ago`
                  : hrs < 24  ? `${hrs}h ago`
                  : new Date(op.created_at).toLocaleDateString();
                return (
                  <div key={op.operation_id}
                    className="flex items-center justify-between px-4 py-2.5 bg-paper-50 border border-paper-200 rounded-xl shadow-warm-sm text-left">
                    <span className="text-xs font-medium text-ink">
                      {op.moves.length} file{op.moves.length !== 1 ? 's' : ''} moved
                    </span>
                    <span className="text-2xs font-mono text-ink-light">{timeAgo}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
