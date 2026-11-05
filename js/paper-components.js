/* =========================================================
   Reusable presentational components.

   Layout shells:
     ChartCard   — white card wrapping a chart, with serif title
     StatCard    — single-metric tile for the header stat row

   Papers tab:
     FilterGroup — collapsible row of toggle chips for one facet
     PaperCard   — compact card shown in the Papers grid
     PaperModal  — full record popup opened by clicking a card
   ========================================================= */

window.AppComponents = window.AppComponents || {};

(function() {
  const { useEffect } = React;
  const { splitMulti } = window.AppUtils;

  // ----- Layout shells -----------------------------------------------------

  const ChartCard = ({ title, subtitle, children }) => (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <h3 className="serif text-base font-semibold text-slate-900 leading-snug">
        {title}
      </h3>
      {subtitle && (
        <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-4">
          {subtitle}
        </p>
      )}
      <div className={subtitle ? '' : 'mt-4'}>{children}</div>
    </div>
  );

  const StatCard = ({ label, value }) => (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        {label}
      </div>
      <div className="serif text-2xl font-semibold text-slate-900 tabular-nums leading-tight">
        {value}
      </div>
    </div>
  );

  // ----- Filter group ------------------------------------------------------

  // Row of toggleable chips for one filter facet. Each chip flips a value
  // in the parent's filter Set via the onToggle callback.
  const FilterGroup = ({ label, values, active, onToggle, truncate }) => {
    if (!values || values.length === 0) return null;
    return (
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            {label}
          </span>
          <span className="text-[10px] text-slate-400 tabular-nums">
            {values.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {values.map(v => {
            const isOn = active.has(v);
            const display = truncate && v.length > truncate
              ? v.slice(0, truncate - 1) + '…'
              : v;
            return (
              <button
                key={v}
                onClick={() => onToggle(v)}
                title={v}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  isOn
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
                }`}
              >
                {display}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ----- Paper card --------------------------------------------------------

  // Build a short citation like "Sadeh H. et al. (2026)" or "Ru Y. (2026)"
  // from the comma-separated Authors string and Year.
  const shortCitation = (paper) => {
    const authors = (paper.Authors || '').trim();
    const year = (paper.Year || '').trim();
    if (!authors) return year ? `(${year})` : 'Unknown';
    const parts = authors.split(/,\s*/).filter(Boolean);
    const first = parts[0];
    const tail = parts.length > 1 ? ' et al.' : '';
    return year ? `${first}${tail} (${year})` : `${first}${tail}`;
  };

  // Up to three small tags shown on each card. Pulled from single-value
  // governance fields that are short enough to fit.
  const cardChips = (paper) => {
    const out = [];
    if (paper.Country_of_Study) out.push(paper.Country_of_Study);
    if (paper.Primary_Governance_Dimension) out.push(paper.Primary_Governance_Dimension);
    if (paper.Research_Method) out.push(paper.Research_Method);
    return out.slice(0, 3);
  };

  const PaperCard = ({ paper, onClick }) => (
    <button
      onClick={onClick}
      className="block w-full text-left p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition-all"
    >
      <div className="text-[11px] text-slate-500 mb-1.5 truncate">
        {shortCitation(paper)}
        {paper['Source title'] && (
          <>
            <span className="text-slate-300"> · </span>
            <span className="italic">{paper['Source title']}</span>
          </>
        )}
      </div>
      <div className="serif text-sm text-slate-900 leading-snug mb-3">
        {paper.Title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cardChips(paper).map((c, i) => (
          <span
            key={i}
            className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded"
          >
            {c}
          </span>
        ))}
      </div>
    </button>
  );

  // ----- Paper modal -------------------------------------------------------

  // One field rendered as a small "label / value" block inside the modal's
  // metadata grid. Returns null if there's no value, so empty cells just
  // disappear instead of leaving holes in the layout.
  const MetaField = ({ label, value }) => {
    if (!value || String(value).trim() === '' || String(value).trim().toUpperCase() === 'N/A') {
      return null;
    }
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-0.5">
          {label}
        </div>
        <div className="text-sm text-slate-800 leading-snug">{value}</div>
      </div>
    );
  };

  // A longer text section: heading on top, prose below. Same null-guard
  // as MetaField so the modal stays tidy for partially-coded papers.
  const Section = ({ label, text }) => {
    if (!text || String(text).trim() === '') return null;
    return (
      <div>
        <h4 className="serif text-sm font-semibold text-slate-900 mb-1.5">
          {label}
        </h4>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {text}
        </p>
      </div>
    );
  };

  const PaperModal = ({ paper, onClose }) => {
    // Close on Escape and lock body scroll while the modal is open so the
    // page behind doesn't drift around.
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = prev;
      };
    }, [onClose]);

    if (!paper) return null;

    const doi = paper.DOI;
    const link = paper.Link;

    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-modal flex items-start sm:items-center justify-center p-0 sm:p-6 animate-fade"
        onClick={onClose}
      >
        <div
          className="bg-white w-full sm:max-w-3xl sm:rounded-lg shadow-xl max-h-screen sm:max-h-[90vh] overflow-y-auto scrollbar-thin"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sticky header inside the modal — citation + close button */}
          <div className="sticky top-0 bg-white border-b border-slate-200 px-5 sm:px-7 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                {shortCitation(paper)}
                {paper['Source title'] && (
                  <>
                    <span className="text-slate-300 normal-case"> · </span>
                    <span className="italic text-slate-600 normal-case font-normal">
                      {paper['Source title']}
                    </span>
                  </>
                )}
              </div>
              <h2 className="serif text-lg sm:text-xl font-semibold text-slate-900 leading-snug">
                {paper.Title}
              </h2>
              {(doi || link) && (
                <div className="mt-2 flex gap-3 text-xs">
                  {doi && (
                    <a
                      href={`https://doi.org/${doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-700 hover:text-slate-900 underline underline-offset-2"
                    >
                      DOI: {doi}
                    </a>
                  )}
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-700 hover:text-slate-900 underline underline-offset-2"
                    >
                      View on publisher site ↗
                    </a>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-900 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 flex-shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="px-5 sm:px-7 py-5 space-y-6">

            <Section label="Abstract" text={paper.Abstract} />
            <Section label="Research problem" text={paper.Research_Problem} />
            <Section label="Key findings" text={paper.Key_Findings} />

            {/* Metadata grid — two columns of short labelled facts */}
            <div>
              <h4 className="serif text-sm font-semibold text-slate-900 mb-3">
                Study characteristics
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <MetaField label="Country of study"        value={paper.Country_of_Study} />
                <MetaField label="Research method"         value={paper.Research_Method} />
                <MetaField label="Data type"               value={paper.Data_Type} />
                <MetaField label="Sample size"             value={paper.Sample_Size} />
                <MetaField label="Validation setting"      value={paper.Validation_Setting} />
                <MetaField label="Validation level"        value={paper.Validation_Level} />
                <MetaField label="AI technology"           value={paper.AI_Technology} />
                <MetaField label="AI approach type"        value={paper.AI_Approach_Type} />
                <MetaField label="Construction application" value={paper.Construction_Application} />
                <MetaField label="Construction phase"      value={paper.Construction_Phase} />
              </div>
            </div>

            {/* Governance block — the heart of this review */}
            <div>
              <h4 className="serif text-sm font-semibold text-slate-900 mb-3">
                Governance characterisation
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <MetaField label="Governance layer addressed"   value={paper.Governance_Layer_Addressed} />
                <MetaField label="Governance dimensions"        value={paper.Governance_Dimensions} />
                <MetaField label="Primary governance dimension" value={paper.Primary_Governance_Dimension} />
                <MetaField label="Governance depth"             value={paper.Governance_Depth} />
                <MetaField label="Primary risk addressed"       value={paper.Primary_Risk_Addressed} />
                <MetaField label="Governance mechanism type"    value={paper.Governance_Mechanism_Type} />
                <MetaField label="Human oversight role"         value={paper.Human_Oversight_Role} />
                <MetaField label="Stakeholder perspective"      value={paper.Primary_Stakeholder_Perspective} />
                <MetaField label="Regulatory framework aligned" value={paper.Regulatory_Framework_Aligned} />
              </div>
            </div>

            <Section label="Regulations analyzed"       text={paper.Regulations_Analyzed} />
            <Section label="Theoretical foundation"     text={paper.Theoretical_Foundation
              ? `${paper.Theoretical_Foundation}${paper.Theoretical_Depth ? ` (${paper.Theoretical_Depth})` : ''}`
              : ''} />
            <Section label="Framework proposed"         text={paper.Framework_Proposed} />
            <Section label="Identified gaps"            text={paper.Identified_Gaps} />
            <Section label="Future research directions" text={paper.Future_Research_Directions} />

            {paper['Author Keywords'] && (
              <div>
                <h4 className="serif text-sm font-semibold text-slate-900 mb-2">Keywords</h4>
                <div className="flex flex-wrap gap-1.5">
                  {splitMulti(paper['Author Keywords']).map((k, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  };

  window.AppComponents.ChartCard   = ChartCard;
  window.AppComponents.StatCard    = StatCard;
  window.AppComponents.FilterGroup = FilterGroup;
  window.AppComponents.PaperCard   = PaperCard;
  window.AppComponents.PaperModal  = PaperModal;
})();