import './globals.css';
import React from 'react';

export const metadata = {
  title: 'AI Media Scheduler',
  description: 'Lightweight scheduler skeleton following the v2.1 logic chain',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-slate-50 text-slate-900">
        <header className="p-4 shadow bg-white">
          <h1 className="text-xl font-semibold">AI Media Scheduler</h1>
          <p className="text-sm text-slate-600">Render backend + Vercel frontend skeleton</p>
        </header>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
