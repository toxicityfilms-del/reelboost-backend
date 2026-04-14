const { validationResult } = require('express-validator');
const OpenAI = require('openai');
const { analyzeViralScore } = require('../services/viralScoreService');

const NICHE_RULES = [
  { niche: 'fitness', re: /\b(fitness|gym|workout|muscle|fat ?loss|cardio|protein|bodybuilding|exercise)\b/i },
  { niche: 'business', re: /\b(business|startup|entrepreneur|sales|marketing|brand|revenue|client|lead)\b/i },
  { niche: 'motivation', re: /\b(motivation|mindset|discipline|grind|success|focus|inspiration|self ?growth)\b/i },
  { niche: 'comedy', re: /\b(comedy|funny|meme|joke|lol|roast|satire|skit)\b/i },
  { niche: 'education', re: /\b(learn|education|tutorial|how to|tips|guide|explainer|lesson|study)\b/i },
  { niche: 'fashion', re: /\b(fashion|style|outfit|ootd|makeup|beauty|streetwear|lookbook)\b/i },
  { niche: 'lifestyle', re: /\b(lifestyle|vlog|routine|daily|wellness|travel|home|selfcare)\b/i },
];

function detectNiche(text) {
  const src = String(text || '');
  let best = 'lifestyle';
  let bestScore = 0;
  for (const rule of NICHE_RULES) {
    const matches = src.match(new RegExp(rule.re.source, 'gi'));
    const score = matches ? matches.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = rule.niche;
    }
  }
  return best;
}

function detectMood(text) {
  const src = String(text || '');
  if (/\b(fun|funny|lol|haha|meme|roast|chaos|crazy)\b/i.test(src)) return 'playful';
  if (/\b(inspire|motivate|discipline|grind|dream|believe|success)\b/i.test(src)) return 'uplifting';
  if (/\b(learn|tutorial|tips|guide|explain|how to)\b/i.test(src)) return 'educational';
  if (/\b(chill|calm|soft|slow|cozy|relax)\b/i.test(src)) return 'calm';
  return 'high-energy';
}

function dynamicBestTimeByNiche(niche, mood) {
  const byNiche = {
    fitness: ['6:00–8:30 AM', '6:30–9:00 PM'],
    business: ['8:00–10:00 AM', '12:00–2:00 PM'],
    motivation: ['7:00–9:00 AM', '8:00–10:00 PM'],
    comedy: ['8:00–11:00 PM', '12:00–2:00 PM'],
    education: ['7:00–9:00 PM', '12:00–1:30 PM'],
    fashion: ['5:00–7:30 PM', '11:00 AM–1:00 PM'],
    lifestyle: ['9:00–11:00 AM', '6:00–8:00 PM'],
  };
  const slots = byNiche[niche] || byNiche.lifestyle;
  if (mood === 'calm') return slots[0];
  return slots[1] || slots[0];
}

function dynamicAudioSuggestion(niche, mood) {
  const byNiche = {
    fitness: {
      'high-energy': 'Power workout trap / gym phonk',
      uplifting: 'Anthem-style pop rock',
      calm: 'Lo-fi training montage beat',
      playful: 'Punchy meme transition beat',
      educational: 'Minimal motivational instrumental',
    },
    business: {
      'high-energy': 'Confident corporate trap beat',
      uplifting: 'Cinematic success piano + drums',
      calm: 'Clean lo-fi productivity loop',
      playful: 'Light sarcastic office meme audio',
      educational: 'Minimal tech explainer beat',
    },
    motivation: {
      'high-energy': 'Epic rise cinematic beat',
      uplifting: 'Believer-style motivational rock',
      calm: 'Soft emotional piano bed',
      playful: 'Snappy confidence trend sound',
      educational: 'Focused ambient beat',
    },
    comedy: {
      'high-energy': 'Fast meme remix with punch hits',
      uplifting: 'Feel-good funky pop loop',
      calm: 'Deadpan low-key meme sound',
      playful: 'Trending comedic voiceover audio',
      educational: 'Light quirky pluck beat',
    },
    education: {
      'high-energy': 'Quick-cut tutorial beat',
      uplifting: 'Bright explanatory pop instrumental',
      calm: 'Neutral lo-fi study loop',
      playful: 'Light upbeat explainer trend sound',
      educational: 'Clean no-vocal instructional bed',
    },
    fashion: {
      'high-energy': 'Runway house bass drop',
      uplifting: 'Glam pop transition sound',
      calm: 'Aesthetic chill house loop',
      playful: 'Stylish trend sync sound',
      educational: 'Clean beauty tutorial beat',
    },
    lifestyle: {
      'high-energy': 'Daily vlog upbeat pop beat',
      uplifting: 'Warm feel-good indie pop loop',
      calm: 'Soft ambient lifestyle lo-fi',
      playful: 'Wholesome day-in-life trend audio',
      educational: 'Simple storytelling background beat',
    },
  };
  const map = byNiche[niche] || byNiche.lifestyle;
  return map[mood] || map['high-energy'];
}

