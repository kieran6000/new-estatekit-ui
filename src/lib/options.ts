/** A multiple-choice question's answers as saved: trimmed, no blanks, no
 *  duplicates. */
export function cleanOptions(v: string[]): string[] {
  return [...new Set(v.map((o) => o.trim()).filter(Boolean))];
}
