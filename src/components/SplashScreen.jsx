import { motion } from 'framer-motion';

/** Minimal loading screen — shown for ~200–400ms while settings load from Rust.
 *  Colors reference CSS custom properties so this screen participates in
 *  light/dark mode switching alongside the rest of the app.
 */
export function SplashScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-paper)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      fontFamily: '"DM Mono", monospace',
      position: 'relative',
    }}>
      {/* Paper grain — shared CSS utility class */}
      <div className="grain-overlay" />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          position: 'relative',
          zIndex: 10,
        }}
      >

        {/* Wordmark */}
        <span style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--color-ink)',
          lineHeight: 1,
        }}>
          ur<span style={{ color: 'var(--color-gold)' }}>o</span>rdo
        </span>
      </motion.div>

      {/* Loading shimmer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        style={{
          width: 64, height: 1,
          background: 'var(--color-gold)',
          position: 'relative',
          zIndex: 10,
        }}
      />
    </div>
  );
}
