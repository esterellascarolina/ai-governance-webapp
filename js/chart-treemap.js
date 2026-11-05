/* =========================================================
   TreemapChart — Research Problem Theme explorer.

   Level 1: Rectangular tiles, one per Research_Problem_Theme.
            Tile area ∝ paper count. Click to drill into theme.

   Level 2: Paper tiles within the chosen theme.
            Hover shows the full Research_Problem text in a
            floating tooltip. Click navigates to the paper modal
            via onPaperClick.

   Props:
     papersData   – full parsed CSV rows
     onPaperClick – (paper) => void, called on paper tile click
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function () {
  const { useState, useRef, useCallback, useLayoutEffect } = React;

  /* ---- colour palette for themes (cycles if > 12 themes) ----
     Light tints so the black labels stay readable on every tile. */
  const PALETTE = [
    '#bfdbfe','#bbf7d0','#fde68a','#fecaca','#ddd6fe',
    '#a5f3fc','#fed7aa','#d9f99d','#fbcfe8','#c7d2fe',
    '#99f6e4','#e2e8f0',
  ];
  const INK = '#000000';

  /* ---- squarified treemap layout ---- */
  function squarify(items, x, y, w, h) {
    if (!items.length) return [];

    function layout(nodes, x, y, w, h) {
      if (!nodes.length) return [];
      if (nodes.length === 1) {
        return [{ ...nodes[0], x, y, w, h }];
      }

      const totalVal = nodes.reduce((s, d) => s + d.value, 0);
      let bestSplit = 1;
      let bestRatio = Infinity;

      for (let i = 1; i < nodes.length; i++) {
        const a = nodes.slice(0, i).reduce((s, d) => s + d.value, 0);
        const b = totalVal - a;
        const wa = (a / totalVal) * (w > h ? w : h);
        const wb = (b / totalVal) * (w > h ? w : h);
        let maxR = 0;
        nodes.slice(0, i).forEach(d => {
          const rw = d.value / a * (w > h ? h : w);
          const rh = wa;
          maxR = Math.max(maxR, Math.max(rw / rh, rh / rw));
        });
        nodes.slice(i).forEach(d => {
          const rw = d.value / b * (w > h ? h : w);
          const rh = wb;
          maxR = Math.max(maxR, Math.max(rw / rh, rh / rw));
        });
        if (maxR < bestRatio) { bestRatio = maxR; bestSplit = i; }
      }

      const aNodes = nodes.slice(0, bestSplit);
      const bNodes = nodes.slice(bestSplit);
      const aVal   = aNodes.reduce((s, d) => s + d.value, 0);
      const bVal   = bNodes.reduce((s, d) => s + d.value, 0);

      let rects = [];
      if (w >= h) {
        const wa = (aVal / totalVal) * w;
        const wb = w - wa;
        rects = [
          ...layout(aNodes, x,      y, wa, h),
          ...layout(bNodes, x + wa, y, wb, h),
        ];
      } else {
        const ha = (aVal / totalVal) * h;
        const hb = h - ha;
        rects = [
          ...layout(aNodes, x, y,      w, ha),
          ...layout(bNodes, x, y + ha, w, hb),
        ];
      }
      return rects;
    }

    const sorted = [...items].sort((a, b) => b.value - a.value);
    return layout(sorted, x, y, w, h);
  }

  /* ---- Tooltip ---- */
  const Tooltip = ({ text, x, y, visible, containerW }) => {
    if (!visible || !text) return null;
    const maxW  = Math.min(320, containerW - 24);
    const left  = x + maxW + 16 > containerW ? x - maxW - 8 : x + 12;
    return (
      <div
        style={{
          position: 'absolute',
          left,
          top: y,
          maxWidth: maxW,
          pointerEvents: 'none',
          zIndex: 40,
        }}
        className="bg-slate-900 text-white text-xs leading-relaxed rounded-lg p-3 shadow-xl"
      >
        {text}
      </div>
    );
  };

  /* ---- Level-1: Theme tiles ---- */
  const ThemeMap = ({ themes, onThemeClick }) => {
    const ref      = useRef(null);
    const [size, setSize] = useState({ w: 600, h: 220 });
    const [hover, setHover] = useState(null);

    useLayoutEffect(() => {
      if (!ref.current) return;
      const obs = new ResizeObserver(entries => {
        const { width } = entries[0].contentRect;
        setSize({ w: width, h: Math.max(200, Math.round(width * 0.34)) });
      });
      obs.observe(ref.current);
      return () => obs.disconnect();
    }, []);

    const rects = squarify(
      themes.map(([label, count], i) => ({ label, value: count, index: i })),
      0, 0, size.w, size.h
    );

    return (
      <div ref={ref} style={{ position: 'relative', width: '100%' }}>
        <svg
          width={size.w}
          height={size.h}
          style={{ display: 'block', borderRadius: 8, overflow: 'hidden' }}
        >
          {rects.map(({ label, value, index, x, y, w, h }) => {
            const isHov = hover === label;
            const color = PALETTE[index % PALETTE.length];
            const pad   = 8;
            const area  = w * h;
            const fs    = area > 40000 ? 14 : area > 15000 ? 12 : area > 6000 ? 11 : 10;
            return (
              <g
                key={label}
                onClick={() => onThemeClick(label)}
                onMouseEnter={() => setHover(label)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={x + 1} y={y + 1} width={w - 2} height={h - 2}
                  rx="4"
                  fill={color}
                  stroke={isHov ? INK : '#ffffff'}
                  strokeWidth={isHov ? 1.5 : 1}
                  style={{ transition: 'stroke 150ms' }}
                />
                {w > 50 && h > 34 && (
                  <foreignObject x={x + pad} y={y + pad} width={w - pad * 2} height={h - pad * 2}>
                    <div
                      xmlns="http://www.w3.org/1999/xhtml"
                      style={{
                        color: INK,
                        fontSize: fs,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        height: '100%',
                      }}
                    >
                      <div>{label}</div>
                      <div style={{ fontSize: fs - 1, fontWeight: 500, marginTop: 2 }}>
                        {value} paper{value !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>

        <div className="mt-3 flex flex-wrap gap-2">
          {themes.map(([label, count], i) => (
            <button
              key={label}
              onClick={() => onThemeClick(label)}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors"
            >
              <span
                style={{
                  display: 'inline-block', width: 10, height: 10,
                  borderRadius: 2,
                  background: PALETTE[i % PALETTE.length],
                  border: '1px solid #94a3b8',
                  flexShrink: 0,
                }}
              />
              {label}
              <span className="text-slate-400">({count})</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  /* ---- Level-2: Papers within a theme ---- */
  const PaperMap = ({ papers, theme, themeIndex, onPaperClick, onBack }) => {
    const ref       = useRef(null);
    const [size, setSize]         = useState({ w: 600, h: 240 });
    const [tooltip, setTooltip]   = useState({ visible: false, text: '', x: 0, y: 0 });

    useLayoutEffect(() => {
      if (!ref.current) return;
      const obs = new ResizeObserver(entries => {
        const { width } = entries[0].contentRect;
        setSize({ w: width, h: Math.max(220, Math.round(width * 0.4)) });
      });
      obs.observe(ref.current);
      return () => obs.disconnect();
    }, []);

    const items = papers.map((p, i) => ({
      label: p.Title || `Paper ${i + 1}`,
      value: 1,
      paper: p,
      index: i,
    }));

    const rects = squarify(items, 0, 0, size.w, size.h);
    const baseColor = PALETTE[themeIndex % PALETTE.length];

    const tileColors = rects.map((_, i) => {
      const t = i / Math.max(rects.length - 1, 1);
      return lerpColor(baseColor, lighten(baseColor, 0.6), t);
    });

    const handleMouseMove = useCallback((e, text) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        visible: true,
        text,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top + 8,
      });
    }, []);

    const handleMouseLeave = useCallback(() => {
      setTooltip(t => ({ ...t, visible: false }));
    }, []);

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={onBack}
            className="text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2 transition-colors"
          >
            ← All themes
          </button>
          <span className="text-slate-300">/</span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ background: baseColor, color: INK }}
          >
            {theme}
          </span>
          <span className="text-xs text-slate-400">({papers.length} paper{papers.length !== 1 ? 's' : ''})</span>
        </div>

        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
          <svg
            width={size.w}
            height={size.h}
            style={{ display: 'block', borderRadius: 8, overflow: 'hidden' }}
          >
            {rects.map(({ label, paper, index, x, y, w, h }, ri) => {
              const pad = 6;
              const area = w * h;
              const fs = area > 20000 ? 12 : area > 8000 ? 11 : 10;
              return (
                <g
                  key={index}
                  onClick={() => onPaperClick(paper)}
                  onMouseMove={(e) => handleMouseMove(e, paper.Research_Problem || '')}
                  onMouseLeave={handleMouseLeave}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x + 1} y={y + 1} width={w - 2} height={h - 2}
                    rx="3"
                    fill={tileColors[ri]}
                    stroke="#ffffff"
                    strokeWidth="1"
                  />
                  {w > 60 && h > 28 && (
                    <foreignObject x={x + pad} y={y + pad} width={w - pad * 2} height={h - pad * 2}>
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        style={{
                          fontSize: fs,
                          fontWeight: 600,
                          lineHeight: 1.3,
                          color: INK,
                          overflow: 'hidden',
                          height: '100%',
                        }}
                      >
                        {truncateStr(label, Math.floor((w - pad * 2) / (fs * 0.55) * 2), 80)}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>

          <Tooltip
            text={tooltip.text}
            x={tooltip.x}
            y={tooltip.y}
            visible={tooltip.visible}
            containerW={size.w}
          />
        </div>
        <p className="text-xs text-slate-400 mt-2 italic">
          Hover a tile to read its research problem · click to open the full record
        </p>
      </div>
    );
  };

  /* ---- Public component ---- */
  const TreemapChart = ({ papersData, onPaperClick }) => {
    const [selectedTheme, setSelectedTheme] = useState(null);

    const themeCounts = React.useMemo(() => {
      const counts = {};
      papersData.forEach(p => {
        const t = (p.Research_Problem_Theme || '').trim();
        if (!t) return;
        counts[t] = (counts[t] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [papersData]);

    const themePapers = React.useMemo(() => {
      if (!selectedTheme) return [];
      return papersData.filter(
        p => (p.Research_Problem_Theme || '').trim() === selectedTheme
      );
    }, [papersData, selectedTheme]);

    const themeIndex = themeCounts.findIndex(([t]) => t === selectedTheme);

    if (!selectedTheme) {
      return (
        <ThemeMap
          themes={themeCounts}
          onThemeClick={setSelectedTheme}
        />
      );
    }

    return (
      <PaperMap
        papers={themePapers}
        theme={selectedTheme}
        themeIndex={themeIndex}
        onPaperClick={onPaperClick}
        onBack={() => setSelectedTheme(null)}
      />
    );
  };

  /* ---- Colour helpers ---- */
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
  }
  function lerpColor(a, b, t) {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
  }
  function lighten(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  function luminance([r, g, b]) {
    const c = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastColor(hex) {
    return luminance(hexToRgb(hex)) > 0.35 ? '#1e293b' : '#ffffff';
  }

  /* ---- Text helpers ---- */
  function wrapText(text, charsPerLine, maxLines) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (lines.length >= maxLines) break;
      if ((cur + ' ' + w).trim().length > charsPerLine) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    return lines;
  }
  function truncateStr(str, chars, hard = 80) {
    const limit = Math.min(chars, hard);
    if (str.length <= limit) return str;
    return str.slice(0, limit - 1) + '…';
  }

  window.AppCharts.TreemapChart = TreemapChart;
})();