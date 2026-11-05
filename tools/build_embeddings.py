"""
build_embeddings.py — generate paper_embeddings.json from data.csv

What it does
------------
Reads ./data.csv (the systematic-review corpus), asks the Gemini
embedding API to produce a 768-dimensional vector for each paper,
and writes the result to ./paper_embeddings.json in the exact shape
that js/ai-chat.js expects:

    {
      "model": "gemini-embedding-001",
      "dimension": 768,
      "task_type": "RETRIEVAL_DOCUMENT",
      "n_papers": <N>,
      "papers": [
        {
          "id": "1",                          # matches new_ID in data.csv
          "citation": "Sadeh et al. (2026)",
          "embedding": [ ... 768 floats ... ],
          "summary": { title, topic, ai_model, method,
                       abstract, results, gaps, future }
        },
        ...
      ]
    }

Usage
-----
1. Install the SDK:

       pip install google-genai

2. Set your Gemini API key (get one at https://aistudio.google.com/apikey):

       export GEMINI_API_KEY="your-key-here"          # macOS / Linux
       setx GEMINI_API_KEY "your-key-here"            # Windows (new shell)

3. Run from the project root (the folder that contains data.csv):

       python tools/build_embeddings.py

   Or with custom paths / a quick smoke test on 3 papers:

       python tools/build_embeddings.py --input data.csv \\
                                        --output paper_embeddings.json \\
                                        --limit 3

You only need to re-run this when data.csv changes (new paper, edited
abstract, etc.). The output JSON is what your AI Assistant tab loads.

Notes
-----
- The free tier of Gemini Embedding is plenty for a corpus of this size
  (39 papers = 39 requests). At paid rates it costs ~$0.0001 per paper.
- API key never leaves your machine — this script runs locally.
- The same model and dimension constants are duplicated in ai-chat.js;
  if you change them here, change them there too.
"""

import argparse
import csv
import json
import os
import sys
import time

# Increase the CSV field size limit. data.csv has very long fields
# (the References column can be tens of thousands of characters per row)
# and the default limit is too small.
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


# ----- config ---------------------------------------------------------------

MODEL = "gemini-embedding-001"
DIMENSION = 768
TASK_TYPE = "RETRIEVAL_DOCUMENT"

# Trim long fields when packing them into the JSON summary so the file
# stays small (the summary is loaded into the browser and also sent to
# Gemini as context for every question). The full record still lives in
# data.csv — only the AI tab uses these condensed summaries.
SUMMARY_MAX_CHARS = {
    "abstract": 1200,
    "results":  800,
    "gaps":     500,
    "future":   500,
    "topic":    200,
    "ai_model": 300,
    "method":   200,
}


# ----- helpers --------------------------------------------------------------

def short_citation(authors: str, year: str) -> str:
    """Build 'Sadeh et al. (2026)' or 'Ru (2026)' from the raw fields."""
    authors = (authors or "").strip()
    year = (year or "").strip()
    if not authors:
        return f"({year})" if year else "Unknown"
    # The Authors column is comma-separated like "Sadeh H., Zhang R., Lee M.J."
    # Splitting on ", " (with the space) keeps each surname+initials together.
    parts = [p for p in authors.split(", ") if p]
    first = parts[0]
    # Take just the surname for a compact citation: "Sadeh H." -> "Sadeh"
    surname = first.split()[0].rstrip(",")
    tail = " et al." if len(parts) > 1 else ""
    return f"{surname}{tail} ({year})" if year else f"{surname}{tail}"


def truncate(text: str, max_chars: int) -> str:
    """Trim long text, ending on a word boundary plus an ellipsis."""
    if not text:
        return ""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    # Back up to the last whitespace so we don't slice mid-word.
    space = cut.rfind(" ")
    if space > max_chars * 0.8:
        cut = cut[:space]
    return cut.rstrip() + "…"


def build_summary(row: dict) -> dict:
    """Pack the fields the AI tab cares about into the JSON summary block."""
    return {
        "title":    (row.get("Title") or "").strip(),
        "topic":    truncate(row.get("Construction_Application", ""), SUMMARY_MAX_CHARS["topic"]),
        "ai_model": truncate(row.get("AI_Technology", ""),            SUMMARY_MAX_CHARS["ai_model"]),
        "method":   truncate(row.get("Research_Method", ""),          SUMMARY_MAX_CHARS["method"]),
        "abstract": truncate(row.get("Abstract", ""),                 SUMMARY_MAX_CHARS["abstract"]),
        "results":  truncate(row.get("Key_Findings", ""),             SUMMARY_MAX_CHARS["results"]),
        "gaps":     truncate(row.get("Identified_Gaps", ""),          SUMMARY_MAX_CHARS["gaps"]),
        "future":   truncate(row.get("Future_Research_Directions", ""), SUMMARY_MAX_CHARS["future"]),
    }


