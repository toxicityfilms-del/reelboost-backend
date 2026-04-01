const OpenAI = require('openai');

function getClient() {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  return new OpenAI({ apiKey: key });
}

function isQuotaOrRateLimitError(err) {
  const code =
    err?.code ||
    err?.error?.code ||
    err?.error?.error?.code ||
    err?.response?.data?.error?.code;

  const status =
    err?.status ||
    err?.statusCode ||
    err?.response?.status ||
    err?.error?.status ||
    err?.error?.statusCode;

  const message = String(err?.message || err?.error?.message || '').toLowerCase();
  const quotaText =
    message.includes('you exceeded your current quota') ||
    message.includes('insufficient_quota') ||
    message.includes('rate limit') ||
    message.includes('rate_limit_exceeded');

  return status === 429 || code === 'insufficient_quota' || code === 'rate_limit_exceeded' || quotaText;
}

function slugTopic(text) {
  const s = String(text || 'trending')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return s || 'trending';
}

function fallbackHashtags(keyword) {
  const t = slugTopic(keyword);

  const high = [
    `#${t}`,
    `#${t}reels`,
    `#${t}viral`,
    `#${t}2026`,
    `#${t}tips`,
    `#${t}life`,
    `#${t}daily`,
    `#${t}content`,
    `#${t}community`,
    `#${t}trending`,
  ];
  const medium = [
    `#${t}love`,
    `#${t}motivation`,
    `#${t}inspo`,
    `#${t}ideas`,
    `#${t}share`,
    `#${t}fyp`,
    `#${t}explore`,
    `#${t}grow`,
    `#${t}creator`,
    `#${t}story`,
  ];
  const low = [
    `#reels`,
    `#instagram`,
    `#explorepage`,
    `#viral`,
    `#fyp`,
    `#instagood`,
    `#photooftheday`,
    `#love`,
    `#instadaily`,
    `#follow`,
  ];
  return { high, medium, low };
}

function fallbackCaption(idea) {
  const line = String(idea || 'your reel').trim();
  return {
    caption: `POV: ${line} ✨ Drop a 🔥 if you relate!\n\nSave this for later — comment “YES” for part 2. #reels #fyp #viral`,
    hooks: [
      `Wait for it… ${line} hits different 😮‍💨`,
      `Nobody talks about this part of ${line} 👀`,
      `3 seconds that’ll change how you see ${line}`,
    ],
  };
}

function fallbackIdeas(niche) {
  const n = String(niche || 'content').trim();
  return [
    `${n}: “before vs after” transformation in 15s`,
    `${n}: myth vs fact — one line each, fast cuts`,
    `${n}: “things I wish I knew sooner” listicle reel`,
    `${n}: day-in-the-life hook in the first 2 seconds`,
    `${n}: common mistake + quick fix (text on screen)`,
    `${n}: “unpopular opinion” + stitch-friendly ending`,
    `${n}: tutorial in 3 steps with countdown timer`,
    `${n}: storytime voiceover + B-roll from camera roll`,
    `${n}: “POV you just discovered…” pattern interrupt`,
    `${n}: trend sound + niche-specific caption twist`,
  ];
}

async function generateHashtags(keyword) {
  try {
    const client = getClient();
    const prompt = `Generate 30 Instagram hashtags for "${keyword}", include high, medium and low competition. Return ONLY valid JSON with this exact shape (no markdown):
{"high":["#tag1",...],"medium":["#tag1",...],"low":["#tag1",...]}
Each array should have roughly 10 hashtags. Hashtags must start with #.`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You output only valid JSON for Instagram hashtag lists.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = safeJsonParse(text);
    return normalizeHashtagBuckets(parsed);
  } catch (e) {
    if (isQuotaOrRateLimitError(e)) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAI] quota/rate limit — returning local hashtag fallback');
      return fallbackHashtags(keyword);
    }
    throw e;
  }
}

