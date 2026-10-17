'use client';

import MedicalCertificatesList from '@/components/MedicalCertificatesList';

// The backend only returns the gestor's own team (leader or secondary approver)
export default function ManagerAtestados() {
  return <MedicalCertificatesList authType="manager" />;
}
