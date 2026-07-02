import { Button } from '../ui';

export default function StopTrip({ onStop, disabled }: { onStop: () => void; disabled?: boolean }) {
  return <Button onClick={onStop} disabled={disabled} variant="danger">Stop Trip</Button>;
}
