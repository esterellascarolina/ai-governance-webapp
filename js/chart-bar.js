/* =========================================================
   Bar charts.

   BarChart  — horizontal bars, ranked categorical data.
                [(label, count), …]   →   stacked rows.

   YearChart — vertical bars indexed by year, used in the
                At-a-glance grid as the publication-output view.
                Years sort ascending left-to-right.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState } = React;

  /* ---------- BarChart ---------- */

  const BarChart = ({ data, max = 10, accent = '#475569', onItemClick, totalCount }) => {
    const [hover, setHover] = useState(null);
    const top = data.slice(0, max);
    const maxValue = top.length > 0 ? top[0][1] : 1;
    const Wrapper = onItemClick ? 'button' : 'div';
    return (
      <div className="space-y-2">
        {top.map(([label, value]) => {
          const isHover = hover === label;
          const pct = totalCount ? ((value / totalCount) * 100).toFixed(1) : null;
          return (
            <Wrapper
              key={label}
              type={onItemClick ? 'button' : undefined}
              onMouseEnter={() => setHover(label)}
              onMouseLeave={() => setHover(null)}
              onClick={onItemClick ? () => onItemClick(label) : undefined}
              className={`block w-full text-left transition-all ${onItemClick ? 'cursor-pointer hover:opacity-100' : ''}`}
            >
              <div className="flex justify-between items-baseline mb-1.5 gap-3">
                <span
                  className={`text-sm truncate transition-colors ${isHover ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}
                  title={label}
                >
                  {label}
                </span>
                <span className="flex items-baseline gap-2 flex-shrink-0">
                  {pct && (
                    <span className={`text-xs tabular-nums transition-opacity ${isHover ? 'opacity-100 text-slate-500' : 'opacity-0'}`}>
                      {pct}%
                    </span>
                  )}
                  <span className={`text-sm tabular-nums transition-colors ${isHover ? 'text-slate-900 font-semibold' : 'text-slate-500 font-medium'}`}>
                    {value}
                  </span>
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(value / maxValue) * 100}%`,
                    background: isHover ? '#0f172a' : accent,
                  }}
                />
              </div>
            </Wrapper>
          );
        })}
      </div>
    );
  };

  /* ---------- YearChart ----------
     Pure SVG. Each year is a vertical bar; year labels sit on the
     baseline, count appears in a tooltip on hover. Years sort ASC
     so the timeline reads left-to-right.
     -------------------------------- */

  const YearChart = ({ data, onItemClick }) => {
    const [hover, setHover] = useState(null);
    if (!data.length) return null;
    const sorted = [...data].sort((a, b) => a[0].localeCompare(b[0]));
    const maxValue = Math.max(...sorted.map(d => d[1]));
    const width = 600;
    const height = 200;
    const padTop = 32;
    const padBottom = 36;
    const chartH = height - padTop - padBottom;
    const slot = width / sorted.length;
    const barW = Math.min(slot * 0.72, 36);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <line x1="0" y1={padTop + chartH} x2={width} y2={padTop + chartH} stroke="#e2e8f0" strokeWidth="1" />
        {sorted.map(([year, count], i) => {
          const barH = (count / maxValue) * chartH;
          const cx = i * slot + slot / 2;
          const x = cx - barW / 2;
          const y = padTop + chartH - barH;
          const isHover = hover === year;
          return (
            <g
              key={year}
              onMouseEnter={() => setHover(year)}
              onMouseLeave={() => setHover(null)}
              onClick={onItemClick ? () => onItemClick(year) : undefined}
              style={{ cursor: onItemClick ? 'pointer' : 'default' }}
            >
              {/* Invisible wider hit-target so hover/click is forgiving */}
              <rect x={i * slot} y={padTop - 8} width={slot} height={chartH + 16} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 2)}
                fill={isHover ? '#0f172a' : '#334155'}
                rx="2"
                style={{ transition: 'fill 200ms' }}
              />
              {isHover && (
                <g>
                  <rect x={cx - 18} y={y - 26} width="36" height="20" rx="3" fill="#0f172a" />
                  <text x={cx} y={y - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="#ffffff">
                    {count}
                  </text>
                </g>
              )}
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                fontSize="13"
                fill={isHover ? '#0f172a' : '#64748b'}
                fontWeight={isHover ? '700' : '500'}
                style={{ transition: 'all 200ms' }}
              >
                {year}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  window.AppCharts.BarChart  = BarChart;
  window.AppCharts.YearChart = YearChart;
})();