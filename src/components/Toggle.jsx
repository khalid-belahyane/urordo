import React from 'react';
import { motion } from 'framer-motion';

export function Toggle({ enabled, onToggle, ariaLabel }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative w-[42px] h-[22px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent shrink-0 ${
        enabled ? 'bg-gold' : 'bg-paper-300'
      }`}
    >
      <motion.div
        className="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-warm-sm"
        animate={{ x: enabled ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  );
}
