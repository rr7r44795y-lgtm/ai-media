'use client';

import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

const emailRegex = /^(?:[a-zA-Z0-9_'^&amp;+{}-]+(?:\.[a-zA-Z0-9_'^&amp;+{}-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f!#-[^-~]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-zA-Z-]*[a-zA-Z]:[\x01-\x08\x0b\x0c\x0e-\x1f!-~]+)\])/;

export default function LoginForm({ supabase, onLogin }: { supabase: SupabaseClient; onLogin: (session: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'email' | 'magic'>('email');

  const validate = () => emailRegex.test(email) && (mode === 'magic' || (password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password)));

  const handleSubmit = async () => {
    if (!validate()) {
      setError('Invalid credentials format');
      return;
    }
    setError('');

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}` } });
      if (error) setError('Login failed');
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Login failed');
      return;
    }
    onLogin(data.session);
  };

  return (
    <div className="bg-white p-6 rounded shadow max-w-lg">
      <h1 className="text-2xl font-bold mb-2">Login or Register</h1>
      <p className="text-sm text-slate-500 mb-4">Email confirmation required. After 5 failed attempts, login locks for 10 minutes.</p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            type="email"
          />
        </div>
        {mode === 'email' && (
          <div>
            <label className="block text-sm">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              type="password"
            />
          </div>
        )}
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex gap-2">
          <button
            className="bg-indigo-600 text-white px-4 py-2 rounded"
            onClick={() => handleSubmit()}
          >
            {mode === 'email' ? 'Login / Register' : 'Send Magic Link'}
          </button>
          <button
            className="text-sm underline"
            onClick={() => setMode(mode === 'email' ? 'magic' : 'email')}
          >
            {mode === 'email' ? 'Use Magic Link' : 'Use Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
