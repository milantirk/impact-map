/** Lower-case and strip accents, so "edzőterem" and "edzoterem" match the same pattern. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '');
}

/** Escape a literal for a RegExp source. Spaces match any whitespace. */
export function escapeKeyword(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&').replace(/ /g, '\\s+');
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}
