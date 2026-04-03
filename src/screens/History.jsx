import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Undo2, ChevronDown, ChevronUp, CheckCircle2,
  RotateCcw, ArrowRight, AlertCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { tauriApi } from '../lib/tauri';
import { getFileName } from '../lib/planner';
import { humanizeError } from '../lib/planner';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmContext';
import { SkeletonRow } from '../components/Skeleton';

const STATUS_BADGE = {
  failed:        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-red-500 px-1.5 py-0.5 bg-red-50 border border-red-100 rounded">Failed</span>,
  pending:       <span className="text-2xs font-mono font-bold uppercase tracking-wider text-amber-600 px-1.5 py-0.5 bg-amber-50 border border-amber-100 rounded">Interrupted</span>,
  partial_rollback:<span className="text-2xs font-mono font-bold uppercase tracking-wider text-amber-700 px-1.5 py-0.5 bg-amber-50 border border-amber-100 rounded">Partially undone</span>,
  rolled_back:   <span className="text-2xs font-mono font-bold uppercase tracking-wider text-ink-light px-1.5 py-0.5 bg-paper-100 border border-paper-200 rounded">Undone</span>,
  'rolled back': <span className="text-2xs font-mono font-bold uppercase tracking-wider text-ink-light px-1.5 py-0.5 bg-paper-100 border border-paper-200 rounded">Undone</span>,
  rollback_failed:<span className="text-2xs font-mono font-bold uppercase tracking-wider text-red-400 px-1.5 py-0.5 bg-red-50 border border-red-100 rounded">Undo failed</span>,
};

