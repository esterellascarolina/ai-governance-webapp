/* =========================================================
   App entry point.

   - Loads data.csv with PapaParse.
   - Maintains a `tab` state ('findings' | 'papers').
   - Findings tab: stat row + 8 horizontal bar charts. Each
     chart's bar is clickable and drills down to a filtered
     view on the Papers tab.
   - Papers tab: sticky search + filter panel, paper grid,
     and a modal that opens with the full record on click.
   - AI Assistant tab: Q&A grounded in the reviewed papers.

   The AI regulations material that used to live here (the
   Regulations tab and the regulatory figures) is now its own
   webapp in 09_AI Regulations/6_Webapp.
   ========================================================= */

(function() {
  const { useState, useEffect, useMemo } = React;
  const { countBy, uniqueValues, splitMulti } = window.AppUtils;
  const { BarChart, YearChart, SankeyChart, HeatmapChart, AIChat, TreemapChart, FigureSections } = window.AppCharts;
  const { ChartCard, StatCard, FilterGroup, PaperCard, PaperModal } = window.AppComponents;

  /* ----- AI assistant config -----------------------------------------------
     URL of your Cloudflare Worker (or equivalent proxy). The worker must
     expose POST /embed and POST /generate and hold the Gemini API key as
     a secret. The browser must never see the key directly.

     Leave as '' to disable the tab's calls (the UI will still render and
     show a friendly error on submit).
     ---------------------------------------------------------------------- */
  const GEMINI_WORKER_BASE = '';

  /* ----- filter facets -------------------------------------------------
     One entry per filter the UI can apply. Order here drives both the
     filter panel and the drill-down mapping from each chart.

     - key:    field on `filters` state and the drillDown() argument
     - col:    CSV column to match against
     - multi:  true if the cell is a ';'-separated list (one paper can
               belong to several values), false if it's a single value
     - label:  what to show above the chip row in the filter panel
     - truncate: optional max chip length to avoid huge regulation chips
     ------------------------------------------------------------------ */
  const FACETS = [
    { key: 'years',          col: 'Year',                          multi: false, label: 'Year' },
    { key: 'countries',      col: 'Country_of_Study',              multi: false, label: 'Country' },
    { key: 'methods',        col: 'Research_Method',               multi: false, label: 'Research Method' },
    { key: 'validation',     col: 'Validation_Level',              multi: true,  label: 'Validation Level' },
    { key: 'aiTech',         col: 'AI_Technology',                 multi: true,  label: 'AI Technology' },
    { key: 'aiApproach',     col: 'AI_Approach_Type',              multi: true,  label: 'AI Approach' },
    { key: 'govLayers',      col: 'Governance_Layer_Addressed',    multi: true,  label: 'Governance Layer' },
    { key: 'govDims',        col: 'Governance_Dimensions',         multi: true,  label: 'Governance Dimension' },
    { key: 'primaryGovDim',  col: 'Primary_Governance_Dimension',  multi: false, label: 'Primary Governance Dimension' },
    { key: 'govMechs',       col: 'Governance_Mechanism_Type',     multi: true,  label: 'Governance Mechanism' },
    { key: 'risks',          col: 'Primary_Risk_Addressed',        multi: true,  label: 'Primary Risk' },
    { key: 'regs',           col: 'Regulatory_Framework_Aligned',  multi: true,  label: 'Regulatory Framework' },
    { key: 'regulations',    col: 'Regulations_Analyzed',          multi: true,  label: 'Regulation Analyzed',     truncate: 45 },
    { key: 'apps',           col: 'Construction_Application',      multi: true,  label: 'Construction Application', truncate: 45 },
    { key: 'journals',       col: 'Source title',                  multi: false, label: 'Journal',                  truncate: 45 },
  ];

  // Helper: build the empty filters object from FACETS so we never get
  // the keys out of sync if we add a new facet later.
  const makeEmptyFilters = () =>
    Object.fromEntries(FACETS.map(f => [f.key, new Set()]));

  function App() {
    const [data, setData]                 = useState([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState(null);
    const [tab, setTab]                   = useState('findings');
    const [search, setSearch]             = useState('');
    const [filters, setFilters]           = useState(makeEmptyFilters);
    const [showFilters, setShowFilters]   = useState(false);
    const [selectedPaper, setSelectedPaper] = useState(null);
    const [sankeySelection, setSankeySelection] = useState(null); // { filters: {key→Set}, label: string }

    /* ----- data loading ----- */
    useEffect(() => {
      Papa.parse('./data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
        complete: (results) => {
          const cleaned = results.data
            .filter(r => r.Title && r.Title.trim())
            .map(r => ({ ...r, Year: r.Year ? String(r.Year).trim() : '' }));
          setData(cleaned);
          setLoading(false);
        },
        error: (err) => { setError(err.message); setLoading(false); },
      });
    }, []);

    /* ----- filter helpers ----- */
    const toggleFilter = (key, value) => {
      setFilters(prev => {
        const next = { ...prev, [key]: new Set(prev[key]) };
        if (next[key].has(value)) next[key].delete(value);
        else next[key].add(value);
        return next;
      });
    };

    const clearFilters = () => {
      setFilters(makeEmptyFilters());
      setSearch('');
    };

    // Called when a chart element is clicked. Accepts an object whose keys
    // are facet keys and values are single label strings — that way bar
    // charts (one filter) and heatmap cells / Sankey links (two filters)
    // share the same API.
    //
    //   drillDown({ countries: 'United States' })
    //   drillDown({ govLayers: 'Mechanisms/tools', govDims: 'Accountability' })
    const drillDown = (updates) => {
      const next = makeEmptyFilters();
      Object.entries(updates).forEach(([key, value]) => {
        next[key] = new Set([value]);
      });
      setFilters(next);
      setTab('papers');
      setShowFilters(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Sankey-specific drill-down: filters papers inline below the chart
    // without switching tabs. Accepts same {key: value} shape as drillDown.
    const sankeyDrillDown = (updates) => {
      const filterSets = {};
      Object.entries(updates).forEach(([key, value]) => {
        filterSets[key] = new Set([value]);
      });
      const label = Object.entries(updates)
        .map(([key, value]) => {
          const facet = FACETS.find(f => f.key === key);
          return `${facet ? facet.label : key}: ${value}`;
        })
        .join(' · ');
      setSankeySelection({ filters: filterSets, label });
    };

    const sankeyPapers = useMemo(() => {
      if (!sankeySelection) return [];
      return data.filter(r => {
        for (const [key, valueSet] of Object.entries(sankeySelection.filters)) {
          const facet = FACETS.find(f => f.key === key);
          if (!facet) continue;
          if (facet.multi) {
            const items = splitMulti(r[facet.col]);
            if (!items.some(v => valueSet.has(v))) return false;
          } else {
            if (!valueSet.has((r[facet.col] || '').trim())) return false;
          }
        }
        return true;
      });
    }, [data, sankeySelection]);
    const filtered = useMemo(() => {
      const q = search.trim().toLowerCase();
      return data.filter(r => {
        // Apply every facet's set. For multi-value columns the row
        // matches if any item in the cell is in the filter set.
        for (const f of FACETS) {
          const active = filters[f.key];
          if (active.size === 0) continue;
          if (f.multi) {
            const items = splitMulti(r[f.col]);
            if (!items.some(v => active.has(v))) return false;
          } else {
            if (!active.has((r[f.col] || '').trim())) return false;
          }
        }
        // Free-text search across the fields a reader most likely
        // types into the box.
        if (q) {
          const blob = [
            r.Title, r.Abstract, r.Authors,
            r.AI_Technology, r.Governance_Dimensions,
            r.Regulations_Analyzed, r['Author Keywords'],
          ].filter(Boolean).join(' ').toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      });
    }, [data, filters, search]);

    const totalFilters = Object.values(filters).reduce((s, set) => s + set.size, 0);

    /* ----- counts (for both charts and filter chips) ----- */
    const yearCounts          = useMemo(() => countBy(data, 'Year'),                                  [data]);
    // Year counts re-sorted by year descending (newest first) for the
    // horizontal at-a-glance chart. yearCounts itself stays in count
    // order, which is what the filter chip ordering downstream expects.
    const yearCountsByYear    = useMemo(
      () => [...yearCounts].sort((a, b) => b[0].localeCompare(a[0])),
      [yearCounts]
    );
    const countryCounts       = useMemo(() => countBy(data, 'Country_of_Study'),                      [data]);
    const aiTechCounts        = useMemo(() => countBy(data, 'AI_Technology',                    true), [data]);
    const govDimCounts        = useMemo(() => countBy(data, 'Governance_Dimensions',            true), [data]);
    const primaryGovDimCounts = useMemo(() => countBy(data, 'Primary_Governance_Dimension'),          [data]);
    const riskCounts          = useMemo(() => countBy(data, 'Primary_Risk_Addressed',           true), [data]);
    const regCounts           = useMemo(() => countBy(data, 'Regulatory_Framework_Aligned',     true), [data]);
    const regulationsCounts   = useMemo(() => countBy(data, 'Regulations_Analyzed',             true), [data]);
    const appCounts           = useMemo(() => countBy(data, 'Construction_Application',         true), [data]);
    const methodCounts        = useMemo(() => countBy(data, 'Research_Method'),                       [data]);
    const journalCounts       = useMemo(() => countBy(data, 'Source title'),                          [data]);
    const allRegulations      = useMemo(() => uniqueValues(data, 'Regulations_Analyzed',        true), [data]);

    // The full sorted list of values per facet, used by FilterGroup.
    // Years sort descending (newest first); everything else uses the
    // descending-by-count order that countBy already returns.
    const facetValues = useMemo(() => {
      const out = {};
      FACETS.forEach(f => {
        const vals = uniqueValues(data, f.col, f.multi);
        out[f.key] = f.key === 'years'
          ? [...vals].sort((a, b) => b.localeCompare(a))
          : countBy(data, f.col, f.multi).map(([v]) => v);
      });
      return out;
    }, [data]);

    /* ----- loading / error ----- */
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
            <p className="text-sm text-slate-500">Loading review data…</p>
          </div>
        </div>
      );
    }
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-sm text-red-600 mb-2">Could not load data.csv</p>
            <p className="text-xs text-slate-500">{error}</p>
            <p className="text-xs text-slate-500 mt-3">
              Make sure data.csv sits next to index.html and the page is served over HTTP
              (not opened directly as a file).
            </p>
          </div>
        </div>
      );
    }

    const minYear = data.length > 0 ? Math.min(...data.map(r => parseInt(r.Year)).filter(Boolean)) : '';
    const maxYear = data.length > 0 ? Math.max(...data.map(r => parseInt(r.Year)).filter(Boolean)) : '';

    /* ----- header / tabs ----- */
    const TABS = [['findings', 'Findings'], ['papers', 'Papers'], ['ai', 'AI Assistant']];

    return (
      <div className="min-h-screen">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="serif text-base sm:text-lg font-semibold text-slate-900 leading-tight truncate">
                AI Governance in Construction
              </h1>
              <p className="text-[11px] text-slate-500">
                Systematic Review Database, n = {data.length}
              </p>
            </div>
            <nav className="flex gap-1 text-sm flex-shrink-0">
              {TABS.map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

          {/* ============ FINDINGS TAB ============ */}
          {tab === 'findings' && (
            <div className="space-y-10 animate-fade">

              <section className="text-center max-w-3xl mx-auto pt-4 pb-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">
                  Systematic Literature Review
                </p>
                <h2 className="serif text-3xl sm:text-5xl font-semibold text-slate-900 leading-[1.1] tracking-tight">
                  Mapping AI governance across the construction lifecycle
                </h2>
                <p className="text-slate-600 mt-5 leading-relaxed text-base sm:text-lg max-w-2xl mx-auto">
                  A systematic review of {data.length} peer-reviewed articles on AI governance in
                  construction, covering {minYear}–{maxYear}.
                </p>
              </section>

              <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Articles reviewed"      value={data.length} />
                <StatCard label="Countries of study"     value={countryCounts.length} />
                <StatCard label="Regulations referenced" value={allRegulations.length} />
                <StatCard label="Governance dimensions"  value={govDimCounts.length} />
              </section>

              <section>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="serif text-xl font-semibold text-slate-900">At a glance</h3>
                  <p className="text-xs text-slate-400 italic">
                    Click any bar to filter the paper list
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <ChartCard title="Publication output by year"
                    subtitle="Annual distribution of the reviewed articles.">
                    <BarChart data={yearCountsByYear} max={8} accent="#0f172a" totalCount={data.length}
                      onItemClick={(v) => drillDown({ years: v })} />
                  </ChartCard>

                  <ChartCard title="Countries of study"
                    subtitle="Where the reviewed work was conducted or the regulatory context examined.">
                    <BarChart data={countryCounts} max={8} accent="#0f172a" totalCount={data.length}
                      onItemClick={(v) => drillDown({ countries: v })} />
                  </ChartCard>

                  <ChartCard title="Source journals"
                    subtitle="The venues where reviewed AI governance research has been published.">
                    <BarChart data={journalCounts} max={8} accent="#334155" totalCount={data.length}
                      onItemClick={(v) => drillDown({ journals: v })} />
                  </ChartCard>

                  <ChartCard title="Primary governance dimension"
                    subtitle="The single dimension each paper foregrounds (one value per paper).">
                    <BarChart data={primaryGovDimCounts} max={8} accent="#475569" totalCount={data.length}
                      onItemClick={(v) => drillDown({ primaryGovDim: v })} />
                  </ChartCard>

                  <ChartCard title="Regulations analyzed"
                    subtitle="Specific AI regulations or standards the paper examines.">
                    <BarChart data={regulationsCounts} max={8} accent="#334155" totalCount={data.length}
                      onItemClick={(v) => drillDown({ regulations: v })} />
                  </ChartCard>

                  <ChartCard title="Research methods"
                    subtitle="Methodological approaches used across the corpus.">
                    <BarChart data={methodCounts} max={8} accent="#475569" totalCount={data.length}
                      onItemClick={(v) => drillDown({ methods: v })} />
                  </ChartCard>

                  <ChartCard title="AI technologies covered"
                    subtitle="Technologies addressed (a paper may cite several).">
                    <BarChart data={aiTechCounts} max={8} accent="#0f172a" totalCount={data.length}
                      onItemClick={(v) => drillDown({ aiTech: v })} />
                  </ChartCard>

                  <ChartCard title="Construction applications"
                    subtitle="Application areas covered by the research.">
                    <BarChart data={appCounts} max={8} accent="#475569" totalCount={data.length}
                      onItemClick={(v) => drillDown({ apps: v })} />
                  </ChartCard>
                </div>
              </section>

              <section>
                <ChartCard
                  title="Research problems by theme"
                  subtitle="Tile area reflects paper count per theme. Click a theme to drill into its papers — hover any paper tile to read its full research problem, click to open the record."
                >
                  <TreemapChart
                    papersData={data}
                    onPaperClick={(p) => { setSelectedPaper(p); }}
                  />
                </ChartCard>
              </section>

              <section>
                <ChartCard
                  title="From AI approach to validation level"
                  subtitle="Ribbon widths encode co-occurrence counts as papers flow from each AI approach through the governance dimensions they engage with and on to the validation levels at which they are evaluated. Hover any node or flow to trace its path; click a node or flow to see matching papers below."
                >
                  <SankeyChart papersData={data} onDrillDown={sankeyDrillDown} />

                  {sankeySelection && (
                    <div className="mt-6 pt-5 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700">{sankeySelection.label}</span>
                          <span className="text-xs text-slate-400 tabular-nums">
                            {sankeyPapers.length} paper{sankeyPapers.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <button
                          onClick={() => setSankeySelection(null)}
                          className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          ✕ Clear
                        </button>
                      </div>
                      {sankeyPapers.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No papers match this selection.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
                          {sankeyPapers.map((paper, i) => (
                            <PaperCard
                              key={paper.new_ID || i}
                              paper={paper}
                              onClick={() => setSelectedPaper(paper)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </ChartCard>
              </section>

              <section>
                <ChartCard
                  title="Pairwise governance co-occurrences"
                  subtitle="Each cell counts the papers in which the row and column values co-occur. Use the three views to toggle between layer-by-dimension, layer-by-mechanism, and dimension-by-mechanism matrices. Click a cell to see the matching papers below the figure; click a row or column label to view all papers in that group."
                >
                  <HeatmapChart papersData={data} onPaperClick={(p) => setSelectedPaper(p)} />
                </ChartCard>
              </section>

              <section>
                <FigureSections
                  papersData={data}
                  onPaperClick={(p) => setSelectedPaper(p)}
                />
              </section>

              <div className="text-center pt-4">
                <button
                  onClick={() => setTab('papers')}
                  className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Explore the {data.length} reviewed papers →
                </button>
              </div>
            </div>
          )}

          {/* ============ PAPERS TAB ============ */}
          {tab === 'papers' && (
            <div className="animate-fade">

              {/* Sticky search + filter bar. top-[73px] clears the page header. */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 mb-5 sticky top-[73px] z-20">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Search title, abstract, authors, AI tech, regulations…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm"
                      >×</button>
                    )}
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    Filters
                    {totalFilters > 0 && (
                      <span className="bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        {totalFilters}
                      </span>
                    )}
                  </button>
                  {(totalFilters > 0 || search) && (
                    <button
                      onClick={clearFilters}
                      className="px-3 py-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {showFilters && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 max-h-[40vh] overflow-y-auto scrollbar-thin">
                    {FACETS.map(f => (
                      <FilterGroup
                        key={f.key}
                        label={f.label}
                        values={facetValues[f.key] || []}
                        active={filters[f.key]}
                        onToggle={(v) => toggleFilter(f.key, v)}
                        truncate={f.truncate}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-3 text-xs text-slate-500">
                  Showing <span className="font-medium text-slate-900 tabular-nums">{filtered.length}</span>
                  {' '}of {data.length} papers
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-sm">No papers match the current filters.</p>
                  <button
                    onClick={clearFilters}
                    className="text-xs text-slate-700 underline mt-2"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filtered.map((paper, i) => (
                    <PaperCard
                      key={paper.new_ID || i}
                      paper={paper}
                      onClick={() => setSelectedPaper(paper)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============ AI ASSISTANT TAB ============ */}
          {tab === 'ai' && (
            <div className="animate-fade max-w-4xl mx-auto">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">
                  AI Assistant
                </p>
                <h2 className="serif text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight">
                  Ask the reviewed literature
                </h2>
                <p className="text-slate-600 mt-2 leading-relaxed text-sm sm:text-base">
                  Free-form Q&amp;A grounded in the reviewed papers. Each question retrieves the
                  most relevant papers via semantic search and asks Gemini to answer with citations.
                  Click any citation chip in the answer or any paper in the references list to open
                  its full record.
                </p>
              </div>
              <AIChat
                papersData={data}
                workerBase={GEMINI_WORKER_BASE}
                onPaperClick={(p) => setSelectedPaper(p)}
              />
            </div>
          )}

        </main>

        <footer className="border-t border-slate-200 mt-12 py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>Systematic Review Database &middot; Built with React and Tailwind</span>
            <span>Data: data.csv &middot; Last updated dynamically on load</span>
          </div>
        </footer>

        {selectedPaper && (
          <PaperModal paper={selectedPaper} onClose={() => setSelectedPaper(null)} />
        )}
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();