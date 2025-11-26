export const safeTruncate = (input: string, maxLength: number): string => {
  const units = Array.from(input);
  if (units.length <= maxLength) return input;
  return units.slice(0, maxLength).join('');
};
