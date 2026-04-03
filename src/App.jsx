import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { SettingsProvider, useSettings } from './lib/SettingsContext';
import { Sidebar } from './components/Sidebar';
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './screens/Landing';
import { Inbox } from './screens/Inbox';
import { History } from './screens/History';
import { Settings } from './screens/Settings';
import { Watchers } from './screens/Watchers';
import { UpdatePrompt } from './screens/UpdatePrompt';
import { ToastProvider } from './components/ToastContext';
import { ConfirmProvider } from './components/ConfirmContext';

function AppShell({ initialPath, clearPath }) {
  const [screen, setScreen] = useState('inbox');

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex h-screen bg-paper overflow-hidden text-ink font-body">
          <UpdatePrompt />
          <Sidebar current={screen} onNavigate={setScreen} />
          <main className="flex-1 relative overflow-hidden bg-paper-2/50 rounded-tl-2xl shadow-[inset_1px_1px_4px_rgba(0,0,0,0.02)] border-t border-l border-rule mt-2 ml-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={screen}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute inset-0 overflow-y-auto"
              >
                <ErrorBoundary>
                  {screen === 'inbox' && (
                    <Inbox
                      onNavigate={setScreen}
                      initialPath={initialPath}
                      onPathUsed={clearPath}
                    />
                  )}
                  {screen === 'history' && <History />}
                  {screen === 'watchers' && <Watchers />}
                  {screen === 'settings' && <Settings />}
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function AppContent() {
  const { settings, loading, updateSettings } = useSettings();
  const [initialPath, setInitialPath] = useState('');
  const [onboardingDone, setOnboardingDone] = useState(false);

  const onboardingComplete =
    onboardingDone ||
    settings.onboardingComplete === true ||
    settings.hasSeenWelcome === true;

  useEffect(() => {
    const theme = settings.theme || 'system';
    if (theme === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [settings.theme]);

  const finishOnboarding = () => {
    setOnboardingDone(true);
    updateSettings({ onboardingComplete: true, hasSeenWelcome: true });
  };

  if (loading) return <SplashScreen />;

  if (!onboardingComplete) {
    return <Landing onComplete={finishOnboarding} />;
  }

  return (
    <AppShell
      initialPath={initialPath}
      clearPath={() => setInitialPath('')}
    />
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