export function History() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [data, setData]           = useState({ items: [], total_pages: 1 });
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [expanded, setExpanded]   = useState(new Set());
  const [rollingBack, setRollingBack] = useState(null);

  useEffect(() => { fetchHistory(page); }, [page]);

  const fetchHistory = async (p) => {
    setLoading(true);
    const res = await tauriApi.listHistory(p, 20);
    if (res.error) toast.error("Failed to load activity", humanizeError(res.error));
    else if (res.data) setData(res.data);
    setLoading(false);
  };

  const toggleExpand = (id) => setExpanded(prev => {
    const copy = new Set(prev);
    copy.has(id) ? copy.delete(id) : copy.add(id);
    return copy;
  });

  const rollback = async (op) => {
    const ok = await confirm({
      title: 'Revert Operation',
      message: `Are you sure you want to revert ${op.moves.length} moves? Files will be returned to their original locations.`,
      confirmText: 'Revert Moves',
      variant: 'warning'
    });
    if (!ok) return;

    setRollingBack(op.operation_id);
    const res = await tauriApi.rollbackMoves([op.operation_id], null);
    if (res.error) toast.error("Rollback failed", humanizeError(res.error));
    else if (res.data?.status === 'partial_rollback') {
      toast.info(
        'Rollback partially completed',
        `${res.data.reverted_count} restored, ${res.data.missing_count} could not be returned.`
      );
      await fetchHistory(page);
    } else if (res.data?.status === 'rollback_failed') {
      toast.error(
        'Rollback failed',
        'urordo could not return these files to their original locations.'
      );
      await fetchHistory(page);
    } else {
      toast.success("Rolled back", "Files have been returned to their original locations.");
      await fetchHistory(page);
    }
    setRollingBack(null);
  };

  const items      = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="p-8 h-full flex flex-col"
    >
      {/* Header */}
      <div className="mb-7 shrink-0">
        <h2 className="text-[1.75rem] font-display font-semibold text-ink-dark leading-none">Activity</h2>
        <p className="text-sm text-ink-light mt-1">Review past operations or revert any change.</p>
      </div>



      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-3">
            <SkeletonRow className="h-[76px] w-full rounded-xl bg-paper-100/50 border border-paper-200" />
            <SkeletonRow className="h-[76px] w-full rounded-xl bg-paper-100/50 border border-paper-200" />
            <SkeletonRow className="h-[76px] w-full rounded-xl bg-paper-100/50 border border-paper-200" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 rounded-xl bg-paper-100/50 border border-paper-200 gap-3 text-ink-light">
            <Clock size={32} strokeWidth={1.5} className="opacity-30" />
            <span className="text-sm">No activity yet</span>
            <span className="text-xs text-ink-light/60">Organised files will appear here</span>
          </div>
        ) : (
          items.map((op, idx) => {
            const isRolledBack = op.status === 'rolled back' || op.status === 'rolled_back';
            const isPartialRollback = op.status === 'partial_rollback';
            const isExpanded   = expanded.has(op.operation_id);
            const isRolling    = rollingBack === op.operation_id;
            const date         = new Date(op.created_at).toLocaleString();

            return (
              <motion.div
                key={op.operation_id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`border rounded-xl overflow-hidden shadow-warm-sm transition-colors ${
                  isRolledBack
                    ? 'border-paper-300 bg-paper-100/60'
                    : isPartialRollback
                      ? 'border-amber-200 bg-amber-50/60'
                      : 'border-paper-200 bg-paper-50'
                }`}
              >
                {/* Row header */}
                <div
                  onClick={() => toggleExpand(op.operation_id)}
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-paper-100/40 transition-colors"
                >
                  <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                    isRolledBack
                      ? 'bg-paper-200'
                      : isPartialRollback
                        ? 'bg-amber-100'
                        : 'bg-accent-light/40'
                  }`}>
                    {isRolledBack
                      ? <RotateCcw size={13} className="text-ink-light" />
                      : isPartialRollback
                        ? <AlertCircle size={13} className="text-amber-700" />
                        : <CheckCircle2 size={13} className="text-accent" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isRolledBack || isPartialRollback ? 'text-ink-light' : 'text-ink-dark'}`}>
                      {op.moves.length} file{op.moves.length !== 1 ? 's' : ''} moved
                      {isPartialRollback && <span className="ml-2 text-2xs font-mono font-bold uppercase tracking-widest text-amber-700/80">Partial rollback</span>}
                      {isRolledBack && <span className="ml-2 text-2xs font-mono font-bold uppercase tracking-widest text-ink-light/60">· Reverted</span>}
                    </p>
                    <p className="text-2xs font-mono text-ink-light mt-0.5 truncate">
                      {date} · {op.operation_id.split('-')[0]}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Inline revert */}
                    {!isRolledBack && !isPartialRollback && (
                      <button
                        onClick={e => { e.stopPropagation(); rollback(op); }}
                        disabled={isRolling}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-paper-200 text-ink-light bg-paper-50 rounded-lg hover:bg-paper-200/60 hover:text-ink hover:border-paper-300 transition-all shadow-warm-sm disabled:opacity-40"
                      >
                        <Undo2 size={12} /> {isRolling ? 'Reverting…' : 'Revert'}
                      </button>
                    )}

                    {isExpanded
                      ? <ChevronUp size={16} className="text-ink-light shrink-0" />
                      : <ChevronDown size={16} className="text-ink-light shrink-0" />
                    }
                  </div>
                </div>

                {/* Expanded move list */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 py-3 bg-paper-100/50 border-t border-paper-200 space-y-1.5">
                        {op.moves.map(m => {
                          const isFailed   = m.status === 'failed' || m.status === 'rollback_failed';
                          const isReverted = m.status === 'rolled_back' || m.status === 'rolled back';
                          return (
                            <div
                              key={m.id}
                              className={`flex items-center gap-3 text-xs px-3 py-2 rounded-lg border ${
                                isReverted ? 'opacity-40 bg-paper-50 border-paper-200'
                                : isFailed  ? 'bg-red-50 border-red-100'
                                : 'bg-paper-50 border-paper-200 opacity-80'
                              }`}
                            >
                              <span className="truncate flex-1 max-w-[40%] font-mono text-ink-light">{getFileName(m.source_path)}</span>
                              <ArrowRight size={12} className="shrink-0 text-ink-light/40" />
                              <span className="truncate flex-1 font-mono text-ink font-medium">{getFileName(m.destination_path)}</span>
                              {STATUS_BADGE[m.status]}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 shrink-0">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-paper-200 hover:bg-paper-100 text-ink-light disabled:opacity-30 transition-colors shadow-warm-sm"
          >
            <ChevronLeft size={16} />
          </motion.button>
          <span className="text-xs font-mono text-ink-light">
            {page} / {totalPages}
          </span>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-paper-200 hover:bg-paper-100 text-ink-light disabled:opacity-30 transition-colors shadow-warm-sm"
          >
            <ChevronRight size={16} />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
