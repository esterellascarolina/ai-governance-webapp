/* =========================================================
   Shared kit for the interactive figures.

   The charts in figures-corpus.js and figures-regulations.js are
   ports of the matplotlib scripts in 09_Visualization and
   17_Visualization for AI Regulations. They keep those figures'
   palettes and orderings so the screen version and the page
   version read as the same figure — what changes is that every
   mark here answers to the pointer.

   Exports on window.FigureKit:
     PALETTE      the shared ink / surface / categorical colours
     useTooltip   pointer-following tooltip state + <Tooltip />
     Measured     width-aware wrapper (charts lay out in real pixels)
     FigureFrame  title, caption, encoding line, selection slot
     PaperList    the papers behind a selection, click to open one
     splitMulti   ';'-separated cell parser (same rule as utils.js)
   ========================================================= */

window.FigureKit = window.FigureKit || {};

(function () {
  const { useState, useRef, useCallback, useLayoutEffect } = React;

  /* ---------- palette, lifted from the scripts ---------- */
  const PALETTE = {
    surface: '#fcfcfb',
    inkPrimary: '#0b0b0b',
    inkSecondary: '#52514e',
    inkMuted: '#8a8985',
    gridline: '#e1e0d9',
    baseline: '#c3c2b7',
    bar: '#c9c8c2',
    envelope: '#e8e7e0',
    // Validated categorical slots used across every figure
    blue: '#2a78d6',
    orange: '#eb6834',
    aqua: '#1baf7a',
    violet: '#4a3aa7',
    yellow: '#eda100',
    red: '#e34948',
    grey: '#9a998f',
    // Ordinal blue ramp, light to dark
    ramp: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7',
           '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
    depth: {
      'Primary focus': '#104281',
      'Secondary discussion': '#2a78d6',
      'Brief mention': '#86b6ef',
    },
    depthInk: {
      'Primary focus': '#ffffff',
      'Secondary discussion': '#ffffff',
      'Brief mention': '#0b0b0b',
    },
  };

  const DEPTH_ORDER = ['Primary focus', 'Secondary discussion', 'Brief mention'];

  /* ---------- multi-value cells ---------- */
  const splitMulti = (value) => {
    if (value === null || value === undefined) return [];
    return String(value).split(/[;|]/).map(s => s.trim()).filter(Boolean);
  };

  /* ---------- colour helpers ---------- */
  const rampColor = (t) => {
    const r = PALETTE.ramp;
    const x = Math.max(0, Math.min(1, t)) * (r.length - 1);
    return r[Math.round(x)];
  };

  const hexToRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (hex) => {
    const c = hexToRgb(hex).map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  // Whichever of white or primary ink reads better on this fill — the same
  // rule the mosaic script uses for its cell labels.
  const readableInk = (hex) => (luminance(hex) > 0.42 ? PALETTE.inkPrimary : '#ffffff');

  /* ---------- tooltip ---------- */
  const useTooltip = () => {
    const [tip, setTip] = useState(null); // { x, y, content }
    const hostRef = useRef(null);

    const show = useCallback((event, content) => {
      const host = hostRef.current;
      if (!host) return;
      const box = host.getBoundingClientRect();
      setTip({ x: event.clientX - box.left, y: event.clientY - box.top, content });
    }, []);
    const hide = useCallback(() => setTip(null), []);

    const Tooltip = () => {
      if (!tip) return null;
      const host = hostRef.current;
      const w = host ? host.clientWidth : 0;
      const flip = tip.x > w - 260;
      return (
        <div
          className="absolute z-30 pointer-events-none bg-slate-900 text-white text-xs leading-relaxed rounded-lg px-3 py-2 shadow-xl max-w-[260px]"
          style={{ left: flip ? tip.x - 268 : tip.x + 14, top: tip.y + 12 }}
        >
          {tip.content}
        </div>
      );
    };

    return { hostRef, show, hide, Tooltip, active: Boolean(tip) };
  };

  /* ---------- width-aware wrapper ----------
     Charts need real pixels: type is a fixed size while the panel is fluid,
     so a viewBox alone would scale the labels into illegibility. */
  const Measured = ({ children, minWidth = 320, className = '' }) => {
    const ref = useRef(null);
    const [width, setWidth] = useState(null);

    useLayoutEffect(() => {
      if (!ref.current) return;
      const obs = new ResizeObserver(entries => {
        const w = entries[0].contentRect.width;
        setWidth(Math.max(minWidth, Math.round(w)));
      });
      obs.observe(ref.current);
      return () => obs.disconnect();
    }, [minWidth]);

    return (
      <div ref={ref} className={`w-full ${className}`}>
        {width ? children(width) : <div className="h-40" />}
      </div>
    );
  };

  /* ---------- figure frame ---------- */
  const FigureFrame = ({ title, encodes, caption, children, footer, onReset, resetLabel }) => (
    <figure className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="serif text-base font-semibold text-slate-900 leading-snug">{title}</h3>
        {onReset && (
          <button
            onClick={onReset}
            className="text-xs text-slate-400 hover:text-slate-900 transition-colors flex-shrink-0"
          >
            {resetLabel || 'Clear ×'}
          </button>
        )}
      </div>
      {caption && (
        <figcaption className="text-xs text-slate-500 leading-relaxed mb-1">{caption}</figcaption>
      )}
      {encodes && (
        <p className="text-[11px] text-slate-400 leading-relaxed mb-4">{encodes}</p>
      )}
      <div className={encodes || caption ? '' : 'mt-4'}>{children}</div>
      {footer && <div className="mt-4 pt-3 border-t border-slate-100">{footer}</div>}
    </figure>
  );

  /* ---------- the papers behind a selection ---------- */
  const shortCitation = (paper) => {
    const authors = (paper.Authors || '').trim();
    const year = (paper.Year || '').trim();
    if (!authors) return year ? `(${year})` : 'Unknown';
    const parts = authors.split(/,\s*/).filter(Boolean);
    return `${parts[0]}${parts.length > 1 ? ' et al.' : ''}${year ? ` (${year})` : ''}`;
  };

  const PaperList = ({ papers, label, onPaperClick, onClear }) => (
    <div className="animate-fade">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <div className="text-sm min-w-0">
          <span className="font-semibold text-slate-900 tabular-nums">{papers.length}</span>
          <span className="text-slate-500"> paper{papers.length === 1 ? '' : 's'}</span>
          <span className="text-slate-300"> · </span>
          <span className="text-slate-800 font-medium">{label}</span>
        </div>
        {onClear && (
          <button onClick={onClear} className="text-xs text-slate-400 hover:text-slate-900 flex-shrink-0">
            Clear ×
          </button>
        )}
      </div>
      {papers.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-2">No papers match this selection.</p>
      ) : (
        <div className="space-y-0.5 max-h-72 overflow-y-auto scrollbar-thin -mx-2">
          {papers.map((p, i) => (
            <button
              key={p.new_ID || i}
              onClick={() => onPaperClick && onPaperClick(p)}
              className="block w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 transition-colors"
            >
              <div className="text-[11px] text-slate-500 truncate">
                {shortCitation(p)}
                {p['Source title'] && (
                  <>
                    <span className="text-slate-300"> · </span>
                    <span className="italic">{p['Source title']}</span>
                  </>
                )}
              </div>
              <div className="serif text-xs text-slate-900 leading-snug">{p.Title}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  /* ---------- a generic record list (regulation instruments) ---------- */
  const RecordList = ({ records, label, onClear }) => (
    <div className="animate-fade">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <div className="text-sm min-w-0">
          <span className="font-semibold text-slate-900 tabular-nums">{records.length}</span>
          <span className="text-slate-500"> instrument{records.length === 1 ? '' : 's'}</span>
          <span className="text-slate-300"> · </span>
          <span className="text-slate-800 font-medium">{label}</span>
        </div>
        {onClear && (
          <button onClick={onClear} className="text-xs text-slate-400 hover:text-slate-900 flex-shrink-0">
            Clear ×
          </button>
        )}
      </div>
      {records.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-2">Nothing matches this selection.</p>
      ) : (
        <div className="space-y-0.5 max-h-72 overflow-y-auto scrollbar-thin -mx-2">
          {records.map((r, i) => (
            <div key={i} className="px-2 py-1.5">
              <div className="text-[11px] text-slate-500 truncate">
                {r.jurisdiction}
                {r.type && (
                  <>
                    <span className="text-slate-300"> · </span>
                    <span className="italic">{r.type}</span>
                  </>
                )}
              </div>
              {r.title && (
                <div className="serif text-xs text-slate-900 leading-snug">{r.title}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ---------- legend ---------- */
  const Legend = ({ items, note }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block flex-shrink-0"
            style={{
              width: it.shape === 'line' ? 14 : 10,
              height: it.shape === 'line' ? 3 : 10,
              borderRadius: it.shape === 'circle' ? 5 : 2,
              background: it.hollow ? 'transparent' : it.color,
              border: it.hollow ? `1.4px solid ${it.color}` : 'none',
            }}
          />
          {it.label}
        </span>
      ))}
      {note && <span className="text-slate-400 italic">{note}</span>}
    </div>
  );

  Object.assign(window.FigureKit, {
    PALETTE, DEPTH_ORDER, splitMulti, rampColor, readableInk, luminance,
    useTooltip, Measured, FigureFrame, PaperList, RecordList, Legend, shortCitation,
  });
})();
