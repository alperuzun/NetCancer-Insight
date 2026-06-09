import React from 'react';

/**
 * The NetCancer Insight brand mark.
 *
 * `BrandGlyph` is the bare white hub-motif glyph — a central hub gene wired to
 * its interacting partners, with one partner ringed as a flagged
 * "gene-of-interest" (a nod to *Insight*) — the literal object the app
 * analyzes. `BrandMark` wraps it in the gradient square and optionally pairs it
 * with the wordmark. This is the single source of the logo: use it everywhere
 * the brand mark appears (app sidebar, marketing nav, footer).
 */

const DEFAULT_GRADIENT = 'linear-gradient(135deg, #a855f7, #818cf8)';
const DEFAULT_GLOW = '0 10px 30px -10px rgba(168,85,247,0.5)';

interface BrandGlyphProps {
  size?: number;
  /** Fill for the ringed "gene-of-interest" node — should read as a hole on the gradient. */
  ringFill?: string;
  style?: React.CSSProperties;
}

export function BrandGlyph({ size = 24, ringFill = '#0d0b17', style }: BrandGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NetCancer Insight"
      style={{ display: 'block', ...style }}
    >
      <g stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.8">
        <line x1="12" y1="12.4" x2="12" y2="4" />
        <line x1="12" y1="12.4" x2="19.4" y2="8.9" />
        <line x1="12" y1="12.4" x2="18.3" y2="18.6" />
        <line x1="12" y1="12.4" x2="5.6" y2="18" />
        <line x1="12" y1="12.4" x2="4.2" y2="8.6" />
        <line x1="12" y1="4" x2="19.4" y2="8.9" strokeOpacity="0.5" />
        <line x1="4.2" y1="8.6" x2="5.6" y2="18" strokeOpacity="0.5" />
      </g>
      <g fill="#fff">
        <circle cx="12" cy="12.4" r="2.9" />
        <circle cx="12" cy="4" r="1.9" />
        <circle cx="19.4" cy="8.9" r="1.7" />
        <circle cx="18.3" cy="18.6" r="1.9" />
        <circle cx="5.6" cy="18" r="1.6" />
      </g>
      {/* flagged gene-of-interest: ringed node */}
      <circle cx="4.2" cy="8.6" r="2.1" fill={ringFill} stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

interface BrandMarkProps {
  /** Size of the gradient square in px. */
  size?: number;
  /** Show the "NetCancer Insight" wordmark beside the mark. */
  wordmark?: boolean;
  /** Any valid CSS `background` value for the square. Defaults to the brand violet→indigo. */
  gradient?: string;
  /** Render the soft violet accent glow behind the square. */
  glow?: boolean;
  /** Fill for the ringed gene-of-interest node (kept dark to read as a hole on the gradient). */
  ringFill?: string;
  /** Wordmark text color. */
  wordmarkColor?: string;
  style?: React.CSSProperties;
}

export function BrandMark({
  size = 40,
  wordmark = false,
  gradient = DEFAULT_GRADIENT,
  glow = true,
  ringFill,
  wordmarkColor = '#f1f5f9',
  style,
}: BrandMarkProps) {
  const radius = size >= 56 ? 16 : size >= 34 ? 11 : 7;
  const glyphSize = Math.round(size * 0.6);

  const mark = (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        background: gradient,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: glow ? DEFAULT_GLOW : 'none',
        ...(wordmark ? {} : style),
      }}
    >
      <BrandGlyph size={glyphSize} ringFill={ringFill} />
    </span>
  );

  if (!wordmark) return mark;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), ...style }}>
      {mark}
      <span
        style={{
          fontWeight: 700,
          fontSize: Math.max(14, Math.round(size * 0.5)),
          color: wordmarkColor,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        NetCancer Insight
      </span>
    </span>
  );
}

export default BrandMark;
