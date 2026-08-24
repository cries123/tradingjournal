import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

export type HelpArticleCategory =
  | 'general'
  | 'brokers'
  | 'dashboard'
  | 'journal'
  | 'settings'
  | 'privacy'
  | 'support';

/** Single source of truth for the Help Center's fixed category list, in display order. */
export const HELP_CATEGORIES: { key: HelpArticleCategory; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'brokers', label: 'Brokers' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'journal', label: 'Journal' },
  { key: 'settings', label: 'Settings' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'support', label: 'Support' },
];

const CATEGORY_LABEL: Record<HelpArticleCategory, string> = HELP_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.label }),
  {} as Record<HelpArticleCategory, string>,
);

export function helpCategoryLabel(category: HelpArticleCategory): string {
  return CATEGORY_LABEL[category] ?? category;
}

export interface HelpArticle {
  id: string;
  title: string;
  category: HelpArticleCategory;
  body: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

const COLLECTION = 'helpArticles';

function fromDoc(id: string, data: Record<string, unknown>): HelpArticle {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    category: (typeof data.category === 'string' ? data.category : 'general') as HelpArticleCategory,
    body: typeof data.body === 'string' ? data.body : '',
    published: Boolean(data.published),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
  };
}

/** Admin-only: every article, including unpublished drafts, newest edit first. */
export async function fetchAllHelpArticles(): Promise<HelpArticle[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const snap = await getDocs(collection(getFirebaseDb(), COLLECTION));
    return snap.docs
      .map((d) => fromDoc(d.id, d.data()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

/** Public: published articles only, grouped by the fixed category order and then title. */
export async function fetchPublishedHelpArticles(): Promise<HelpArticle[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const q = query(collection(getFirebaseDb(), COLLECTION), where('published', '==', true));
    const snap = await getDocs(q);
    const categoryRank = new Map(HELP_CATEGORIES.map((c, i) => [c.key, i]));
    return snap.docs
      .map((d) => fromDoc(d.id, d.data()))
      .sort((a, b) => {
        const rankDiff = (categoryRank.get(a.category) ?? 99) - (categoryRank.get(b.category) ?? 99);
        return rankDiff !== 0 ? rankDiff : a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      });
  } catch {
    return [];
  }
}

export interface HelpArticleInput {
  title: string;
  category: HelpArticleCategory;
  body: string;
  published: boolean;
}

export async function createHelpArticle(input: HelpArticleInput, adminEmail: string): Promise<HelpArticle> {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured');
  const now = new Date().toISOString();
  const payload = {
    title: input.title.trim(),
    category: input.category,
    body: input.body.trim(),
    published: input.published,
    createdAt: now,
    updatedAt: now,
    updatedBy: adminEmail,
  };
  const ref = await addDoc(collection(getFirebaseDb(), COLLECTION), payload);
  return { id: ref.id, ...payload };
}

export async function updateHelpArticle(
  id: string,
  patch: Partial<HelpArticleInput>,
  adminEmail: string,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured');
  const update: Record<string, unknown> = { ...patch, updatedAt: new Date().toISOString(), updatedBy: adminEmail };
  if (typeof update.title === 'string') update.title = update.title.trim();
  if (typeof update.body === 'string') update.body = update.body.trim();
  await updateDoc(doc(getFirebaseDb(), COLLECTION, id), update);
}

export async function deleteHelpArticle(id: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured');
  await deleteDoc(doc(getFirebaseDb(), COLLECTION, id));
}
