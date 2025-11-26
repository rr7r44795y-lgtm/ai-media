'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listSocialAccounts, disconnectSocialAccount } from '../lib/api';
import { SocialAccount, SocialPlatform } from '../lib/types';
import { PlatformIcon } from './PlatformIcon';

const platforms: { id: SocialPlatform; label: string; description: string }[] = [
  { id: 'instagram_business', label: 'Instagram Business', description: 'Publish to Instagram Business accounts.' },
  { id: 'facebook_page', label: 'Facebook Page', description: 'Schedule content to your Facebook Pages.' },
  { id: 'linkedin', label: 'LinkedIn', description: 'Post updates to your LinkedIn account.' },
  { id: 'youtube_draft', label: 'YouTube Draft', description: 'Create YouTube drafts with titles and descriptions.' },
];

export default function OAuthConnections({ session }: { session: any }) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const token = session?.access_token as string | undefined;

  const fetchAccounts = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await listSocialAccounts(token);
      setAccounts(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Unable to load connected accounts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const connectedPlatforms = useMemo(() => new Set(accounts.map((a) => a.platform)), [accounts]);
  const missingPlatforms = platforms.filter((p) => !connectedPlatforms.has(p.id));

  const connect = async (platform: SocialPlatform) => {
    if (!token) return;
    setConnecting(platform);
    try {
      const res = await fetch(`/api/oauth/${platform}/start`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error(err);
      setError('Unable to start connection.');
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async (accountId: string) => {
    if (!token) return;
    setDisconnecting(accountId);
    try {
      await disconnectSocialAccount(accountId, token);
      await fetchAccounts();
    } catch (err) {
      console.error(err);
      setError('Unable to disconnect account.');
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">OAuth Connections</h2>
        <p className="text-sm text-slate-500">
          Tokens are encrypted with AES-256, refreshed automatically, and stored per account.
        </p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-600">Loading connections...</div>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">Connected accounts</h3>
            {accounts.length === 0 ? (
              <p className="text-sm text-slate-500">No connected accounts yet.</p>
            ) : (
              <ul className="space-y-2">
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <PlatformIcon platform={account.platform} />
                      <div className="leading-tight">
                        <div className="font-semibold text-slate-800">{account.external_account_id}</div>
                        <div className="text-xs text-slate-500">Connected on {new Date(account.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <button
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                      onClick={() => disconnect(account.id)}
                      disabled={disconnecting === account.id}
                    >
                      {disconnecting === account.id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">Connect a platform</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {missingPlatforms.map((platform) => (
                <div key={platform.id} className="rounded border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={platform.id} />
                      <span className="font-semibold text-slate-800">{platform.label}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{platform.description}</p>
                  <button
                    className="mt-2 inline-flex items-center justify-center rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    onClick={() => connect(platform.id)}
                    disabled={connecting === platform.id}
                  >
                    {connecting === platform.id ? 'Starting...' : 'Connect'}
                  </button>
                </div>
              ))}
              {missingPlatforms.length === 0 && (
                <div className="text-sm text-slate-500">All supported platforms are connected.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
