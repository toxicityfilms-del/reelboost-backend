function getMockTrends() {
  return {
    updatedAt: new Date().toISOString(),
    source: 'mock',
    ideas: [
      { title: 'Day-in-the-life with a twist ending', niche: 'Lifestyle', difficulty: 'medium' },
      { title: '3 mistakes I stopped making (save this)', niche: 'Fitness', difficulty: 'easy' },
      { title: 'POV: you finally fixed your lighting', niche: 'Creator tips', difficulty: 'easy' },
      { title: 'Before/after but honest timeline', niche: 'Skincare', difficulty: 'medium' },
      { title: 'Storytime: the DM that changed everything', niche: 'Personal brand', difficulty: 'hard' },
      { title: 'Trending audio + your niche hook in 3s', niche: 'General', difficulty: 'easy' },
      { title: 'Green screen reaction to your niche drama', niche: 'Commentary', difficulty: 'medium' },
      { title: 'Checklist reel: 5 steps under 15s', niche: 'Education', difficulty: 'easy' },
    ],
    sounds: [
      { name: 'Upbeat motivational clip', mood: 'hype', note: 'Fitness & morning routines' },
      { name: 'Lo-fi chill beat', mood: 'calm', note: 'Aesthetic vlogs' },
      { name: 'Comedic sting', mood: 'funny', note: 'Skits and punchlines' },
    ],
  };
}

module.exports = { getMockTrends };