async function generateCaptionAndHooks(idea) {
  try {
    const client = getClient();
    const prompt = `Write a viral Instagram caption with a strong hook and emojis for ${idea}.
Also provide 2-3 short alternate opening hooks (one line each) that could replace the first line.
Return ONLY valid JSON:
{"caption":"...","hooks":["hook1","hook2","hook3"]}`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You write viral Instagram captions with emojis. Output JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.85,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = safeJsonParse(text);
    const hooks = Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 3) : [];
    return {
      caption: typeof parsed.caption === 'string' ? parsed.caption : '',
      hooks,
    };
  } catch (e) {
    if (isQuotaOrRateLimitError(e)) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAI] quota/rate limit — returning local caption fallback');
      return fallbackCaption(idea);
    }
    throw e;
  }
}

async function generateIdeas(niche) {
  try {
    const client = getClient();
    const prompt = `Generate 10 viral Instagram reel content ideas for niche "${niche}".
Return ONLY a JSON array of 10 strings: ["idea1",...]`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You generate viral short-form content ideas. Output JSON array only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '[]';
    const parsed = safeJsonParse(text);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 10) : [];
  } catch (e) {
    if (isQuotaOrRateLimitError(e)) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAI] quota/rate limit — returning local ideas fallback');
      return fallbackIdeas(niche);
    }
    throw e;
  }
}

function safeJsonParse(text) {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function normalizeHashtagBuckets(parsed) {
  const high = Array.isArray(parsed.high) ? parsed.high.map(String) : [];
  const medium = Array.isArray(parsed.medium) ? parsed.medium.map(String) : [];
  const low = Array.isArray(parsed.low) ? parsed.low.map(String) : [];
  const ensureHash = (s) => (s.startsWith('#') ? s : `#${s.replace(/^#/, '')}`);
  return {
    high: high.map(ensureHash).filter(Boolean),
    medium: medium.map(ensureHash).filter(Boolean),
    low: low.map(ensureHash).filter(Boolean),
  };
}

function normalizePostAnalysis(parsed) {
  let hashtags = parsed.hashtags;
  if (typeof hashtags === 'string') {
    hashtags = hashtags
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(hashtags)) hashtags = [];
  const ensureHash = (s) => {
    const t = String(s).trim();
    if (!t) return '';
    return t.startsWith('#') ? t : `#${t.replace(/^#/, '')}`;
  };
  const audioRaw =
    parsed.audio ??
    parsed.trendingAudio ??
    parsed.trending_audio ??
    parsed.trendingAudioSuggestion ??
    '';
  return {
    hook: String(parsed.hook || '').trim(),
    caption: String(parsed.caption || '').trim(),
    hashtags: hashtags.map(ensureHash).filter(Boolean).slice(0, 30),
    bestTime: String(parsed.bestTime || parsed.best_time || '').trim(),
    audio: String(audioRaw || '').trim(),
  };
}

function fallbackPostAnalysis(idea, hasImage, niche) {
  const hint = String(idea || (hasImage ? 'this visual' : 'your reel')).trim() || 'your reel';
  const nicheHint = String(niche || '').trim();
  const audio = nicheHint
    ? `Check the Reels audio tab for sounds trending in the “${nicheHint.slice(0, 48)}${nicheHint.length > 48 ? '…' : ''}” niche this week.`
    : 'Try a sped-up trending phonk clip or “day in my life” soft piano — check Reels audio for what’s rising; add a profile niche for tighter picks.';
  return {
    hook: `POV: you’re about to blow up with ${hint.slice(0, 40)}${hint.length > 40 ? '…' : ''}`,
    caption: `This is your sign to post ✨\n\n${hint}\n\nComment “FIRE” if you’d watch the full story. #reels #fyp #viral #explorepage`,
    hashtags: [
      '#reels',
      '#fyp',
      '#viral',
      '#explorepage',
      '#instagram',
      '#trending',
      '#creator',
      '#content',
      '#growth',
      '#instagood',
    ],
    bestTime: nicheHint
      ? `Weekday 6–9 PM in your audience’s timezone; test niche-specific peak times for ${nicheHint.slice(0, 32)}.`
      : 'Weekday 6–9 PM in your audience’s main timezone; test Sat/Sun mornings for lifestyle niches.',
    audio,
  };
}

async function analyzePost({ idea, imageBase64, niche, bio }) {
  const hasImage = !!(imageBase64 && String(imageBase64).trim());
  const ideaStr = String(idea || '').trim();
  const nicheStr = String(niche || '').trim();
  const bioStr = String(bio || '').trim().slice(0, 400);
  try {
    const client = getClient();
    const sys =
      'You analyze Instagram posts and Reels. Reply with ONLY valid JSON (no markdown, no code fences). Keys: hook (string), caption (string), hashtags (array of exactly 30 strings, each starting with #), bestTime (string), audio (string — trending audio suggestion). When the user message includes a concrete creator niche, reflect it consistently in hook tone, caption wording, all hashtags, posting-window reasoning, and audio suggestion.';
    const nicheLine = nicheStr || '(not set — treat as general / broad audience)';
    const ideaLine =
      ideaStr || (hasImage ? '(No text idea — infer from the attached image.)' : '(No idea text provided.)');
    let userText = `Analyze this Instagram post idea and generate:
1. Viral 3-second hook
2. Caption with emojis
3. 30 hashtags
4. Best time to post
5. Trending audio suggestion

Niche: ${nicheLine}
Idea: ${ideaLine}`;
    if (bioStr) {
      userText += `\n\nCreator bio (tone/voice hint): ${bioStr}`;
    }
    if (hasImage) {
      userText +=
        '\n\nAn image is attached. Use it for visual context, mood, and niche when writing the hook, caption, and hashtags.';
    }
    if (nicheStr) {
      userText += `\n\nNICHE MODE: The creator profile niche is "${nicheStr}". Align the hook, caption voice, every hashtag, best-time advice, and audio pick with what actually performs in that niche on Instagram Reels. Prefer niche-specific vocabulary, hashtag clusters competitors use, and audio trends common in that vertical.`;
    } else {
      userText +=
        '\n\nNO PROFILE NICHE: The app did not send a creator niche. Still deliver 30 strong hashtags for the idea, but keep hook and caption broadly appealing; for timing and audio, give practical Instagram-wide guidance and note the user can refine by adding a niche in their profile.';
    }

    /** @type {import('openai').OpenAI.Chat.Completions.ChatCompletionMessageParam[]} */
    const userMessage = {
      role: 'user',
      content: [{ type: 'text', text: userText }],
    };
    if (hasImage) {
      let b64 = String(imageBase64).trim();
      const url = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
      userMessage.content.push({ type: 'image_url', image_url: { url } });
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, userMessage],
      temperature: 0.75,
      max_tokens: 1400,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = safeJsonParse(text);
    return normalizePostAnalysis(parsed);
  } catch (e) {
    if (isQuotaOrRateLimitError(e)) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAI] quota/rate limit — returning local post analysis fallback');
      return fallbackPostAnalysis(ideaStr, hasImage, nicheStr);
    }
    throw e;
  }
}

