import { useEffect, useState, type FormEvent } from 'react';
import { api, type Bus, type Student } from '../../lib/api';
import { Button, Field, Input, Modal, Select } from '../../components/ui';

export default function AddStudentModal({
  open,
  onClose,
  onCreated,
  studentToEdit = null
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  studentToEdit?: Student | null;
}) {
  const [form, setForm] = useState(blankForm(studentToEdit));
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      api.listBuses().then(setBuses).catch(() => {});
      setForm(blankForm(studentToEdit));
      setError('');
    }
  }, [open, studentToEdit]);

  function update<K extends keyof ReturnType<typeof blankForm>>(key: K, value: ReturnType<typeof blankForm>[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.register_no || !form.password) {
      setError('Name, Roll Number and Password are required');
      return;
    }
    setLoading(true);
    try {
      const selectedBus = buses.find((b) => (b.busId || b.bus_id) === form.bus_id);
      const studentData = {
        register_no: form.register_no,
        name: form.name,
        gender: form.gender,
        year: form.year,
        department: form.department,
        section: form.section,
        date_of_birth: form.dob,
        address: { door_no: form.door_no, street: form.street, city: form.city, state: form.state, pincode: form.pincode },
        bus_details: {
          bus_id: form.bus_id,
          bus_number: selectedBus?.busNumber || selectedBus?.bus_number || '',
          route_name: selectedBus?.routeName || selectedBus?.route_name || '',
          boarding_point: form.boarding_point,
        },
        boardingPoint: form.boarding_point,
        landmark: form.landmark,
        latitude: Number(form.home_latitude) || 0,
        longitude: Number(form.home_longitude) || 0,
        home_latitude: Number(form.home_latitude) || 0,
        home_longitude: Number(form.home_longitude) || 0,
        allowedRadiusMeters: Number(form.allowedRadiusMeters) || 200,
        password: form.password,
        parent_password: form.parent_password,
        parent_phone: form.parent_phone,
        parent_email: form.parent_email,
      };

      if (studentToEdit) {
        await api.updateStudent(studentToEdit._id, studentData);
      } else {
        await api.createStudent(studentData);
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save student');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={studentToEdit ? `Edit Student: ${studentToEdit.name}` : "Add New Student"} maxWidth="max-w-4xl">
      <form className="space-y-6" onSubmit={submit}>
        <p className="text-sm text-slate-500">
          Fill the details below. The roll number will be the student's username, and the same roll number will be the parent's username. Set unique passwords for both.
        </p>

        <SectionTitle color="text-blue-600">Student Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Full Name *"><Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Student full name" /></Field>
          <Field label="Roll Number / Register No *"><Input value={form.register_no} onChange={(e) => update('register_no', e.target.value)} placeholder="e.g. 22B91A0501" disabled={!!studentToEdit} /></Field>
          <Field label="Gender"><Select value={form.gender} onChange={(e) => update('gender', e.target.value)}><option>Male</option><option>Female</option><option>Other</option></Select></Field>
          <Field label="Year / Class"><Input value={form.year} onChange={(e) => update('year', e.target.value)} placeholder="e.g. 3rd Year / 8th Grade" /></Field>
          <Field label="Department"><Input value={form.department} onChange={(e) => update('department', e.target.value)} placeholder="e.g. CSE" /></Field>
          <Field label="Section"><Input value={form.section} onChange={(e) => update('section', e.target.value)} placeholder="e.g. A" /></Field>
          <Field label="Date of Birth"><Input type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} /></Field>
          <div />
        </div>

        <SectionTitle color="text-emerald-600">Address</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Door No"><Input value={form.door_no} onChange={(e) => update('door_no', e.target.value)} /></Field>
          <Field label="Street"><Input value={form.street} onChange={(e) => update('street', e.target.value)} /></Field>
          <Field label="City"><Input value={form.city} onChange={(e) => update('city', e.target.value)} /></Field>
          <Field label="State"><Input value={form.state} onChange={(e) => update('state', e.target.value)} /></Field>
          <Field label="Pincode"><Input value={form.pincode} onChange={(e) => update('pincode', e.target.value)} /></Field>
        </div>

        <SectionTitle color="text-amber-600">Bus Assignment & Stop Geofence</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Bus">
            <Select value={form.bus_id} onChange={(e) => update('bus_id', e.target.value)}>
              <option value="">Select bus</option>
              {buses.filter((b: any) => b.active !== false || b.status === 'active').map((b) => {
                const bId = b.busId || b.bus_id;
                const bNum = b.busNumber || b.bus_number;
                const bRoute = b.routeName || b.route_name || 'No route template';
                return (
                  <option key={bId} value={bId}>{bNum} - {bRoute}</option>
                );
              })}
            </Select>
          </Field>
          <Field label="Boarding Point / Stop Name"><Input value={form.boarding_point} onChange={(e) => update('boarding_point', e.target.value)} placeholder="e.g. Diwancheruvu" /></Field>
          <Field label="Stop Landmark"><Input value={form.landmark} onChange={(e) => update('landmark', e.target.value)} placeholder="e.g. Sai Baba Temple" /></Field>
          <Field label="Allowed Radius (Meters)"><Input type="number" value={form.allowedRadiusMeters} onChange={(e) => update('allowedRadiusMeters', e.target.value)} placeholder="200" /></Field>
          <Field label="Stop Latitude"><Input type="number" step="any" value={form.home_latitude} onChange={(e) => update('home_latitude', e.target.value)} placeholder="e.g. 17.0269" /></Field>
          <Field label="Stop Longitude"><Input type="number" step="any" value={form.home_longitude} onChange={(e) => update('home_longitude', e.target.value)} placeholder="e.g. 81.8797" /></Field>
        </div>

        <SectionTitle color="text-violet-600">Parent Contact</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Parent Phone"><Input value={form.parent_phone} onChange={(e) => update('parent_phone', e.target.value)} placeholder="10-digit number" /></Field>
          <Field label="Parent Email"><Input type="email" value={form.parent_email} onChange={(e) => update('parent_email', e.target.value)} placeholder="parent@email.com" /></Field>
        </div>

        <SectionTitle color="text-pink-600">Login Credentials</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Student Password *"><Input type="text" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Set student login password" /></Field>
          <Field label="Parent Password *"><Input type="text" value={form.parent_password} onChange={(e) => update('parent_password', e.target.value)} placeholder="Set parent login password" /></Field>
        </div>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
          <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? (studentToEdit ? 'Saving...' : 'Adding...') : (studentToEdit ? 'Save Changes' : 'Add Student & Generate QR')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return <h3 className={`text-sm font-black uppercase tracking-wide ${color}`}>{children}</h3>;
}

function blankForm(student?: Student | null) {
  if (student) {
    return {
      name: student.name || '',
      register_no: student.register_no || '',
      gender: student.gender || 'Male',
      year: student.year || '',
      department: student.department || '',
      section: student.section || '',
      dob: student.date_of_birth || '',
      door_no: student.address?.door_no || '',
      street: student.address?.street || '',
      city: student.address?.city || '',
      state: student.address?.state || '',
      pincode: student.address?.pincode || '',
      bus_id: student.bus_details?.bus_id || '',
      boarding_point: student.boardingPoint || student.bus_details?.boarding_point || '',
      landmark: student.landmark || '',
      allowedRadiusMeters: student.allowedRadiusMeters ? String(student.allowedRadiusMeters) : '200',
      parent_phone: student.parent_phone || '',
      parent_email: student.parent_email || '',
      password: student.password || '',
      parent_password: student.parent_password || '',
      home_latitude: student.latitude ? String(student.latitude) : (student.home_latitude ? String(student.home_latitude) : ''),
      home_longitude: student.longitude ? String(student.longitude) : (student.home_longitude ? String(student.home_longitude) : ''),
    };
  }
  return {
    name: '',
    register_no: '',
    gender: 'Male',
    year: '',
    department: '',
    section: '',
    dob: '',
    door_no: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
    bus_id: '',
    boarding_point: '',
    landmark: '',
    allowedRadiusMeters: '200',
    parent_phone: '',
    parent_email: '',
    password: '',
    parent_password: '',
    home_latitude: '',
    home_longitude: '',
  };
}
