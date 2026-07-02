import { useEffect, useState } from 'react';
import { api, type Bus, type Driver } from '../../lib/api';
import { Button, Modal, Select } from '../../components/ui';

export default function AssignBusModal({ driver, onClose, onAssigned }: { driver: Driver | null; onClose: () => void; onAssigned: () => void }) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [bus_id, setBusId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (driver) {
      api.listBuses().then(setBuses).catch(() => {});
      api.listDrivers().then(setAllDrivers).catch(() => {});
      setBusId(driver.bus_id || '');
      setError('');
    }
  }, [driver]);

  if (!driver) return null;

  const assignedBusIds = new Set(allDrivers.filter((d) => d._id !== driver._id && d.bus_id).map((d) => d.bus_id));
  const availableBuses = buses.filter((b) => !assignedBusIds.has(b.busId || b.bus_id));

  async function submit(targetBusId: string = bus_id) {
    setError('');
    setLoading(true);
    try {
      await api.assignBus(driver!._id, targetBusId);
      onAssigned();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save assignment');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnassign() {
    const currentBus = buses.find((b) => (b.busId || b.bus_id) === driver?.bus_id);
    const busName = currentBus ? (currentBus.busNumber || currentBus.bus_number) : 'bus';
    if (confirm(`Remove ${busName} from ${driver.name}?`)) {
      await submit('');
    }
  }

  const hasExistingBus = !!driver.bus_id;

  return (
    <Modal open onClose={onClose} title={hasExistingBus ? `Change Bus for ${driver.name}` : `Assign Bus to ${driver.name}`} maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">A bus can only be assigned to one driver at a time.</p>
        <Select value={bus_id} onChange={(e) => setBusId(e.target.value)}>
          <option value="">Select a bus (No Bus Assigned)</option>
          {availableBuses.map((b) => {
            const bId = b.busId || b.bus_id;
            const bNum = b.busNumber || b.bus_number;
            const bRoute = b.routeName || b.route_name || 'No route template';
            return (
              <option key={bId} value={bId}>{bNum} - {bRoute}</option>
            );
          })}
        </Select>
        {availableBuses.length === 0 && <p className="text-sm text-slate-500">All buses are currently assigned.</p>}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          {hasExistingBus && (
            <Button variant="danger" onClick={handleUnassign} disabled={loading}>
              Unassign Bus
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit()} disabled={loading}>
            {loading ? 'Saving...' : hasExistingBus ? 'Change Bus' : 'Assign Bus'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
