import { Button } from '../ui';

export default function StartTrip({ onStart, disabled }: { onStart: () => void; disabled?: boolean }) {
  return <Button onClick={onStart} disabled={disabled} variant="success">Start Trip</Button>;
}
