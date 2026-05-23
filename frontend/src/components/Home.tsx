import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import affil1 from '../assets/Brown_logo.png';
import affil2 from '../assets/Legoretta.png';
import affil3 from '../assets/WarrenAlpert_logo.png';
import LLMTestButton from './LLMTestButton';

// --- Parallax helpers -------------------------------------------------------
function useScrollHue(base = 230, span = 180) {
  const [hue, setHue] = useState(base);
  useEffect(() => {
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const t = Math.min(1, Math.max(0, window.scrollY / max));
      setHue(base + span * t); // smoothly rotate hue as you scroll
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [base, span]);
  return hue;
}

function ParallaxLayer({ speed = 0.15, className = '', children }: { speed?: number; className?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY * speed;
      if (ref.current) ref.current.style.transform = `translate3d(0, ${y}px, 0)`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [speed]);
  return (
    <div ref={ref} className={className} aria-hidden>
      {children}
    </div>
  );
}

// --- Section-scoped network background -------------------------------------
function SectionNetworkBackground({ hue = 260, density = 0.0002 }: { hue?: number; density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number }>>([]);
  const hueRef = useRef(hue);
  hueRef.current = hue;
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);

  const spawn = (w: number, h: number) => {
    const speed = 0.3 + Math.random() * 0.7;
    const angle = Math.random() * Math.PI * 2;
    return { x: Math.random() * w, y: Math.random() * h, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const parent = canvas.parentElement as HTMLElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeToParent = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: rect.width, h: rect.height };

      const target = Math.floor(rect.width * rect.height * density);
      const arr = particlesRef.current;
      while (arr.length < target) arr.push(spawn(rect.width, rect.height));
      while (arr.length > target) arr.pop();
    };

    const ro = new ResizeObserver(resizeToParent);
    ro.observe(parent);
    resizeToParent();

    const step = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);

      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.05, w / 2, h / 2, Math.max(w, h));
      g.addColorStop(0, `hsla(${hueRef.current}, 75%, 8%, 0.25)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const nodes = particlesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -50) p.x = w + 50;
        if (p.x > w + 50) p.x = -50;
        if (p.y < -50) p.y = h + 50;
        if (p.y > h + 50) p.y = -50;
      }

      const maxDist = Math.min(160, Math.max(100, Math.min(w, h) * 0.22));
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]; const b = nodes[j];
          const dx = a.x - b.x; const dy = a.y - b.y; const d2 = dx * dx + dy * dy;
          if (d2 < maxDist * maxDist) {
            const alpha = 1 - Math.sqrt(d2) / maxDist;
            ctx.strokeStyle = `hsla(${hueRef.current}, 95%, 72%, ${alpha * 0.35})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        ctx.fillStyle = `hsla(${hueRef.current}, 95%, 82%, 0.55)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill();
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [density]);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 -z-10 h-full w-full pointer-events-none" role="img" aria-label="Animated network background" />
  );
}

// --- Mini previews for cards (force graph / heatmap / motif chart) ---------
function ForceGraphPreview({ hue }: { hue: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef<number | null>(null);
  const t = useRef(0);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const parent = canvas.parentElement as HTMLElement;
    const resize = () => {
      const r = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(160 * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `160px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(parent);
    const nodes = Array.from({ length: 18 }).map((_, i) => ({ angle: (i / 18) * Math.PI * 2, r: 55 + (i % 3) * 10 }));
    const draw = () => {
      t.current += 0.01;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = (canvas.width / dpr) | 0; const h = 160;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const ax = cx + Math.cos(a.angle + t.current * 0.6) * a.r;
          const ay = cy + Math.sin(a.angle + t.current * 0.6) * a.r;
          const bx = cx + Math.cos(b.angle + t.current * 0.6) * b.r;
          const by = cy + Math.sin(b.angle + t.current * 0.6) * b.r;
          const dx = ax - bx, dy = ay - by; const d2 = dx * dx + dy * dy; const max = 120;
          if (d2 < max * max) {
            const alpha = 1 - Math.sqrt(d2) / max;
            ctx.strokeStyle = `hsla(${hue}, 90%, 70%, ${alpha * 0.35})`;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          }
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const x = cx + Math.cos(n.angle + t.current * 0.6) * n.r;
        const y = cy + Math.sin(n.angle + t.current * 0.6) * n.r;
        ctx.fillStyle = `hsla(${hue}, 100%, 85%, 0.8)`;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); ro.disconnect(); };
  }, [hue]);
  return <canvas ref={ref} className="mt-4 w-full rounded-xl border border-white/10 bg-slate-900/40" />;
}

