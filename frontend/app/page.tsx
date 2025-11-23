import Link from 'next/link';

const sections = [
  {
    title: 'Health check',
    description: 'Backend endpoint for uptime monitoring at /api/health.',
  },
  {
    title: 'Scheduling payload contract',
    description: 'Zod-validated shape for creating schedules aligned with the logic chain.',
  },
  {
    title: 'Best time recommendation',
    description: 'Rule-based, non-AI suggestions for each platform.',
  },
  {
    title: 'Supabase schema',
    description: 'RLS-ready tables for contents, tags, schedules, and feedback.',
  },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-2xl font-semibold mb-2">Starter experience</h2>
        <p className="text-slate-700 mb-4">
          This minimal Next.js shell is ready for Vercel deployment and pairs with the Render
          Express backend. Extend it with OAuth flows, calendar views, and billing per the logic chain.
        </p>
        <Link
          href="https://github.com/"
          className="inline-block px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500"
        >
          View repository
        </Link>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => (
          <div key={section.title} className="bg-white p-4 rounded shadow">
            <h3 className="text-lg font-medium">{section.title}</h3>
            <p className="text-slate-700 text-sm">{section.description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
