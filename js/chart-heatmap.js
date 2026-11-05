/* =========================================================
   Pairwise co-occurrence heatmap.

   One component, three views — switched via small pill buttons:

     LD  Governance Layer  ×  Governance Dimensions    (5 × 12)
     LM  Governance Layer  ×  Mechanism Type            (5 × 5)
     DM  Governance Dimensions × Mechanism Type        (12 × 5)

   Cells are shaded blue with opacity proportional to count.
   Clicking a cell, row label, or column label keeps the user
   on the Findings tab and reveals the matching papers in a
   panel directly underneath the heatmap. Clicking a paper in
   that panel opens its modal.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState, useMemo, useEffect } = React;
  const { splitMulti } = window.AppUtils;

  const LAYER_ORDER = [
    'Mechanisms/tools',
    'Risk identification',
    'Actors/responsibility',
    'Principles/values',
    'Lifecycle/scope',
  ];
  const DIMENSION_ORDER = [
    'Accountability', 'Compliance', 'Transparency', 'Trust',
    'Human oversight', 'Privacy', 'Ethics', 'Safety',
    'Explainability', 'Responsible AI', 'Liability', 'Bias/Fairness',
  ];
  const MECHANISM_ORDER = [
    'Procedural', 'Technical', 'Organizational',
    'Hard/regulatory', 'Soft/voluntary',
  ];

  const VIEWS = {
    LD: {
      label: 'Layer × Dimensions',
      rowField: 'Governance_Layer_Addressed', rowOrder: LAYER_ORDER,     rowLabel: 'Governance Layer',
      colField: 'Governance_Dimensions',      colOrder: DIMENSION_ORDER, colLabel: 'Governance Dimensions',
    },
    LM: {
      label: 'Layer × Mechanism',
      rowField: 'Governance_Layer_Addressed', rowOrder: LAYER_ORDER,     rowLabel: 'Governance Layer',
      colField: 'Governance_Mechanism_Type',  colOrder: MECHANISM_ORDER, colLabel: 'Mechanism Type',
    },
    DM: {
      label: 'Dimensions × Mechanism',
      rowField: 'Governance_Dimensions',      rowOrder: DIMENSION_ORDER, rowLabel: 'Governance Dimensions',
      colField: 'Governance_Mechanism_Type',  colOrder: MECHANISM_ORDER, colLabel: 'Mechanism Type',
    },
  };

  const orderedPresent = (presentSet, canonical) => {
    const result = canonical.filter(v => presentSet.has(v));
    [...presentSet].forEach(v => { if (!result.includes(v)) result.push(v); });
    return result;
  };

  // Inline copy of the citation builder used by paper-components.
  // Duplicated here so this component is self-contained and can render
  // its own paper list without crossing into AppComponents.
  const shortCitation = (paper) => {
    const authors = (paper.Authors || '').trim();
    const year = (paper.Year || '').trim();
    if (!authors) return year ? `(${year})` : 'Unknown';
    const parts = authors.split(/,\s*/).filter(Boolean);
    const first = parts[0];
    const tail = parts.length > 1 ? ' et al.' : '';
    return year ? `${first}${tail} (${year})` : `${first}${tail}`;
  };

  const HeatmapChart = ({ papersData, onPaperClick }) => {
    const [view, setView]         = useState('LD');
    const [hover, setHover]       = useState(null);   // { r, c } — indices, -1 means "label only"
    const [selected, setSelected] = useState(null);   // { type: 'cell'|'row'|'col', r?, c? }

    // Reset the selection when the user flips between views so we never
    // show stale paper lists when the underlying axes change.
    useEffect(() => { setSelected(null); }, [view]);

    /* --- co-occurrence matrix for the selected view --- */
    const grid = useMemo(() => {
      const cfg = VIEWS[view];
      const rowsPresent = new Set();
      const colsPresent = new Set();
      const counter = new Map();

      papersData.forEach(p => {
        const rs = splitMulti(p[cfg.rowField]);
        const cs = splitMulti(p[cfg.colField]);
        rs.forEach(r => rowsPresent.add(r));
        cs.forEach(c => colsPresent.add(c));
        rs.forEach(r => cs.forEach(c => {
          const k = `${r}|${c}`;
          counter.set(k, (counter.get(k) || 0) + 1);
        }));
      });

      const rows = orderedPresent(rowsPresent, cfg.rowOrder);
      const cols = orderedPresent(colsPresent, cfg.colOrder);
      let maxV = 0;
      rows.forEach(r => cols.forEach(c => {
        const v = counter.get(`${r}|${c}`) || 0;
        if (v > maxV) maxV = v;
      }));
      return { cfg, rows, cols, counter, maxV };
    }, [view, papersData]);

    /* --- papers matching the current selection --- */
    const matchingPapers = useMemo(() => {
      if (!selected) return [];
      const { rowField, colField } = grid.cfg;
      const rowVal = selected.r != null ? grid.rows[selected.r] : null;
      const colVal = selected.c != null ? grid.cols[selected.c] : null;
      return papersData.filter(p => {
        const rs = splitMulti(p[rowField]);
        const cs = splitMulti(p[colField]);
        if (selected.type === 'cell') return rs.includes(rowVal) && cs.includes(colVal);
        if (selected.type === 'row')  return rs.includes(rowVal);
        if (selected.type === 'col')  return cs.includes(colVal);
        return false;
      });
    }, [selected, papersData, grid]);

    const selectionLabel = useMemo(() => {
      if (!selected) return '';
      if (selected.type === 'cell') return `${grid.rows[selected.r]}  ×  ${grid.cols[selected.c]}`;
      if (selected.type === 'row')  return `${grid.cfg.rowLabel}: ${grid.rows[selected.r]}`;
      if (selected.type === 'col')  return `${grid.cfg.colLabel}: ${grid.cols[selected.c]}`;
      return '';
    }, [selected, grid]);

    /* --- click handlers (toggle off if the same target is re-clicked) --- */
    const clickCell = (r, c, v) => {
      if (v === 0) return;
      if (selected && selected.type === 'cell' && selected.r === r && selected.c === c) setSelected(null);
      else setSelected({ type: 'cell', r, c });
    };
    const clickRow = (r) => {
      if (selected && selected.type === 'row' && selected.r === r) setSelected(null);
      else setSelected({ type: 'row', r });
    };
    const clickCol = (c) => {
      if (selected && selected.type === 'col' && selected.c === c) setSelected(null);
      else setSelected({ type: 'col', c });
    };

    /* --- layout --- */
    const CELL_W   = 48;
    const CELL_H   = 36;
    const PAD_LEFT = 200;
    const PAD_TOP  = 110;
    const PAD_RIGHT = 16;
    const PAD_BOT   = 16;
    const plotW = grid.cols.length * CELL_W;
    const plotH = grid.rows.length * CELL_H;
    const W = PAD_LEFT + plotW + PAD_RIGHT;
    const H = PAD_TOP  + plotH + PAD_BOT;

    // Blue palette: tailwind blue-600 (#2563eb) with opacity scaled to
    // the cell's count. A non-zero floor (0.15) keeps single-occurrence
    // cells visible against the off-white background.
    const cellFill = (v) => {
      if (v === 0) return '#f8fafc';
      const t = v / grid.maxV;
      const op = 0.15 + t * 0.82;
      return `rgba(37, 99, 235, ${op.toFixed(3)})`;
    };
    const cellText = (v) => {
      if (v === 0) return '#cbd5e1';
      return (v / grid.maxV) > 0.55 ? '#ffffff' : '#0f172a';
    };

    const hoverCell = (r, c) => hover && hover.r === r && hover.c === c;
    const hoverRow  = (r)    => hover && hover.r === r;
    const hoverCol  = (c)    => hover && hover.c === c;
    const isSelCell = (r, c) => selected && selected.type === 'cell' && selected.r === r && selected.c === c;
    const isSelRow  = (r)    => selected && selected.type === 'row'  && selected.r === r;
    const isSelCol  = (c)    => selected && selected.type === 'col'  && selected.c === c;
    // A cell lights up because it's *in* the selected row or column,
    // even if it isn't itself the clicked cell.
    const inSelRowOrCol = (r, c) =>
      (selected && selected.type === 'row' && selected.r === r) ||
      (selected && selected.type === 'col' && selected.c === c);

    return (
      <div className="space-y-4">

        {/* View switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                view === k
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {v.label}
            </button>
          ))}
          <span className="text-[11px] text-slate-400 ml-2">
            {grid.rows.length} × {grid.cols.length} matrix · max {grid.maxV}
          </span>
        </div>

        {/* Heatmap */}
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}
               style={{ maxWidth: '100%', minWidth: Math.min(W, 480) }}>

            {/* Row labels */}
            {grid.rows.map((r, ri) => {
              const lit = hoverRow(ri) || isSelRow(ri);
              return (
                <text
                  key={`r-${r}`}
                  x={PAD_LEFT - 8}
                  y={PAD_TOP + ri * CELL_H + CELL_H / 2 + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontWeight={lit ? '700' : '500'}
                  fill={lit ? '#0f172a' : '#475569'}
                  style={{ cursor: 'pointer', transition: 'all 120ms' }}
                  onMouseEnter={() => setHover({ r: ri, c: -1 })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => clickRow(ri)}
                >
                  {r}
                </text>
              );
            })}

            {/* Column labels (rotated -40°) */}
            {grid.cols.map((c, ci) => {
              const x = PAD_LEFT + ci * CELL_W + CELL_W / 2;
              const y = PAD_TOP - 8;
              const lit = hoverCol(ci) || isSelCol(ci);
              return (
                <text
                  key={`c-${c}`}
                  x={x} y={y}
                  fontSize="11"
                  fontWeight={lit ? '700' : '500'}
                  fill={lit ? '#0f172a' : '#475569'}
                  transform={`rotate(-40, ${x}, ${y})`}
                  textAnchor="start"
                  style={{ cursor: 'pointer', transition: 'all 120ms' }}
                  onMouseEnter={() => setHover({ r: -1, c: ci })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => clickCol(ci)}
                >
                  {c}
                </text>
              );
            })}

            {/* Cells */}
            {grid.rows.map((r, ri) =>
              grid.cols.map((c, ci) => {
                const v = grid.counter.get(`${r}|${c}`) || 0;
                const isHover = hoverCell(ri, ci);
                const isSel   = isSelCell(ri, ci);
                const rowSel  = isSelRow(ri);
                const colSel  = isSelCol(ci);
                const inSel   = inSelRowOrCol(ri, ci);
                const stroke = isSel || (inSel && v > 0) ? '#0f172a'
                            : isHover ? '#0f172a'
                            : (hoverRow(ri) || hoverCol(ci) ? '#cbd5e1' : 'transparent');
                const strokeW = isSel ? 2.5
                              : isHover ? 2
                              : (inSel && v > 0 ? 1.5 : 1);
                return (
                  <g key={`${r}-${c}`}
                    onMouseEnter={() => setHover({ r: ri, c: ci })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => clickCell(ri, ci, v)}
                    style={{ cursor: v > 0 ? 'pointer' : 'default' }}
                  >
                    <rect
                      x={PAD_LEFT + ci * CELL_W + 1}
                      y={PAD_TOP  + ri * CELL_H + 1}
                      width={CELL_W - 2}
                      height={CELL_H - 2}
                      rx="2"
                      fill={cellFill(v)}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      style={{ transition: 'all 120ms' }}
                    />
                    {v > 0 && (
                      <text
                        x={PAD_LEFT + ci * CELL_W + CELL_W / 2}
                        y={PAD_TOP  + ri * CELL_H + CELL_H / 2 + 4}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill={cellText(v)}
                        style={{ pointerEvents: 'none' }}
                      >
                        {v}
                      </text>
                    )}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        {/* Legend + hover readout */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Cell shade
            </span>
            <div className="flex h-3 w-32 rounded overflow-hidden border border-slate-200">
              {[0.15, 0.28, 0.42, 0.55, 0.7, 0.85, 0.97].map(t => (
                <div key={t} className="flex-1" style={{ background: `rgba(37, 99, 235, ${t})` }} />
              ))}
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums">1 → {grid.maxV}</span>
          </div>
          <div className="text-[11px] text-slate-500 min-h-[16px]">
            {hover && hover.r >= 0 && hover.c >= 0 ? (
              <>
                <span className="text-slate-900 font-medium">{grid.rows[hover.r]}</span>
                <span className="text-slate-300"> × </span>
                <span className="text-slate-900 font-medium">{grid.cols[hover.c]}</span>
                <span className="text-slate-400"> · </span>
                <span className="tabular-nums">{grid.counter.get(`${grid.rows[hover.r]}|${grid.cols[hover.c]}`) || 0}</span>
              </>
            ) : (
              <span className="italic">Click a cell to see papers below · click a row or column label for that whole group</span>
            )}
          </div>
        </div>

        {/* Inline papers panel — shown only when something is selected. */}
        {selected && (
          <div className="pt-4 border-t border-slate-200 animate-fade">
            <div className="flex items-baseline justify-between mb-3 gap-3">
              <div className="text-sm min-w-0">
                <span className="font-semibold text-slate-900 tabular-nums">
                  {matchingPapers.length}
                </span>
                <span className="text-slate-500">
                  {' '}paper{matchingPapers.length === 1 ? '' : 's'}
                  <span className="text-slate-300"> · </span>
                </span>
                <span className="text-slate-800 font-medium">{selectionLabel}</span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:text-slate-900 transition-colors flex-shrink-0"
              >
                Clear ×
              </button>
            </div>

            {matchingPapers.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-4">
                No papers match this selection.
              </div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto scrollbar-thin pr-1 -mx-2">
                {matchingPapers.map((paper, i) => (
                  <button
                    key={paper.new_ID || i}
                    onClick={() => onPaperClick && onPaperClick(paper)}
                    className="block w-full text-left px-2 py-2 rounded hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-[11px] text-slate-500 truncate">
                      {shortCitation(paper)}
                      {paper['Source title'] && (
                        <>
                          <span className="text-slate-300"> · </span>
                          <span className="italic">{paper['Source title']}</span>
                        </>
                      )}
                    </div>
                    <div className="serif text-xs text-slate-900 leading-snug mt-0.5">
                      {paper.Title}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  window.AppCharts.HeatmapChart = HeatmapChart;
})();