/* =========================================================
   Interactive ports of four 09_Visualization figures.

   Each chart recomputes its own aggregation from the loaded
   data.csv rows using the same transforms as the matplotlib
   script it comes from, so the numbers match the published
   figure. Palettes and category orders are lifted from those
   scripts too.

     ApplicationPhaseRisk  Construction_application_phase_risk 60%.py
     FrameworkAnchoring    Framework_anchoring 60%.py
     DimensionNetwork      Governance_dimension_network 60%.py
     LayerUpset            Governance_layer_upset 60%.py

   (The rigor–governance tradeoff figure was removed from the
   webapp; its script and SVG are unchanged.)

   Every mark answers to the pointer: hover reads the value,
   click selects the papers behind it and lists them under the
   figure, and clicking a paper opens its full record.
   ========================================================= */

window.AppFigures = window.AppFigures || {};

(function () {
  const { useState, useMemo, useRef, useEffect } = React;
  const K = window.FigureKit;
  const { PALETTE, DEPTH_ORDER, splitMulti, rampColor, readableInk } = K;

  /* ---------- shared constants from the scripts ---------- */
  const PHASE_ORDER = ['Preconstruction', 'Design', 'Construction', 'Operation', 'Lifecycle'];
  const RISK_COLOR = {
    'Safety risk': PALETTE.blue,
    'Accuracy/performance risk': PALETTE.orange,
    'Accountability risk': PALETTE.aqua,
    'Privacy risk': PALETTE.violet,
  };
  const OTHER_RISK = 'Other risk';
  const OTHER_RISK_COLOR = PALETTE.grey;

  const FRAMEWORK_GROUPS = [
    ['Construction & sector instruments',
      ['Sector-specific standard', 'National building codes', 'ISO 19650']],
    ['AI & data-governance instruments',
      ['EU AI Act', 'GDPR', 'OECD principles', 'ISO/IEC 42001', 'NIST AI RMF']],
    ['No anchor', ['None explicit']],
  ];
  const OTHER_GROUP = 'Other instruments';

  const LAYER_ORDER = [
    'Mechanisms/tools', 'Actors/responsibility', 'Risk identification',
    'Lifecycle/scope', 'Principles/values',
  ];
  const APPROACH_ORDER = ['LLM-based', 'Hybrid', 'ML/Probabilistic', 'Other'];
  const APPROACH_COLOR = {
    'LLM-based': PALETTE.orange,
    'Hybrid': PALETTE.aqua,
    'ML/Probabilistic': PALETTE.violet,
    'Other': PALETTE.yellow,
  };
  const VALIDATION_ORDER = [
    'Theoretical only', 'Lab prototype', 'Single case study',
    'Multi-case validation', 'Industry adoption',
  ];

  const riskColor = (r) => RISK_COLOR[r] || OTHER_RISK_COLOR;
  const cell = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /* =========================================================
     1. Where AI is applied, and what risk it is framed against
     ========================================================= */

  const ApplicationPhaseRisk = ({ papersData, onPaperClick }) => {
    const [selected, setSelected] = useState(null);   // { app, phase } | { app } | { phase }
    const [hover, setHover] = useState(null);
    const tip = K.useTooltip();

    const model = useMemo(() => {
      const rows = papersData
        .map(p => ({
          paper: p,
          apps: splitMulti(p.Construction_Application),
          phases: splitMulti(p.Construction_Phase),
          risk: splitMulti(p.Primary_Risk_Addressed)[0] || 'None explicit',
        }))
        .filter(r => r.apps.length && r.phases.length);

      const appCount = new Map();
      const phaseSet = new Set();
      rows.forEach(r => {
        new Set(r.apps).forEach(a => appCount.set(a, (appCount.get(a) || 0) + 1));
        r.phases.forEach(p => phaseSet.add(p));
      });
      const apps = [...appCount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([a]) => a);
      const phases = PHASE_ORDER.filter(p => phaseSet.has(p))
        .concat([...phaseSet].filter(p => !PHASE_ORDER.includes(p)));

      // Overall risk frequency decides ties for a cell's dominant risk,
      // exactly as risk_rank() does in the script.
      const riskTotal = new Map();
      rows.forEach(r => riskTotal.set(r.risk, (riskTotal.get(r.risk) || 0) + 1));
      const rank = [...riskTotal.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);

      const cells = new Map();  // "app|phase" -> { n, risks: Map, papers: [] }
      rows.forEach(r => {
        new Set(r.apps).forEach(a => new Set(r.phases).forEach(ph => {
          const key = `${a}|${ph}`;
          if (!cells.has(key)) cells.set(key, { n: 0, risks: new Map(), papers: [] });
          const c = cells.get(key);
          c.n += 1;
          c.risks.set(r.risk, (c.risks.get(r.risk) || 0) + 1);
          c.papers.push(r.paper);
        }));
      });
      cells.forEach(c => {
        let best = null, bestN = -1;
        c.risks.forEach((n, r) => {
          const better = n > bestN || (n === bestN && rank.indexOf(r) < rank.indexOf(best));
          if (better) { best = r; bestN = n; }
        });
        c.risk = best;
      });

      const maxCell = Math.max(...[...cells.values()].map(c => c.n), 1);
      const maxApp = Math.max(...appCount.values(), 1);
      // The script keys four named risks and folds everything else into one
      // grey "Other risk", so the legend stays four colours plus a catch-all
      // rather than five shades of the same grey.
      const risksPresent = [];
      rank.forEach(r => {
        if (r === 'None explicit') return;
        const shown = RISK_COLOR[r] ? r : OTHER_RISK;
        if (!risksPresent.includes(shown)) risksPresent.push(shown);
      });
      return { rows, apps, phases, cells, appCount, maxCell, maxApp, risksPresent };
    }, [papersData]);

    const selectedPapers = useMemo(() => {
      if (!selected) return [];
      const seen = new Set();
      const out = [];
      model.rows.forEach(r => {
        const okApp = !selected.app || r.apps.includes(selected.app);
        const okPhase = !selected.phase || r.phases.includes(selected.phase);
        if (okApp && okPhase && !seen.has(r.paper)) { seen.add(r.paper); out.push(r.paper); }
      });
      return out;
    }, [selected, model]);

    const label = selected
      ? [selected.app, selected.phase].filter(Boolean).join('  ×  ')
      : '';

    return (
      <K.FigureFrame
        title="Where AI is applied in construction, and what risk it is framed against"
        caption="The grid says where the work sits; the colour says what it is defended against. Safety and worker monitoring concentrate in the construction phase under safety risk, while BIM compliance checking and design review sit in design and preconstruction under accuracy risk."
        encodes="Rows: construction application · Columns: project phase · Bubble area: papers coded to both · Colour: the cell's dominant primary risk · Right bars: unique papers per application"
        onReset={selected ? () => setSelected(null) : null}
        footer={selected && (
          <K.PaperList papers={selectedPapers} label={label} onPaperClick={onPaperClick}
            onClear={() => setSelected(null)} />
        )}
      >
        <div ref={tip.hostRef} className="relative">
          <K.Measured minWidth={520}>
            {(width) => {
              const padL = 168, padR = 108, padT = 54, rowH = 34;
              const plotW = Math.max(160, width - padL - padR);
              const colW = plotW / model.phases.length;
              const height = padT + model.apps.length * rowH + 12;
              const maxR = Math.min(rowH * 0.46, colW * 0.42);

              return (
                <svg width={width} height={height} className="select-none"
                     style={{ background: PALETTE.surface, borderRadius: 6 }}>
                  {/* zebra rows */}
                  {model.apps.map((a, ri) => (
                    <rect key={`z-${a}`} x={padL} y={padT + ri * rowH} width={plotW} height={rowH}
                      fill={ri % 2 ? 'transparent' : '#f4f3ef'}
                      opacity={hover && hover.app === a ? 1 : 0.85} />
                  ))}

                  {/* phase headers */}
                  {model.phases.map((ph, ci) => {
                    const x = padL + ci * colW + colW / 2;
                    const lit = hover && hover.phase === ph;
                    return (
                      <text key={ph} x={x} y={padT - 12} textAnchor="start" fontSize="11"
                        fill={lit ? PALETTE.inkPrimary : PALETTE.inkSecondary}
                        fontWeight={lit ? 700 : 500}
                        transform={`rotate(-28, ${x}, ${padT - 12})`}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHover({ phase: ph })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setSelected({ phase: ph })}>
                        {ph}
                      </text>
                    );
                  })}
                  <text x={padL + plotW + 12} y={padT - 12} fontSize="11" fill={PALETTE.inkSecondary}>
                    Papers
                  </text>

                  {/* rows */}
                  {model.apps.map((app, ri) => {
                    const y = padT + ri * rowH + rowH / 2;
                    const litRow = hover && hover.app === app;
                    const total = model.appCount.get(app);
                    return (
                      <g key={app}>
                        <text x={padL - 10} y={y + 4} textAnchor="end" fontSize="11"
                          fill={litRow ? PALETTE.inkPrimary : PALETTE.inkSecondary}
                          fontWeight={litRow ? 700 : 500}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHover({ app })}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => setSelected({ app })}>
                          {app.length > 26 ? app.slice(0, 25) + '…' : app}
                        </text>

                        {model.phases.map((ph, ci) => {
                          const c = model.cells.get(`${app}|${ph}`);
                          const cx = padL + ci * colW + colW / 2;
                          if (!c) {
                            return <circle key={ph} cx={cx} cy={y} r={2} fill="#dedcd4" />;
                          }
                          const r = Math.max(6, maxR * Math.sqrt(c.n / model.maxCell));
                          const isSel = selected && selected.app === app && selected.phase === ph;
                          const dim = hover && !(hover.app === app || hover.phase === ph);
                          const fill = riskColor(c.risk);
                          return (
                            <g key={ph} style={{ cursor: 'pointer' }}
                              onMouseEnter={(e) => {
                                setHover({ app, phase: ph });
                                tip.show(e, (
                                  <div>
                                    <div className="font-semibold">{app} · {ph}</div>
                                    <div className="mt-1">{c.n} paper{c.n === 1 ? '' : 's'}</div>
                                    <div className="mt-1 text-slate-300">
                                      {[...c.risks.entries()].sort((a, b) => b[1] - a[1])
                                        .map(([r2, n]) => `${r2} ${n}`).join(' · ')}
                                    </div>
                                    <div className="mt-1 text-slate-400">Click to list the papers</div>
                                  </div>
                                ));
                              }}
                              onMouseLeave={() => { setHover(null); tip.hide(); }}
                              onClick={() => setSelected({ app, phase: ph })}>
                              <circle cx={cx} cy={y} r={r} fill={fill}
                                opacity={dim ? 0.25 : 1}
                                stroke={isSel ? PALETTE.inkPrimary : 'none'} strokeWidth={isSel ? 2 : 0} />
                              <text x={cx} y={y + 3.5} textAnchor="middle" fontSize={r > 11 ? 10 : 8}
                                fill={readableInk(fill)} opacity={dim ? 0.3 : 1}
                                style={{ pointerEvents: 'none' }} fontWeight="600">
                                {c.n}
                              </text>
                            </g>
                          );
                        })}

                        {/* right bar: unique papers in this application */}
                        <g style={{ cursor: 'pointer' }}
                          onMouseEnter={(e) => {
                            setHover({ app });
                            tip.show(e, <div><span className="font-semibold">{app}</span><br />{total} papers</div>);
                          }}
                          onMouseLeave={() => { setHover(null); tip.hide(); }}
                          onClick={() => setSelected({ app })}>
                          <rect x={padL + plotW + 12} y={y - 7}
                            width={Math.max(2, (total / model.maxApp) * (padR - 40))} height={14}
                            fill={litRow ? PALETTE.inkSecondary : PALETTE.bar} rx="1" />
                          <text x={padL + plotW + 16 + (padR - 40)} y={y + 4} fontSize="10"
                            fill={PALETTE.inkSecondary} className="tabular-nums">{total}</text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
              );
            }}
          </K.Measured>
          <tip.Tooltip />
        </div>

        <div className="mt-3">
          <K.Legend
            items={model.risksPresent.map(r => ({ label: r, color: riskColor(r), shape: 'circle' }))}
            note="bubble area = papers in the cell"
          />
        </div>
      </K.FigureFrame>
    );
  };

  /* =========================================================
     2. What the corpus actually anchors to
     ========================================================= */

  const FrameworkAnchoring = ({ papersData, onPaperClick }) => {
    const [selected, setSelected] = useState(null); // { framework, country?, depth? }
    const [hover, setHover] = useState(null);
    const tip = K.useTooltip();

    const model = useMemo(() => {
      const pairs = [];
      papersData.forEach(p => {
        const fws = splitMulti(p.Regulatory_Framework_Aligned);
        const country = cell(p.Country_of_Study) || 'Not stated';
        const depth = cell(p.Governance_Depth);
        new Set(fws).forEach(f => pairs.push({ paper: p, framework: f, country, depth }));
      });

      const byFramework = new Map();
      const countryCount = new Map();
      pairs.forEach(pr => {
        if (!byFramework.has(pr.framework)) byFramework.set(pr.framework, []);
        byFramework.get(pr.framework).push(pr);
        countryCount.set(pr.country, (countryCount.get(pr.country) || 0) + 1);
      });

      const listed = new Set(FRAMEWORK_GROUPS.flatMap(g => g[1]));
      const groups = [];
      FRAMEWORK_GROUPS.forEach(([name, members]) => {
        const present = members.filter(m => byFramework.has(m));
        if (name === 'No anchor') return;             // appended last, after Other
        if (present.length) groups.push({ name, frameworks: present });
      });
      const others = [...byFramework.keys()].filter(f => !listed.has(f))
        .sort((a, b) => byFramework.get(b).length - byFramework.get(a).length);
      if (others.length) groups.push({ name: OTHER_GROUP, frameworks: others });
      const noAnchor = FRAMEWORK_GROUPS[2][1].filter(m => byFramework.has(m));
      if (noAnchor.length) groups.push({ name: 'No anchor', frameworks: noAnchor });

      const countries = [...countryCount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);

      const matrix = new Map(); // "fw|country" -> { n, depths: Map, papers: [] }
      pairs.forEach(pr => {
        const key = `${pr.framework}|${pr.country}`;
        if (!matrix.has(key)) matrix.set(key, { n: 0, depths: new Map(), papers: [] });
        const c = matrix.get(key);
        c.n += 1;
        c.depths.set(pr.depth, (c.depths.get(pr.depth) || 0) + 1);
        c.papers.push(pr.paper);
      });
      matrix.forEach(c => {
        let best = null, bestN = -1;
        c.depths.forEach((n, d) => {
          const better = n > bestN ||
            (n === bestN && DEPTH_ORDER.indexOf(d) < DEPTH_ORDER.indexOf(best));
          if (better) { best = d; bestN = n; }
        });
        c.depth = best;
      });

      const maxCell = Math.max(...[...matrix.values()].map(c => c.n), 1);
      const maxBar = Math.max(...[...byFramework.values()].map(v => v.length), 1);
      return { pairs, groups, byFramework, countries, matrix, maxCell, maxBar };
    }, [papersData]);

    const selectedPapers = useMemo(() => {
      if (!selected) return [];
      const seen = new Set(); const out = [];
      model.pairs.forEach(pr => {
        if (selected.framework && pr.framework !== selected.framework) return;
        if (selected.country && pr.country !== selected.country) return;
        if (selected.depth && pr.depth !== selected.depth) return;
        if (!seen.has(pr.paper)) { seen.add(pr.paper); out.push(pr.paper); }
      });
      return out;
    }, [selected, model]);

    const rowsFlat = model.groups.flatMap(g => g.frameworks.map(f => ({ group: g.name, framework: f })));

    return (
      <K.FigureFrame
        title="What the corpus actually anchors to"
        caption="Panel A gives total citations per framework, split by governance depth; panel B shows where those citations come from. Grouping the rows into construction and sector instruments, AI and data-governance instruments, and papers with no explicit framework is what makes the asymmetry legible."
        encodes="Rows: regulatory framework aligned · Bars: papers citing it, split by governance depth · Matrix columns: country of study · Dot area: papers in that framework × country cell · Dot colour: dominant governance depth"
        onReset={selected ? () => setSelected(null) : null}
        footer={selected && (
          <K.PaperList
            papers={selectedPapers}
            label={[selected.framework, selected.country, selected.depth].filter(Boolean).join('  ×  ')}
            onPaperClick={onPaperClick}
            onClear={() => setSelected(null)}
          />
        )}
      >
        <div ref={tip.hostRef} className="relative">
          <K.Measured minWidth={560}>
            {(width) => {
              const padL = 150, barW = 132, gap = 18, padT = 62, rowH = 26, padB = 74;
              const matrixW = Math.max(150, width - padL - barW - gap - 16);
              const colW = matrixW / model.countries.length;
              const nRows = rowsFlat.length + model.groups.length;  // rows + group headers
              const height = padT + nRows * rowH + padB;
              const maxR = Math.min(rowH * 0.42, colW * 0.44);
              const matrixX = padL + barW + gap;

              let y = padT;
              const rendered = [];
              model.groups.forEach(group => {
                rendered.push(
                  <text key={`g-${group.name}`} x={4} y={y + 14} fontSize="10"
                    fontWeight="700" fill={PALETTE.inkPrimary}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {group.name}
                  </text>
                );
                y += rowH;
                group.frameworks.forEach(fw => {
                  const rowY = y;
                  const entries = model.byFramework.get(fw) || [];
                  const total = entries.length;
                  const litRow = hover && hover.framework === fw;

                  // stacked depth bar
                  let x0 = padL;
                  const segs = DEPTH_ORDER.map(d => {
                    const n = entries.filter(e => e.depth === d).length;
                    const w = (n / model.maxBar) * barW;
                    const seg = { d, n, x: x0, w };
                    x0 += w;
                    return seg;
                  }).filter(s => s.n > 0);

                  rendered.push(
                    <g key={fw}>
                      <text x={padL - 8} y={rowY + rowH / 2 + 4} textAnchor="end" fontSize="10.5"
                        fill={litRow ? PALETTE.inkPrimary : PALETTE.inkSecondary}
                        fontWeight={litRow ? 700 : 500} style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHover({ framework: fw })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setSelected({ framework: fw })}>
                        {fw.length > 24 ? fw.slice(0, 23) + '…' : fw}
                      </text>
                      <text x={padL - 4} y={rowY + rowH / 2 + 4} textAnchor="start" fontSize="10"
                        fill={PALETTE.inkPrimary} fontWeight="700" className="tabular-nums"
                        style={{ pointerEvents: 'none' }}>
                        {' '}
                      </text>

                      {segs.map(s => (
                        <rect key={s.d} x={s.x + 14} y={rowY + 6} width={Math.max(1.5, s.w)} height={rowH - 12}
                          fill={PALETTE.depth[s.d] || PALETTE.bar} rx="1"
                          style={{ cursor: 'pointer' }}
                          opacity={hover && hover.framework && hover.framework !== fw ? 0.35 : 1}
                          onMouseEnter={(e) => {
                            setHover({ framework: fw });
                            tip.show(e, (
                              <div>
                                <div className="font-semibold">{fw}</div>
                                <div className="mt-1">{s.d}: {s.n} of {total} citations</div>
                                <div className="mt-1 text-slate-400">Click to list the papers</div>
                              </div>
                            ));
                          }}
                          onMouseLeave={() => { setHover(null); tip.hide(); }}
                          onClick={() => setSelected({ framework: fw, depth: s.d })} />
                      ))}
                      <text x={padL + 8} y={rowY + rowH / 2 + 4} textAnchor="end" fontSize="10"
                        fill={PALETTE.inkPrimary} fontWeight="700" className="tabular-nums">
                        {total}
                      </text>

                      {model.countries.map((country, ci) => {
                        const c = model.matrix.get(`${fw}|${country}`);
                        if (!c) return null;
                        const cx = matrixX + ci * colW + colW / 2;
                        const r = Math.max(3.4, maxR * Math.sqrt(c.n / model.maxCell));
                        const dim = hover && ((hover.framework && hover.framework !== fw) ||
                                              (hover.country && hover.country !== country));
                        return (
                          <g key={country} style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => {
                              setHover({ framework: fw, country });
                              tip.show(e, (
                                <div>
                                  <div className="font-semibold">{fw} · {country}</div>
                                  <div className="mt-1">{c.n} paper{c.n === 1 ? '' : 's'} · dominant depth: {c.depth}</div>
                                  <div className="mt-1 text-slate-400">Click to list the papers</div>
                                </div>
                              ));
                            }}
                            onMouseLeave={() => { setHover(null); tip.hide(); }}
                            onClick={() => setSelected({ framework: fw, country })}>
                            <circle cx={cx} cy={rowY + rowH / 2} r={r}
                              fill={PALETTE.depth[c.depth] || PALETTE.bar} opacity={dim ? 0.25 : 1} />
                            {r >= 7 && (
                              <text x={cx} y={rowY + rowH / 2 + 3} textAnchor="middle" fontSize="8"
                                fill={PALETTE.depthInk[c.depth] || '#fff'} style={{ pointerEvents: 'none' }}>
                                {c.n}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                  y += rowH;
                });
              });

              return (
                <svg width={width} height={height} className="select-none"
                     style={{ background: PALETTE.surface, borderRadius: 6 }}>
                  <text x={padL} y={20} fontSize="10" fill={PALETTE.inkMuted}>
                    Citations, by governance depth
                  </text>
                  <text x={matrixX} y={20} fontSize="10" fill={PALETTE.inkMuted}>
                    Country of study (papers)
                  </text>
                  {/* column guides */}
                  {model.countries.map((c, ci) => (
                    <line key={`v-${c}`} x1={matrixX + ci * colW + colW / 2} x2={matrixX + ci * colW + colW / 2}
                      y1={padT} y2={padT + nRows * rowH} stroke={PALETTE.gridline} strokeWidth="0.8"
                      opacity={hover && hover.country === c ? 0 : 1} />
                  ))}
                  {rendered}
                  {/* country labels */}
                  {model.countries.map((c, ci) => {
                    const x = matrixX + ci * colW + colW / 2;
                    const yy = padT + nRows * rowH + 10;
                    const lit = hover && hover.country === c;
                    return (
                      <text key={c} x={x} y={yy} fontSize="9.5" textAnchor="end"
                        fill={lit ? PALETTE.inkPrimary : PALETTE.inkSecondary}
                        fontWeight={lit ? 700 : 500}
                        transform={`rotate(-42, ${x}, ${yy})`} style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHover({ country: c })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setSelected({ country: c })}>
                        {c}
                      </text>
                    );
                  })}
                </svg>
              );
            }}
          </K.Measured>
          <tip.Tooltip />
        </div>

        <div className="mt-3">
          <K.Legend items={DEPTH_ORDER.map(d => ({ label: d, color: PALETTE.depth[d], shape: 'circle' }))}
            note="dot area = papers in the cell" />
        </div>
      </K.FigureFrame>
    );
  };

  /* =========================================================
     3. The governance-dimension co-occurrence network
     ========================================================= */

  // Deterministic weighted Fruchterman-Reingold, the same idea as the
  // script's layout: a fixed seed, repulsion between every pair, and
  // attraction along each edge scaled by its Jaccard weight.
  const layoutNetwork = (nodes, edges, width, height, iterations = 380) => {
    const n = nodes.length;
    const area = width * height;
    const k = Math.sqrt(area / n) * 0.62;
    let seed = 20240915;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pos = nodes.map((_, i) => {
      const a = (i / n) * Math.PI * 2;
      return {
        x: width / 2 + Math.cos(a) * width * 0.3 + (rand() - 0.5) * 20,
        y: height / 2 + Math.sin(a) * height * 0.3 + (rand() - 0.5) * 20,
      };
    });
    const index = new Map(nodes.map((d, i) => [d.label, i]));
    let temp = width * 0.09;
    for (let it = 0; it < iterations; it++) {
      const disp = pos.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
          let d = Math.hypot(dx, dy) || 0.01;
          const rep = (k * k) / d;
          dx /= d; dy /= d;
          disp[i].x += dx * rep; disp[i].y += dy * rep;
          disp[j].x -= dx * rep; disp[j].y -= dy * rep;
        }
      }
      edges.forEach(e => {
        const i = index.get(e.source), j = index.get(e.target);
        let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        let d = Math.hypot(dx, dy) || 0.01;
        const att = (d * d) / k * e.weight * 2.4;
        dx /= d; dy /= d;
        disp[i].x -= dx * att; disp[i].y -= dy * att;
        disp[j].x += dx * att; disp[j].y += dy * att;
      });
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(disp[i].x, disp[i].y) || 0.01;
        pos[i].x += (disp[i].x / d) * Math.min(d, temp);
        pos[i].y += (disp[i].y / d) * Math.min(d, temp);
        pos[i].x = Math.max(0, Math.min(width, pos[i].x));
        pos[i].y = Math.max(0, Math.min(height, pos[i].y));
      }
      temp *= 0.985;
    }
    // Normalise into the frame with a margin for labels
    const xs = pos.map(p => p.x), ys = pos.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return pos.map(p => ({
      x: ((p.x - minX) / (maxX - minX || 1)) * width,
      y: ((p.y - minY) / (maxY - minY || 1)) * height,
    }));
  };

  const DimensionNetwork = ({ papersData, onPaperClick }) => {
    const [selected, setSelected] = useState(null);  // { node } | { a, b }
    const [hover, setHover] = useState(null);
    const [drag, setDrag] = useState(null);
    const [offsets, setOffsets] = useState({});
    const tip = K.useTooltip();

    const model = useMemo(() => {
      const rows = papersData
        .map(p => ({ paper: p, dims: [...new Set(splitMulti(p.Governance_Dimensions))],
                     primary: cell(p.Primary_Governance_Dimension) }))
        .filter(r => r.dims.length);

      const count = new Map(), primary = new Map();
      rows.forEach(r => {
        r.dims.forEach(d => count.set(d, (count.get(d) || 0) + 1));
        if (r.primary) primary.set(r.primary, (primary.get(r.primary) || 0) + 1);
      });
      const names = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.localeCompare(b));

      const co = new Map();
      rows.forEach(r => {
        const s = [...r.dims].sort();
        for (let i = 0; i < s.length; i++) {
          for (let j = i + 1; j < s.length; j++) {
            const key = `${s[i]}|${s[j]}`;
            co.set(key, (co.get(key) || 0) + 1);
          }
        }
      });
      const edges = [...co.entries()].map(([key, n]) => {
        const [a, b] = key.split('|');
        return { source: a, target: b, n, weight: n / (count.get(a) + count.get(b) - n) };
      });
      const nodes = names.map(label => ({
        label,
        count: count.get(label),
        primary: primary.get(label) || 0,
        share: (primary.get(label) || 0) / count.get(label),
      }));
      return { rows, nodes, edges, maxCount: Math.max(...nodes.map(n => n.count), 1),
               maxWeight: Math.max(...edges.map(e => e.weight), 0.01),
               minWeight: Math.min(...edges.map(e => e.weight), 0) };
    }, [papersData]);

    const selectedPapers = useMemo(() => {
      if (!selected) return [];
      return model.rows.filter(r => {
        if (selected.node) return r.dims.includes(selected.node);
        return r.dims.includes(selected.a) && r.dims.includes(selected.b);
      }).map(r => r.paper);
    }, [selected, model]);

    return (
      <K.FigureFrame
        title="The governance-dimension co-occurrence network"
        caption="Edges are the Jaccard index — papers naming both over papers naming either — rather than raw co-occurrence. Every possible pair in this corpus co-occurs at least twice, so the raw graph is complete and node degree carries nothing; dividing out frequency is what turns a hairball into structure. Drag a node to pull the layout apart."
        encodes="Node area: papers naming the dimension · Node colour: share of those papers where it is the primary dimension · Edge width: Jaccard association · Layout: weighted force-directed"
        onReset={selected ? () => setSelected(null) : null}
        footer={selected && (
          <K.PaperList papers={selectedPapers}
            label={selected.node || `${selected.a}  ×  ${selected.b}`}
            onPaperClick={onPaperClick} onClear={() => setSelected(null)} />
        )}
      >
        <div ref={tip.hostRef} className="relative">
          <K.Measured minWidth={520}>
            {(width) => {
              const height = Math.max(420, Math.round(width * 0.66));
              const m = 74;
              const base = layoutNetwork(model.nodes, model.edges, width - m * 2, height - m * 2);
              const pos = model.nodes.map((nd, i) => {
                const o = offsets[nd.label] || { x: 0, y: 0 };
                return { x: base[i].x + m + o.x, y: base[i].y + m + o.y };
              });
              const at = (label) => pos[model.nodes.findIndex(n => n.label === label)];
              const radius = (nd) => 8 + 26 * Math.sqrt(nd.count / model.maxCount);

              const onMove = (e) => {
                if (!drag) return;
                const box = e.currentTarget.getBoundingClientRect();
                setOffsets(prev => ({
                  ...prev,
                  [drag.label]: {
                    x: (e.clientX - box.left) - drag.originX,
                    y: (e.clientY - box.top) - drag.originY,
                  },
                }));
              };

              return (
                <svg width={width} height={height} className="select-none"
                  style={{ background: PALETTE.surface, borderRadius: 6, cursor: drag ? 'grabbing' : 'default' }}
                  onMouseMove={onMove}
                  onMouseUp={() => setDrag(null)}
                  onMouseLeave={() => setDrag(null)}>

                  {model.edges.map((e, i) => {
                    const a = at(e.source), b = at(e.target);
                    const lit = !hover ||
                      (hover.node && (hover.node === e.source || hover.node === e.target)) ||
                      (hover.edge === i);
                    const w = 0.6 + 6.5 * ((e.weight - model.minWeight) /
                      (model.maxWeight - model.minWeight || 1));
                    return (
                      <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={hover && hover.edge === i ? PALETTE.inkSecondary : '#c8c7c2'}
                        strokeWidth={w} strokeLinecap="round"
                        opacity={lit ? 0.85 : 0.13} style={{ cursor: 'pointer' }}
                        onMouseEnter={(ev) => {
                          setHover({ edge: i });
                          tip.show(ev, (
                            <div>
                              <div className="font-semibold">{e.source} ↔ {e.target}</div>
                              <div className="mt-1">Jaccard {e.weight.toFixed(2)} · {e.n} papers name both</div>
                              <div className="mt-1 text-slate-400">Click to list them</div>
                            </div>
                          ));
                        }}
                        onMouseLeave={() => { setHover(null); tip.hide(); }}
                        onClick={() => setSelected({ a: e.source, b: e.target })} />
                    );
                  })}

                  {model.nodes.map((nd, i) => {
                    const p = pos[i];
                    const r = radius(nd);
                    const fill = rampColor(nd.share * 1.6);
                    const isSel = selected && selected.node === nd.label;
                    const lit = !hover || hover.node === nd.label ||
                      (hover.edge !== undefined &&
                        (model.edges[hover.edge].source === nd.label ||
                         model.edges[hover.edge].target === nd.label)) ||
                      (hover.node && model.edges.some(e =>
                        (e.source === hover.node && e.target === nd.label) ||
                        (e.target === hover.node && e.source === nd.label)));
                    return (
                      <g key={nd.label} opacity={lit ? 1 : 0.25}>
                        <circle cx={p.x} cy={p.y} r={r} fill={fill}
                          stroke={isSel ? PALETTE.inkPrimary : '#ffffff'} strokeWidth={isSel ? 2.4 : 1.4}
                          style={{ cursor: 'grab' }}
                          onMouseDown={(ev) => {
                            const box = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
                            const o = offsets[nd.label] || { x: 0, y: 0 };
                            setDrag({ label: nd.label,
                              originX: (ev.clientX - box.left) - o.x,
                              originY: (ev.clientY - box.top) - o.y });
                          }}
                          onMouseEnter={(ev) => {
                            setHover({ node: nd.label });
                            tip.show(ev, (
                              <div>
                                <div className="font-semibold">{nd.label}</div>
                                <div className="mt-1">{nd.count} papers · primary in {nd.primary} ({(nd.share * 100).toFixed(0)}%)</div>
                                <div className="mt-1 text-slate-400">Drag to move · click to list the papers</div>
                              </div>
                            ));
                          }}
                          onMouseLeave={() => { setHover(null); tip.hide(); }}
                          onClick={() => !drag && setSelected({ node: nd.label })} />
                        <text x={p.x} y={p.y - r - 6} textAnchor="middle" fontSize="11"
                          fontWeight={hover && hover.node === nd.label ? 700 : 600}
                          fill={PALETTE.inkPrimary} style={{ pointerEvents: 'none' }}>
                          {nd.label}
                        </text>
                        <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10"
                          fill={readableInk(fill)} style={{ pointerEvents: 'none' }} fontWeight="600">
                          {nd.count}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            }}
          </K.Measured>
          <tip.Tooltip />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[11px] text-slate-500">Share primary</span>
          <div className="flex h-3 w-28 rounded overflow-hidden border border-slate-200">
            {PALETTE.ramp.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
          </div>
          <span className="text-[11px] text-slate-400">low → high</span>
          {Object.keys(offsets).length > 0 && (
            <button onClick={() => setOffsets({})}
              className="text-[11px] text-slate-400 hover:text-slate-900 underline underline-offset-2">
              Reset layout
            </button>
          )}
        </div>
      </K.FigureFrame>
    );
  };

  /* ---------- hatch fills for the UpSet figure ----------
     Colour alone made the depth and approach categories hard to
     tell apart in small segments, so each one also gets its own
     texture: solid, diagonal lines, cross-hatch, dots, etc. */
  const DEPTH_HATCH = {
    'Primary focus':        { bg: '#104281', kind: 'solid' },
    'Secondary discussion': { bg: '#2a78d6', kind: 'diag',  ink: '#ffffff' },
    'Brief mention':        { bg: '#cde2fb', kind: 'cross', ink: '#104281' },
  };
  const APPROACH_HATCH = {
    'LLM-based':        { bg: PALETTE.orange, kind: 'solid' },
    'Hybrid':           { bg: PALETTE.aqua,   kind: 'anti',  ink: '#ffffff' },
    'ML/Probabilistic': { bg: PALETTE.violet, kind: 'dots',  ink: '#ffffff' },
    'Other':            { bg: PALETTE.yellow, kind: 'horiz', ink: '#0b0b0b' },
  };
  const hatchSlug = (k) => String(k).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const HatchPattern = ({ id, spec }) => {
    if (spec.kind === 'solid') return null;
    const S = 6;
    const line = (props) => <line stroke={spec.ink} strokeWidth="1.5" {...props} />;
    let marks = null, transform;
    if (spec.kind === 'diag')  { transform = 'rotate(45)';  marks = line({ x1: 0, y1: 0, x2: 0, y2: S }); }
    if (spec.kind === 'anti')  { transform = 'rotate(-45)'; marks = line({ x1: 0, y1: 0, x2: 0, y2: S }); }
    if (spec.kind === 'horiz') { marks = line({ x1: 0, y1: S / 2, x2: S, y2: S / 2, strokeWidth: 1.2 }); }
    if (spec.kind === 'cross') {
      transform = 'rotate(45)';
      marks = <>{line({ x1: 0, y1: 0, x2: 0, y2: S, strokeWidth: 0.9 })}{line({ x1: 0, y1: 0, x2: S, y2: 0, strokeWidth: 0.9 })}</>;
    }
    if (spec.kind === 'dots')  { marks = <circle cx={S / 2} cy={S / 2} r="1.3" fill={spec.ink} />; }
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={S} height={S} patternTransform={transform}>
        <rect width={S} height={S} fill={spec.bg} />
        {marks}
      </pattern>
    );
  };

  const hatchFill = (prefix, key, spec) =>
    spec.kind === 'solid' ? spec.bg : `url(#${prefix}-${hatchSlug(key)})`;

  const HatchLegend = ({ specs, order, prefix }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
      {order.map(k => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <svg width="16" height="12" className="flex-shrink-0">
            <defs><HatchPattern id={`${prefix}-${hatchSlug(k)}`} spec={specs[k]} /></defs>
            <rect x="0.5" y="0.5" width="15" height="11" rx="1.5"
              fill={hatchFill(prefix, k, specs[k])} stroke="#94a3b8" strokeWidth="0.6" />
          </svg>
          {k}
        </span>
      ))}
    </div>
  );

  /* =========================================================
     4. Which governance layers a paper actually covers (UpSet)
     ========================================================= */

  const LayerUpset = ({ papersData, onPaperClick }) => {
    const [selected, setSelected] = useState(null);
    const [hover, setHover] = useState(null);
    const tip = K.useTooltip();

    const model = useMemo(() => {
      const rows = papersData
        .map(p => {
          const layers = [...new Set(splitMulti(p.Governance_Layer_Addressed))];
          const approachRaw = splitMulti(p.AI_Approach_Type)[0] || 'Other';
          return {
            paper: p,
            layers,
            key: [...layers].sort().join(' | '),
            depth: cell(p.Governance_Depth),
            approach: APPROACH_ORDER.includes(approachRaw) ? approachRaw : 'Other',
          };
        })
        .filter(r => r.layers.length);

      const byCombo = new Map();
      rows.forEach(r => {
        if (!byCombo.has(r.key)) byCombo.set(r.key, { key: r.key, layers: r.layers, rows: [] });
        byCombo.get(r.key).rows.push(r);
      });
      const combos = [...byCombo.values()].sort((a, b) =>
        b.rows.length - a.rows.length ||
        a.layers.length - b.layers.length ||
        a.key.localeCompare(b.key));

      const layers = LAYER_ORDER.filter(l => rows.some(r => r.layers.includes(l)))
        .concat([...new Set(rows.flatMap(r => r.layers))].filter(l => !LAYER_ORDER.includes(l)));
      const setSize = new Map(layers.map(l => [l, rows.filter(r => r.layers.includes(l)).length]));

      return { rows, combos, layers, setSize,
               maxCombo: Math.max(...combos.map(c => c.rows.length), 1),
               maxSet: Math.max(...[...setSize.values()], 1) };
    }, [papersData]);

    const selectedPapers = useMemo(() => {
      if (!selected) return [];
      if (selected.combo) {
        const c = model.combos.find(x => x.key === selected.combo);
        return c ? c.rows.map(r => r.paper) : [];
      }
      return model.rows.filter(r => r.layers.includes(selected.layer)).map(r => r.paper);
    }, [selected, model]);

    return (
      <K.FigureFrame
        title="Which governance layers a paper actually covers"
        caption="An UpSet plot: each column is one combination of layers that actually occurs, with the matrix below naming which layers are in it. Combinations that never occur get no column — the point of the form is to show which combinations exist rather than forcing a 2⁵ grid that would be mostly empty."
        encodes="Columns: observed layer combinations · Bar height: papers · Bar colour: governance depth · Strip below the matrix: AI approach · Left bars: papers per layer"
        onReset={selected ? () => setSelected(null) : null}
        footer={selected && (
          <K.PaperList papers={selectedPapers}
            label={selected.combo ? selected.combo.replace(/ \| /g, ' + ') : `Layer: ${selected.layer}`}
            onPaperClick={onPaperClick} onClear={() => setSelected(null)} />
        )}
      >
        <div ref={tip.hostRef} className="relative">
          <K.Measured minWidth={560}>
            {(width) => {
              const padL = 168, setW = 76, countW = 26, gap = 14, barsH = 168, matrixTop = barsH + 18;
              const rowH = 26, stripH = 32;
              const plotX = padL + setW + countW + gap;
              const plotW = Math.max(180, width - plotX - 14);
              const colW = plotW / model.combos.length;
              const height = matrixTop + model.layers.length * rowH + stripH + 34;

              return (
                <svg width={width} height={height} className="select-none"
                     style={{ background: PALETTE.surface, borderRadius: 6 }}>
                  <defs>
                    {DEPTH_ORDER.map(d => (
                      <HatchPattern key={d} id={`ups-depth-${hatchSlug(d)}`} spec={DEPTH_HATCH[d]} />
                    ))}
                    {APPROACH_ORDER.map(a => (
                      <HatchPattern key={a} id={`ups-appr-${hatchSlug(a)}`} spec={APPROACH_HATCH[a]} />
                    ))}
                  </defs>
                  {/* y-axis guides for the count bars */}
                  {[0, 0.25, 0.5, 0.75, 1].map(t => (
                    <g key={t}>
                      <line x1={plotX} x2={plotX + plotW} y1={barsH - t * (barsH - 18)}
                        y2={barsH - t * (barsH - 18)} stroke={PALETTE.gridline} strokeWidth="0.8" />
                      <text x={plotX - 6} y={barsH - t * (barsH - 18) + 3} fontSize="9"
                        textAnchor="end" fill={PALETTE.inkMuted} className="tabular-nums">
                        {Math.round(t * model.maxCombo)}
                      </text>
                    </g>
                  ))}

                  {/* set-size bars */}
                  <text x={padL} y={matrixTop - 8} fontSize="9" fill={PALETTE.inkMuted}>Papers per layer</text>
                  {model.layers.map((l, li) => {
                    const y = matrixTop + li * rowH;
                    const n = model.setSize.get(l);
                    const w = (n / model.maxSet) * setW;
                    const lit = hover && hover.layer === l;
                    return (
                      <g key={l} style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => {
                          setHover({ layer: l });
                          tip.show(e, <div><span className="font-semibold">{l}</span><br />{n} papers address this layer<br /><span className="text-slate-400">Click to list them</span></div>);
                        }}
                        onMouseLeave={() => { setHover(null); tip.hide(); }}
                        onClick={() => setSelected({ layer: l })}>
                        <text x={padL - 10} y={y + rowH / 2 + 4} textAnchor="end" fontSize="10.5"
                          fill={lit ? PALETTE.inkPrimary : PALETTE.inkSecondary}
                          fontWeight={lit ? 700 : 500}>{l}</text>
                        <rect x={padL} y={y + 6} width={Math.max(2, w)} height={rowH - 12}
                          fill={lit ? PALETTE.inkSecondary : PALETTE.bar} rx="1" />
                        <text x={padL + Math.max(2, w) + 4} y={y + rowH / 2 + 3.5} textAnchor="start"
                          fontSize="9.5" fill={PALETTE.inkSecondary} className="tabular-nums">{n}</text>
                      </g>
                    );
                  })}

                  {/* columns */}
                  {model.combos.map((combo, ci) => {
                    const x = plotX + ci * colW;
                    const cw = Math.max(6, colW * 0.62);
                    const cx = x + colW / 2;
                    const total = combo.rows.length;
                    const isSel = selected && selected.combo === combo.key;
                    const dim = hover && hover.combo !== undefined && hover.combo !== ci;

                    let yTop = barsH;
                    const segs = DEPTH_ORDER.map(d => {
                      const n = combo.rows.filter(r => r.depth === d).length;
                      const h = (n / model.maxCombo) * (barsH - 18);
                      yTop -= h;
                      return { d, n, y: yTop, h };
                    }).filter(s => s.n > 0);

                    const strip = APPROACH_ORDER.map(a => ({
                      a, n: combo.rows.filter(r => r.approach === a).length,
                    })).filter(s => s.n > 0);
                    let sx = cx - cw / 2;

                    return (
                      <g key={combo.key} opacity={dim ? 0.3 : 1} style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => {
                          setHover({ combo: ci });
                          tip.show(e, (
                            <div>
                              <div className="font-semibold">{combo.layers.join(' + ')}</div>
                              <div className="mt-1">{total} paper{total === 1 ? '' : 's'}</div>
                              <div className="mt-1 text-slate-300">
                                {segs.map(s => `${s.d} ${s.n}`).join(' · ')}
                              </div>
                              <div className="mt-1 text-slate-400">Click to list them</div>
                            </div>
                          ));
                        }}
                        onMouseLeave={() => { setHover(null); tip.hide(); }}
                        onClick={() => setSelected({ combo: combo.key })}>

                        {segs.map(s => (
                          <rect key={s.d} x={cx - cw / 2} y={s.y} width={cw} height={Math.max(1, s.h)}
                            fill={DEPTH_HATCH[s.d] ? hatchFill('ups-depth', s.d, DEPTH_HATCH[s.d]) : PALETTE.bar}
                            stroke={isSel ? PALETTE.inkPrimary : '#ffffff'} strokeWidth={isSel ? 1.4 : 0.6} />
                        ))}
                        <text x={cx} y={barsH - (total / model.maxCombo) * (barsH - 18) - 5}
                          textAnchor="middle" fontSize="9.5" fill={PALETTE.inkPrimary}
                          className="tabular-nums" fontWeight="600">{total}</text>

                        {/* membership matrix */}
                        {model.layers.map((l, li) => {
                          const on = combo.layers.includes(l);
                          const y = matrixTop + li * rowH + rowH / 2;
                          return (
                            <circle key={l} cx={cx} cy={y} r={on ? 5.4 : 3}
                              fill={on ? PALETTE.inkSecondary : '#e4e2da'} />
                          );
                        })}
                        {/* connector */}
                        {(() => {
                          const idx = model.layers.map((l, li) => combo.layers.includes(l) ? li : -1)
                            .filter(i => i >= 0);
                          if (idx.length < 2) return null;
                          return (
                            <line x1={cx} x2={cx}
                              y1={matrixTop + Math.min(...idx) * rowH + rowH / 2}
                              y2={matrixTop + Math.max(...idx) * rowH + rowH / 2}
                              stroke={PALETTE.inkSecondary} strokeWidth="1.6" />
                          );
                        })()}

                        {/* approach strip */}
                        {strip.map(s => {
                          const w = (s.n / total) * cw;
                          const rect = (
                            <rect key={s.a} x={sx} y={matrixTop + model.layers.length * rowH + 6}
                              width={Math.max(1.5, w)} height={stripH - 12}
                              fill={hatchFill('ups-appr', s.a, APPROACH_HATCH[s.a])}
                              stroke="#ffffff" strokeWidth="0.6" />
                          );
                          sx += w;
                          return rect;
                        })}
                      </g>
                    );
                  })}

                  <text x={plotX} y={matrixTop + model.layers.length * rowH + stripH + 14}
                    fontSize="9" fill={PALETTE.inkMuted}>AI approach within each combination</text>
                </svg>
              );
            }}
          </K.Measured>
          <tip.Tooltip />
        </div>

        <div className="mt-3 space-y-1.5">
          <HatchLegend specs={DEPTH_HATCH} order={DEPTH_ORDER} prefix="ups-leg-depth" />
          <HatchLegend specs={APPROACH_HATCH} order={APPROACH_ORDER} prefix="ups-leg-appr" />
        </div>
      </K.FigureFrame>
    );
  };

  window.AppFigures.corpus = {
    ApplicationPhaseRisk, FrameworkAnchoring, DimensionNetwork, LayerUpset,
  };
})();
