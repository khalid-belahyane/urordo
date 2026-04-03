import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const MONO  = '"DM Mono", monospace';
const SERIF = '"Cormorant Garamond", Georgia, serif';

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By installing or using urordo ("the Software"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not install or use the Software. These Terms constitute a legally binding agreement between you ("User") and the developers of urordo ("we", "us", "our").`,
  },
  {
    title: '2. Description of Service',
    body: `urordo is a local-first file organisation tool for Windows. It scans, classifies, and proposes reorganisation of files stored on your local computer. The Software operates entirely on your device by default. No file content is transmitted to any external server unless you explicitly enable Smart Mode and provide your own API credentials.`,
  },
  {
    title: '3. License Grant',
    body: `Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, revocable licence to install and use the Software solely for your personal or internal business purposes. You may not sublicense, sell, resell, transfer, assign, or otherwise commercially exploit the Software.`,
  },
  {
    title: '4. User Responsibilities',
    body: `You are solely responsible for:\n\n• All files and data processed by the Software on your device.\n• Maintaining adequate backups of your data before using any file organisation or move operation.\n• Ensuring that the use of the Software complies with all applicable local, national, and international laws and regulations.\n• Any consequences arising from file operations you authorise within the Software, including moves, renames, or reorganisations.\n\nThe Software provides a full rollback mechanism. It is your responsibility to use it if needed.`,
  },
  {
    title: '5. Data Privacy',
    body: `urordo is designed to be privacy-first:\n\n• All file scanning and organisation runs entirely on your local machine.\n• No file names, file contents, directory structures, or personal data are transmitted to our servers at any time during normal operation.\n• If you enable Smart Mode and configure an AI API key (e.g. Google Gemini), file metadata may be sent to the respective third-party API provider under their own privacy policy. We have no control over third-party services and are not responsible for their data handling.\n• We do not collect telemetry, analytics, or crash reports unless you explicitly opt in to a future opt-in programme.`,
  },
  {
    title: '6. Intellectual Property',
    body: `The Software, including all code, design, graphics, brand assets (the FolderSearch logo mark, wordmark, and visual identity), and documentation, is the exclusive intellectual property of the developers of urordo and is protected by applicable copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, reverse-engineer, decompile, or create derivative works based on the Software or its brand assets without prior written permission.`,
  },
  {
    title: '7. Disclaimer of Warranties',
    body: `THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.\n\nWE DO NOT WARRANT THAT:\n• The Software will be error-free or uninterrupted.\n• The Software will be compatible with all hardware or software configurations.\n• Any file operations performed by the Software will produce the results you expect.\n• The Software will prevent data loss.\n\nYou assume all risk associated with the use of the Software and any file operations it performs on your system.`,
  },
  {
    title: '8. Limitation of Liability',
    body: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE DEVELOPERS OF URORDO, THEIR AFFILIATES, LICENSORS, EMPLOYEES, AGENTS, OFFICERS, OR DIRECTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO:\n\n• Loss of data, files, or directories.\n• Business interruption or loss of profits.\n• Loss of goodwill.\n• Personal injury.\n\nARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SOFTWARE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.\n\nOUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS SHALL NOT EXCEED USD $10.00.`,
  },
  {
    title: '9. Indemnification',
    body: `You agree to indemnify, defend, and hold harmless the developers of urordo and their respective officers, directors, employees, contractors, agents, licensors, and suppliers from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms or your use of the Software.`,
  },
  {
    title: '10. Updates and Changes',
    body: `We reserve the right to modify, update, or discontinue the Software or these Terms at any time without prior notice. Continued use of the Software after any such changes constitutes your acceptance of the new Terms.`,
  },
  {
    title: '11. Termination',
    body: `These Terms are effective until terminated. Your rights under these Terms will terminate automatically and without notice if you fail to comply with any of their terms. Upon termination, you must cease all use of the Software and delete all copies from your devices.`,
  },
  {
    title: '12. Governing Law',
    body: `These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising under or in connection with these Terms shall be resolved exclusively through binding arbitration or in the competent courts of the jurisdiction in which the primary developer resides.`,
  },
  {
    title: '13. Entire Agreement',
    body: `These Terms constitute the entire agreement between you and the developers of urordo regarding the Software and supersede all prior agreements. If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.`,
  },
  {
    title: '14. Contact',
    body: `If you have any questions about these Terms, please contact us through the official urordo project channels.`,
  },
];

/**
 * TermsModal — renders as a right-side drawer sheet.
 * Slides in from the right edge, full viewport height.
 * Dismissible via X button, backdrop click, or Escape key.
 */
export function TermsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Subtle backdrop — doesn't black out the page, just dims it */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.30)',
              zIndex: 8000,
              backdropFilter: 'blur(1px)',
              WebkitBackdropFilter: 'blur(1px)',
            }}
          />

          {/* Right-side drawer panel */}
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Terms of Service"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              maxWidth: 480,
              zIndex: 8001,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-paper)',
              borderLeft: '1px solid var(--color-rule)',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 20px 14px',
                borderBottom: '1px solid var(--color-rule)',
                flexShrink: 0,
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 600,
                    fontSize: 20,
                    color: 'var(--color-ink)',
                    letterSpacing: '-0.01em',
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  Terms of Service
                </h2>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: 'var(--color-ink-muted)',
                    marginTop: 3,
                  }}
                >
                  urordo · Last updated April 2026
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close terms of service"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: '1px solid var(--color-rule)',
                  background: 'var(--color-paper-2)',
                  color: 'var(--color-ink-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>

            {/* Scrollable content */}
            <div
              style={{
                overflowY: 'auto',
                padding: '18px 20px 32px',
                flex: 1,
              }}
            >
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: 'var(--color-ink-muted)',
                  lineHeight: 1.7,
                  marginBottom: 22,
                  padding: '11px 13px',
                  background: 'var(--color-paper-2)',
                  borderRadius: 9,
                  border: '1px solid var(--color-rule)',
                }}
              >
                Please read these Terms carefully before using urordo. By using this software you agree to be bound by these terms.
              </p>

              {SECTIONS.map((section) => (
                <div key={section.title} style={{ marginBottom: 20 }}>
                  <h3
                    style={{
                      fontFamily: SERIF,
                      fontWeight: 600,
                      fontSize: 14,
                      color: 'var(--color-ink)',
                      marginBottom: 5,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {section.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: 'var(--color-ink-2)',
                      lineHeight: 1.75,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {section.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--color-rule)',
                flexShrink: 0,
                background: 'var(--color-paper-2)',
              }}
            >
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  padding: '9px 20px',
                  borderRadius: 9,
                  border: 'none',
                  background: 'var(--color-ink)',
                  color: 'var(--color-paper)',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
