const baseWords = [
  'election',
  'vote',
  'party',
  'hate',
  'terror',
  'extremism',
  'scam',
  'fraud',
  'violence',
  'abuse',
  'politics',
  'political',
  'weapon',
  'drugs',
  'gambling',
  'adult',
];

const generated: string[] = [];
for (let i = 0; i < 1000; i += 1) {
  generated.push(`forbidden-${i}`);
}

export const forbiddenWords: string[] = [...new Set([...baseWords, ...generated])];

export const matchesForbiddenWord = (text: string): boolean => {
  const lower = text.toLowerCase();
  return forbiddenWords.some((word) => {
    const pattern = word
      .replace(/o/g, '[o0]')
      .replace(/i/g, '[i1!]')
      .replace(/a/g, '[a@]')
      .replace(/e/g, '[e3]')
      .replace(/t/g, '[t7]');
    const regex = new RegExp(`\\b${pattern}\w*`, 'i');
    return regex.test(lower);
  });
};
