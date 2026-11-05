/* =========================================================
   Shared utilities: parsing multi-value cells and counting.

   The CSV uses ';' as the multi-value delimiter inside a cell
   (e.g. "Trust; Transparency; Human oversight"). countBy and
   uniqueValues optionally split on that delimiter so a single
   row can contribute to several categories.
   ========================================================= */

window.AppUtils = window.AppUtils || {};

(function() {

  // Split a multi-value cell. Accepts ';' as the primary delimiter
  // and '|' as a fallback. Trims whitespace and drops empty fragments.
  const splitMulti = (value) => {
    if (value === null || value === undefined) return [];
    return String(value)
      .split(/[;|]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  // Unique values from a column. If isMulti, splits each cell first.
  const uniqueValues = (data, key, isMulti = false) => {
    const set = new Set();
    data.forEach(row => {
      const raw = row[key];
      if (raw === null || raw === undefined || raw === '') return;
      if (isMulti) {
        splitMulti(raw).forEach(v => set.add(v));
      } else {
        const v = String(raw).trim();
        if (v) set.add(v);
      }
    });
    return [...set];
  };

  // Count occurrences and return [[label, count], ...] sorted desc.
  const countBy = (data, key, isMulti = false) => {
    const counts = {};
    data.forEach(row => {
      const raw = row[key];
      if (raw === null || raw === undefined || raw === '') return;
      if (isMulti) {
        splitMulti(raw).forEach(v => {
          counts[v] = (counts[v] || 0) + 1;
        });
      } else {
        const v = String(raw).trim();
        if (v) counts[v] = (counts[v] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  window.AppUtils.splitMulti = splitMulti;
  window.AppUtils.uniqueValues = uniqueValues;
  window.AppUtils.countBy = countBy;
})();