function safeJsonParse(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function normalizeBetterHashtags(raw, source, niche) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw.map(String);
  } else if (typeof raw === 'string') {
    list = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const ensureHash = (s) => {
    const t = String(s || '').trim();
    if (!t) return '';
    return t.startsWith('#') ? t : `#${t.replace(/^#/, '')}`;
  };
  const deduped = [...new Set(list.map(ensureHash).filter(Boolean))];
  if (deduped.length >= 10) return deduped.slice(0, 15);

  const seed = String(source || niche || 'reels')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20) || 'reels';
  const fallback = [
    `#${seed}`,
    `#${seed}tips`,
    `#${seed}reels`,
    `#${seed}content`,
    '#reels',
    '#viral',
    '#fyp',
    '#instagram',
    '#explorepage',
    '#contentcreator',
    '#socialmedia',
    `#${niche}`,
  ].map(ensureHash);
  return [...new Set([...deduped, ...fallback])].slice(0, 15);
}

function fallbackOpenAiFields(cap, tags, niche, suggestions) {
  const source = `${cap} ${tags}`.trim() || 'your post';
  const hook = `Stop scrolling: ${source.slice(0, 42)}${source.length > 42 ? '…' : ''}`;
  const improvedCaption = `${cap || 'Your idea'}\n\nSave this post and share it with a friend who needs this.`;
  return {
    improvedCaption,
    betterHashtags: normalizeBetterHashtags(tags, source, niche),
    hook,
    engagementTips:
      Array.isArray(suggestions) && suggestions.length
        ? suggestions.slice(0, 4)
        : ['Use a stronger first line.', 'Add a CTA to comment or save.', 'Use 10-15 focused hashtags.'],
  };
}

async function generateOpenAiViralFields({ caption, hashtags, niche }) {
  // eslint-disable-next-line no-console
  console.log('OPENAI KEY:', process.env.OPENAI_API_KEY);
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    return fallbackOpenAiFields(caption, hashtags, niche, []);
  }

  const client = new OpenAI({ apiKey: key });
  const prompt = `You are an Instagram growth strategist.
Input:
- Caption: "${caption || ''}"
- Hashtags: "${hashtags || ''}"
- Niche: "${niche || 'lifestyle'}"

Return ONLY valid JSON with keys:
{
  "improvedCaption": "string",
  "betterHashtags": ["#tag1", "... 10 to 15 tags total ..."],
  "hook": "string",
  "engagementTips": ["tip1", "tip2", "tip3", "tip4"]
}

Rules:
- improvedCaption must be punchy and conversion-oriented.
- betterHashtags must be 10-15 focused hashtags.
- hook should be a short viral opener.
- engagementTips should be 3-4 concise practical bullets.`;

  try {
    // eslint-disable-next-line no-console
    console.log('Calling OpenAI...');
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Output JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 700,
    });
    const raw = completion.choices?.[0]?.message?.content || '{}';
    const parsed = safeJsonParse(raw);
    const tips = Array.isArray(parsed.engagementTips) ? parsed.engagementTips.map(String).slice(0, 4) : [];
    const result = {
      improvedCaption: String(parsed.improvedCaption || '').trim() || fallbackOpenAiFields(caption, hashtags, niche, []).improvedCaption,
      betterHashtags: normalizeBetterHashtags(parsed.betterHashtags, `${caption} ${hashtags}`, niche),
      hook: String(parsed.hook || '').trim() || fallbackOpenAiFields(caption, hashtags, niche, []).hook,
      engagementTips: tips.length ? tips : fallbackOpenAiFields(caption, hashtags, niche, []).engagementTips,
    };
    // eslint-disable-next-line no-console
    console.log('OpenAI response:', result);
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('OpenAI ERROR:', error.message);
    return fallbackOpenAiFields(caption, hashtags, niche, []);
  }
}

async function analyze(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { caption, hashtags } = req.body;
    const cap = String(caption || '');
    const tags = String(hashtags || '');
    const data = analyzeViralScore(cap, tags);
    const source = `${cap} ${tags}`;
    const niche = detectNiche(source);
    const mood = detectMood(source);
    const ai = await generateOpenAiViralFields({
      caption: cap,
      hashtags: tags,
      niche,
    });
    return res.json({
      success: true,
      data: {
        ...data,
        niche,
        bestTime: dynamicBestTimeByNiche(niche, mood),
        audioSuggestion: dynamicAudioSuggestion(niche, mood),
        improvedCaption: ai.improvedCaption,
        betterHashtags: ai.betterHashtags,
        hook: ai.hook,
        engagementTips: ai.engagementTips,
      },
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { analyze };
