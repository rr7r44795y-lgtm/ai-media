'use client';

import { useEffect, useState } from 'react';
import { getClient } from '../lib/supabaseClient';
import LoginForm from '../components/LoginForm';
import ContentLibrary from '../components/ContentLibrary';
import OAuthConnections from '../components/OAuthConnections';
import BillingPanel from '../components/BillingPanel';

export default function Home() {
  const supabase = getClient();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => {
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!session) {
    return <LoginForm supabase={supabase} onLogin={setSession} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-slate-600">Authenticated as {session.user.email}</p>
        </div>
        <button
          className="px-3 py-2 bg-slate-800 text-white rounded"
          onClick={() => supabase.auth.signOut().then(() => setSession(null))}
        >
          Sign out
        </button>
      </div>
      <ContentLibrary session={session} />
      <OAuthConnections session={session} />
      <BillingPanel session={session} />
    </div>
  );
}
