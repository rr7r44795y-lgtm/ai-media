"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

function statusMessage(status: string | null, platform: string | null, error: string | null) {
  if (status === "success") {
    return `Successfully connected ${platform ?? "account"}.`;
  }
  if (status === "failed") {
    return error ? `Connection failed: ${error}` : "Connection failed.";
  }
  return "Processing connection...";
}

export default function OAuthCompletePage() {
  const searchParams = useSearchParams();

  const { status, platform, error } = useMemo(
    () => ({
      status: searchParams.get("connected"),
      platform: searchParams.get("platform"),
      error: searchParams.get("error"),
    }),
    [searchParams]
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-semibold mb-4">OAuth Connection</h1>
      <p className="text-lg text-gray-700">
        {statusMessage(status, platform, error)}
      </p>
    </main>
  );
}