function normalizeMediaContext(parsed) {
  const pickArr = (v) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);
  const objects = pickArr(parsed.objects);
  const actions = pickArr(parsed.actions);
  const keywords = pickArr(parsed.keywords);
  return {
    description: String(parsed.description || '').trim(),
    objects: objects.slice(0, 12),
    actions: actions.slice(0, 10),
    mood: String(parsed.mood || '').trim(),
    setting: String(parsed.setting || '').trim(),
    textOnScreen: String(parsed.textOnScreen || parsed.text_on_screen || '').trim(),
    keywords: keywords.slice(0, 18),
  };
}

function safeFileHint(file) {
  if (!file) return '';
  const name = String(file.originalname || '').slice(0, 120);
  const mime = String(file.mimetype || '').slice(0, 80);
  const bytes = Number(file.size || 0);
  return `fileName=${name} mime=${mime} bytes=${bytes}`;
}

async function extractMediaContext({ imageDataUrl, file, niche, userNotes }) {
  const nicheStr = String(niche || '').trim();
  const notes = String(userNotes || '').trim().slice(0, 600);
  const hasImage = !!(imageDataUrl && String(imageDataUrl).trim());

  if (!hasImage) {
    return normalizeMediaContext({
      description: notes || '',
      keywords: nicheStr ? nicheStr.split(/[\s,]+/).filter(Boolean) : [],
    });
  }

  const hint = safeFileHint(file);
  try {
    const client = getClient();
    const sys =
      'You are a media content analyst. You must extract concrete visual details (not generic advice). Output ONLY valid JSON with keys: description (string, 1-2 sentences), objects (array of strings), actions (array of strings), mood (string), setting (string), textOnScreen (string), keywords (array of strings).';

    const userText = `Analyze the attached media and extract a concise, concrete description and tags.

Creator niche: ${nicheStr || '(not set)'}
User notes (optional): ${notes || '(none)'}
Upload hint: ${hint || '(none)'}

Rules:
- Use details visible in the media (subjects, setting, colors, vibe, product/category, on-screen text).
- If niche is provided, include niche-specific keywords that match what is actually shown.
- Avoid generic marketing language.`;

    /** @type {import('openai').OpenAI.Chat.Completions.ChatCompletionMessageParam} */
    const userMessage = {
      role: 'user',
      content: [{ type: 'text', text: userText }],
    };
    const url = String(imageDataUrl).trim();
    userMessage.content.push({ type: 'image_url', image_url: { url } });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, userMessage],
      temperature: 0.2,
      max_tokens: 700,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = safeJsonParse(text);
    return normalizeMediaContext(parsed);
  } catch (e) {
    if (isQuotaOrRateLimitError(e)) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAI] quota/rate limit — returning local media context fallback');
      return normalizeMediaContext({
        description: notes || 'Uploaded media',
        mood: '',
        setting: '',
        textOnScreen: '',
        objects: [],
        actions: [],
        keywords: [
          ...new Set(
            [nicheStr, notes, hint]
              .join(' ')
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 18)
          ),
        ],
      });
    }
    throw e;
  }
}

