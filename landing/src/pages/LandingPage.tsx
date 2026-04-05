import { useEffect, useRef, useCallback, useState } from 'react';

const VERSION    = '0.0.1';
const DL_URL     = 'https://github.com/khalid-belahyane/urordo/releases/download/v0.0.1/urordo_0.0.1_x64-setup.exe';
const TRACKER    = 'https://urordo-tracker.belahyanekhalid.workers.dev/track';
const track = (variant: string) => {
  try {
    navigator.sendBeacon(TRACKER, JSON.stringify({ event: 'download_click', variant }));
  } catch { /* silent */ }
};

/* ── File data ────────────────────────────────────────────── */
const FILES = [
  { n:'invoice_may',    e:'pdf',  i:'📄', c:'tp-pdf', f:'Finance',   pc:'#c97060' },
  { n:'screenshot_001', e:'png',  i:'🖼', c:'tp-img', f:'Media',     pc:'#6090c0' },
  { n:'budget_2024',    e:'xlsx', i:'📊', c:'tp-xls', f:'Finance',   pc:'#60a070' },
  { n:'Steam',          e:'lnk',  i:'🔗', c:'tp-lnk', f:'Launchers', pc:'#8b2020' },
  { n:'README',         e:'md',   i:'📝', c:'tp-doc', f:'Docs',      pc:'#7080c0' },
  { n:'.git',           e:'',     i:'🌿', c:'tp-git', f:'Projects',  pc:'#9060b0' },
  { n:'photo_holiday',  e:'jpg',  i:'🖼', c:'tp-img', f:'Media',     pc:'#6090c0' },
  { n:'contract_2024',  e:'pdf',  i:'📄', c:'tp-pdf', f:'Docs',      pc:'#c97060' },
  { n:'VSCode',         e:'lnk',  i:'🔗', c:'tp-lnk', f:'Launchers', pc:'#8b2020' },
  { n:'App',            e:'jsx',  i:'⚡', c:'tp-cod', f:'Projects',  pc:'#40a0a0' },
  { n:'backup_old',     e:'zip',  i:'📦', c:'tp-zip', f:'Archives',  pc:'#b09040' },
  { n:'report_q3',      e:'docx', i:'📝', c:'tp-doc', f:'Docs',      pc:'#7080c0' },
  { n:'profile_pic',    e:'png',  i:'🖼', c:'tp-img', f:'Media',     pc:'#6090c0' },
  { n:'Chrome',         e:'lnk',  i:'🔗', c:'tp-lnk', f:'Launchers', pc:'#8b2020' },
  { n:'package',        e:'json', i:'⚡', c:'tp-cod', f:'Projects',  pc:'#40a0a0' },
  { n:'taxes_2023',     e:'pdf',  i:'📄', c:'tp-pdf', f:'Finance',   pc:'#c97060' },
  { n:'archive_2022',   e:'zip',  i:'📦', c:'tp-zip', f:'Archives',  pc:'#b09040' },
  { n:'notes',          e:'txt',  i:'📝', c:'tp-doc', f:'Docs',      pc:'#7080c0' },
  { n:'video_clip',     e:'mp4',  i:'🎬', c:'tp-img', f:'Media',     pc:'#6090c0' },
  { n:'requirements',   e:'txt',  i:'📝', c:'tp-doc', f:'Projects',  pc:'#40a0a0' },
  { n:'splash',         e:'png',  i:'🖼', c:'tp-img', f:'Media',     pc:'#6090c0' },
  { n:'Notion',         e:'lnk',  i:'🔗', c:'tp-lnk', f:'Launchers', pc:'#8b2020' },
  { n:'index',          e:'html', i:'⚡', c:'tp-cod', f:'Projects',  pc:'#40a0a0' },
  { n:'receipts',       e:'pdf',  i:'📄', c:'tp-pdf', f:'Finance',   pc:'#c97060' },
] as const;

const FDIRS = ['Finance', 'Media', 'Docs', 'Projects', 'Launchers', 'Archives'] as const;

const MILESTONES = [
  { at: 4,  title: 'Sorting…',        sub: 'Files finding their folders.' },
  { at: 10, title: 'Half organised.', sub: 'The chaos is retreating.'    },
  { at: 18, title: 'Almost there.',   sub: 'Just a few files left.'      },
  { at: 24, title: 'All done.',       sub: 'Everything in its place.'    },
];

/* ── Deterministic RNG (stable chip positions) ─────────────── */
let _s = 9371;
const rng = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };

type ModalType = 'terms' | 'privacy' | null;

