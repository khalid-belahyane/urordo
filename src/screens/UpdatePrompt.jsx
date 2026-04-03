import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2 } from 'lucide-react';

export function UpdatePrompt() {
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');

  useEffect(() => {
    const unlistenPromise = listen('update-available', (event) => {
      setUpdate(event.payload);
      setDismissed(false);
      setInstalling(false);
      setInstallMessage('');
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  if (!update || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    setInstallMessage('Checking package...');

    try {
      const [{ check }, { relaunch }] = await Promise.all([
        import('@tauri-apps/plugin-updater'),
        import('@tauri-apps/plugin-process'),
      ]);

      const nextUpdate = await check();
      if (!nextUpdate) {
        setInstallMessage('No update is ready any more.');
        setInstalling(false);
        return;
      }

      await nextUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setInstallMessage('Downloading update...');
            break;
          case 'Progress':
            setInstallMessage('Downloading update...');
            break;
          case 'Finished':
            setInstallMessage('Installing update...');
            break;
          default:
            break;
        }
      });

      setInstallMessage('Restarting...');
      await relaunch();
    } catch (error) {
      console.error('Failed to install update:', error);
      setInstallMessage('Update install failed. Download the latest installer manually.');
      setInstalling(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-4 right-4 z-50 w-72 bg-paper-50 border border-paper-200 rounded-xl shadow-lg p-4"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 text-ink font-semibold text-sm">
            <Download size={15} className="text-accent" />
            Update available
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-ink-light hover:text-ink text-lg leading-none ml-3 transition-colors"
            aria-label="Dismiss update notification"
            disabled={installing}
          >
            x
          </button>
        </div>

        <p className="text-xs text-ink-light mb-3">
          urordo {update.version} is ready to install.
        </p>

        {installMessage && (
          <p className="text-xs text-ink-light mb-3">{installMessage}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setDismissed(true)}
            className="flex-1 py-1.5 text-xs text-ink-light border border-paper-200 rounded-lg hover:bg-paper-100 transition-colors disabled:opacity-40"
            disabled={installing}
          >
            Later
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 py-1.5 text-xs text-paper-50 bg-ink rounded-lg hover:bg-ink-dark transition-colors disabled:opacity-70 flex items-center justify-center gap-1.5"
            disabled={installing}
          >
            {installing ? <Loader2 size={12} className="animate-spin" /> : null}
            <span>{installing ? 'Installing...' : 'Install now'}</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
