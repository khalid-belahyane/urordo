import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Trash2, Info, X } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [config, setConfig] = useState(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setConfig({
        ...opts,
        onConfirm: () => {
          resolve(true);
          setConfig(null);
        },
        onCancel: () => {
          resolve(false);
          setConfig(null);
        },
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
        {config && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 isolate">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={config.onCancel}
              className="absolute inset-0 bg-ink-dark/20 backdrop-blur-[2px]"
            />
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative w-full max-w-sm bg-paper border border-paper-200 shadow-warm-lg rounded-2xl overflow-hidden pointer-events-auto flex flex-col pt-7 pb-6 px-7"
            >
              <button
                onClick={config.onCancel}
                className="absolute top-4 right-4 p-1.5 text-ink-light/50 hover:text-ink-light hover:bg-paper-100 transition-colors rounded-lg"
              >
                <X size={16} />
              </button>
              
              <div className="mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${
                  config.variant === 'danger' ? 'bg-red-50 text-red-500 border border-red-100' :
                  config.variant === 'warning' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                  'bg-paper-200/50 text-ink-light border border-paper-200'
                }`}>
                  {config.variant === 'danger' ? <Trash2 size={24} strokeWidth={1.5} /> :
                   config.variant === 'warning' ? <AlertCircle size={24} strokeWidth={1.5} /> :
                   <Info size={24} strokeWidth={1.5} />}
                </div>
                
                <h3 className="text-[1.35rem] font-display font-semibold text-ink-dark leading-tight mb-2">
                  {config.title}
                </h3>
                <p className="text-sm text-ink-light leading-relaxed">
                  {config.message}
                </p>
              </div>
              
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={config.onCancel}
                  className="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium text-ink bg-paper-100 hover:bg-paper-200/60 border border-paper-200 transition-colors"
                >
                  {config.cancelText || 'Cancel'}
                </button>
                <button
                  onClick={config.onConfirm}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors shadow-sm ${
                    config.variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white shadow-[0_2px_8px_rgba(220,38,38,0.25)]' :
                    config.variant === 'warning' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-[0_2px_8px_rgba(217,119,6,0.25)]' :
                    'bg-ink-dark hover:bg-ink text-paper-25 shadow-warm-sm'
                  }`}
                >
                  {config.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context;
};