async function analyzeMediaPost({ niche, bio, userNotes, mediaContext }) {
  const nicheStr = String(niche || '').trim();
  const bioStr = String(bio || '').trim().slice(0, 400);
  const notes = String(userNotes || '').trim().slice(0, 600);

  try {
    const client = getClient();
    const sys =
      'You analyze Instagram Reels/posts. Reply with ONLY valid JSON (no markdown, no code fences). Keys: hook (string, a 3-second hook), caption (string), hashtags (array of exactly 30 strings, each starting with #), bestTime (string), audio (string — trending audio suggestion). The output MUST be specific to the described media (not generic). If niche is provided, align hook tone, caption voice, EVERY hashtag, bestTime advice, and audio pick to that niche.';

    const ctx = mediaContext || {};
    const ctxJson = JSON.stringify(
      {
        description: ctx.description || '',
        objects: ctx.objects || [],
        actions: ctx.actions || [],
        mood: ctx.mood || '',
        setting: ctx.setting || '',
        textOnScreen: ctx.textOnScreen || '',
        keywords: ctx.keywords || [],
      },
      null,
      0
    );

    let userText = `You are given extracted media context (from an uploaded image/video thumbnail). Use it as the primary source of truth.

Media context JSON: ${ctxJson}

Creator niche: ${nicheStr || '(not set)'}
Creator bio (tone hint): ${bioStr || '(not provided)'}
User notes: ${notes || '(none)'}

Generate:
1) Best posting time (be concrete + short reasoning)
2) Caption tailored to the media and niche (use emojis naturally)
3) 30 hashtags tightly matching the visible content + niche (no repeats)
4) Trending audio suggestion relevant to the media/niche (describe the kind of sound and why)
5) 3-second hook that matches the opening frame / pattern interrupt

Hard rules:
- Do NOT be generic. Mention specific objects/actions/settings from the media context.
- Hashtags must be specific to the media context; include a mix of broad + niche + contextual tags.
- Hook must be 3–8 words and punchy.`;

    if (!nicheStr) {
      userText +=
        '\n\nNo niche provided: still be specific to the media; keep the hashtags balanced and broadly discoverable.';
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: userText }],
      temperature: 0.75,
      max_tokens: 1600,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = safeJsonParse(text);
    return normalizePostAnalysis(parsed);
  } catch (e) {
    if (isQuotaOrRateLimitError(e)) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAI] quota/rate limit — returning local post analysis fallback');
      const hint = mediaContext?.description || notes || 'this post';
      return fallbackPostAnalysis(hint, false, nicheStr);
    }
    throw e;
  }
}

module.exports = {
  generateHashtags,
  generateCaptionAndHooks,
  generateIdeas,
  analyzePost,
  extractMediaContext,
  analyzeMediaPost,
};
