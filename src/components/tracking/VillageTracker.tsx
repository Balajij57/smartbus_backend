import type { TrackingProgressVillage } from '../../lib/api';
import RouteProgress from './RouteProgress';

export default function VillageTracker({ villages }: { villages: TrackingProgressVillage[] }) {
  return <RouteProgress villages={villages} />;
}
