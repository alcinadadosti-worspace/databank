'use client';

import MedicalCertificatesList from '@/components/MedicalCertificatesList';
import { useManagerAuth } from '../ManagerAuthContext';

// The backend only returns the gestor's own team (leader or secondary approver)
export default function ManagerAtestados() {
  const { manager } = useManagerAuth();
  return <MedicalCertificatesList authType="manager" leaderId={manager?.id} />;
}
