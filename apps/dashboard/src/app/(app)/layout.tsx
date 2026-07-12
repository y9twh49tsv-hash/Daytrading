import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import { TestnetBanner } from '@/components/testnet-banner';
import { signOut } from '@/app/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <TestnetBanner />
      <Nav email={user.email ?? ''} signOutAction={signOut} />
      <main className="p-4 sm:p-6 lg:ml-60 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
