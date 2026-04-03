import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * FolderSearchLogo — the urordo brand mark.
 *
 * Built from the Lucide FolderSearch icon (24×24 viewBox), scaled via the
 * `size` prop. Colors are pure CSS custom property references so the mark
 * adapts automatically to light and dark mode.
 *
 * Colors:
 *   Folder body stroke  → var(--color-ink)   at 0.75 opacity
 *   Search circle       → var(--color-gold)
 *   Search handle       → var(--color-gold)
 *
 * Animation (animated=true, plays once, respects prefers-reduced-motion):
 *   Phase 1  0.00–0.45s  Folder body fades + scales in
 *   Phase 2  0.45–1.05s  Scan line sweeps top→bottom inside folder, fades out
 *   Phase 3  1.05–1.55s  Magnifying glass appears (circle + handle)
 *   Phase 4  1.55–2.10s  Expanding ring pulse on the search circle, then done
 *
 * Props:
 *   size      {number}   Pixel size of the rendered SVG. Default 64.
 *   animated  {boolean}  Whether to play the intro sequence. Default true.
 *   className {string}   Extra CSS classes on the <svg> element.
 */
export function FolderSearchLogo({ size = 64, animated = true, className = '' }) {
  const prefersReduced = useReducedMotion();
  const play = animated && !prefersReduced;

  // strokeWidth that stays visually consistent across all rendered sizes
  const sw = 1.75;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="urordo logo"
      role="img"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* ── Phase 1: Folder body ──────────────────────────────────────────── */}
      <motion.path
        d="M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1"
        stroke="var(--color-ink)"
        strokeWidth={sw}
        fill="none"
        initial={play ? { opacity: 0, scale: 0.85 } : { opacity: 0.75, scale: 1 }}
        animate={{ opacity: 0.75, scale: 1 }}
        transition={play ? { duration: 0.45, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
        style={{ transformOrigin: '12px 12px' }}
      />

      {/* ── Phase 2: Scan line (sweeps inside folder area, then fades) ────── */}
      {play && (
        <motion.line
          x1="3" x2="17"
          y1="0" y2="0"
          stroke="var(--color-gold)"
          strokeWidth={0.6}
          initial={{ y: 4, opacity: 0 }}
          animate={{
            y: [4, 19, 19],
            opacity: [0, 0.55, 0],
          }}
          transition={{
            duration: 0.66,
            delay: 0.45,
            times: [0, 0.788, 1],
            ease: ['easeInOut', 'linear']
          }}
        />
      )}

      {/* ── Phase 3: Search circle ────────────────────────────────────────── */}
      <motion.circle
        cx="17" cy="17" r="3"
        stroke="var(--color-gold)"
        strokeWidth={sw}
        initial={play ? { opacity: 0, y: -2 } : { opacity: 1, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={play ? { delay: 1.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
      />

      {/* ── Phase 3: Search handle ────────────────────────────────────────── */}
      <motion.path
        d="m21 21-1.9-1.9"
        stroke="var(--color-gold)"
        strokeWidth={sw + 0.25}
        initial={play ? { opacity: 0, y: -2 } : { opacity: 1, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={play ? { delay: 1.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
      />

      {/* ── Phase 4: Expanding ring pulse on the search circle ───────────── */}
      {play && (
        <motion.circle
          cx="17" cy="17" r="3"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth={0.8}
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: 2.4, opacity: [0, 0.5, 0] }}
          transition={{ delay: 1.55, duration: 0.55, ease: 'easeOut' }}
          style={{ originX: '17px', originY: '17px' }}
        />
      )}
    </svg>
  );
}
