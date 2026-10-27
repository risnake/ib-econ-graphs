/**
 * Tiny label markup:
 *   P_1      → P with subscript "1"   (subscript runs over letters/digits)
 *   P_{w+t}  → braces for anything longer
 *   x^2      → superscript
 *   line one\nline two → multi-line
 */

export interface Run {
  text: string;
  sub?: boolean;
  sup?: boolean;
}

export function parseRich(src: string): Run[][] {
  return src.split('\n').map(parseLine);
}

function parseLine(s: string): Run[] {
  const runs: Run[] = [];
  let buf = '';
  const flush = () => {
    if (buf) runs.push({ text: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if ((ch === '_' || ch === '^') && i + 1 < s.length) {
      let j = i + 1;
      let text = '';
      if (s[j] === '{') {
        const end = s.indexOf('}', j);
        if (end === -1) {
          buf += ch;
          i++;
          continue;
        }
        text = s.slice(j + 1, end);
        j = end + 1;
      } else {
        while (j < s.length && /[A-Za-z0-9*′'.]/.test(s[j])) j++;
        text = s.slice(i + 1, j);
      }
      if (!text) {
        buf += ch;
        i++;
        continue;
      }
      flush();
      runs.push(ch === '_' ? { text, sub: true } : { text, sup: true });
      i = j;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return runs;
}

/** Strip markup to plain text (for accessibility titles, file names, search). */
export function plainText(src: string): string {
  return parseRich(src)
    .map((line) => line.map((r) => r.text).join(''))
    .join(' ');
}

export const SUB_SCALE = 0.7;

/** Rough width in px — good enough for legends, collision nudges and highlight boxes. */
export function measureRich(src: string, fontSize: number): { width: number; lines: number } {
  const lines = parseRich(src);
  let width = 0;
  for (const line of lines) {
    let w = 0;
    for (const r of line) w += charWidth(r.text) * fontSize * (r.sub || r.sup ? SUB_SCALE : 1);
    width = Math.max(width, w);
  }
  return { width, lines: lines.length };
}

function charWidth(text: string): number {
  let w = 0;
  for (const c of text) {
    if (/[ilI.,:;|!'1]/.test(c)) w += 0.3;
    else if (/[MWmw]/.test(c)) w += 0.85;
    else if (/[A-Z]/.test(c)) w += 0.66;
    else if (c === ' ') w += 0.28;
    else w += 0.55;
  }
  return w;
}
