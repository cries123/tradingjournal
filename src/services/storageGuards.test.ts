import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Every localStorage and sessionStorage call in the app must sit inside a try block.
 *
 * Not a style rule. In Safari with site data blocked, and in a private window, EVERY call throws —
 * getItem included — and the ~5MB quota does the same to writes on a long-lived journal. Six sites
 * were unguarded when this was written, and the worst of them was hasCompletedOnboarding(), read
 * while App decides what to mount: in that browser the app hit the crash screen before it had
 * rendered anything at all. Another was saveTrades, called from inside a React state updater, so
 * logging a trade threw during a state update.
 *
 * What made it hard to see is that the guarded and unguarded versions sat next to each other in the
 * same files — loadSettings was wrapped and saveSettings was not; isGettingStartedHidden was and
 * hasCompletedOnboarding was not. Nothing kept them honest, so they drifted one function at a time.
 * This is the thing that keeps them honest.
 */

const SOURCE_ROOT = 'src';

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) found.push(path);
  }
  return found;
}

/**
 * Blanks comments and the insides of strings, keeping every byte offset.
 *
 * Without this, a brace in a string or the word localStorage in a comment — of which this very file
 * is full — would move or invent a match.
 */
function blankNonCode(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i++) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };

  let i = 0;
  while (i < src.length) {
    const pair = src.slice(i, i + 2);
    if (pair === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (pair === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    const quote = src[i];
    if (quote === '"' || quote === "'" || quote === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Offset ranges of every `try { ... }` block, by brace matching. */
function tryBlocks(code: string): [number, number][] {
  const blocks: [number, number][] = [];
  const opener = /\btry\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(code)) !== null) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}' && --depth === 0) break;
    }
    blocks.push([match.index, i]);
  }
  return blocks;
}

const STORAGE_CALL =
  /\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear|key|length)/g;

describe('browser storage access', () => {
  it('is wrapped in a try block everywhere in the app', () => {
    const unguarded: string[] = [];

    for (const file of sourceFiles(SOURCE_ROOT)) {
      const src = readFileSync(file, 'utf8');
      const code = blankNonCode(src);
      const blocks = tryBlocks(code);
      const lines = src.split('\n');

      let match: RegExpExecArray | null;
      STORAGE_CALL.lastIndex = 0;
      while ((match = STORAGE_CALL.exec(code)) !== null) {
        const inside = blocks.some(([start, end]) => match!.index > start && match!.index < end);
        if (inside) continue;
        const line = src.slice(0, match.index).split('\n').length;
        unguarded.push(`${file.split(/[\\/]/).join('/')}:${line}  ${lines[line - 1].trim()}`);
      }
    }

    expect(unguarded).toEqual([]);
  });

  it('finds the calls it is supposed to be checking', () => {
    /*
     * The guard on the guard. If the matcher silently stopped matching — a rename, a refactor to a
     * wrapper, a bad regex — the test above would pass by finding nothing, and go on passing while
     * unguarded calls piled up. This is the mutation that would otherwise survive.
     */
    let calls = 0;
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const code = blankNonCode(readFileSync(file, 'utf8'));
      calls += (code.match(STORAGE_CALL) ?? []).length;
    }

    expect(calls).toBeGreaterThan(30);
  });

  it('does not count a call named only in a comment or a string', () => {
    const sample = [
      '// localStorage.setItem in a comment',
      'const hint = "localStorage.setItem in a string";',
      'localStorage.setItem(k, v);',
    ].join('\n');

    const code = blankNonCode(sample);
    expect((code.match(STORAGE_CALL) ?? []).length).toBe(1);
  });

  it('knows a call inside a try block from one after it', () => {
    const sample = [
      'function a() {',
      '  try {',
      '    localStorage.setItem(k, v);',
      '  } catch {}',
      '  localStorage.removeItem(k);',
      '}',
    ].join('\n');

    const code = blankNonCode(sample);
    const blocks = tryBlocks(code);
    const offsets = [...code.matchAll(STORAGE_CALL)].map((m) => m.index);

    expect(offsets).toHaveLength(2);
    expect(blocks.some(([s, e]) => offsets[0] > s && offsets[0] < e)).toBe(true);
    expect(blocks.some(([s, e]) => offsets[1] > s && offsets[1] < e)).toBe(false);
  });
});
