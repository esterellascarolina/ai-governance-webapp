/* =========================================================
   The manuscript figures, rebuilt interactive, inside Findings.

   Each figure is a port of its matplotlib script, not a picture
   of one:

     Literature corpus   09_Visualization/*.py   → figures-corpus.js
                         recomputed live from data.csv

   This module is the shell: it lays the figures out and hands
   each chart the data and the paper-click callback it needs.
   Every chart owns its own hover and selection state, so one
   figure's exploration never resets another's.

   (The AI-regulation figures now live in the separate AI
   Regulations webapp, 09_AI Regulations/6_Webapp.)

   Rendered by app.js inside the Findings tab as <FigureSections />.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function () {

  const GroupHeader = ({ label, count, blurb }) => (
    <>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h4 className="serif text-lg font-semibold text-slate-900">{label}</h4>
        <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
          {count} figure{count === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed mb-4 max-w-3xl">{blurb}</p>
    </>
  );

  const Loading = ({ what }) => (
    <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
      <div className="inline-block w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
      <p className="text-sm text-slate-500">Loading {what}…</p>
    </div>
  );

  const FigureSections = ({ papersData, onPaperClick }) => {
    const corpus = (window.AppFigures || {}).corpus || {};

    if (!papersData || papersData.length === 0) return <Loading what="the corpus" />;

    return (
      <div className="space-y-10">

        <div className="flex items-baseline justify-between mb-1">
          <h3 className="serif text-xl font-semibold text-slate-900">Publication figures</h3>
          <p className="text-xs text-slate-400 italic">
            Hover to read a value · click to open what is behind it
          </p>
        </div>

        {/* ---------------- Literature corpus ---------------- */}
        <section>
          <GroupHeader
            label="The reviewed corpus"
            count={4}
            blurb={`Recomputed live from data.csv — the ${papersData.length} coded studies — with the transforms, category orders and palettes of the scripts in 09_Visualization. Click any mark to list the papers behind it, and click a paper to open its full record.`}
          />
          <div className="space-y-5">
            {corpus.ApplicationPhaseRisk && (
              <corpus.ApplicationPhaseRisk papersData={papersData} onPaperClick={onPaperClick} />
            )}
            {corpus.FrameworkAnchoring && (
              <corpus.FrameworkAnchoring papersData={papersData} onPaperClick={onPaperClick} />
            )}
            {corpus.DimensionNetwork && (
              <corpus.DimensionNetwork papersData={papersData} onPaperClick={onPaperClick} />
            )}
            {corpus.LayerUpset && (
              <corpus.LayerUpset papersData={papersData} onPaperClick={onPaperClick} />
            )}
          </div>
        </section>
      </div>
    );
  };

  window.AppCharts.FigureSections = FigureSections;
})();
