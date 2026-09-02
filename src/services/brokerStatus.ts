import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';
import {
  BROKER_STATUS_DOC,
  parseBrokerStatusOverrides,
  type BrokerStatusKind,
  type BrokerStatusOverrides,
} from '../data/brokerStatusOverrides';

const [COLLECTION, DOC_ID] = BROKER_STATUS_DOC.split('/');

/** Live broker availability. Public read — every visitor's connect page depends on it. */
export function subscribeToBrokerStatus(
  onChange: (overrides: BrokerStatusOverrides) => void,
): () => void {
  if (!isFirebaseConfigured()) {
    onChange({});
    return () => {};
  }

  return onSnapshot(
    doc(getFirebaseDb(), COLLECTION, DOC_ID),
    (snap) => onChange(parseBrokerStatusOverrides(snap.data()?.brokers)),
    // A read failure must not blank the connect page — fall back to the registry defaults.
    () => onChange({}),
  );
}

export async function fetchBrokerStatus(): Promise<BrokerStatusOverrides> {
  if (!isFirebaseConfigured()) return {};
  try {
    const snap = await getDoc(doc(getFirebaseDb(), COLLECTION, DOC_ID));
    return parseBrokerStatusOverrides(snap.data()?.brokers);
  } catch {
    return {};
  }
}

/** Admin-only by rule. Writes one broker's status, leaving the rest alone. */
export async function setBrokerStatus(
  brokerKey: string,
  status: { kind: BrokerStatusKind; message: string },
  adminUid: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  await setDoc(
    doc(getFirebaseDb(), COLLECTION, DOC_ID),
    {
      brokers: {
        [brokerKey]: {
          kind: status.kind,
          message: status.message.trim().slice(0, 500),
          since: new Date().toISOString().slice(0, 10),
          updatedAt: new Date().toISOString(),
          updatedBy: adminUid,
        },
      },
    },
    // merge, so setting one broker never clears the others.
    { merge: true },
  );
}
