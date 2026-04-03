import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Undo2, Sparkles, Check, ArrowRight } from 'lucide-react';
import { FolderSearchLogo } from '../components/FolderSearchLogo';
import { TermsModal } from '../components/TermsModal';

const SERIF = '"Cormorant Garamond", Georgia, serif';
const MONO  = '"DM Mono", monospace';

// Theme token shorthand
const T = {
  get paper()  { return 'var(--color-paper)'; },
  get paper2() { return 'var(--color-paper-2)'; },
  get ink()    { return 'var(--color-ink)'; },
  get ink2()   { return 'var(--color-ink-2)'; },
  get muted()  { return 'var(--color-ink-muted)'; },
  get rule()   { return 'var(--color-rule)'; },
  get gold()   { return 'var(--color-gold)'; },
};

const FEATURES = [
  { icon: Sparkles, label: 'Semantic sorting' },
  { icon: Shield,   label: 'Local-first'      },
  { icon: Undo2,    label: 'Full rollback'     },
];

export function Landing({ onComplete }) {
  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden z-[500]"
      style={{ background: T.paper }}
    >
      {/* Subtle texture + ruled lines */}
      <div className="grain-overlay" />
      <div className="ruled-bg" />

      {/* Radial glow behind the logo */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -68%)',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, var(--color-gold) 0%, transparent 70%)',
          opacity: 0.06,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 480, padding: '0 24px' }}
      >
        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          {/* Logo animation */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <FolderSearchLogo size={88} animated={true} />
          </div>

          {/* Wordmark */}
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
            style={{
              fontFamily: SERIF,
              fontWeight: 600,
              fontSize: 44,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              color: T.ink,
              marginBottom: 12,
            }}
          >
            ur<span style={{ color: T.gold, fontStyle: 'italic' }}>O</span>rdo
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.70, duration: 0.4 }}
            style={{
              fontFamily: SERIF,
              fontSize: 20,
              fontWeight: 400,
              fontStyle: 'italic',
              color: T.muted,
              letterSpacing: '-0.01em',
              marginBottom: 20,
            }}
          >
            Order out of chaos, automatically.
          </motion.p>

          {/* Feature pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.82, duration: 0.4 }}
            style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}
          >
            {FEATURES.map(({ icon: Icon, label }) => (
              <span
                key={label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: MONO,
                  fontSize: 11,
                  color: T.muted,
                  background: T.paper2,
                  border: `1px solid ${T.rule}`,
                  borderRadius: 99,
                  padding: '4px 10px',
                }}
              >
                <Icon size={11} strokeWidth={1.75} />
                {label}
              </span>
            ))}
          </motion.div>
        </div>

        {/* ── Action card ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0  }}
          transition={{ delay: 0.9, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: T.paper2,
            border: `1px solid ${T.rule}`,
            borderRadius: 18,
            padding: '28px 28px 24px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Agreements */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <AgreementRow icon={Shield}>
              Everything runs <strong>locally by default</strong>. Your files never leave your
              computer unless you explicitly enable Smart Mode.
            </AgreementRow>
            <AgreementRow icon={Undo2}>
              You review every proposed move. Any operation can be fully rolled back from
              the History tab.
            </AgreementRow>
          </div>

          {/* ToS checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              cursor: 'pointer',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${T.rule}`,
              background: accepted ? 'var(--color-gold)15' : T.paper,
              marginBottom: 16,
              transition: 'background 0.2s',
            }}
          >
            {/* Custom checkbox */}
            <div
              style={{
                marginTop: 1,
                width: 16,
                height: 16,
                borderRadius: 5,
                border: `1.5px solid ${accepted ? T.gold : 'var(--color-ink-muted)'}`,
                background: accepted ? T.gold : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {accepted && <Check size={10} color="white" strokeWidth={3} />}
            </div>
            <input
              type="checkbox"
              style={{ display: 'none' }}
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
            />
            <span style={{ fontFamily: MONO, fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
              I have read and accept the{' '}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setTermsOpen(true); }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontFamily: MONO,
                  fontSize: 11,
                  color: T.ink,
                  textDecoration: 'underline',
                  textDecorationColor: T.rule,
                  cursor: 'pointer',
                }}
              >
                Terms of Service
              </button>
              .
            </span>
          </label>

          {/* CTA button */}
          <motion.button
            onClick={() => onComplete()}
            disabled={!accepted}
            whileHover={accepted ? { y: -1 } : {}}
            whileTap={accepted  ? { scale: 0.98 } : {}}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 12,
              border: 'none',
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: accepted ? 'pointer' : 'not-allowed',
              background: accepted ? T.ink : 'var(--color-paper-3)',
              color:      accepted ? T.paper : T.muted,
              boxShadow:  accepted ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            Enter urordo <ArrowRight size={14} />
          </motion.button>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.4 }}
          style={{
            textAlign: 'center',
            fontFamily: MONO,
            fontSize: 10,
            color: T.muted,
            opacity: 0.55,
            marginTop: 16,
          }}
        >
          urordo v0.0.1 · Windows · Local-first
        </motion.p>
      </motion.div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}

function AgreementRow({ icon: Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div
        style={{
          marginTop: 2,
          padding: 5,
          borderRadius: 7,
          border: `1px solid var(--color-rule)`,
          background: 'var(--color-paper)',
          flexShrink: 0,
        }}
      >
        <Icon size={11} strokeWidth={1.75} color="var(--color-ink-muted)" />
      </div>
      <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'var(--color-ink-2)', lineHeight: 1.65 }}>
        {children}
      </p>
    </div>
  );
}
