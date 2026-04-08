import React from 'react';
import { motion } from 'framer-motion';
import { FolderSearch, History, Settings, Eye } from 'lucide-react';
import clsx from 'clsx';
import { FolderSearchLogo } from './FolderSearchLogo';

const NAV_ITEMS = [
  { id: 'inbox',    icon: FolderSearch, label: 'Organise' },
  { id: 'watchers', icon: Eye,          label: 'Watchers'  },
  { id: 'history',  icon: History,      label: 'Activity'  },
  { id: 'settings', icon: Settings,     label: 'Settings'  },
];

export function Sidebar({ current, onNavigate }) {
  return (
    <div className="w-56 h-full border-r border-rule bg-paper flex flex-col pt-6 pb-4 px-3 shrink-0">

      {/* Logo + Wordmark */}
      <div className="flex items-center gap-2.5 px-3 mb-10">
        <FolderSearchLogo size={28} animated={false} />
        <h1 className="font-display text-[1.65rem] font-semibold tracking-wide text-ink leading-none">
          ur<span className="text-gold italic">O</span>rdo
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = current === id;
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => onNavigate(id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium relative focus:outline-none',
                isActive
                  ? 'text-ink bg-paper-2'
                  : 'text-ink-muted hover:bg-paper-2/60 hover:text-ink'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute inset-y-1.5 left-0 w-[3px] bg-gold rounded-r-full"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                />
              )}
              <Icon
                size={17}
                strokeWidth={isActive ? 2 : 1.75}
                className={clsx('shrink-0 transition-colors', isActive ? 'text-gold' : '')}
              />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Version footer */}
      <div className="px-3 pt-3 border-t border-paper-200">
        <p className="text-2xs text-ink-muted/50 font-mono tracking-wider">v0.0.2</p>
      </div>
    </div>
  );
}
