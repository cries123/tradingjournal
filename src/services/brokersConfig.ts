import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
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
    const snap = await getDoc(doc(getFirebaseDb(), 'config', 'brokers'));
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
