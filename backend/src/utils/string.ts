export const safeTruncate = (input: string, maxLength: number): string => {
  const units = Array.from(input);
  if (units.length <= maxLength) return input;
  return units.slice(0, maxLength).join('');
};

export const extractTextPreview = (platformText: unknown, maxLength: number): string => {
  if (typeof platformText === 'string') {
    return safeTruncate(platformText, maxLength);
  }
  if (platformText && typeof platformText === 'object') {
    const candidateParts: string[] = [];
    const value = platformText as Record<string, unknown>;
    if (typeof value.title === 'string') {
      candidateParts.push(value.title);
    }
    if (typeof value.description === 'string') {
      candidateParts.push(value.description);
    }
    const combined = candidateParts.join(' ').trim();
    if (combined) {
      return safeTruncate(combined, maxLength);
    }
    try {
      return safeTruncate(JSON.stringify(platformText), maxLength);
    } catch (_e) {
      return '';
    }
  }
  return '';
};
