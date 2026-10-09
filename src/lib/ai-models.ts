/** "gemini-3-8-flash" → "Gemini 3.8 Flash", "claude-opus-5-5" → "Claude Opus 5.5". Safe to use on the client. */
export function modelLabel(id: string | null | undefined) {
  if (!id) return "AI";
  const words: string[] = [];
  for (const part of id.split("-")) {
    const last = words.length - 1;
    if (/^\d+$/.test(part) && last >= 0 && /^\d+(\.\d+)*$/.test(words[last]!)) words[last] += `.${part}`;
    else words.push(/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1));
  }
  return words.join(" ");
}
