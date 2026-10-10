import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * A modal that saves has to wait for the save.
 *
 * The trade modal and the CSV import both fired their write and closed in the same breath. Writes go
 * through runCloudWrite, which marks the sync as failed and then RETHROWS — so a refused write (rules
 * not yet published after a deploy, a quota error) closed the form as if it had saved, threw away
 * what was typed or previewed, and reached the admin error feed as an anonymous async rejection.
 *
 * Source assertions because the suite has no DOM; what broke is the order of three statements.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');
const codeOnly = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('the trade modal', () => {
  const MODAL = codeOnly('src/components/TradeModal.tsx');
  const submit = MODAL.slice(MODAL.indexOf('const handleSubmit'), MODAL.indexOf('return ('));

  it('awaits the save, and only closes after it', () => {
    expect(submit).toContain('await onSave(payload)');
    expect(submit).toContain('await onUpdate(');
    // Close inside the try, after the awaits — never after the catch, where a failure also lands.
    const tryBlock = submit.slice(submit.indexOf('try {'), submit.indexOf('} catch'));
    expect(tryBlock).toContain('onClose()');
    expect(submit.slice(submit.indexOf('} catch'))).not.toContain('onClose()');
  });

  it('says so on failure, and reports it with a scope', () => {
    expect(submit).toContain('setSaveError(');
    expect(submit).toMatch(/reportErrorSilently\(err, 'promise', isEdit \? 'trade-modal-update' : 'trade-modal-save'\)/);
  });

  it('cannot be submitted twice while the first save is in flight', () => {
    expect(submit).toContain('if (saving) return;');
  });
});

describe('the CSV import', () => {
  const CSV = codeOnly('src/components/CsvImportModal.tsx');
  const save = CSV.slice(CSV.indexOf('const handleSave'), CSV.indexOf('const totalPnl'));

  it('awaits the batch and closes only once it has landed', () => {
    expect(save).toContain('await onSave(toSave)');
    const tryBlock = save.slice(save.indexOf('try {'), save.indexOf('} catch'));
    expect(tryBlock).toContain('onClose()');
  });

  it('keeps the preview on failure and reports with a scope', () => {
    expect(save).toContain("reportErrorSilently(err, 'promise', 'csv-import-save')");
    expect(save).toContain('setError(');
  });
});

describe('what the modals are handed', () => {
  it('has addTrade returning its write rather than voiding it', () => {
    const hook = codeOnly('src/hooks/useTrades.ts');
    const addTrade = hook.slice(hook.indexOf('const addTrade'), hook.indexOf('const addTrades'));
    expect(addTrade).toContain('await persistTrade(newTrade)');
    expect(addTrade).not.toContain('void persistTrade');
  });

  it('has the journal passing the CSV write through instead of voiding it', () => {
    const page = codeOnly('src/pages/JournalApp.tsx');
    expect(page).toContain('onSave={(imported) => addTrades(imported)}');
    expect(page).not.toContain('void addTrades(imported)');
  });
});

describe('the share card copy button', () => {
  it('handles the clipboard refusing instead of letting it reject', () => {
    const modal = codeOnly('src/components/ShareCardModal.tsx');
    const copy = modal.slice(modal.indexOf('const copyText'), modal.indexOf('const copyText') + 400);
    expect(copy).toContain('try {');
    expect(copy).toContain("setCopied('failed')");
  });
});
