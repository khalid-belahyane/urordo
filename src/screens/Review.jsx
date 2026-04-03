import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Play, Settings2, CheckCircle2, AlertCircle, History, Folder, ChevronDown, Search, X, Package, FolderX, Image as ImageIcon, Video, FileText, Files } from 'lucide-react';
import { tauriApi } from '../lib/tauri';
import { useConfirm } from '../components/ConfirmContext';
import { useSettings } from '../lib/SettingsContext';
import { getFileName } from '../lib/planner';

const CategoryIcon = ({ category, size = 16, className = "" }) => {
  switch (category) {
    case 'Project':  return <Package size={size} className={className} />;
    case 'Empty':    return <FolderX size={size} className={className} />;
    case 'Image':    return <ImageIcon size={size} className={className} />;
    case 'Video':    return <Video size={size} className={className} />;
    case 'Document': return <FileText size={size} className={className} />;
    default:         return <Files size={size} className={className} />;
  }
};

const SummaryDashboard = ({ files }) => {
  const stats = {
    projects: files.filter(f => f.category === 'Project').length,
    empty:    files.filter(f => f.category === 'Empty').length,
    media:    files.filter(f => f.category === 'Image' || f.category === 'Video').length,
    docs:     files.filter(f => f.category === 'Document').length,
    other:    files.filter(f => !['Project', 'Empty', 'Image', 'Video', 'Document'].includes(f.category)).length,
  };

  const Card = ({ label, count, icon: Icon, color }) => (
    <div className="bg-paper-50 border border-paper-200 rounded-2xl p-4 flex flex-col gap-1 flex-1 shadow-warm-sm">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 ${color}`}>
        <Icon size={18} />
      </div>
      <span className="text-xl font-display font-bold text-ink-dark">{count}</span>
      <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-light/60">{label}</span>
    </div>
  );

  return (
    <div className="flex gap-4 mb-8">
      {stats.projects > 0 && <Card label="Projects" count={stats.projects} icon={Package} color="bg-blue-50 text-blue-500" />}
      {stats.empty > 0 && <Card label="Empty Folders" count={stats.empty} icon={FolderX} color="bg-red-50 text-red-400" />}
      {stats.media > 0 && <Card label="Media" count={stats.media} icon={ImageIcon} color="bg-purple-50 text-purple-500" />}
      {stats.docs > 0 && <Card label="Documents" count={stats.docs} icon={FileText} color="bg-amber-50 text-amber-500" />}
      {stats.other > 0 && <Card label="Other Loose" count={stats.other} icon={Files} color="bg-ink-50 text-ink-light" />}
    </div>
  );
};

export function Review({ classifications, originalPath, rootPath = '', pendingPaths = [], onCancel, onComplete }) {
  const { confirm } = useConfirm();
  const { settings } = useSettings();
  const [files, setFiles] = useState(() =>
    classifications.map((c, i) => ({
      ...c, id: i, name: getFileName(c.path), checked: c.action === 'move',
    }))
  );
  const [applying, setApplying]     = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [applyResult, setApplyResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBuckets, setExpandedBuckets] = useState({});

  const bucketNames = React.useMemo(() => [...new Set(files.map(f => f.bucket))], [files]);
  const q = searchQuery.toLowerCase().trim();

  // Primary filtering
  const filteredFiles = React.useMemo(() => {
    return q
      ? files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      : files;
  }, [files, q]);

  // Grouping by Category first, then Buckets
  const groupedData = React.useMemo(() => {
    const categoryNames = [...new Set(filteredFiles.map(f => f.category))];
    const groups = {};
    categoryNames.forEach(cat => {
      groups[cat] = {};
      const catFiles = filteredFiles.filter(f => f.category === cat);
      const catBuckets = [...new Set(catFiles.map(f => f.bucket))];
      catBuckets.forEach(b => {
        groups[cat][b] = catFiles.filter(f => f.bucket === b);
      });
    });
    return groups;
  }, [filteredFiles]);

  const isFiltering  = q.length > 0;
  const checkedCount = React.useMemo(() => files.filter(f => f.checked).length, [files]);

  const executePlan = async () => {
    const checkedFiles = files.filter(f => f.checked);
    if (checkedFiles.length === 0) {
      if (pendingPaths.length > 0) {
        await tauriApi.resolvePendingFiles(files.map(file => file.path));
      }
      setApplyResult({ moved: 0, failed: 0, error: null, skippedByRules: 0 });
      return;
    }

    const destinationMode = settings.destinationMode || 'alongside';
    const destinationPath = settings.destinationPath?.trim() || '';
    if (destinationMode !== 'alongside' && !destinationPath) {
      setApplyResult({
        moved: 0,
        failed: 0,
        error: 'Pick a destination folder in Settings before using this destination mode.',
        skippedByRules: 0,
      });
      return;
    }

    const ok = await confirm({
      title: 'Apply Moves',
      message: `You are about to move ${checkedFiles.length} file${checkedFiles.length === 1 ? '' : 's'}. This operation is completely reversible from the Activity screen.`,
      confirmText: 'Move files',
      variant: 'neutral',
    });
    if (!ok) return;

    // Construct the plan on the backend — PathBuf ensures OS-correct paths,
    // ignore rules are enforced server-side against the live DB state.
    const planItems = checkedFiles.map(f => ({
      path: f.path,
      bucket: f.bucket,
      checked: true,
      root_path: f.root_path || rootPath || null,
    }));

    const destinationOverride =
      destinationMode !== 'alongside' && destinationPath
        ? destinationPath
        : null;

    const { data: planResult, error: planError } = await tauriApi.buildPlan(planItems, rootPath, destinationOverride);
    if (planError || !planResult) {
      setApplyResult({ moved: 0, failed: 0, error: planError ?? 'Failed to build plan', skippedByRules: 0 });
      return;
    }

    const { actions, skipped_by_rules } = planResult;
    if (actions.length === 0) {
      // All items were filtered by ignore rules
      if (pendingPaths.length > 0) {
        await tauriApi.resolvePendingFiles(files.map(file => file.path));
      }
      setApplyResult({ moved: 0, failed: 0, error: null, skippedByRules: skipped_by_rules });
      return;
    }

    setProgress({ done: 0, total: actions.length });
    setApplying(true);
    let unlisten;
    try { unlisten = await tauriApi.onApplyProgress(p => setProgress({ done: p.done, total: p.total })); } catch (e) {}

    const { data, error } = await tauriApi.applyPlan(actions);
    if (unlisten) unlisten();
    setApplying(false);
    const failed = data?.failed ?? 0;

    if (!error && pendingPaths.length > 0) {
      const uncheckedPaths = files.filter(file => !file.checked).map(file => file.path);
      const pathsToResolve = failed === 0 ? files.map(file => file.path) : uncheckedPaths;
      if (pathsToResolve.length > 0) {
        await tauriApi.resolvePendingFiles(pathsToResolve);
      }
    }

    setApplyResult({
      moved: data?.successful ?? actions.length,
      failed,
      error: error ?? null,
      skippedByRules: skipped_by_rules,
    });
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (applyResult) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-10 h-full flex flex-col items-center justify-center gap-6 text-center"
      >
        {applyResult.error ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
              <AlertCircle size={32} className="text-red-400" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xl font-display font-semibold text-ink-dark">Move failed</p>
              <p className="text-sm text-ink-light mt-1 max-w-xs">{applyResult.error}</p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel}
              className="px-6 py-2.5 border border-paper-200 rounded-xl font-medium text-ink hover:bg-paper-100 transition-colors text-sm">
              Go back
            </motion.button>
          </>
        ) : applyResult.failed > 0 ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <AlertCircle size={32} className="text-amber-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xl font-display font-semibold text-ink-dark">Move completed with issues</p>
              <p className="text-sm text-ink-light mt-1 max-w-sm">
                {applyResult.moved} moved, {applyResult.failed} failed.
                {applyResult.skippedByRules > 0 ? ` ${applyResult.skippedByRules} skipped by ignore rules.` : ''}
              </p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={onComplete}
              className="px-6 py-3 bg-ink-dark text-paper-25 rounded-xl font-medium hover:bg-ink transition-colors flex items-center gap-2 shadow-warm-md text-sm">
              <History size={15} /> View Activity
            </motion.button>
          </>
        ) : applyResult.moved === 0 ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-paper-100 border border-paper-200 flex items-center justify-center">
              <AlertCircle size={32} className="text-ink-light" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xl font-display font-semibold text-ink-dark">Nothing was moved</p>
              <p className="text-sm text-ink-light mt-1 max-w-sm">
                {applyResult.skippedByRules > 0
                  ? `${applyResult.skippedByRules} selected item${applyResult.skippedByRules === 1 ? '' : 's'} matched ignore rules and were left untouched.`
                  : 'All selected items were left in place.'}
              </p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={onComplete}
              className="px-6 py-2.5 border border-paper-200 rounded-xl font-medium text-ink hover:bg-paper-100 transition-colors text-sm">
              Done
            </motion.button>
          </>
        ) : (
          <>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
              className="w-16 h-16 rounded-2xl bg-accent-light/40 border border-accent-light flex items-center justify-center"
            >
              <CheckCircle2 size={32} className="text-accent" strokeWidth={1.5} />
            </motion.div>
            <div>
              <p className="text-2xl font-display font-semibold text-ink-dark">
                {applyResult.moved} {applyResult.moved === 1 ? 'file' : 'files'} organised
              </p>
              <p className="text-sm text-ink-light mt-1">
                All moves logged - revert any time from Activity.
                {applyResult.skippedByRules > 0 ? ` ${applyResult.skippedByRules} skipped by ignore rules.` : ''}
              </p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={onComplete}
              className="px-6 py-3 bg-ink-dark text-paper-25 rounded-xl font-medium hover:bg-ink transition-colors flex items-center gap-2 shadow-warm-md text-sm">
              <History size={15} /> View Activity
            </motion.button>
          </>
        )}
      </motion.div>
    );
  }

  // ── Applying screen ────────────────────────────────────────────────────────
  if (applying) {
    return (
      <div className="p-10 h-full flex flex-col items-center justify-center gap-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
        >
          <Settings2 size={36} className="text-accent" strokeWidth={1.5} />
        </motion.div>
        <div>
          <h3 className="text-xl font-display font-semibold text-ink-dark">Moving Files</h3>
          <p className="text-sm text-ink-light mt-1">
            {progress.done} of {progress.total} moved…
          </p>
        </div>
        <div className="w-48 h-1 bg-paper-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-full"
            animate={{ width: progress.total > 0 ? `${Math.round((progress.done / progress.total) * 100)}%` : '0%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>
    );
  }

  // ── Review list ────────────────────────────────────────────────────────────
  const allBucketOptions = [...new Set([...bucketNames, 'Other', 'Trash'])];

  return (
    <motion.div
      className="p-8 h-full flex flex-col"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-7 shrink-0">
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-paper-200/60 text-ink-light transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div>
            <h2 className="text-[1.6rem] font-display font-semibold text-ink-dark leading-none">Review Plan</h2>
            <p className="text-xs text-ink-light mt-0.5 font-mono">{originalPath}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-3 text-ink-light pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files…"
              className="bg-paper-100 border border-paper-200 rounded-xl pl-8 pr-7 py-2 text-xs font-mono focus:outline-none focus:border-accent transition-colors w-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 text-ink-light hover:text-ink transition-colors">
                <X size={12} />
              </button>
            )}
          </div>
          {isFiltering && (
            <span className="text-2xs font-mono text-ink-light whitespace-nowrap">
              {filteredFiles.length} / {files.length}
            </span>
          )}
          {/* Apply button */}
          <motion.button
            onClick={executePlan}
            whileTap={{ scale: 0.97 }}
            disabled={checkedCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-ink-dark text-paper-25 rounded-xl font-medium hover:bg-ink transition-colors text-sm shadow-warm-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={14} />
            Apply {checkedCount} {checkedCount === 1 ? 'move' : 'moves'}
          </motion.button>
        </div>
      </div>

      {/* Summary Dashboard */}
      {!isFiltering && files.length > 0 && <SummaryDashboard files={files} />}

      {/* Empty state — no files at all */}
      {files.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl bg-paper-100/50 border border-paper-200">
          <CheckCircle2 size={40} className="text-accent opacity-50" strokeWidth={1.5} />
          <p className="font-semibold text-ink-dark">Everything is already organised</p>
          <p className="text-sm text-ink-light">No files need to be moved.</p>
        </div>
      )}

      {/* Empty search state */}
      {files.length > 0 && isFiltering && Object.keys(groupedData).length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl bg-paper-100/50 border border-paper-200">
          <Search size={32} className="text-ink-light opacity-40" strokeWidth={1.5} />
          <p className="font-semibold text-ink-dark">No matches</p>
          <p className="text-sm text-ink-light">Try a different search term.</p>
        </div>
      )}

      {/* Category Groups */}
      <div className="flex-1 overflow-y-auto space-y-8 pr-1 pb-10">
        {Object.entries(groupedData).map(([category, buckets]) => (
          <div key={category} className="space-y-4">
            <div className="flex items-center gap-2 px-2 sticky top-0 bg-paper-25/80 backdrop-blur-sm py-1 z-10">
              <CategoryIcon category={category} className="text-ink-light" size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest text-ink-light/70">{category === 'Loose' ? 'Loose Files' : category === 'Mixed' ? 'Mixed Folders' : category}</h3>
              <div className="h-px bg-paper-200 flex-1 ml-2" />
            </div>

            {Object.entries(buckets).map(([bucket, bFiles]) => {
              const allChecked = bFiles.every(f => f.checked);
              const someChecked = bFiles.some(f => f.checked);

              return (
                <motion.div
                  key={bucket}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-paper-50 border border-paper-200 rounded-xl overflow-hidden shadow-warm-sm"
                >
                  <div className="px-4 py-3 bg-paper-100 border-b border-paper-200 flex items-center gap-3">
                    <button
                      role="checkbox"
                      aria-checked={allChecked}
                      onClick={() => setFiles(prev => prev.map(f => f.category === category && f.bucket === bucket ? { ...f, checked: !allChecked } : f))}
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                        allChecked    ? 'bg-ink-dark border-ink-dark text-paper-25' :
                        someChecked   ? 'bg-accent/30 border-accent'                :
                        'border-paper-300 bg-paper-50'
                      }`}
                    >
                      {allChecked && <Check size={10} strokeWidth={3} />}
                    </button>
                    <Folder size={15} className="text-accent shrink-0" strokeWidth={1.5} />
                    <span className="font-semibold text-sm text-ink-dark flex-1">
                      {bucket}
                    </span>
                    <span className="text-2xs font-mono text-ink-light bg-paper-200 px-1.5 py-0.5 rounded">
                      {bFiles.length}
                    </span>
                  </div>

                  <div className="divide-y divide-paper-100">
                    {bFiles.slice(0, expandedBuckets[`${category}-${bucket}`] ? bFiles.length : 20).map((f) => (
                      <div
                        key={f.id}
                        onClick={() => setFiles(prev => prev.map(item => item.id === f.id ? { ...item, checked: !item.checked } : item))}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-paper-100/40 transition-colors cursor-pointer"
                      >
                        <button
                          role="checkbox"
                          aria-checked={f.checked}
                          onClick={(event) => {
                            event.stopPropagation();
                            setFiles(prev => prev.map(item => item.id === f.id ? { ...item, checked: !item.checked } : item));
                          }}
                          className={`w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center border transition-colors ${
                            f.checked ? 'bg-accent border-accent text-paper-25' : 'border-paper-300 bg-paper-50'
                          }`}
                        >
                          {f.checked && <Check size={10} strokeWidth={3} />}
                        </button>

                        <div className="flex-1 flex items-start gap-2 min-w-0" title={f.path}>
                          <CategoryIcon category={f.category} size={14} className="text-accent/60 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="block truncate text-sm text-ink font-medium">{f.name}</span>
                            <span className="block truncate text-2xs font-mono text-ink-light/60 mt-0.5">
                              {f.path.split(/[/\\]/).slice(0, -1).join('/')}
                            </span>
                          </div>
                        </div>

                        {f.category === 'Empty' && (
                          <span className="shrink-0 text-[10px] font-bold uppercase text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded mt-0.5">Cleanup</span>
                        )}
                        {f.category === 'Project' && (
                          <span className="shrink-0 text-[10px] font-bold uppercase text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded mt-0.5">Project</span>
                        )}

                        <div className="relative shrink-0 mt-0.5">
                          <select
                            value={f.bucket}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setFiles(prev => prev.map(item => item.id === f.id ? { ...item, bucket: e.target.value, checked: true } : item))}
                            className="appearance-none bg-paper-100 border border-paper-200 text-ink-light text-xs font-medium rounded-lg pl-2.5 pr-6 py-1 cursor-pointer hover:bg-paper-200 transition-colors focus:outline-none"
                          >
                            {allBucketOptions.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-light pointer-events-none" />
                        </div>
                      </div>
                    ))}
                    
                    {bFiles.length > 20 && !expandedBuckets[`${category}-${bucket}`] && (
                      <div className="px-4 py-3 bg-paper-50/50 hover:bg-paper-100/50 transition-colors border-t border-paper-100 flex justify-center">
                        <button
                          onClick={() => setExpandedBuckets(prev => ({...prev, [`${category}-${bucket}`]: true}))}
                          className="text-xs font-mono text-ink-light hover:text-ink font-semibold transition-colors flex items-center gap-2"
                        >
                          <ChevronDown size={14} /> Show {bFiles.length - 20} more files
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
