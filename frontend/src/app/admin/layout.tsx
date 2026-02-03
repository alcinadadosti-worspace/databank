import Sidebar from '@/components/Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar role="admin" />
      <main className="ml-56 flex-1 min-h-screen p-8">
        {children}
      </main>
    </div>
  );
}
