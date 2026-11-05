/* =========================================================
   AI Assistant — semantic Q&A grounded in the reviewed corpus.

   Flow per question:
     1. Lazy-load paper_embeddings.json on first mount.
     2. Embed the user's question via the worker (RETRIEVAL_QUERY).
     3. Rank all paper embeddings by cosine similarity, take top K.
     4. Build a prompt containing those K summaries and ask Gemini
        (also via the worker) to answer with [n] inline citations.
     5. Parse [1], [2], [1, 3] patterns in the answer and turn them
        into chips that open the corresponding paper's modal.

   Worker contract (what `workerBase` must implement):

     POST  {workerBase}/embed
       body:     { text: string, task_type?: 'RETRIEVAL_QUERY' }
       response: { embedding: number[] }

     POST  {workerBase}/generate
       body:     { prompt: string }
       response: { text: string }

   The browser never sees the Gemini API key — the worker holds it
   as a secret and forwards each request.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState, useEffect, useMemo, useRef } = React;

  const TOP_K = 8;             // How many papers to put in the context window.
  const EMBEDDINGS_PATH = './paper_embeddings.json';

  // Suggestions shown in the empty state — first-click prompts that
  // demonstrate the kinds of questions the corpus can actually answer.
  const EXAMPLE_QUESTIONS = [
    'Which papers analyze the EU AI Act in relation to construction?',
    'What governance mechanisms are proposed for AI in safety-critical construction applications?',
    'How do papers handle accountability when generative AI is used in construction workflows?',
    'What gaps in current AI regulation do reviewers most frequently identify?',
  ];

  // ----- math --------------------------------------------------------------

  // Cosine similarity between two equal-length numeric vectors.
  // Written as a plain loop rather than fancy array ops because this
  // runs against 100+ vectors per question and the hot path matters.
  const cosine = (a, b) => {
    let dot = 0, na = 0, nb = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const x = a[i], y = b[i];
      dot += x * y;
      na  += x * x;
      nb  += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  };

  // ----- worker calls ------------------------------------------------------

  // Uses the shared electriai-proxy Worker, which forwards the request
  // body to Gemini unchanged and adds the API key server-side.
  const embedQuery = async (workerBase, text) => {
    const res = await fetch(`${workerBase}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,   // must match paper_embeddings.json
      }),
    });
    if (!res.ok) throw new Error(`Embed failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const values = data && data.embedding && data.embedding.values;
    if (!Array.isArray(values)) throw new Error('Embed response missing `embedding.values` array');
    return values;
  };

  const generateAnswer = async (workerBase, prompt) => {
    const res = await fetch(`${workerBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });
    if (!res.ok) throw new Error(`Generate failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map(p => p.text || '').join('');
    if (!text) throw new Error('Generate response contained no text');
    return text;
  };

  // ----- prompt construction ----------------------------------------------

  // Pull whatever's most informative out of each paper's stored summary.
  // Different rows may have different fields populated; we just include
  // whatever is non-empty so the model sees as much grounding as possible.
  const formatSummary = (s) => {
    const lines = [];
    if (s.topic)    lines.push(`Topic: ${s.topic}`);
    if (s.method)   lines.push(`Method: ${s.method}`);
    if (s.ai_model) lines.push(`AI model: ${s.ai_model}`);
    if (s.abstract) lines.push(`Abstract: ${s.abstract}`);
    if (s.results)  lines.push(`Results: ${s.results}`);
    if (s.gaps)     lines.push(`Gaps: ${s.gaps}`);
    if (s.future)   lines.push(`Future work: ${s.future}`);
    return lines.join('\n');
  };

  const buildPrompt = (question, topPapers) => {
    const corpus = topPapers.map((p, i) => {
      const s = p.summary || {};
      const title = s.title ? ` — "${s.title}"` : '';
      return `[${i + 1}] ${p.citation}${title}\n${formatSummary(s)}`.trim();
    }).join('\n\n---\n\n');

    return `You are a research assistant helping analyze a systematic review corpus on AI governance in construction. Answer the user's question using ONLY the papers listed below. Cite the papers inline using their bracketed numbers exactly as given, like [1], [2], or [1, 3] when multiple papers support a claim. If the corpus does not contain enough information to answer, say so plainly — do not invent findings.

Be concise but substantive: 2 to 4 short paragraphs is ideal. Use plain prose, no markdown headers or bullet lists unless the question explicitly asks for a list.

PAPERS:

${corpus}

QUESTION: ${question}

ANSWER (with inline [n] citations):`;
  };

  // ----- answer rendering with citation chips -----------------------------

  // Splits text on [n] / [n, m] patterns and renders each citation as a
  // small button. Clicking the button looks up the underlying paper by
  // its embedding ID in the papers map and opens its modal.
  const AnswerWithCitations = ({ text, topPapers, papersById, onPaperClick }) => {
    const parts = [];
    const regex = /\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]/g;
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push({ type: 'text', value: text.slice(lastIdx, match.index) });
      }
      const nums = match[1].split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
      parts.push({ type: 'cite', nums });
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIdx) });
    }

    return (
      <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
        {parts.map((p, i) => {
          if (p.type === 'text') return <span key={i}>{p.value}</span>;
          return (
            <span key={i} className="inline-flex gap-0.5 mx-0.5 align-middle">
              {p.nums.map((n, j) => {
                const ref = topPapers[n - 1];
                // n out of range — render the raw token so the model's
                // intent stays visible even if it cited a nonexistent paper.
                if (!ref) return <span key={j} className="text-slate-400 tabular-nums">[{n}]</span>;
                const paper = papersById.get(String(ref.id));
                const clickable = Boolean(paper);
                return (
                  <button
                    key={j}
                    onClick={() => clickable && onPaperClick && onPaperClick(paper)}
                    disabled={!clickable}
                    title={ref.citation + (clickable ? '' : ' (not in current dataset)')}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums transition-colors ${
                      clickable
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-900 hover:text-white cursor-pointer'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </span>
          );
        })}
      </div>
    );
  };

  // ----- references list under each answer --------------------------------

  const ReferencesList = ({ topPapers, papersById, onPaperClick }) => (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
        References ({topPapers.length})
      </div>
      <div className="space-y-1.5">
        {topPapers.map((p, i) => {
          const paper = papersById.get(String(p.id));
          const clickable = Boolean(paper);
          return (
            <button
              key={i}
              onClick={() => clickable && onPaperClick && onPaperClick(paper)}
              disabled={!clickable}
              className={`block w-full text-left p-2 rounded transition-colors ${
                clickable
                  ? 'hover:bg-slate-50 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-semibold tabular-nums text-slate-500 mt-0.5 w-5 flex-shrink-0">
                  [{i + 1}]
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-slate-500 mb-0.5">
                    {p.citation}
                    {p.summary && p.summary.topic && (
                      <>
                        <span className="text-slate-300"> · </span>
                        <span className="italic">{p.summary.topic}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-slate-800 leading-snug serif">
                    {p.summary && p.summary.title}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0 mt-0.5">
                  {(p.score * 100).toFixed(0)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ----- main component ----------------------------------------------------

  const AIChat = ({ papersData, workerBase, onPaperClick }) => {
    const [embeddings, setEmbeddings] = useState(null);
    const [loadingEmb, setLoadingEmb] = useState(false);
    const [embError, setEmbError]     = useState(null);

    const [question, setQuestion]         = useState('');
    const [conversation, setConversation] = useState([]); // [{ question, answer, topPapers, error, thinking }]
    const [thinking, setThinking]         = useState(false);

    const bottomRef = useRef(null);
    const textareaRef = useRef(null);

    // Map paper IDs (as strings) to full paper rows from data.csv so a
    // citation chip can resolve to the modal-ready record in O(1).
    const papersById = useMemo(() => {
      const m = new Map();
      papersData.forEach(p => {
        if (p.new_ID !== undefined && p.new_ID !== '') m.set(String(p.new_ID).trim(), p);
      });
      return m;
    }, [papersData]);

    // Lazy load embeddings on first mount of the AI tab. The file is
    // ~1.7 MB so we don't want to pay this cost on the Findings tab.
    useEffect(() => {
      if (embeddings || loadingEmb) return;
      setLoadingEmb(true);
      fetch(EMBEDDINGS_PATH)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => { setEmbeddings(data); setLoadingEmb(false); })
        .catch(err => { setEmbError(err.message); setLoadingEmb(false); });
    }, []); // eslint-disable-line

    // Auto-scroll to the latest turn whenever the conversation grows or
    // the thinking indicator changes.
    useEffect(() => {
      if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [conversation.length, thinking]);

    // Auto-grow the textarea so the input expands with the question.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }, [question]);

    const ask = async (overrideText) => {
      const q = (overrideText !== undefined ? overrideText : question).trim();
      if (!q || thinking || !embeddings) return;

      setQuestion('');
      setThinking(true);

      // Optimistically push the turn so the user sees their question
      // immediately, with the answer filling in once Gemini responds.
      const turnIdx = conversation.length;
      setConversation(prev => [...prev, { question: q, answer: null, topPapers: [], error: null }]);

      try {
        if (!workerBase) {
          throw new Error('No worker URL configured. Set GEMINI_WORKER_BASE in app.js.');
        }

        // 1. Embed the question.
        const qVec = await embedQuery(workerBase, q);

        // 2. Rank all papers by cosine similarity.
        const scored = embeddings.papers.map(p => ({
          ...p,
          score: cosine(qVec, p.embedding),
        })).sort((a, b) => b.score - a.score);
        const topPapers = scored.slice(0, TOP_K);

        // 3. Ask Gemini with the top papers as context.
        const prompt = buildPrompt(q, topPapers);
        const answer = await generateAnswer(workerBase, prompt);

        setConversation(prev => prev.map((t, i) =>
          i === turnIdx ? { ...t, answer, topPapers } : t
        ));
      } catch (err) {
        setConversation(prev => prev.map((t, i) =>
          i === turnIdx ? { ...t, error: err.message } : t
        ));
      } finally {
        setThinking(false);
      }
    };

    const onKeyDown = (e) => {
      // Cmd/Ctrl+Enter submits; plain Enter inserts a newline so users
      // can write multi-line questions without surprises.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ask();
      }
    };

    const reset = () => {
      setConversation([]);
      setQuestion('');
    };

    // ----- loading / error states -----
    if (loadingEmb) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <div className="inline-block w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-slate-500">Loading paper embeddings…</p>
        </div>
      );
    }

    if (embError) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
          <p className="text-sm text-red-600 mb-2">Could not load paper_embeddings.json</p>
          <p className="text-xs text-slate-500">{embError}</p>
          <p className="text-xs text-slate-500 mt-3 max-w-md mx-auto">
            Make sure <code className="px-1 bg-slate-100 rounded">paper_embeddings.json</code> sits
            next to <code className="px-1 bg-slate-100 rounded">index.html</code> and the page is
            served over HTTP.
          </p>
        </div>
      );
    }

    const corpusSize = embeddings ? embeddings.papers.length : 0;

    return (
      <div className="space-y-5">

        {/* ----- conversation ----- */}
        {conversation.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-3">
              Try an example
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXAMPLE_QUESTIONS.map(eq => (
                <button
                  key={eq}
                  onClick={() => ask(eq)}
                  className="text-left text-sm text-slate-700 px-3 py-2.5 border border-slate-200 rounded-md hover:border-slate-400 hover:bg-slate-50 transition-colors leading-snug"
                >
                  {eq}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {conversation.map((turn, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg p-5 animate-fade">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                  Question
                </div>
                <div className="serif text-base text-slate-900 leading-snug mb-4">
                  {turn.question}
                </div>

                {turn.error ? (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                    <span className="font-semibold">Error: </span>{turn.error}
                  </div>
                ) : turn.answer === null ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <div className="inline-block w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></div>
                    <span>Searching the corpus and drafting an answer…</span>
                  </div>
                ) : (
                  <>
                    <AnswerWithCitations
                      text={turn.answer}
                      topPapers={turn.topPapers}
                      papersById={papersById}
                      onPaperClick={onPaperClick}
                    />
                    <ReferencesList
                      topPapers={turn.topPapers}
                      papersById={papersById}
                      onPaperClick={onPaperClick}
                    />
                  </>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ----- input ----- */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 sticky bottom-4 shadow-sm">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Ask a question about the ${corpusSize} indexed papers…`}
            rows={1}
            className="w-full px-2 py-1.5 text-sm resize-none focus:outline-none placeholder-slate-400 leading-relaxed"
            disabled={thinking}
          />
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-400">
              {conversation.length > 0 && (
                <button onClick={reset} className="hover:text-slate-700 underline underline-offset-2">
                  Clear conversation
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                ⌘/Ctrl + Enter
              </span>
              <button
                onClick={() => ask()}
                disabled={thinking || !question.trim()}
                className="px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                {thinking ? 'Thinking…' : 'Ask'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  window.AppCharts.AIChat = AIChat;
})();
