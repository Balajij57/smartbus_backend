import { useEffect, useState } from 'react';
import { api, type Bus } from '../../lib/api';
import { Card, Section, Input, Button, Badge, Empty, Modal, Select, Field } from '../../components/ui';

export default function BusManagementModule() {
  const [buses, setBuses] = useState<any[]>([]);
  const [selectedBus, setSelectedBus] = useState<any | null>(null);
  const [occupancyData, setOccupancyData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingBus, setEditingBus] = useState<any | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);

  // Form states
  const [busNumber, setBusNumber] = useState('');
  const [busName, setBusName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [capacity, setCapacity] = useState('40');
  const [status, setStatus] = useState('inactive');
  const [formError, setFormError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const load = async () => {
    try {
      const busesList = await api.listBuses();
      setBuses(busesList);
      const driversList = await api.listDrivers();
      setDrivers(driversList);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch live occupancy when a bus is selected
  useEffect(() => {
    if (!selectedBus) {
      setOccupancyData(null);
      return;
    }
    const fetchOccupancy = () => {
      api.getBusOccupancy(selectedBus.busNumber)
        .then(setOccupancyData)
        .catch(console.error);
    };
    fetchOccupancy();
    const interval = setInterval(fetchOccupancy, 3000);
    return () => clearInterval(interval);
  }, [selectedBus]);

  const handleOpenAdd = () => {
    setEditingBus(null);
    setBusNumber('');
    setBusName('');
    setVehicleNumber('');
    setCapacity('40');
    setStatus('inactive');
    setFormError('');
    setShowAddEdit(true);
  };

  const handleOpenEdit = (bus: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBus(bus);
    setBusNumber(bus.busNumber);
    setBusName(bus.busName || '');
    setVehicleNumber(bus.vehicleNumber || '');
    setCapacity(String(bus.capacity || 40));
    setStatus(bus.status || 'inactive');
    setFormError('');
    setShowAddEdit(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!busNumber.trim()) {
      setFormError('Bus Number is required');
      return;
    }
    const cap = Number(capacity);
    if (isNaN(cap) || cap <= 0) {
      setFormError('Capacity must be greater than 0');
      return;
    }

    const payload = {
      busNumber: busNumber.trim().toUpperCase(),
      busName: busName.trim(),
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      capacity: cap,
      status
    };

    try {
      if (editingBus) {
        await api.updateBus(editingBus.busId || editingBus._id, payload);
      } else {
        await api.createBus(payload);
      }
      setShowAddEdit(false);
      load();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    }
  };

  const handleDelete = async (bus: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete bus ${bus.busNumber}?`)) return;
    setErrorMsg('');
    try {
      await api.deleteBus(bus.busId || bus._id);
      if (selectedBus && (selectedBus.busId === bus.busId || selectedBus._id === bus._id)) {
        setSelectedBus(null);
      }
      load();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete bus');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black">Bus Fleet Management</h2>
          <p className="text-sm text-slate-500">Configure buses, track dynamic live capacities, and monitor hardware telematics.</p>
        </div>
        <Button onClick={handleOpenAdd} size="lg">+ Add New Bus</Button>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fleet Table */}
        <Card className="lg:col-span-2">
          <Section title={`Fleet List (${buses.length})`}>
            {buses.length === 0 ? <Empty message="No buses in fleet. Click '+ Add New Bus' to begin." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-3 pr-2">Bus Details</th>
                      <th className="px-2">Vehicle Reg</th>
                      <th className="px-2">Capacity Utilization</th>
                      <th className="px-2">Status</th>
                      <th className="py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buses.map((bus) => {
                      const assignedDriver = drivers.find(d => d.bus_id === bus.busId || d.bus_number === bus.busNumber);
                      
                      // Count students assigned to this bus
                      // Since we don't have the whole student list here directly, the backend server /api/buses can return the student count
                      // Let's check how students list can be processed, or we can fetch student count. Wait!
                      // Let's count how many students are assigned. Let's see if the bus has a student count, or we fetch it.
                      // Wait! The backend GET /api/buses/:busNumber/occupancy returns assignedStudents. Let's make sure we show it dynamically if we select the bus,
                      // or we can calculate it from occupancyData when selected. Let's show a loading or approximate count if we fetch occupancy or if it is on the bus object itself.
                      // Let's check if the bus object returned by api.listBuses() has an assigned student count or driver details.
                      // Wait, we can fetch all students or the list of students using api.listStudents() to calculate assigned students for all buses in memory!
                      // Yes! That's incredibly elegant and avoids extra API calls.
                      return (
                        <tr
                          key={bus._id}
                          className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${selectedBus?.busNumber === bus.busNumber ? 'bg-blue-50/50' : ''}`}
                          onClick={() => setSelectedBus(bus)}
                        >
                          <td className="py-4 pr-2">
                            <div className="font-bold text-slate-900">{bus.busNumber}</div>
                            {bus.busName && <div className="text-xs text-slate-500">{bus.busName}</div>}
                            <div className="mt-1 text-xs text-slate-400">
                              Driver: {assignedDriver ? assignedDriver.name : <span className="italic text-slate-400">None</span>}
                            </div>
                          </td>
                          <td className="px-2 font-mono text-xs">{bus.vehicleNumber || '—'}</td>
                          <td className="px-2">
                            <CapacityDisplay bus={bus} />
                          </td>
                          <td className="px-2">
                            <StatusBadge status={bus.status} />
                          </td>
                          <td className="py-4 text-right space-x-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <Button variant="outline" size="sm" onClick={e => handleOpenEdit(bus, e)}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={e => handleDelete(bus, e)}>Delete</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </Card>

        {/* Bus Statistics & Health Drawer / Panel */}
        <Card className="lg:col-span-1">
          <Section title="Bus Status & Telematics">
            {!selectedBus ? (
              <Empty message="Select a bus from the list to view live tracking details, statistics, and telematics health." />
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900">{selectedBus.busNumber}</h3>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{selectedBus.busName || 'Standard Fleet Route'}</p>
                    </div>
                    <Badge tone="blue">{selectedBus.routeName || 'No template route'}</Badge>
                  </div>
                </div>

                {/* Health & Status Matrix */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GPS Telematics</p>
                    <div className="mt-1 flex items-center gap-1.5 font-bold text-sm">
                      <GPSStatus bus={selectedBus} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Scanner Status</p>
                    <div className="mt-1 flex items-center gap-1.5 font-bold text-sm">
                      <ScannerStatus bus={selectedBus} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver Assignment</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {drivers.find(d => d.bus_id === selectedBus.busId || d.bus_number === selectedBus.busNumber)?.name || 'Unassigned'}
                    </p>
                  </div>
                </div>

                {/* Live Occupancy Stats Card */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Live Occupancy & Trip Progress</h4>
                  {occupancyData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Onboard</p>
                          <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-2xl font-black text-blue-600">{occupancyData.currentOccupancy}</span>
                            <span className="text-xs text-slate-400">/ {selectedBus.capacity}</span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Students</p>
                          <p className="mt-1 text-2xl font-black text-slate-800">{occupancyData.assignedStudents}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Boarded Today</p>
                          <p className="mt-1 text-2xl font-black text-emerald-600">{occupancyData.boardedToday}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dropped Today</p>
                          <p className="mt-1 text-2xl font-black text-rose-500">{occupancyData.droppedToday}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Remaining Stops</p>
                            <p className="text-lg font-extrabold text-indigo-950 mt-0.5">{occupancyData.remainingStops} Stops Left</p>
                          </div>
                          <span className="text-2xl">🛑</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"></span>
                        Loading live telematics data...
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>
        </Card>
      </div>

      {/* Add / Edit Modal */}
      <Modal open={showAddEdit} onClose={() => setShowAddEdit(false)} title={editingBus ? 'Modify Fleet Vehicle' : 'Register New Fleet Vehicle'}>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              ⚠️ {formError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Bus Identifier Code (e.g. BUS-07)">
              <Input
                placeholder="BUS-XX"
                value={busNumber}
                onChange={e => setBusNumber(e.target.value)}
                disabled={!!editingBus}
                required
              />
            </Field>

            <Field label="Bus Route Name / Descr">
              <Input
                placeholder="e.g. Samalkot Express"
                value={busName}
                onChange={e => setBusName(e.target.value)}
              />
            </Field>

            <Field label="Vehicle Registration Number">
              <Input
                placeholder="AP-XX-XX-XXXX"
                value={vehicleNumber}
                onChange={e => setVehicleNumber(e.target.value)}
                required
              />
            </Field>

            <Field label="Passenger Seating Capacity">
              <Input
                type="number"
                min="1"
                placeholder="40"
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                required
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Operational Status">
                <Select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="maintenance">Maintenance</option>
                </Select>
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setShowAddEdit(false)}>Cancel</Button>
            <Button type="submit">{editingBus ? 'Save Changes' : 'Register Bus'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
    active: 'green',
    inactive: 'slate',
    paused: 'amber',
    maintenance: 'red'
  };
  return <Badge tone={tones[status] || 'slate'}>{status}</Badge>;
}

function GPSStatus({ bus }: { bus: any }) {
  const [online, setOnline] = useState(false);
  const [timeText, setTimeText] = useState('—');

  useEffect(() => {
    if (!bus?.lastKnownLocation?.timestamp) {
      setOnline(false);
      setTimeText('—');
      return;
    }
    const check = () => {
      const ts = new Date(bus.lastKnownLocation.timestamp).getTime();
      const diff = Date.now() - ts;
      const isOnline = diff < 2 * 60 * 1000;
      setOnline(isOnline);
      setTimeText(new Date(ts).toLocaleTimeString());
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, [bus]);

  return (
    <>
      <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
      <span className={online ? 'text-emerald-700' : 'text-rose-700'}>
        {online ? 'Online' : 'Offline'}
      </span>
      <span className="text-[10px] font-normal text-slate-400">({timeText})</span>
    </>
  );
}

function ScannerStatus({ bus }: { bus: any }) {
  const isScanning = bus?.status === 'active' && bus?.currentTripId;
  return (
    <>
      <span className={`h-2.5 w-2.5 rounded-full ${isScanning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
      <span className={isScanning ? 'text-emerald-700' : 'text-slate-600'}>
        {isScanning ? 'Scanning' : 'Ready'}
      </span>
    </>
  );
}

function CapacityDisplay({ bus }: { bus: any }) {
  const [assigned, setAssigned] = useState(0);

  useEffect(() => {
    api.listStudents()
      .then(list => {
        const count = list.filter(s => s.bus_details.bus_number === bus.busNumber && s.status === 'active').length;
        setAssigned(count);
      })
      .catch(() => {});
  }, [bus.busNumber]);

  const cap = bus.capacity || 40;
  const ratio = assigned / cap;

  let color = 'text-emerald-600';
  if (ratio >= 0.95) color = 'text-rose-600 font-bold';
  else if (ratio >= 0.8) color = 'text-amber-600 font-bold';

  return (
    <span className={color}>
      {assigned} / {cap} Students
    </span>
  );
}
