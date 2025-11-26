"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listSocialAccounts } from "../../../lib/api";
import { SocialAccount, SocialPlatform } from "../../../lib/types";
import { getClient } from "../../../lib/supabaseClient";
import { PlatformIcon } from "../../../components/PlatformIcon";

const platformLabel: Record<SocialPlatform, string> = {
  instagram_business: "Instagram Business",
  facebook_page: "Facebook Page",
  linkedin: "LinkedIn",
  youtube_draft: "YouTube Draft",
};

function statusMessage(status: string | null, platform: string | null, error: string | null) {
  if (status === "success") {
    return `Successfully connected ${platformLabel[platform as SocialPlatform] ?? platform ?? "account"}.`;
  }
  if (status === "failed") {
    return error ? `Connection failed: ${error}` : "Connection failed.";
  }
  return "Processing connection...";
}

export default function OAuthCompletePage() {
  const searchParams = useSearchParams();
  const supabase = getClient();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [showCTA, setShowCTA] = useState(false);

  const { status, platform, error } = useMemo(
    () => ({
      status: searchParams.get("connected"),
      platform: searchParams.get("platform"),
      error: searchParams.get("error"),
    }),
    [searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => setShowCTA(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const latestAccounts = await listSocialAccounts(token);
        setAccounts(latestAccounts);
      } catch (err) {
        console.error(err);
      }
    });
  }, [supabase, status]);

  const isSuccess = status === "success";
  const isFailure = status === "failed";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-10 text-center space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">OAuth Connection</h1>
        <p className="text-lg text-gray-700">{statusMessage(status, platform, error)}</p>
        {isSuccess && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            Your account is now linked. You can close this tab or return to manage connections.
          </div>
        )}
        {isFailure && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error || "We could not complete the connection. Please try again."}
          </div>
        )}
      </div>

      <div className="w-full max-w-2xl rounded border bg-white p-4 text-left shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Connected accounts</h2>
          <span className="text-xs text-slate-500">Auto-refreshed after linking</span>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">No connected accounts were found.</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={account.platform} />
                  <div className="leading-tight">
                    <div className="font-semibold text-slate-800">{account.external_account_id}</div>
                    <div className="text-xs text-slate-500">Linked on {new Date(account.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <span className="text-xs text-emerald-700">Active</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCTA && (
        <Link
          href="/platforms"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
        >
          Return to Connections
        </Link>
      )}
    </main>
  );
}
