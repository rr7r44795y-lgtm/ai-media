import './globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'AI Media Scheduler',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="max-w-5xl mx-auto p-6">{children}</div>
      </body>
    </html>
  );
}
