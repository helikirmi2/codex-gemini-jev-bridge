import { createHash } from 'node:crypto';

export const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Fixed expiration: reading an entry never extends the retention of task data.
export class ExactCache {
  constructor({ maxEntries = 20, maxBytes = 2_000_000, ttlMs = 600_000, now = Date.now } = {}) {
    Object.assign(this, { maxEntries, maxBytes, ttlMs, now });
    this.entries = new Map();
    this.sizeBytes = 0;
  }
  delete(key) {
    const entry = this.entries.get(key);
    if (entry) { clearTimeout(entry.timer); this.sizeBytes -= entry.size; this.entries.delete(key); }
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) { this.delete(key); return undefined; }
    return structuredClone(entry.value);
  }
  set(key, value) {
    this.delete(key);
    for (const [id, entry] of this.entries) if (entry.expires <= this.now()) this.delete(id);
    const size = bytes(value);
    if (size > this.maxBytes) return;
    while (this.entries.size && (this.entries.size >= this.maxEntries || this.sizeBytes + size > this.maxBytes)) this.delete(this.entries.keys().next().value);
    const timer = setTimeout(() => this.delete(key), this.ttlMs);
    timer.unref();
    this.entries.set(key, { value: structuredClone(value), size, expires: this.now() + this.ttlMs, timer });
    this.sizeBytes += size;
  }
}

// Reserve synchronously before any preparation awaits. Identical requests share
// one promise; different requests do not silently queue or consume more quota.
export function singleFlight() {
  let active;
  return async (key, run) => {
    if (active) {
      if (active.key !== key) throw new Error('A Gemini task is already running. Wait for its result.');
      return { value: structuredClone(await active.promise), coalesced: true };
    }
    const job = { key, promise: Promise.resolve().then(run) };
    active = job;
    try { return { value: await job.promise, coalesced: false }; }
    finally { if (active === job) active = undefined; }
  };
}

export function reviewPlan({ task, context = '', sources, review_checks, review_context, review_evidence }) {
  if (review_context !== undefined && typeof review_context !== 'string') throw new Error('review_context must be text.');
  if (review_evidence !== undefined && (!Array.isArray(review_evidence) || review_evidence.length !== review_checks.length)) throw new Error('Provide one review_evidence entry per review check.');
  const all = sources.map((_, index) => index);
  const mapping = {};
  const used = new Set();
  review_checks.forEach((_, index) => {
    const entry = review_evidence?.[index];
    const indices = review_evidence === undefined ? all : entry?.source_indices;
    if (!Array.isArray(indices) || indices.some(id => !Number.isInteger(id) || id < 0 || id >= sources.length)) throw new Error('Invalid review source index.');
    if (entry?.context !== undefined && typeof entry.context !== 'string') throw new Error('Review evidence context must be text.');
    const selected = [...new Set(indices)];
    selected.forEach(id => used.add(id));
    mapping[`check_${index + 1}`] = { source_indices: selected, ...(entry?.context !== undefined ? { context: entry.context } : {}) };
  });
  return { task, context: review_context ?? context, sources: all.filter(id => used.has(id)).map(id => ({ source_index: id, ...sources[id] })), evidence_by_check: mapping };
}

export function compactReport(report, response) {
  const review = report.review?.answers ? {
    model: report.review.model, cached: report.review.cached,
    current_usage: report.review.current_usage,
    answers: Object.fromEntries(Object.entries(report.review.answers).map(([id, answer]) => [id, { choice: answer.choice, confidence: answer.confidence }])),
  } : report.review;
  const result = { result_file: report.result_file, metadata_file: report.metadata_file, verdict: report.verdict, review, gemini_stats: report.gemini_stats, metrics: report.metrics, preview: response.slice(0, 400), truncated: response.length > 400 };
  // Size excludes this field itself to avoid a recursive measurement.
  result.metrics = { ...result.metrics, returned_bytes_without_size_field: bytes(result) };
  return result;
}
