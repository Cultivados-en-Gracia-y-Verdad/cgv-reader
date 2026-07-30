/**
 * OSHB (WLC) helpers for Daniel Observer — MT verse remap + morph → Mark tags.
 *
 * MorphHB verb core after stripping language/prefixes: V + stem + type + PNG…
 * types: p perfect, i imperfect, w wayyiqtol, v imperative, j jussive,
 *        r participle, c inf. construct, a inf. absolute
 */

/** Map OSHB/MT Daniel refs to Protestant/LBF verse numbers. */
export function mtToProtestant(ch: number, vs: number): { chapter: number; verse: number } {
  if (ch === 3 && vs >= 31) return { chapter: 4, verse: vs - 30 };
  if (ch === 4) return { chapter: 4, verse: vs + 3 };
  if (ch === 6 && vs === 1) return { chapter: 5, verse: 31 };
  if (ch === 6 && vs >= 2) return { chapter: 6, verse: vs - 1 };
  return { chapter: ch, verse: vs };
}

function verbCore(morph: string): string | null {
  const parts = morph.split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^[HA]V/.test(part)) return part.slice(1); // drop H/A → V…
    if (part.startsWith("V") && part.length >= 3) return part;
  }
  const match = morph.match(/[HA]?(V[A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

/** Verb type letter (p/i/w/v/r/c/a/…) or null. */
function verbType(morph: string): string | null {
  const core = verbCore(morph);
  return core && core.length >= 3 ? core[2] : null;
}

export function isOshbFiniteVerb(morph: string): boolean {
  const type = verbType(morph);
  if (!type) return false;
  if (type === "r" || type === "c" || type === "a") return false;
  const core = verbCore(morph);
  return Boolean(core && /[123]/.test(core.slice(3)));
}

export function isOshbParticiple(morph: string): boolean {
  return verbType(morph) === "r";
}

export function isOshbInfinitive(morph: string): boolean {
  const type = verbType(morph);
  return type === "c" || type === "a";
}

function personFromCore(core: string): "1" | "2" | "3" {
  const match = core.slice(3).match(/[123]/);
  return (match?.[0] as "1" | "2" | "3") ?? "3";
}

function numberFromCore(core: string): "S" | "P" {
  if (core.endsWith("p") || core.endsWith("mp") || core.endsWith("fp") || core.endsWith("cp")) {
    return "P";
  }
  return "S";
}

/**
 * Synthetic MorphGNT-like sourceMorph so Mark brick detectors keep working.
 * Finite: V-{person}{tense}{voice}{mood}-…
 * Participle: V--{tense}{voice}P-…
 * Infinitive: V--{tense}{voice}N-…
 */
export function oshbToSourceMorph(morph: string): string {
  const core = verbCore(morph);
  if (!core) return morph;

  const type = core[2] ?? "p";
  const person = personFromCore(core);
  const number = numberFromCore(core);
  const tense = type === "i" || type === "w" || type === "j" ? "A" : "P";
  const voice = "A";

  if (type === "r") {
    return `V--${tense}${voice}P-${number}M-`;
  }
  if (type === "c" || type === "a") {
    return `V--${tense}${voice}N----`;
  }
  if (type === "v") {
    return `V-${person}${tense}${voice}M-${number}--`;
  }
  return `V-${person}${tense}${voice}I-${number}--`;
}

export function otTokenId(chapter: number, verse: number, token: number): string {
  return `${chapter}:${verse}:${token}`;
}

export function isAlignmentStyleId(id: string): boolean {
  return /^\d+:\d+:\d+$/.test(id);
}