interface ChipState {
  el: HTMLDivElement;
  x: number;
  y: number;
  rot: number;
  org: boolean;
  file: typeof FILES[number];
}
interface FolderState {
  el: HTMLDivElement;
  body: HTMLDivElement | null;
  cEl: HTMLElement | null;
  n: number;
}
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  r: number; col: string;
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const dotRef       = useRef<HTMLDivElement>(null);
  const ringRef      = useRef<HTMLDivElement>(null);
  const progRef      = useRef<HTMLDivElement>(null);
  const cvRef        = useRef<HTMLCanvasElement>(null);
  const lvFlashRef   = useRef<HTMLDivElement>(null);
  const lvTitleRef   = useRef<HTMLDivElement>(null);
  const lvSubRef     = useRef<HTMLDivElement>(null);
  const chipLayerRef = useRef<HTMLDivElement>(null);
  const folderLayerRef = useRef<HTMLDivElement>(null);
  const shBarFillRef = useRef<HTMLDivElement>(null);
  const shPctRef     = useRef<HTMLDivElement>(null);
  const shCountRef   = useRef<HTMLDivElement>(null);
  const sweeperRef   = useRef<HTMLDivElement>(null);
  const stageElRef   = useRef<HTMLElement>(null);

  const chipsRef   = useRef<ChipState[]>([]);
  const foldersRef = useRef<Record<string, FolderState>>({});
  const pxRef      = useRef<Particle[]>([]);
  const prevRef    = useRef(0);
  const lastMileRef = useRef(-1);
  const mxRef = useRef(-200);
  const myRef = useRef(-200);
  const rxRef = useRef(-200);
  const ryRef = useRef(-200);

  const [modal, setModal] = useState<ModalType>(null);

  const openModal = (type: ModalType) => (e: React.MouseEvent) => {
    e.preventDefault();
    setModal(type);
  };
  const closeModal = () => setModal(null);

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;

  /* ── Particle burst ──────────────────────────────────────── */
  const burst = useCallback((x: number, y: number, col: string, n = 8) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = .8 + Math.random() * 3;
      pxRef.current.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        life: 1, decay: .03 + Math.random() * .02,
        r: 1.5 + Math.random() * 2.5, col,
      });
    }
  }, []);

  /* ── Confirmation pop ────────────────────────────────────── */
  const pop = useCallback((x: number, y: number, t: string) => {
    const el = document.createElement('div');
    el.className = 'spop';
    el.textContent = t;
    el.style.left = (x - 16) + 'px';
    el.style.top  = (y - 8) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }, []);

  /* ── Progress HUD ────────────────────────────────────────── */
  const setHud = useCallback((org: number, total: number) => {
    const pct = org / total;
    if (shBarFillRef.current) shBarFillRef.current.style.width = (pct * 100) + '%';
    if (shPctRef.current)    shPctRef.current.textContent    = `${org} of ${total} files`;
    if (shCountRef.current)  shCountRef.current.textContent  = String(org);
  }, []);

  /* ── Milestone flash ─────────────────────────────────────── */
  const checkMilestone = useCallback((n: number) => {
    for (let i = MILESTONES.length - 1; i >= 0; i--) {
      if (n >= MILESTONES[i].at && i > lastMileRef.current) {
        lastMileRef.current = i;
        if (lvTitleRef.current) lvTitleRef.current.textContent = MILESTONES[i].title;
        if (lvSubRef.current)   lvSubRef.current.textContent   = MILESTONES[i].sub;
        if (lvFlashRef.current) {
          lvFlashRef.current.classList.remove('pop');
          void lvFlashRef.current.offsetWidth;
          lvFlashRef.current.classList.add('pop');
        }
        burst(vw() / 2, vh() / 2, '#8b6914', 20);
        burst(vw() / 2, vh() / 2, '#8c8474', 10);
        break;
      }
    }
  }, [burst]);

  /* ── Organise chip ───────────────────────────────────────── */
  const organise = useCallback((chip: ChipState) => {
    if (chip.org) return;
    chip.org = true;
    const fd = foldersRef.current[chip.file.f];
    if (!fd) return;
    if (!fd.el.classList.contains('show')) fd.el.classList.add('show');

    const chipRect   = chip.el.getBoundingClientRect();
    const folderRect = fd.el.getBoundingClientRect();
    const dx = (folderRect.left + folderRect.width  * .5) - (chipRect.left + chipRect.width  * .5);
    const dy = (folderRect.top  + folderRect.height * .5) - (chipRect.top  + chipRect.height * .5);

    chip.el.style.transition = 'opacity .45s cubic-bezier(.4,0,1,1), transform .58s cubic-bezier(.4,0,.2,1)';
    chip.el.style.transform  = `translate(${dx}px,${dy}px) scale(0.25) rotate(0deg)`;
    chip.el.style.opacity    = '0';

    const tag = document.createElement('div');
    tag.className   = 'ftag';
    tag.textContent = chip.file.n + (chip.file.e ? '.' + chip.file.e : '');
    fd.body?.appendChild(tag);
    setTimeout(() => tag.classList.add('show'), 100);

    fd.n++;
    if (fd.cEl) fd.cEl.textContent = String(fd.n);
    fd.el.classList.add('pulse');
    setTimeout(() => fd.el.classList.remove('pulse'), 600);

    burst(chipRect.left  + chipRect.width  / 2, chipRect.top  + chipRect.height / 2, chip.file.pc, 10);
    pop(folderRect.left + folderRect.width / 2, folderRect.top + 20, '✓');
  }, [burst, pop]);

  /* ── Disorganise chip (scroll back) ─────────────────────── */
  const disorganise = useCallback((chip: ChipState) => {
    if (!chip.org) return;
    chip.org = false;
    chip.el.style.transition = 'opacity .4s ease, transform .5s cubic-bezier(.34,1.3,.64,1)';
    chip.el.style.opacity    = '1';
    chip.el.style.transform  = `rotate(${chip.rot}deg)`;
    const fd = foldersRef.current[chip.file.f];
    if (!fd) return;
    if (fd.body?.lastElementChild) fd.body.lastElementChild.remove();
    fd.n = Math.max(0, fd.n - 1);
    if (fd.cEl) fd.cEl.textContent = String(fd.n);
    if (fd.n === 0) fd.el.classList.remove('show');
  }, []);

  /* ── Main useEffect ──────────────────────────────────────── */
  useEffect(() => {
    /* Cursor */
    const onMove = (e: MouseEvent) => { mxRef.current = e.clientX; myRef.current = e.clientY; };
    const onOver = (e: MouseEvent) => {
      const isInteractive = !!(e.target as HTMLElement).closest('a, button');
      dotRef.current?.classList.toggle('hovered', isInteractive);
      ringRef.current?.classList.toggle('hovered', isInteractive);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);

    let rafCursor: number;
    const loopCursor = () => {
      if (dotRef.current) {
        dotRef.current.style.left = mxRef.current + 'px';
        dotRef.current.style.top  = myRef.current + 'px';
      }
      rxRef.current += (mxRef.current - rxRef.current) * .12;
      ryRef.current += (myRef.current - ryRef.current) * .12;
      if (ringRef.current) {
        ringRef.current.style.left = rxRef.current + 'px';
        ringRef.current.style.top  = ryRef.current + 'px';
      }
      rafCursor = requestAnimationFrame(loopCursor);
    };
    rafCursor = requestAnimationFrame(loopCursor);

    /* Particle canvas */
    const canvas = cvRef.current!;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = vw(); canvas.height = vh(); };
    resize();
    window.addEventListener('resize', resize);
    let rafPx: number;
    const loopPx = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pxRef.current = pxRef.current.filter(p => p.life > 0);
      for (const p of pxRef.current) {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        p.x  += p.vx; p.y  += p.vy;
        p.vy += .08;
        p.life -= p.decay;
      }
      rafPx = requestAnimationFrame(loopPx);
    };
    rafPx = requestAnimationFrame(loopPx);

    /* Build chips */
    _s = 9371; // reset RNG for stable layout
    if (chipLayerRef.current) {
      chipLayerRef.current.innerHTML = '';
      chipsRef.current = [];
      FILES.forEach(file => {
        const el = document.createElement('div');
        el.className = `chip ${file.c}`;
        el.innerHTML = `<span class="chip-ico">${file.i}</span><span class="chip-name">${file.n}</span>${file.e ? `<span class="chip-ext">.${file.e}</span>` : ''}`;
        const x = vw() * (.5 + rng() * .38);
        const y = 80 + rng() * (vh() - 160);
        const rot = (rng() - .5) * 12;
        el.style.left      = x + 'px';
        el.style.top       = y + 'px';
        el.style.transform = `rotate(${rot}deg)`;
        chipLayerRef.current!.appendChild(el);
        chipsRef.current.push({ el, x, y, rot, org: false, file });
      });
    }

    /* Build folders */
    if (folderLayerRef.current) {
      folderLayerRef.current.innerHTML = '';
      foldersRef.current = {};
      const gap  = (vh() - 120) / FDIRS.length;
      FDIRS.forEach((name, i) => {
        const el  = document.createElement('div');
        el.className = 'folder';
        el.style.top = (80 + i * gap) + 'px';
        const tab  = document.createElement('div');
        tab.className = 'ftab';
        const tabL = document.createElement('div');
        tabL.className = 'ftab-l';
        const tabName = document.createElement('div');
        tabName.className = 'ftab-name';
        tabName.textContent = name;
        const tabN = document.createElement('div');
        tabN.className = 'ftab-n';
        tabN.textContent = '0';
        tabL.appendChild(tabName);
        tab.appendChild(tabL);
        tab.appendChild(tabN);
        const body = document.createElement('div');
        body.className = 'fbody';
        el.appendChild(tab);
        el.appendChild(body);
        folderLayerRef.current!.appendChild(el);
        foldersRef.current[name] = { el, body, cEl: tabN, n: 0 };
      });
    }

    /* Scroll handler */
    const onScroll = () => {
      const scrollY = window.scrollY;
      const stage = stageElRef.current;

      /* Progress bar */
      const docH = document.documentElement.scrollHeight - vh();
      if (progRef.current) progRef.current.style.width = (scrollY / docH * 100) + '%';

      if (!stage) return;
      const stageTop = stage.offsetTop;
      const stageH   = stage.offsetHeight - vh();
      const raw = (scrollY - stageTop) / stageH;
      const ratio = Math.max(0, Math.min(1, raw));

      /* Sweeper position */
      if (sweeperRef.current) {
        sweeperRef.current.style.left = ((1 - ratio) * 90 + 5) + '%';
      }

      const target = Math.round(ratio * FILES.length);
      const prev   = prevRef.current;

      if (target > prev) {
        for (let i = prev; i < target; i++) organise(chipsRef.current[i]);
        checkMilestone(target);
      } else if (target < prev) {
        for (let i = prev - 1; i >= target; i--) disorganise(chipsRef.current[i]);
        if (target < MILESTONES[lastMileRef.current]?.at) lastMileRef.current--;
      }
      prevRef.current = target;
      setHud(target, FILES.length);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    /* Intersection Observer for scroll reveals */
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('vi');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: .12 },
    );
    document.querySelectorAll('.rv, .rv-left').forEach(el => io.observe(el));

    /* Escape to close modal */
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafCursor);
      cancelAnimationFrame(rafPx);
      io.disconnect();
    };
  }, [organise, disorganise, checkMilestone, setHud]);

  /* ════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════ */
  return (
    <>
      {/* Custom cursor */}
      <div id="dot"  ref={dotRef}  />
      <div id="ring" ref={ringRef} />
      {/* Scroll progress */}
      <div id="prog" ref={progRef} />
      {/* Particle canvas */}
      <canvas id="cv" ref={cvRef} />
      {/* Milestone flash */}
      <div className="lv-flash" ref={lvFlashRef}>
        <div className="lv-flash-pre">urordo</div>
        <div className="lv-flash-title" ref={lvTitleRef}>Sorting…</div>
        <div className="lv-flash-sub"   ref={lvSubRef}>Files finding their folders.</div>
      </div>

      {/* ══ NAV ══ */}
      <nav>
        <a href="/" className="n-logo">ur<em>O</em>rdo</a>
        <ul className="n-links">
          <li><a href="#demo">See it work</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="#how">How</a></li>
          <li><a href="#who">Who</a></li>
        </ul>
        <a href={DL_URL} className="n-dl" download onClick={() => track('exe-nav')}>↓ Download</a>
      </nav>

      {/* ══ HERO ══ */}
      <section className="s-hero">
        <div className="hero-top">
          <div className="hero-stamp">v{VERSION} · Windows · Local-first</div>
        </div>
        <div className="hero-body">
          <h1 className="hero-h">
            Every<em>thing</em><br />
            in its <em>place.</em>
          </h1>
          <div className="hero-meta">
            <p className="hero-desc">
              A Windows file organiser that reads <em>meaning</em>, not just file extension.
              Every move is shown before it happens. Nothing is ever permanent.
            </p>
            <div className="hero-actions">
              <a className="btn-main" href={DL_URL} onClick={() => track('exe-hero')}>↓ Download free</a>
              <a className="btn-sec"  href="https://github.com/khalid-belahyane/urordo">GitHub →</a>
            </div>
          </div>
        </div>
        <div className="hero-scroll">
          <div className="scroll-mouse"><div className="scroll-dot" /></div>
          <span className="scroll-label">scroll</span>
        </div>
      </section>

      {/* ══ GAME STAGE ══ */}
      <section className="s-stage" id="demo" ref={stageElRef as React.RefObject<HTMLElement>}>
        <div className="sticky">
          <div className="stage-hd">
            <div className="shd-left">urordo is working…</div>
            <div className="shd-center">
              <div className="shd-bar">
                <div className="shd-bar-fill" ref={shBarFillRef} />
              </div>
              <div className="shd-pct" ref={shPctRef}>0 of {FILES.length} files</div>
            </div>
            <div className="shd-right">
              <div className="shd-count" ref={shCountRef}>0</div>
              <div className="shd-count-l">organised</div>
            </div>
          </div>

          <div className="z-label z-label-chaos"><div className="zdot" />before</div>
          <div className="z-label z-label-clean">after<div className="zdot" /></div>

          <div id="chips"   ref={chipLayerRef}   />
          <div id="folders" ref={folderLayerRef} />

          <div className="sweeper" ref={sweeperRef}>
            <div className="sw-label">organising your files</div>
            <div className="sw-logo">
              <span className="sw-arrow">←</span> ur<em>O</em>rdo
            </div>
          </div>
        </div>
      </section>

      {/* ══ AFTER SECTIONS ══ */}
      <div className="s-after">

        {/* ABOUT + RULES */}
        <section className="s-about" id="features">
          <div>
            <div className="about-label rv">What is urordo</div>
            <h2 className="about-h rv d1">
              A file organiser<br />
              that <em>understands</em><br />
              what it touches.
            </h2>
            <p className="about-body rv d2">
              urordo scans your Windows folders and proposes a sorted plan — grouping files by{' '}
              <em>meaning</em>, not just extension. Every move is shown to you before it happens.
            </p>
            <p className="about-body rv d3">
              It never moves shortcuts. It never touches git repos or project folders. And every
              single operation can be fully undone from the History screen.
            </p>
          </div>
          <div className="about-rules">
            <div className="rule-row rv">
              <div className="rn">I</div>
              <div>
                <div className="rt">Launchers are sacred</div>
                <div className="rd">
                  <code>.lnk</code> shortcuts are never moved. Moving one breaks the app it
                  points to — so urordo treats every shortcut as untouchable, always.
                </div>
              </div>
            </div>
            <div className="rule-row rv d1">
              <div className="rn">II</div>
              <div>
                <div className="rt">Projects are sacred</div>
                <div className="rd">
                  Folders containing <code>.git</code>, <code>package.json</code>,{' '}
                  <code>*.sln</code> or similar are detected and fully protected — never moved,
                  never flattened.
                </div>
              </div>
            </div>
            <div className="rule-row rv d2">
              <div className="rn">III</div>
              <div>
                <div className="rt">Context beats extension</div>
                <div className="rd">
                  <code>invoice_may_2024.pdf</code> goes to Finance — not to a folder called
                  "PDFs". urordo reads the filename, not just the extension.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="s-features">
          <div className="feat-intro">
            <h2 className="feat-h rv">
              Built to <em>never</em><br />
              surprise you.
            </h2>
            <p className="feat-note rv d1">
              Every design decision in urordo defaults to safety. Nothing moves without your
              approval. Nothing is permanent. Your setup stays intact.
            </p>
          </div>
          <div className="feat-list">
            {([
              { ico:'🔒', name:'Local-first',    tag:'Offline capable',  desc:'No account. No cloud. No subscription. Runs entirely on your machine — your files never leave your computer, even for Smart Mode classification.' },
              { ico:'👁',  name:'Review first',   tag:'Non-destructive',  desc:'urordo proposes every move and shows you the full plan before anything happens. You approve it. Then it runs. Not before.' },
              { ico:'↩',  name:'Full rollback',   tag:'Always undoable',  desc:'Every apply is written to a transaction log. Open History and undo any operation completely — instantly. Nothing is ever truly permanent.' },
              { ico:'🧠', name:'Smart Mode',      tag:'Optional AI',      desc:'When a file is ambiguous the rule engine passes it to Google Gemini for a second opinion. Opt-in, user-supplied API key, falls back silently if unavailable.' },
              { ico:'🌿', name:'Project-aware',   tag:'Project-safe',     desc:'Git repos, npm projects, Python environments, VS solutions — detected automatically and locked. Never moved, never touched.' },
              { ico:'🔗', name:'Launcher-safe',   tag:'Zero broken apps', desc:'Moving a .lnk shortcut silently breaks the app it points to. urordo recognises every shortcut and treats it as untouchable. Always.' },
            ] as const).map((feat, i) => (
              <div className="feat-item rv" key={feat.name} style={{ transitionDelay: `${i * .07}s` }}>
                <div className="fi-name"><span className="fi-ico">{feat.ico}</span>{feat.name}</div>
                <div className="fi-desc">{feat.desc}</div>
                <div className="fi-tag">{feat.tag}</div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="s-how" id="how">
          <div className="how-grid">
            <div>
              <div className="about-label rv">How it works</div>
              <h2 className="about-h rv d1">
                Three steps.<br /><em>Zero</em> surprises.
              </h2>
              <div className="how-steps">
                {([
                  { n:'01', t:'Select a folder', d:'Open urordo, pick any folder. It scans immediately — detecting and locking shortcuts, git repos, and project folders before anything else.' },
                  { n:'02', t:'Review the plan',  d:'Every proposed move is shown to you. You can approve, skip, or edit individual files. Nothing moves until you say so.' },
                  { n:'03', t:'Apply — or undo',  d:'One click runs the plan. Every move is logged. Open History at any time to roll back any operation, completely.' },
                ] as const).map((step, i) => (
                  <div className="how-step rv-left" key={step.n} style={{ transitionDelay: `${i * .1}s` }}>
                    <div className="hs-num">{step.n}</div>
                    <div>
                      <div className="hs-t">{step.t}</div>
                      <div className="hs-d">{step.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="how-terminal rv d2">
              <div className="ht-bar">
                <div className="ht-dot d-r" />
                <div className="ht-dot d-y" />
                <div className="ht-dot d-g" />
              </div>
              <div className="ht-body">
                <div className="hl"><span className="hl-p">›</span><span className="hl-c">urordo scan C:\Users\kb\Downloads</span></div>
                <div className="hl"><span className="hl-m">{'  // scanning 247 files…'}</span></div>
                <div className="hl"><span className="hl-g">{'  ✓ protected: .git (1 repo)'}</span></div>
                <div className="hl"><span className="hl-g">{'  ✓ protected: .lnk (14 shortcuts)'}</span></div>
                <div className="hl"><span className="hl-g">{'  ✓ protected: node_modules (3)'}</span></div>
                <div className="hl" style={{ marginTop: 8 }}><span className="hl-p">›</span><span className="hl-c">Review Queue — 18 proposed moves</span></div>
                <div className="hl"><span className="hl-c">{'  invoice_may.pdf'}</span><span className="hl-g">{'  → Finance/'}</span></div>
                <div className="hl"><span className="hl-c">{'  photo_holiday.jpg'}</span><span className="hl-g">{'  → Media/'}</span></div>
                <div className="hl"><span className="hl-c">{'  contract_2024.pdf'}</span><span className="hl-g">{'  → Docs/'}</span></div>
                <div className="hl"><span className="hl-y">{'  report.docx'}</span><span className="hl-y">{'  ⚠ ambiguous'}</span></div>
                <div className="hl" style={{ marginTop: 8 }}><span className="hl-p">›</span><span className="hl-c">apply --confirm</span></div>
                <div className="hl"><span className="hl-g">{'  ✓ 17 files moved'}</span></div>
                <div className="hl"><span className="hl-g">{'  ✓ 0 shortcuts touched'}</span></div>
                <div className="hl"><span className="hl-g">{'  ✓ 0 projects modified'}</span></div>
                <div className="hl"><span className="hl-m">{'  // rollback available in History'}</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* WHO IS IT FOR */}
        <section className="s-who" id="who">
          <div className="who-intro">
            <div>
              <div className="about-label rv">Who is it for</div>
              <h2 className="who-h rv d1">
                Anyone who's lost<br />a file in their<br /><em>own machine.</em>
              </h2>
            </div>
            <p className="who-note rv d2">
              urordo doesn't need you to already be organised. It meets you where you are —
              Downloads stuffed with random files, Desktop buried under clutter — and proposes
              exactly where everything should go. Nothing moves until you approve it.
            </p>
          </div>
          <div className="who-grid">
            {([
              {
                role: 'Developer', emoji: '⚡',
                name: <>The coder with a<br /><em>broken</em> Downloads.</>,
                desc: 'Your Downloads folder has four old Node installers, twelve test builds, a random .iso and a PDF you downloaded once. urordo detects every .git repo and package.json folder and locks them before touching anything else.',
                before: 'node-v20.11.0-x64.msi',
                after:  'Archives/Installers/',
              },
              {
                role: 'Student', emoji: '📚',
                name: <>The student buried in<br /><em>lecture notes.</em></>,
                desc: 'Lecture slides, assignments, research papers and random screenshots in one flat folder. Smart Mode reads filename context — CS301_week4_notes.pdf lands in the right course folder automatically.',
                before: 'CS301_week4_notes.pdf',
                after:  'University/CS301/',
              },
              {
                role: 'Creative', emoji: '🎨',
                name: <>The designer with<br />four open <em>Desktops.</em></>,
                desc: 'Client briefs, stock assets, exported PSDs, raw photos and half-finished mockups scattered everywhere. urordo groups by project context — not just file type — so every export lands next to the project it belongs to.',
                before: 'client_logo_v3_FINAL.png',
                after:  'Projects/ClientName/',
              },
              {
                role: 'Professional', emoji: '📄',
                name: <>The one with a<br />paperwork <em>pile.</em></>,
                desc: 'Invoices, contracts, tax forms and reports accumulating in Downloads since 2021. urordo reads the filename, not just the extension — invoice_may_2024.pdf goes to Finance, not a generic PDFs folder.',
                before: 'invoice_may_2024.pdf',
                after:  'Finance/2024/',
              },
            ] as const).map((p, i) => (
              <div className="who-card rv" key={p.role} style={{ transitionDelay: `${i * .08}s` }}>
                <div className="wc-role"><span className="wc-ico">{p.emoji}</span>{p.role}</div>
                <div className="wc-name">{p.name}</div>
                <p className="wc-desc">{p.desc}</p>
                <div className="wc-example">
                  <span className="wc-ex-b">before → {p.before}</span>
                  <span className="wc-ex-a">after&nbsp;&nbsp;→ {p.after}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SUPPORT URORDO */}
        <section className="s-support" id="support">
          <div className="support-kintsugi">
            <div className="kin-glow kin-1" />
            <div className="kin-glow kin-2" />
            <div className="kin-glow kin-3" />
          </div>
          <div className="support-content">
            <div className="support-eyebrow rv">Support urordo's local-first future</div>
            <h2 className="support-h rv d1">Help keep urordo fast,<br />private, and <em>independent.</em></h2>
            <p className="support-body rv d2">
              urordo is built for people who want private, local-first software that simply works. If it made your folders feel calmer or saved you time, your support helps me keep building it.
            </p>
            <div className="support-actions rv d3">
              <a className="btn-main kin-btn" href="https://ko-fi.com/urordo" target="_blank" rel="noreferrer">
                Support urordo
              </a>
              <a className="btn-sec" href="#download">Keep using urordo</a>
            </div>
            <p className="support-trust rv d4">Optional, appreciated, never expected.</p>
          </div>
        </section>

        {/* CTA */}
        <section className="s-cta" id="download">
          <div className="cta-pre rv">ready?</div>
          <h2 className="cta-h rv d1">Your files,<br /><em>finally</em> tidy.</h2>
          <p className="cta-sub rv d2">Free download. No account. Works offline. Windows only for now.</p>
          <a className="cta-btn rv d3" href={DL_URL} onClick={() => track('exe-cta')}>↓ Download urordo v{VERSION}</a>
          <p className="cta-meta rv d4">Windows · Free · Open source · No account required</p>
        </section>

        <footer>
          <div>
            <div className="ft-l">ur<em>O</em>rdo</div>
            <div className="ft-tag">Everything in its place. Automatically.</div>
            <div className="ft-copy" style={{ fontSize: '9px', color: 'var(--surface-dark-faint)', marginTop: '12px', letterSpacing: '.04em' }}>
              &copy; {new Date().getFullYear()} Khalid Belahyane. All rights reserved.
            </div>
          </div>
          <ul className="ft-links">
            <li><a href="https://github.com/khalid-belahyane/urordo">GitHub</a></li>
            <li><a href="#" onClick={openModal('privacy')}>Privacy</a></li>
            <li><a href="#" onClick={openModal('terms')}>Terms</a></li>
          </ul>
          <div className="ft-ver">v{VERSION} · local-first</div>
        </footer>

      </div>{/* end .s-after */}

      {/* ══ MODALS ══ */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal} aria-label="Close">×</button>
            <div className="modal-inner">
              {modal === 'terms'   && <TermsContent   />}
              {modal === 'privacy' && <PrivacyContent />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   TERMS OF SERVICE
   ════════════════════════════════════════════════════════════ */
function TermsContent() {
  return (
    <>
      <div className="modal-kicker">Legal</div>
      <h2 className="modal-title">Terms of Service</h2>
      <div className="modal-date">Last updated: April 2026</div>

      <div className="modal-section">
        <h3 className="modal-sh">1. Acceptance of Terms</h3>
        <p className="modal-p">
          By downloading, installing, or using urordo ("the Software"), you agree to be bound by
          these Terms of Service. If you do not agree to these terms, do not use the Software.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">2. License</h3>
        <p className="modal-p">
          urordo is provided as free software. You are granted a non-exclusive, non-transferable
          licence to use the Software on Windows devices you own or control, for personal or
          commercial purposes, subject to the conditions below.
        </p>
        <p className="modal-p">
          You may not sell, relicense, or distribute the Software as a standalone paid product
          without express written permission from the author. Modifications for personal use are
          permitted and encouraged. Redistribution of unmodified binaries must preserve all
          existing notices.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">3. Your Files & Data</h3>
        <p className="modal-p">
          urordo operates <em>entirely on your local machine</em>. It does not transmit, upload,
          or store your files, filenames, or folder structure to any remote server by default. The
          Smart Mode feature may send filenames to Google Gemini for classification only if you
          explicitly opt in and supply your own API key. You are solely responsible for any costs
          or implications of your use of third-party APIs.
        </p>
        <p className="modal-p">
          You are solely responsible for maintaining backups of your data before using this
          Software. While urordo logs every file operation and provides full rollback capability,
          it is your responsibility to verify that rollbacks complete successfully. The author
          accepts no liability for any data loss, however caused.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">4. No Warranty</h3>
        <p className="modal-p">
          THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
          INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, AND NON-INFRINGEMENT. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF
          THE SOFTWARE IS WITH YOU.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">5. Limitation of Liability</h3>
        <p className="modal-p">
          IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
          EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF
          PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT OF THE USE OF OR INABILITY TO USE THIS
          SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">6. Updates & Changes</h3>
        <p className="modal-p">
          We reserve the right to update these terms at any time. Continued use of the Software
          after changes constitutes acceptance of the revised terms. We will update the revision
          date at the top of this document.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">7. Contact</h3>
        <p className="modal-p">
          Questions about these terms can be directed via the{' '}
          <a className="modal-link" href="https://github.com/khalid-belahyane/urordo">GitHub repository</a>.
        </p>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   PRIVACY POLICY
   ════════════════════════════════════════════════════════════ */
function PrivacyContent() {
  return (
    <>
      <div className="modal-kicker">Legal</div>
      <h2 className="modal-title">Privacy Policy</h2>
      <div className="modal-date">Last updated: April 2026</div>

      <div className="modal-section">
        <h3 className="modal-sh">We collect nothing.</h3>
        <p className="modal-p">
          urordo is a <em>local-first</em> application. It has no servers, no analytics, no
          telemetry, and no account system. Everything it does happens on your machine.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">What stays local</h3>
        <p className="modal-p">
          Your filenames, folder structure, organisation history, settings, and all configuration
          are stored only in a local SQLite database on your device at a standard Windows app-data
          path. This data never leaves your computer unless you explicitly share it.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">Smart Mode (optional, fully opt-in)</h3>
        <p className="modal-p">
          If you choose to enable Smart Mode and provide your own Google Gemini API key, ambiguous
          filenames may be sent to Google's Gemini API for classification. This is entirely opt-in,
          requires your own API key, and is governed by{' '}
          <a className="modal-link" href="https://policies.google.com/privacy">
            Google's Privacy Policy
          </a>. urordo never stores or logs these API calls itself. You can disable Smart Mode
          at any time from the Settings screen.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">This website</h3>
        <p className="modal-p">
          This landing page uses standard server access logs (provided by our hosting provider)
          to understand visitor traffic. No third-party tracking scripts, cookies, advertising
          networks, or fingerprinting techniques are used on this website.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">Auto-updates</h3>
        <p className="modal-p">
          When auto-updates are enabled (opt-in), the app may contact our update server to check
          for newer versions. This check sends your current app version and platform. No personal
          data, filenames, or usage information is included.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">Children's privacy</h3>
        <p className="modal-p">
          urordo is not directed at children under 13. We do not knowingly collect any information
          from children. If you believe a child has provided information through this service,
          please contact us via GitHub.
        </p>
      </div>

      <div className="modal-section">
        <h3 className="modal-sh">Contact</h3>
        <p className="modal-p">
          Privacy questions can be raised via the{' '}
          <a className="modal-link" href="https://github.com/khalid-belahyane/urordo">GitHub repository</a>.
        </p>
      </div>
    </>
  );
}
