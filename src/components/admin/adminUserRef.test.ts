import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Fragment, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminUserRef } from './AdminUserRef';

/*
 * Opening a person from the panel that named them.
 *
 * Three panels name someone — support tickets, error events, the costs breakdown — and none of them
 * could open that person. The uid had to be copied, the tab switched, the search box pasted into.
 *
 * The component is called directly rather than rendered: it takes no hooks, and what matters is
 * whether the returned element is a button wired to the right uid or inert text. renderToString
 * would also work but puts <!-- --> separators through interpolated copy, which has broken
 * assertions in this suite before.
 */

const call = (props: Parameters<typeof AdminUserRef>[0]): ReactElement =>
  AdminUserRef(props) as ReactElement;

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');

describe('AdminUserRef', () => {
  it('opens the uid it was given, not whatever the label says', () => {
    // The label is an email and the modal is keyed by uid. Passing the wrong one of the two would
    // open a different customer's billing page, which is why this asserts the argument.
    const onOpen = vi.fn<(uid: string) => void>();
    const el = call({ uid: 'abc123', onOpen, children: 'someone@example.com' });

    expect(el.type).toBe('button');
    (el.props as { onClick: () => void }).onClick();

    expect(onOpen).toHaveBeenCalledWith('abc123');
  });

  it('stays plain text for an account that is no longer loaded', () => {
    /*
     * Tickets and error events outlive the account that filed them. A deleted user's uid resolves to
     * nothing, and the panel this lives in is the one whose whole problem was controls that did not
     * do what they looked like they would.
     */
    const onOpen = vi.fn<(uid: string) => void>();
    const el = call({
      uid: 'deleted-user',
      onOpen,
      canOpen: () => false,
      children: 'gone@example.com',
    });

    expect(el.type).toBe(Fragment);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('stays plain text where no opener was supplied at all', () => {
    expect(call({ uid: 'abc123', children: 'someone@example.com' }).type).toBe(Fragment);
  });

  it('is focusable and typed as a button, so Enter does not submit anything', () => {
    // It sits inside panels that contain selects and reply forms. A <button> with no type is a
    // submit button.
    const props = call({ uid: 'abc123', onOpen: () => {}, children: 'x' }).props as {
      type: string;
      className: string;
    };

    expect(props.type).toBe('button');
    expect(props.className).toContain('focus-ring');
  });
});

describe('the panels that name someone', () => {
  const PANELS = [
    'src/components/admin/SupportTicketsPanel.tsx',
    'src/components/admin/ErrorEventsPanel.tsx',
    'src/components/admin/CostsPanel.tsx',
    'src/components/admin/MoneyAtRiskPanel.tsx',
    'src/components/admin/DormantSubscribersPanel.tsx',
  ];

  it('all route their name through it', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      expect(source, panel).toContain('<AdminUserRef');
      expect(source, panel).toContain('onOpen={onOpenUser}');
      expect(source, panel).toContain('canOpen={canOpenUser}');
    }
  });

  it('are all wired up by the page, not just willing to be', () => {
    // Three optional props are three chances to add the plumbing and forget one end of it.
    const page = read('src/pages/AdminPage.tsx');
    expect(page.match(/onOpenUser=\{openUserByUid\}/g)?.length).toBe(PANELS.length);
    expect(page.match(/canOpenUser=\{canOpenUserByUid\}/g)?.length).toBe(PANELS.length);
  });

  it('keeps the support ticket name out of the expand button', () => {
    /*
     * The identity line used to sit inside the button that expands the thread. A button inside a
     * button is markup the browser un-nests silently, so the name would have rendered but not
     * worked. The expand target now closes before the name opens.
     */
    const source = read('src/components/admin/SupportTicketsPanel.tsx');
    const expandButton = source.slice(
      source.indexOf('onClick={() => setOpenId('),
      source.indexOf('</button>', source.indexOf('onClick={() => setOpenId(')),
    );

    expect(expandButton).not.toContain('AdminUserRef');
  });
});