function HeatmapPreview({ hue = 200 }: { hue?: number }) {
  const rows = 7, cols = 14;
  const data = useMemo(() => Array.from({ length: rows * cols }, (_, i) => (Math.sin(i * 0.9) + Math.random() * 0.6 + 1) / 2), []);
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/40 p-2">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {data.map((v, i) => (
          <div key={i} className="h-4 rounded-[2px] transition" style={{ backgroundColor: `hsl(${hue + v * 60}, 90%, ${30 + v * 40}%)` }} />
        ))}
      </div>
    </div>
  );
}

function MotifChartPreview({ hue }: { hue: number }) {
  const data = [
    { k: 'Triangle', v: 32 },
    { k: 'Chain', v: 54 },
    { k: 'Star', v: 21 },
    { k: 'Square', v: 12 },
  ];
  const max = Math.max(...data.map((d) => d.v));
  const width = 360, height = 160, pad = 30, bw = (width - pad * 2) / data.length - 10;
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/40 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
        {data.map((d, i) => {
          const x = pad + i * (bw + 10);
          const h = Math.max(4, (d.v / max) * (height - pad * 2));
          const y = height - pad - h;
          return (
            <g key={i}>
              <motion.rect
                initial={{ height: 0, y: height - pad }}
                animate={{ height: h, y }}
                transition={{ type: 'spring', stiffness: 180, damping: 20, delay: i * 0.05 }}
                x={x}
                width={bw}
                rx={8}
                fill={`hsl(${hue + 20}, 90%, 65%)`}
              />
              <text x={x + bw / 2} y={height - 10} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.7)">{d.k}</text>
            </g>
          );
        })}
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="rgba(255,255,255,.15)" />
      </svg>
    </div>
  );
}

// --- Stripe-style interactive blocks --------------------------------------
function TiltCard({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--rx', String(-y * 8));
      el.style.setProperty('--ry', String(x * 10));
    };
    const onLeave = () => { el.style.setProperty('--rx', '0'); el.style.setProperty('--ry', '0'); };
    el.addEventListener('mousemove', onMove); el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, []);
  return (
    <motion.div
      ref={ref}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      style={{ transform: 'perspective(1000px) rotateX(var(--rx)) rotateY(var(--ry))' }}
      className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur shadow-sm will-change-transform"
    >
      {subtitle && <div className="text-xs uppercase tracking-wide text-white/60">{subtitle}</div>}
      <div className="mt-1 text-lg font-semibold">{title}</div>
      <div className="mt-4 text-sm text-slate-300">{children}</div>
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10 group-hover:ring-white/20" />
    </motion.div>
  );
}

