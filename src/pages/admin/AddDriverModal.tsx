import { useEffect, useState, type FormEvent } from 'react';
import { api, type Bus, type Driver } from '../../lib/api';
import { Button, Field, Input, Modal, Select } from '../../components/ui';

export default function AddDriverModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ driver_id: '', name: '', phone: '', license: '', password: '', bus_id: '' });
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      api.listBuses().then(setBuses).catch(() => {});
      api.listDrivers().then(setDrivers).catch(() => {});
      setForm({ driver_id: '', name: '', phone: '', license: '', password: '', bus_id: '' });
      setError('');
    }
  }, [open]);

  const assignedBusIds = new Set(drivers.map((d) => d.bus_id).filter(Boolean));
  const availableBuses = buses.filter((b) => !assignedBusIds.has(b.bus_id || b.busId));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.phone || !form.password) {
      setError('Name, Phone and Password are required');
      return;
    }
    setLoading(true);
    try {
      const created = await api.createDriver({
        driver_id: form.driver_id || undefined,
        name: form.name,
        phone: form.phone,
        license: form.license,
        password: form.password,
      });
      if (form.bus_id) {
        await api.assignBus(created._id, form.bus_id);
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add driver');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Driver" maxWidth="max-w-2xl">
      <form className="space-y-5" onSubmit={submit}>
        <p className="text-sm text-slate-500">The driver will use their Driver ID (or phone) as username with the password you set here.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Driver ID (optional)"><Input value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })} placeholder="Auto-generated if blank" /></Field>
          <Field label="Full Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone *"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit number" /></Field>
          <Field label="License Number"><Input value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} /></Field>
          <Field label="Login Password *"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Set driver password" /></Field>
          <Field label="Assign Bus (optional)">
            <Select value={form.bus_id} onChange={(e) => setForm({ ...form, bus_id: e.target.value })}>
              <option value="">No bus assigned</option>
              {availableBuses.map((b) => {
                const bId = b.bus_id || b.busId;
                const bNum = b.bus_number || b.busNumber;
                const bRoute = b.route_name || b.routeName || 'No route template';
                return (
                  <option key={bId} value={bId}>{bNum} - {bRoute}</option>
                );
              })}
            </Select>
          </Field>
        </div>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-3">
          <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add Driver'}</Button>
        </div>
      </form>
    </Modal>
  );
}
