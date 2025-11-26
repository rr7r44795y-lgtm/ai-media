'use client';

import { useEffect, useMemo, useState } from 'react';
import OAuthConnections from '../../components/OAuthConnections';
import { getClient } from '../../lib/supabaseClient';

export default function PlatformsPage() {
  const supabase = getClient();
  const [session, setSession] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);
  const token = useMemo(() => session?.access_token, [session]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Platform Connections</h1>
      {!token && <p>Loading session...</p>}
      {session && <OAuthConnections session={session} />}
    </div>
  );
}