function ScrollShowcase({ hue }: { hue: number }) {
  const steps = [
    { title: 'Ingest & Validate', desc: 'Upload TSV/CSV networks. We validate, de-duplicate edges, and infer direction/weights when missing.' },
    { title: 'Cluster & Annotate', desc: 'Run Louvain/Leiden, compute centralities, and map GO/Reactome terms for context.' },
    { title: 'Explain & Simulate', desc: 'RAG-driven summaries, graphlet stats, and \'what-if\' perturbations to test hypotheses.' },
  ];
  const itemRefs = useRef<HTMLDivElement[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const idx = Number((e.target as HTMLElement).dataset.index);
          if (e.isIntersecting) setActive(idx);
        });
      },
      { root: null, rootMargin: '-40% 0px -40% 0px', threshold: 0.1 }
    );
    itemRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-7xl px-4 md:grid md:grid-cols-12 md:gap-8">
        <div className="md:col-span-5">
          {steps.map((s, i) => (
            <div
              key={i}
              data-index={i}
              ref={(el) => { if (el) itemRefs.current[i] = el; }}
              className="min-h-[70vh] flex items-center"
            >
              <div>
                <div className="text-sm text-white/60">Step {i + 1}</div>
                <h3 className="mt-2 text-2xl font-bold">{s.title}</h3>
                <p className="mt-2 text-slate-300">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="md:col-span-7 md:sticky md:top-28 h-[60vh]">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative h-full rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
          >
            <div className="text-sm text-white/60">Preview</div>
            <div className="mt-2 text-xl font-semibold">{steps[active].title}</div>
            <div className="mt-4 h-[70%] rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent" style={{ boxShadow: `0 30px 80px -40px hsla(${hue},100%,60%,0.3)` }} />
            <p className="mt-3 text-slate-300">{steps[active].desc}</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// --- Chips / badges --------------------------------------------------------- ---------------------------------------------------------
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
      {children}
    </div>
  );
}

// --- Main -------------------------------------------------------------------
export default function Home() {
  const navigate = useNavigate();
  const hue = useScrollHue(220, 200);

  // (replaced) basic features grid removed

  const stats = useMemo(
    () => [
      { label: 'Networks Processed', value: '10k+' },
      { label: 'Genes Indexed', value: '20k+' },
      { label: 'Interactions', value: '5M+' },
    ],
    []
  );

  return (
    <div className="relative min-h-screen overflow-x-clip bg-slate-950 text-slate-100" style={{ ['--accent-hue' as any]: hue }}>
      {/* Animated background */}
      {/* Parallax glow layers */}
      <ParallaxLayer speed={0.05} className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-120px] h-[600px] w-[1000px] -translate-x-1/2 rounded-full blur-3xl opacity-30"
             style={{ background: `radial-gradient(60% 60% at 50% 40%, hsla(${hue}, 100%, 65%, .45), transparent 70%)` }}
        />
      </ParallaxLayer>
      <ParallaxLayer speed={0.12} className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-[-200px] top-[40%] h-[500px] w-[500px] rounded-full blur-3xl opacity-20"
             style={{ background: `radial-gradient(60% 60% at 50% 50%, hsla(${hue + 40}, 100%, 70%, .55), transparent 70%)` }}
        />
      </ParallaxLayer>

      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg"
                 style={{ background: `linear-gradient(135deg, hsla(${hue},100%,65%,1), hsla(${hue + 60},100%,65%,1))` }} />
            <span className="text-lg font-bold">NetCancer Insight</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/program')}
              className="inline-flex items-center rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 transition"
            >
              Open App
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <SectionNetworkBackground hue={hue} />
        <div className="mx-auto max-w-7xl px-4 pt-20 pb-16">
          <div className="max-w-3xl">
            <Pill>Powerful network analysis for oncology</Pill>
            <h1 className="mt-5 text-5xl font-extrabold leading-tight tracking-tight">
              Analyze. Cluster. Interpret.
              <span
                className="block bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(90deg, hsla(${hue},100%,70%,1), hsla(${hue + 60},100%,70%,1))` }}
              >
                Cancer networks at scale
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-slate-300">
              Upload your interaction network, run state-of-the-art clustering, overlay expression data, and explore graphlets—everything in a clean, interactive interface.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <button
                onClick={() => navigate('/program')}
                className="inline-flex items-center rounded-xl px-5 py-3 font-medium text-slate-900 shadow-sm transition"
                style={{ background: `linear-gradient(90deg, hsla(${hue},100%,70%,1), hsla(${hue + 60},100%,70%,1))` }}
              >
                Start Analysis
              </button>
              <button
                onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-white hover:bg-white/10 transition"
              >
                Learn More
              </button>
            </div>
            <div className="mt-8">
              <LLMTestButton />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stats.map((s, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center shadow-sm backdrop-blur">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-sm text-slate-300">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="bg-slate-950/40 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-3xl font-bold">Interactive highlights</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-slate-300">Live, tactile surfaces that mirror how researchers actually work—no stock icons.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <TiltCard title="Live Force Graph" subtitle="Real-time">
              <ForceGraphPreview hue={hue} />
              <p className="mt-3">Drag nodes, pin communities, and stream updates as files load. Keyboard shortcuts and lasso select included.</p>
            </TiltCard>
            <TiltCard title="Expression Overlays" subtitle="Multi-sample">
              <HeatmapPreview hue={hue} />
              <p className="mt-3">Swap heatmaps/thresholds, annotate differentially expressed genes, and preview cohort filters in place.</p>
            </TiltCard>
            <TiltCard title="Graphlet Insights" subtitle="Structure-aware">
              <MotifChartPreview hue={hue} />
              <p className="mt-3">Graphlet counts, separation score, and motif hotspots with click-through to evidence and literature.</p>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <ScrollShowcase hue={hue} />

      {/* Affiliations */}
      <section className="py-14">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold">Affiliations</h2>
          <div className="flex flex-wrap items-center justify-center gap-12 opacity-90 [filter:drop-shadow(0_8px_30px_rgba(0,0,0,0.25))]">
            <img src={affil1} alt="Affiliation 1" className="h-[80px] w-[220px] object-contain opacity-80 transition hover:opacity-100" />
            <img src={affil2} alt="Affiliation 2" className="h-[80px] w-[220px] object-contain opacity-80 transition hover:opacity-100" />
            <img src={affil3} alt="Affiliation 3" className="h-[80px] w-[220px] object-contain opacity-80 transition hover:opacity-100" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-slate-950/60 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h3 className="text-3xl font-bold">Ready to explore your network?</h3>
          <p className="mt-2 text-white/80">Upload data and discover structure and insights instantly.</p>
          <button
            onClick={() => navigate('/program')}
            className="mt-6 inline-flex items-center rounded-xl bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/15"
            style={{ boxShadow: `0 10px 30px -10px hsla(${hue},100%,60%,0.5)` }}
          >
            Start Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950/70">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-2">
              <div
                className="h-8 w-8 rounded-md"
                style={{ background: `linear-gradient(135deg, hsla(${hue},100%,65%,1), hsla(${hue + 60},100%,65%,1))` }}
              />
              <span className="font-semibold">NetCancer Insight</span>
            </div>
            <div className="text-sm text-slate-400">© {new Date().getFullYear()} NetCancer Insight. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
