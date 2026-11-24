// Helpers for API keys pasted into Cloudflare's Variables and Secrets box.

// Be forgiving about how the key was pasted: surrounding spaces / line breaks, wrapping quotes,
// and an accidental leading "Bearer " are all removed.
export function cleanToken(raw) {
  let t = String(raw === undefined || raw === null ? '' : raw).trim();
  t = t.replace(/^["'`]+|["'`]+$/g, '').trim();
  t = t.replace(/^Bearer\s+/i, '').trim();
  return t;
}

// A plain-English description of the stored key that never includes the key itself.
export function describeKey(raw, name) {
  const s = String(raw === undefined || raw === null ? '' : raw);
  if (!s.length) return name + ' is empty or not set for this environment.';
  const clean = cleanToken(s);
  const fixed = [];
  if (/^\s|\s$/.test(s)) fixed.push('extra spaces or line breaks');
  if (/^["'`]|["'`]$/.test(s.trim())) fixed.push('wrapping quotes');
  if (/^\s*["'`]?Bearer\s/i.test(s)) fixed.push('a leading "Bearer"');
  let msg = name + ' is saved as ' + clean.length + ' characters';
  if (/\s/.test(clean)) msg += ' and still contains a space or line break in the middle (the key was probably pasted twice or with other text)';
  if (fixed.length) msg += '; I removed ' + fixed.join(', ') + ' automatically';
  return msg + '.';
}
