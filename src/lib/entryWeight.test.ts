import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What the landing page has to download before it is interactive.
 *
 * Every module reachable from src/main.tsx through STATIC imports is part of the entry — fetched and
 * evaluated before the first paint can respond. Firestore was in it, because the root auth and
 * settings contexts, the visit counter and the landing page's announcement bar each imported it, and
 * lib/firebase.ts imported it alongside auth. That was 135 KB compressed of database client on every
 * marketing page view, to read two small documents after the page was already up.
 *
 * It now loads on first use, through lib/lazyFirestore.ts. One `import { doc } from
 * 'firebase/firestore'` added to anything in the entry would undo that silently — the app would
 * still work, it would just be slow again — so this walks the graph and fails instead.
 */

const ENTRY = resolve('src/main.tsx');

function resolveSpec(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every module statically reachable from the entry, with the packages each imports. */
function entryGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const visit = (file: string) => {
    if (graph.has(file)) return;
    const specs: string[] = [];
    graph.set(file, specs);
    const src = readFileSync(file, 'utf8');
    // `import x from`, `import { a } from`, `export … from` — not `import type`, which is erased,
    // and not `import()`, which is exactly what keeps a module out of the entry.
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      specs.push(m[1]);
      const next = resolveSpec(file, m[1]);
      if (next) visit(next);
    }
    for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
      const next = resolveSpec(file, m[1]);
      if (next) visit(next);
    }
  };
  visit(ENTRY);
  return graph;
}

const graph = entryGraph();
const rel = (p: string) => p.slice(resolve('.').length + 1).split('\\').join('/');

describe('the landing page entry', () => {
  it('is actually being walked', () => {
    // A broken resolver would make the two rules below pass by inspecting nothing.
    expect(graph.size).toBeGreaterThan(40);
    expect([...graph.keys()].map(rel)).toContain('src/context/AuthContext.tsx');
  });

  it('does not import Firestore', () => {
    const offenders = [...graph].filter(([, specs]) => specs.some((s) => s.startsWith('firebase/firestore')));
    expect(offenders.map(([f]) => rel(f))).toEqual([]);
  });

  it('does not import Storage', () => {
    const offenders = [...graph].filter(([, specs]) => specs.some((s) => s.startsWith('firebase/storage')));
    expect(offenders.map(([f]) => rel(f))).toEqual([]);
  });

  it('does not reach lib/firebase.ts, which imports both', () => {
    expect([...graph.keys()].map(rel)).not.toContain('src/lib/firebase.ts');
  });

  it('does not carry the landing page demos, which load as the visitor scrolls to them', () => {
    // The simulator demo and the Performance showcase bring the simulator and the analytics with
    // them. They are React.lazy behind LazyOnView; one static import would put both in the first
    // download of every marketing page.
    const files = [...graph.keys()].map(rel);
    for (const heavy of [
      'src/utils/ruleSimulator.ts',
      'src/utils/brokerAnalytics.ts',
      'src/components/landing/ProductShowcase.tsx',
      'src/components/landing/RuleSimulatorDemo.tsx',
    ]) {
      expect(files).not.toContain(heavy);
    }
  });

  it('keeps Firestore in a chunk apart from auth, or the split above buys nothing', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("return 'firestore'");
  });
});