def build_embedding_text(row: dict) -> str:
    """Concatenate the fields with the strongest semantic signal for retrieval.

    Order is mostly cosmetic for embedding models, but putting the title
    first is a mild convention and helps when text is truncated by the
    model's context window (2048 tokens for gemini-embedding-001).
    Section labels ('TITLE:', 'ABSTRACT:') give the model structural
    cues that empirically improve retrieval quality.
    """
    parts = []

    def add(label: str, value: str):
        v = (value or "").strip()
        if v:
            parts.append(f"{label}: {v}")

    add("TITLE",           row.get("Title", ""))
    add("ABSTRACT",        row.get("Abstract", ""))
    add("RESEARCH PROBLEM", row.get("Research_Problem", ""))
    add("KEY FINDINGS",    row.get("Key_Findings", ""))
    add("AI TECHNOLOGY",   row.get("AI_Technology", ""))
    add("GOVERNANCE DIMENSIONS", row.get("Governance_Dimensions", ""))
    add("PRIMARY RISK",    row.get("Primary_Risk_Addressed", ""))
    add("CONSTRUCTION APPLICATION", row.get("Construction_Application", ""))
    add("REGULATIONS ANALYZED", row.get("Regulations_Analyzed", ""))
    add("THEORETICAL FOUNDATION", row.get("Theoretical_Foundation", ""))
    add("IDENTIFIED GAPS", row.get("Identified_Gaps", ""))
    add("FUTURE RESEARCH",  row.get("Future_Research_Directions", ""))
    add("KEYWORDS",        row.get("Author Keywords", ""))

    return "\n\n".join(parts)


# ----- main pipeline --------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input",  default="data.csv",             help="Path to input CSV (default: data.csv)")
    ap.add_argument("--output", default="paper_embeddings.json", help="Path to output JSON (default: paper_embeddings.json)")
    ap.add_argument("--limit",  type=int, default=None,         help="Only embed the first N papers (for testing)")
    ap.add_argument("--api-key", default=None,                  help="Override the GEMINI_API_KEY env var")
    ap.add_argument("--sleep",  type=float, default=0.0,        help="Seconds to wait between requests (rate-limit safety)")
    args = ap.parse_args()

    api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("error: set GEMINI_API_KEY env var or pass --api-key. "
                 "Get a key at https://aistudio.google.com/apikey")

    # Imports here so that --help works without the SDK installed.
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        sys.exit("error: google-genai not installed. Run:  pip install google-genai")

    client = genai.Client(api_key=api_key)

    # ----- read CSV -----
    if not os.path.exists(args.input):
        sys.exit(f"error: cannot find {args.input}. Run from the project root, "
                 "or pass --input with the correct path.")

    with open(args.input, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = [r for r in reader if (r.get("Title") or "").strip()]

    if args.limit:
        rows = rows[:args.limit]

    print(f"Loaded {len(rows)} papers from {args.input}")
    print(f"Embedding with {MODEL} at dimension {DIMENSION}, task={TASK_TYPE}")
    print()

    # ----- embed each paper -----
    papers_out = []
    failed = []

    for i, row in enumerate(rows, 1):
        paper_id = (row.get("new_ID") or "").strip() or str(i)
        citation = short_citation(row.get("Authors", ""), row.get("Year", ""))
        text = build_embedding_text(row)
        title_short = truncate(row.get("Title", ""), 70)

        print(f"  [{i:>3}/{len(rows)}] {paper_id:<4} {citation:<24} {title_short}")

        try:
            result = client.models.embed_content(
                model=MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type=TASK_TYPE,
                    output_dimensionality=DIMENSION,
                ),
            )
            # The SDK returns result.embeddings as a list (one per content
            # item). We sent a single string so we want the first vector.
            embedding = list(result.embeddings[0].values)

            if len(embedding) != DIMENSION:
                raise ValueError(f"Got {len(embedding)} dims, expected {DIMENSION}")

            papers_out.append({
                "id":        paper_id,
                "citation":  citation,
                "embedding": embedding,
                "summary":   build_summary(row),
            })
        except Exception as e:
            print(f"        ! failed: {e}")
            failed.append((paper_id, str(e)))

        if args.sleep > 0 and i < len(rows):
            time.sleep(args.sleep)

    # ----- write output -----
    out = {
        "model":     MODEL,
        "dimension": DIMENSION,
        "task_type": TASK_TYPE,
        "n_papers":  len(papers_out),
        "papers":    papers_out,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)

    size_kb = os.path.getsize(args.output) / 1024
    print()
    print(f"Wrote {args.output} — {len(papers_out)} papers, {size_kb:.1f} KB")
    if failed:
        print(f"Skipped {len(failed)} papers:")
        for pid, err in failed:
            print(f"  - id={pid}: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
