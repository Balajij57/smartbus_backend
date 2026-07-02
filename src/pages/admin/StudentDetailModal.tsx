import { QRCodeSVG } from 'qrcode.react';
import type { Student } from '../../lib/api';
import { Button, Modal } from '../../components/ui';

export default function StudentDetailModal({
  student,
  onClose,
  onDelete,
  onEdit
}: {
  student: Student | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (student: Student) => void;
}) {
  if (!student) return null;
  const dataUri = `data:image/svg+xml;utf8,`;
  void dataUri;

  function downloadQR() {
    if (!student) return;
    const svg = document.getElementById('student-qr-svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr_${student.register_no}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal open={!!student} onClose={onClose} title={student.name} maxWidth="max-w-3xl">
      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="rounded-xl border-2 border-slate-200 bg-white p-3">
            <QRCodeSVG id="student-qr-svg" value={student.qr_student_id} size={180} level="M" />
          </div>
          <p className="text-xs font-bold text-slate-500">QR ID</p>
          <p className="rounded-md bg-white px-3 py-1 font-mono text-sm">{student.qr_student_id}</p>
          <Button variant="outline" size="sm" onClick={downloadQR}>Download QR</Button>
        </div>

        <div className="space-y-4">
          <Row label="Roll Number" value={student.register_no} />
          <Row label="Year / Class" value={`${student.year} - ${student.section}`} />
          <Row label="Department" value={student.department} />
          <Row label="Gender / DOB" value={`${student.gender} / ${student.date_of_birth}`} />
          <Row label="Bus" value={`${student.bus_details.bus_number} - ${student.bus_details.route_name}`} />
          <Row label="Boarding Point" value={student.bus_details.boarding_point} />
          <Row label="Boarding Coordinates" value={`${student.home_latitude || '0'}, ${student.home_longitude || '0'}`} />
          <Row label="Address" value={`${student.address.door_no}, ${student.address.street}, ${student.address.city}, ${student.address.state} - ${student.address.pincode}`} />
          <Row label="Parent ID" value={student.parent_id} />
          <Row label="Parent Phone" value={student.parent_phone || '—'} />
          <Row label="Parent Email" value={student.parent_email || '—'} />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
        <Button variant="outline" onClick={() => {
          onEdit(student);
          onClose();
        }}>Edit Student</Button>
        <Button variant="danger" onClick={() => {
          if (confirm(`Delete ${student.name}?`)) {
            onDelete(student._id);
            onClose();
          }
        }}>Delete Student</Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}
