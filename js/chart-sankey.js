/* =========================================================
   Sankey diagram: AI Approach → Governance Dimensions → Validation Level.

   Three-column flow built in pure SVG. Each link is a bezier
   ribbon whose vertical thickness encodes co-occurrence count
   across the corpus.

   Algorithm notes
   ---------------
   - Multi-value cells are exploded: a paper that names two AI
     approaches and three dimensions contributes 2×3 = 6 links of
     value 1 each.
   - Node heights are sized by the larger of the node's total
     inflow or outflow so links never overflow the rectangle.
   - Within each column, nodes are ordered by descending total
     flow — the busiest values sit at the top.
   - Within each node, out-links stack in the canonical order
     of their target column (and vice-versa for in-links). This
     is the cheap-and-cheerful crossing-minimisation trick that
     classical Sankey libraries use as a baseline.

   Interaction
   -----------
   - Hover a node       → highlight every link touching it.
   - Hover a link       → highlight both its endpoint nodes.
   - Click a node       → drill to papers carrying that value.
   - Click a link       → drill to papers carrying BOTH
                          endpoint values.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState, useMemo } = React;
  const { splitMulti } = window.AppUtils;

  /* ---------- column palettes ----------
     Each column has its own palette. Colors are assigned by
     descending-flow rank (set at graph-build time), so the
     busiest value in each column gets the first hue. Sizes are
     generous so realistic value counts don't cycle.
     ------------------------------------- */

  const AI_APPROACH_PALETTE = [
    '#1f77b4', '#2ca02c', '#9467bd', '#17becf', '#8c564b',
    '#bcbd22', '#e377c2', '#aec7e8', '#98df8a', '#c5b0d5',
  ];

  const DIMENSION_PALETTE = [
    '#ffbb78', '#aec7e8', '#98df8a', '#ff9896', '#c5b0d5',
    '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
    '#ffd180', '#b4e8c6',
  ];

  const VALIDATION_PALETTE = [
    '#d62728', '#ff7f0e', '#fdb462', '#80b1d3', '#fb8072',
    '#bebada', '#ffd92f', '#a6d854', '#e78ac3', '#b3b3b3',
  ];

  // Column descriptors. `filterKey` is the FACETS key in app.js so
  // node/link clicks land on the right Papers filter.
  const COL_KEYS = {
    aiApproach: {
      field:     'AI_Approach_Type',
      filterKey: 'aiApproach',
      palette:   AI_APPROACH_PALETTE,
      header:    'AI APPROACH',
    },
    dimension: {
      field:     'Governance_Dimensions',
      filterKey: 'govDims',
      palette:   DIMENSION_PALETTE,
      header:    'GOVERNANCE DIMENSIONS',
    },
    validation: {
      field:     'Validation_Level',
      filterKey: 'validation',
      palette:   VALIDATION_PALETTE,
      header:    'VALIDATION LEVEL',
    },
  };

  /* ---------- helpers ---------- */

  // Cubic-bezier "ribbon" connecting two horizontal bands. The control
  // points sit halfway between source and target on the X axis, which
  // gives the canonical S-shaped Sankey link.
  const ribbonPath = (x0, y0Top, y0Bot, x1, y1Top, y1Bot) => {
    const mx = (x0 + x1) / 2;
    return [
      `M ${x0} ${y0Top}`,
      `C ${mx} ${y0Top}, ${mx} ${y1Top}, ${x1} ${y1Top}`,
      `L ${x1} ${y1Bot}`,
      `C ${mx} ${y1Bot}, ${mx} ${y0Bot}, ${x0} ${y0Bot}`,
      'Z',
    ].join(' ');
  };

  /* ---------- main component ---------- */

  const SankeyChart = ({ papersData, onDrillDown }) => {
    const [hoverNode, setHoverNode] = useState(null);  // { col, label }
    const [hoverLink, setHoverLink] = useState(null);  // index into links[]

    /* --- build the graph from the papers --- */
    const graph = useMemo(() => {
      // Pair counts: which (approach, dimension) and (dimension, validation)
      // pairs co-occur across the corpus, and how many times each.
      const apToDim  = new Map();   // "ap|dim" → count
      const dimToVal = new Map();   // "dim|val" → count
      const apsPresent  = new Set();
      const dimsPresent = new Set();
      const valsPresent = new Set();

      papersData.forEach(p => {
        const aps  = splitMulti(p.AI_Approach_Type);
        const dims = splitMulti(p.Governance_Dimensions);
        const vals = splitMulti(p.Validation_Level);
        aps.forEach(a  => apsPresent.add(a));
        dims.forEach(d => dimsPresent.add(d));
        vals.forEach(v => valsPresent.add(v));
        aps.forEach(a => dims.forEach(d => {
          const k = `${a}|${d}`;
          apToDim.set(k, (apToDim.get(k) || 0) + 1);
        }));
        dims.forEach(d => vals.forEach(v => {
          const k = `${d}|${v}`;
          dimToVal.set(k, (dimToVal.get(k) || 0) + 1);
        }));
      });

      const allAps  = [...apsPresent];
      const allDims = [...dimsPresent];
      const allVals = [...valsPresent];

      // Sum-of-flow per node.
      const totals = { aiApproach: {}, dimension: {}, validation: {} };
      const dimIn = {}, dimOut = {};
      allAps.forEach(a  => totals.aiApproach[a] = 0);
      allVals.forEach(v => totals.validation[v] = 0);
      allDims.forEach(d => { dimIn[d] = 0; dimOut[d] = 0; });

      apToDim.forEach((v, k) => {
        const [a, d] = k.split('|');
        if (a in totals.aiApproach) totals.aiApproach[a] += v;
        if (d in dimIn) dimIn[d] += v;
      });
      dimToVal.forEach((v, k) => {
        const [d, vv] = k.split('|');
        if (d in dimOut) dimOut[d] += v;
        if (vv in totals.validation) totals.validation[vv] += v;
      });
      allDims.forEach(d => { totals.dimension[d] = Math.max(dimIn[d], dimOut[d]); });

      // Reorder each column by descending flow so the busiest nodes
      // sit at the top of their column.
      const byFlowDesc = (col) => (a, b) => totals[col][b] - totals[col][a];
      const aiApproaches = [...allAps].sort(byFlowDesc('aiApproach'));
      const dimensions   = [...allDims].sort(byFlowDesc('dimension'));
      const validations  = [...allVals].sort(byFlowDesc('validation'));

      // Resolve each value to a colour by its position in the sorted
      // column. We freeze the lookup here so colorFor() is O(1).
      const colorMaps = { aiApproach: {}, dimension: {}, validation: {} };
      aiApproaches.forEach((a, i) => { colorMaps.aiApproach[a] = AI_APPROACH_PALETTE[i % AI_APPROACH_PALETTE.length]; });
      dimensions.forEach(  (d, i) => { colorMaps.dimension[d]  = DIMENSION_PALETTE[i  % DIMENSION_PALETTE.length];  });
      validations.forEach( (v, i) => { colorMaps.validation[v] = VALIDATION_PALETTE[i % VALIDATION_PALETTE.length]; });

      // Build link arrays sorted so that crossings are minimised: for
      // out-links of each source node, follow the canonical column
      // order of the targets.
      const links = [];
      aiApproaches.forEach(a => {
        dimensions.forEach(d => {
          const v = apToDim.get(`${a}|${d}`);
          if (v) links.push({ srcCol: 'aiApproach', src: a, tgtCol: 'dimension', tgt: d, value: v });
        });
      });
      dimensions.forEach(d => {
        validations.forEach(vv => {
          const v = dimToVal.get(`${d}|${vv}`);
          if (v) links.push({ srcCol: 'dimension', src: d, tgtCol: 'validation', tgt: vv, value: v });
        });
      });

      return { aiApproaches, dimensions, validations, totals, links, colorMaps };
    }, [papersData]);

    /* --- layout --- */
    const W = 900;
    const PAD_TOP    = 28;
    const PAD_BOTTOM = 16;
    const NODE_WIDTH = 18;
    const NODE_GAP   = 6;
    const PLOT_H     = 460;
    const COL_X = {
      aiApproach: 180,
      dimension:  (W - NODE_WIDTH) / 2,
      validation: W - NODE_WIDTH - 180,
    };

    // Pixels-per-flow-unit. Each column wants enough vertical space;
    // pick a scale that lets the tallest column fit.
    const colTotal = (col, list) => list.reduce((s, k) => s + graph.totals[col][k], 0);
    const totalA = colTotal('aiApproach', graph.aiApproaches);
    const totalD = colTotal('dimension',  graph.dimensions);
    const totalV = colTotal('validation', graph.validations);

    const ppu = useMemo(() => {
      const usableA = PLOT_H - NODE_GAP * Math.max(graph.aiApproaches.length - 1, 0);
      const usableD = PLOT_H - NODE_GAP * Math.max(graph.dimensions.length   - 1, 0);
      const usableV = PLOT_H - NODE_GAP * Math.max(graph.validations.length  - 1, 0);
      const ppuA = totalA ? usableA / totalA : 0;
      const ppuD = totalD ? usableD / totalD : 0;
      const ppuV = totalV ? usableV / totalV : 0;
      return Math.min(ppuA, ppuD, ppuV) || 1;
    }, [graph]);

    // Node rectangles: y, h per node per column.
    const nodes = useMemo(() => {
      const out = { aiApproach: {}, dimension: {}, validation: {} };
      const layoutCol = (col, list) => {
        let y = PAD_TOP;
        list.forEach(label => {
          const h = Math.max(graph.totals[col][label] * ppu, 1);
          out[col][label] = { y, h };
          y += h + NODE_GAP;
        });
      };
      layoutCol('aiApproach', graph.aiApproaches);
      layoutCol('dimension',  graph.dimensions);
      layoutCol('validation', graph.validations);
      return out;
    }, [graph, ppu]);

    // Walk links and assign each one a y-offset within its source node's
    // out-stack and its target node's in-stack. Because links are already
    // emitted in canonical target/source order, this stacks cleanly.
    const positionedLinks = useMemo(() => {
      const srcOffsets = { aiApproach: {}, dimension: {}, validation: {} };
      const tgtOffsets = { aiApproach: {}, dimension: {}, validation: {} };
      return graph.links.map((lk, i) => {
        const sNode = nodes[lk.srcCol][lk.src];
        const tNode = nodes[lk.tgtCol][lk.tgt];
        const h = lk.value * ppu;
        const sOff = srcOffsets[lk.srcCol][lk.src] || 0;
        const tOff = tgtOffsets[lk.tgtCol][lk.tgt] || 0;
        srcOffsets[lk.srcCol][lk.src] = sOff + h;
        tgtOffsets[lk.tgtCol][lk.tgt] = tOff + h;
        return {
          ...lk, i, h,
          y0Top: sNode.y + sOff,
          y0Bot: sNode.y + sOff + h,
          y1Top: tNode.y + tOff,
          y1Bot: tNode.y + tOff + h,
        };
      });
    }, [graph.links, nodes, ppu]);

    const colorFor = (col, label) => graph.colorMaps[col][label] || '#94a3b8';

    // Hover-driven highlighting. A link is "lit" when it itself is hovered,
    // when either of its endpoints is hovered, or when nothing is hovered.
    const linkLit = (lk) => {
      if (hoverLink === lk.i) return true;
      if (hoverNode) {
        return (hoverNode.col === lk.srcCol && hoverNode.label === lk.src) ||
               (hoverNode.col === lk.tgtCol && hoverNode.label === lk.tgt);
      }
      return !hoverNode && hoverLink === null;
    };

    const nodeLit = (col, label) => {
      if (hoverNode && hoverNode.col === col && hoverNode.label === label) return true;
      if (hoverLink !== null) {
        const lk = positionedLinks[hoverLink];
        return (lk.srcCol === col && lk.src === label) || (lk.tgtCol === col && lk.tgt === label);
      }
      return !hoverNode && hoverLink === null;
    };

    // Helper used by the node-render loop below to fetch the right
    // ordered list for the current column.
    const colList = (col) =>
      col === 'aiApproach' ? graph.aiApproaches :
      col === 'dimension'  ? graph.dimensions   :
                             graph.validations;

    const totalH = PAD_TOP + PLOT_H + PAD_BOTTOM;

    return (
      <div className="space-y-3">

        <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full" preserveAspectRatio="xMidYMid meet">

          {/* Column headers */}
          <text x={COL_X.aiApproach}                y={16} textAnchor="end"    fontSize="11" fontWeight="600" fill="#64748b">{COL_KEYS.aiApproach.header}</text>
          <text x={COL_X.dimension + NODE_WIDTH/2}  y={16} textAnchor="middle" fontSize="11" fontWeight="600" fill="#64748b">{COL_KEYS.dimension.header}</text>
          <text x={COL_X.validation + NODE_WIDTH}   y={16} textAnchor="start"  fontSize="11" fontWeight="600" fill="#64748b">{COL_KEYS.validation.header}</text>

          {/* Links (drawn first so nodes sit on top) */}
          {positionedLinks.map((lk) => {
            const lit = linkLit(lk);
            const x0 = COL_X[lk.srcCol] + NODE_WIDTH;
            const x1 = COL_X[lk.tgtCol];
            const baseColor = colorFor(lk.srcCol, lk.src);
            return (
              <path
                key={lk.i}
                d={ribbonPath(x0, lk.y0Top, lk.y0Bot, x1, lk.y1Top, lk.y1Bot)}
                fill={baseColor}
                fillOpacity={lit ? 0.55 : 0.12}
                stroke="none"
                onMouseEnter={() => setHoverLink(lk.i)}
                onMouseLeave={() => setHoverLink(null)}
                onClick={() => onDrillDown && onDrillDown({
                  [COL_KEYS[lk.srcCol].filterKey]: lk.src,
                  [COL_KEYS[lk.tgtCol].filterKey]: lk.tgt,
                })}
                style={{ cursor: 'pointer', transition: 'fill-opacity 150ms' }}
              >
                <title>{`${lk.src} → ${lk.tgt}: ${lk.value} co-occurrence${lk.value === 1 ? '' : 's'}`}</title>
              </path>
            );
          })}

          {/* Nodes */}
          {['aiApproach', 'dimension', 'validation'].map(col => (
            colList(col).map(label => {
              const n = nodes[col][label];
              const lit = nodeLit(col, label);
              const color = colorFor(col, label);
              const isLeft = col === 'aiApproach';
              const labelX = isLeft  ? COL_X[col] - 8
                                     : COL_X[col] + NODE_WIDTH + 8;
              const anchor = isLeft ? 'end' : 'start';
              return (
                <g key={`${col}-${label}`}
                  onMouseEnter={() => setHoverNode({ col, label })}
                  onMouseLeave={() => setHoverNode(null)}
                  onClick={() => onDrillDown && onDrillDown({ [COL_KEYS[col].filterKey]: label })}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={COL_X[col]} y={n.y} width={NODE_WIDTH} height={n.h}
                    fill={color}
                    fillOpacity={lit ? 1 : 0.45}
                    stroke={lit ? '#0f172a' : 'none'}
                    strokeWidth={lit ? 1 : 0}
                    style={{ transition: 'all 150ms' }}
                  />
                  <text
                    x={labelX}
                    y={n.y + n.h / 2 + 4}
                    fontSize="11"
                    fontWeight={lit ? '700' : '500'}
                    fill={lit ? '#0f172a' : '#475569'}
                    textAnchor={anchor}
                    style={{ transition: 'all 150ms', pointerEvents: 'none' }}
                  >
                    {label}
                    {n.h > 14 && (
                      <tspan dx="6" fill={lit ? '#475569' : '#94a3b8'} fontSize="10" fontWeight="500">
                        {graph.totals[col][label]}
                      </tspan>
                    )}
                  </text>
                </g>
              );
            })
          ))}
        </svg>

        <p className="text-[11px] text-slate-400 italic text-center">
          Click any node to filter papers by that single value · Click any flow to filter by both endpoints
        </p>
      </div>
    );
  };

  window.AppCharts.SankeyChart = SankeyChart;
})();