export function stripEmojis(text: string): string {
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
}

export function isSafeTagName(name: string): boolean {
  return /^[a-zA-Z0-9 _-]{1,30}$/.test(name);
}
