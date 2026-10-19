import { ChevronDown } from 'lucide-react';
import { useSettings } from '../../context/useSettings';

const ALL = '__all__';

/**
 * Which journal the phone's Overview is showing, as one line under the period.
 *
 * It replaced a panel of journal chips, an "All journals" chip and a New journal button that took
 * the top 150px of the screen on every visit to switch something most people switch once a week.
 * A native select because a phone's own picker is the best one there is for a short list, and
 * because it costs one line. Adding a journal lives on More, with the rest of the journal list.
 *
 * 16px text, like every input here, so iOS Safari does not zoom the page when it opens.
 */
export function PhoneJournalSelect() {
  const { settings, setActiveAccount, viewingAllJournals, canViewAllJournals, setViewAllJournals } = useSettings();
  if (settings.accounts.length < 2) return null;

  const value = viewingAllJournals ? ALL : settings.activeAccountId;
  const label = viewingAllJournals
    ? 'All journals'
    : (settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'Journal');

  return (
    <label className="md:hidden relative inline-flex items-center gap-1 self-start text-[13px] text-text-secondary">
      <span className="sr-only">Journal</span>
      <span aria-hidden className="font-medium text-text-primary">{label}</span>
      <ChevronDown size={14} aria-hidden />
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === ALL) setViewAllJournals(true);
          else setActiveAccount(e.target.value);
        }}
        className="absolute inset-0 opacity-0 text-[16px]"
      >
        {settings.accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
        {canViewAllJournals && <option value={ALL}>All journals</option>}
      </select>
    </label>
  );
}
