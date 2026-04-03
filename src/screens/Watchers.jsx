import React, { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, FolderPlus, Folder, Activity, Settings2, Trash2 } from 'lucide-react';
import clsx from 'clsx';

import { tauriApi } from '../lib/tauri';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';
import { SkeletonCard } from '../components/Skeleton';
import { Toggle } from '../components/Toggle';

export function Watchers() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [watchers, setWatchers] = useState([]);
  const [status, setStatus] = useState({ active_count: 0, pending_count: 0, paused: false });
  const [pendingCounts, setPendingCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastEvents, setLastEvents] = useState({});

  const mapPendingCounts = (pendingFiles = []) =>
    pendingFiles.reduce((counts, file) => {
      counts[file.watcher_id] = (counts[file.watcher_id] || 0) + 1;
      return counts;
    }, {});

  const loadWatchers = async () => {
    setLoading(true);
    const [{ data: watcherData }, { data: watcherStatus }, { data: pendingData }] = await Promise.all([
      tauriApi.getWatchedFolders(),
      tauriApi.getWatcherStatus(),
      tauriApi.getPendingFiles(),
    ]);

    if (watcherData) setWatchers(watcherData);
    if (watcherStatus) setStatus(watcherStatus);
    if (pendingData) setPendingCounts(mapPendingCounts(pendingData));
    setLoading(false);
  };

  useEffect(() => {
    loadWatchers();

    const unlistenWatcherPromise = tauriApi.onWatcherEvent((payload) => {
      setLastEvents((prev) => ({
        ...prev,
        [payload.watcher_id]: `New file detected: ${payload.filename}`,
      }));

      setWatchers((prev) =>
        prev.map((watcher) =>
          watcher.id === payload.watcher_id
            ? {
                ...watcher,
                files_processed: watcher.files_processed + 1,
                last_activity: new Date().toISOString(),
              }
            : watcher
        )
      );

      tauriApi.getPendingFiles().then(({ data }) => {
        if (data) setPendingCounts(mapPendingCounts(data));
      });

      setTimeout(() => {
        setLastEvents((prev) => {
          const next = { ...prev };
          delete next[payload.watcher_id];
          return next;
        });
      }, 3000);
    });

    const unlistenStatusPromise = tauriApi.onWatchersStateChanged((payload) => {
      setStatus(payload);
      tauriApi.getPendingFiles().then(({ data }) => {
        if (data) setPendingCounts(mapPendingCounts(data));
      });
    });

    return () => {
      unlistenWatcherPromise.then((fn) => fn());
      unlistenStatusPromise.then((fn) => fn());
    };
  }, []);

  const handleAddFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      if (!selectedPath) return;

      const { error } = await tauriApi.addWatchedFolder(selectedPath, false);
      if (error) {
        toast.error('Failed to add watcher', error.toString());
        return;
      }

      toast.success('Watcher added', selectedPath.split(/[\\/]/).pop());
      loadWatchers();
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggle = async (id, isActive) => {
    const { error } = await tauriApi.toggleWatcher(id, !isActive);
    if (error) {
      toast.error('Failed to toggle watcher', error.toString());
      return;
    }
    loadWatchers();
  };

  const handleRemove = async (id) => {
    const ok = await confirm({
      title: 'Remove Folder',
      message: 'urordo will stop monitoring this folder. No files will be deleted.',
      variant: 'danger',
      confirmText: 'Remove',
    });
    if (!ok) return;

    const { error } = await tauriApi.removeWatchedFolder(id);
    if (error) {
      toast.error('Failed to remove watcher', error.toString());
      return;
    }
    toast.info('Watcher removed');
    loadWatchers();
  };

  const handleUpdateMode = async (id, autoOrganise, mode) => {
    const { error } = await tauriApi.updateWatcherSettings(id, autoOrganise, mode);
    if (error) {
        toast.error('Failed to update watcher settings', error.toString());
        return;
    }
    loadWatchers();
  };

  const getRelativeTime = (isoString) => {
    if (!isoString) return 'Never';
    const minutes = Math.floor((new Date() - new Date(isoString)) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  };

  if (loading && watchers.length === 0) {
    return (
      <div className="p-8 h-full flex flex-col max-w-4xl mx-auto w-full gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="p-8 h-full flex flex-col max-w-4xl mx-auto overflow-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight text-ink mb-1">Watched folders</h2>
          <p className="text-sm text-ink-muted">
            Watch folders recursively and route every new file into review or automation.
          </p>
        </div>

        {watchers.length > 0 && (
          <button
            onClick={handleAddFolder}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-paper rounded-lg hover:bg-ink/90 transition-colors font-medium text-sm shadow-sm"
          >
            <FolderPlus size={16} />
            <span>Add folder</span>
          </button>
        )}
      </div>

      {status.paused && watchers.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium">
          Watchers are paused from the tray. New files stay queued for review until you resume them.
        </div>
      )}

      {watchers.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-rule rounded-xl bg-paper-2/30">
          <div className="w-16 h-16 bg-paper shadow-sm border border-rule rounded-2xl flex items-center justify-center mb-6 text-gold">
            <Eye size={30} strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-medium text-ink mb-2">No folders being watched</h3>
          <p className="text-ink-muted text-center max-w-sm mb-8">
            Add a folder and urordo will watch it recursively, then send new files into review or auto-organise.
          </p>
          <button
            onClick={handleAddFolder}
            className="flex items-center gap-2 px-6 py-3 bg-ink text-paper rounded-xl hover:bg-ink/90 transition-all active:scale-[0.98] font-medium shadow-md shadow-ink/10"
          >
            <FolderPlus size={18} />
            <span>Add your first folder</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {watchers.map((watcher) => (
              <motion.div
                key={watcher.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={clsx(
                  'p-5 rounded-xl border transition-colors relative overflow-hidden',
                  watcher.is_active ? 'bg-paper border-gold/30 shadow-sm' : 'bg-paper-2/50 border-rule opacity-80'
                )}
              >
                <AnimatePresence>
                  {lastEvents[watcher.id] && watcher.is_active && (
                    <motion.div
                      key="pulse"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-x-0 top-0 h-[2px] bg-gold"
                    >
                      <motion.div
                        initial={{ scaleX: 0, opacity: 1 }}
                        animate={{ scaleX: 1, opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-full h-full bg-gold origin-left"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-start gap-4">
                    <div className={clsx('p-3 rounded-lg mt-1', watcher.is_active ? 'bg-gold/10 text-gold' : 'bg-rule text-ink-muted')}>
                      <Folder size={24} strokeWidth={1.5} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-ink line-clamp-1 break-all">
                          {watcher.path.split(/[\\/]/).pop() || watcher.path}
                        </h3>
                        {lastEvents[watcher.id] && (
                          <motion.span
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-gold/20 text-gold-dark text-xs px-2 py-0.5 rounded-full font-medium"
                          >
                            {lastEvents[watcher.id]}
                          </motion.span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-ink-muted mb-2 break-all max-w-xl">
                        {watcher.path}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-ink-muted/80 font-medium">
                        <span className="flex items-center gap-1.5 capitalize">
                          <Activity size={12} />
                          {getRelativeTime(watcher.last_activity)}
                        </span>
                        <span>•</span>
                        <span>{watcher.files_processed} files seen</span>
                        <span>•</span>
                        <span>{pendingCounts[watcher.id] || 0} pending review</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggle(watcher.id, watcher.is_active)}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
                      watcher.is_active ? 'bg-green-500/10 text-green-600' : 'bg-rule text-ink-muted hover:bg-ink/5 hover:text-ink'
                    )}
                  >
                    <span className={clsx('w-2 h-2 rounded-full', watcher.is_active ? 'bg-green shadow-[0_0_8px_rgba(46,94,24,0.6)] animate-pulse' : 'bg-ink-muted')} />
                    {watcher.is_active ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between border-t border-rule/50 pt-4 mt-2 gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-ink-muted flex items-center gap-1.5">
                        <Settings2 size={16} /> Auto-organise:
                      </span>
                      <Toggle
                        ariaLabel="Toggle auto-organise"
                        enabled={watcher.auto_organise}
                        onToggle={() => handleUpdateMode(watcher.id, !watcher.auto_organise, watcher.auto_organise_mode)}
                      />
                    </div>

                    <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
                      <span className="text-sm font-medium text-ink-muted">Mode:</span>
                      <select
                        value={watcher.auto_organise_mode}
                        onChange={(event) => handleUpdateMode(watcher.id, watcher.auto_organise, event.target.value)}
                        className="bg-paper border border-rule text-sm rounded-md px-2 py-1 outline-none focus:border-gold"
                        disabled={!watcher.auto_organise}
                      >
                        <option value="review">Review first</option>
                        <option value="auto">Organise automatically</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemove(watcher.id)}
                    className="p-2 text-ink-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <Trash2 size={16} />
                    <span>Remove</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
