const { validationResult } = require('express-validator');
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
    return res.json({
      success: true,
      data: {
        ...data,
        niche,
        bestTime: dynamicBestTimeByNiche(niche, mood),
        audioSuggestion: dynamicAudioSuggestion(niche, mood),
      },
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { analyze };
