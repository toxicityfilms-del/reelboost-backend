const CTA_RE =
  /\b(comment|dm|save|share|follow|link in bio|tap|swipe|double tap|subscribe|tell me|drop a|let me know)\b/i;
const EMOJI_RE =
  /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

function extractHashtags(text) {
  if (!text || typeof text !== 'string') return [];
  return text.match(/#[\w\u00c0-\u024f]+/gi) || [];
}

function hasStrongHook(caption) {
  if (!caption || typeof caption !== 'string') return false;
  const first = caption.split(/\n+/)[0]?.trim() || '';
  if (first.length === 0) return false;
  if (first.length <= 120 && (/[!?]/.test(first) || EMOJI_RE.test(first))) return true;
  if (/^(pov|stop|wait|this is|nobody talks about|here's|hot take|unpopular opinion)/i.test(first))
    return true;
  if (/\d/.test(first.slice(0, 20))) return true;
  return first.length <= 90;
}

function captionLengthOptimal(caption) {
  const len = (caption || '').trim().length;
  if (len >= 125 && len <= 220) return true;
  if (len >= 100 && len <= 280) return true;
  return false;
}

function analyzeViralScore(caption, hashtagsInput) {
  const cap = typeof caption === 'string' ? caption : '';
  let hashtags = extractHashtags(hashtagsInput);
  if (hashtags.length === 0) {
    hashtags = extractHashtags(cap);
  }

  let score = 0;
  const suggestions = [];

  if (hasStrongHook(cap)) {
    score += 20;
  } else {
    suggestions.push('Add a stronger first-line hook: question, bold claim, POV, or number.');
  }

  const hc = hashtags.length;
  if (hc >= 10 && hc <= 30) {
    score += 20;
  } else {
    suggestions.push(
      hc < 10
        ? `Use 10–30 hashtags (you have ${hc}). Mix niche + broader tags.`
        : `Trim to 10–30 focused hashtags (you have ${hc}) to avoid looking spammy.`
    );
  }

  if (captionLengthOptimal(cap)) {
    score += 20;
  } else {
    const len = cap.trim().length;
    suggestions.push(
      len < 100
        ? 'Lengthen the caption slightly (aim ~125–220 chars) with story or value.'
        : 'Shorten or break lines: optimal engagement is often ~125–220 characters before the fold.'
    );
  }

  if (EMOJI_RE.test(cap)) {
    score += 10;
  } else {
    suggestions.push('Add 1–3 relevant emojis to increase scroll-stopping contrast.');
  }

  if (CTA_RE.test(cap)) {
    score += 10;
  } else {
    suggestions.push('Add a clear call-to-action (comment, save, DM, follow, link in bio).');
  }

  score = Math.min(100, Math.max(0, score));

  if (score >= 85 && suggestions.length === 0) {
    suggestions.push('Strong baseline. A/B test first line and posting time.');
  }

  return { score, suggestions };
}

module.exports = { analyzeViralScore, extractHashtags };
