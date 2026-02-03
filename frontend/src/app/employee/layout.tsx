import Sidebar from '@/components/Sidebar';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar role="employee" />
      <main className="ml-56 flex-1 min-h-screen p-8">
        {children}
      </main>
    </div>
  );
}
