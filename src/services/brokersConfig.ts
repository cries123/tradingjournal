import { isFirebaseConfigured } from '../lib/firebaseAuth';
import { lazyFirestore } from '../lib/lazyFirestore';
import { COMING_SOON_BROKERS, SUPPORTED_BROKERS } from '../data/brokers';

export interface BrokerConfig {
  name: string;
  detail: string;
  methods: string[];
  live?: boolean;
}

export interface BrokersConfigDoc {
  supported: BrokerConfig[];
  comingSoon: string[];
  updatedAt?: string;
}

export async function fetchBrokersConfig(): Promise<BrokersConfigDoc> {
  const fallback: BrokersConfigDoc = {
    supported: SUPPORTED_BROKERS.map((b) => ({ ...b, methods: [...b.methods], live: true })),
    comingSoon: [...COMING_SOON_BROKERS],
  };

  if (!isFirebaseConfigured()) return fallback;

  try {
    // The landing page reads this, so Firestore arrives on demand — see lib/lazyFirestore.ts.
    const { fs, db } = await lazyFirestore();
    const snap = await fs.getDoc(fs.doc(db, 'config', 'brokers'));
    if (!snap.exists()) return fallback;

    const data = snap.data() as Partial<BrokersConfigDoc>;
    return {
      supported: data.supported?.length ? data.supported : fallback.supported,
      comingSoon: data.comingSoon?.length ? data.comingSoon : fallback.comingSoon,
      updatedAt: data.updatedAt,
    };
  } catch {
    return fallback;
  }
}
