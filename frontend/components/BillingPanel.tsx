'use client';

import { useEffect, useState } from 'react';

const plans = [
  { id: 'free', name: 'Free', details: '20 posts/month', price: '$0' },
  { id: 'intro', name: 'More Options', details: '30 scheduled posts', price: '$4.99' },
  { id: 'starter', name: 'Monthly', details: 'Unlimited', price: '$7.99' },
  { id: 'annual', name: 'Annual', details: 'Unlimited', price: '$69.99' },
];

export default function BillingPanel({ session }: { session: any }) {
  const [current, setCurrent] = useState<any>(null);

  const fetchPlan = async () => {
    const token = session?.access_token;
    const res = await fetch('/api/billing/quota', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setCurrent(data);
  };

  useEffect(() => {
    fetchPlan();
  }, []);

  const startCheckout = async (plan: string) => {
    const token = session?.access_token;
    const res = await fetch('/api/billing/create-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, email: session.user.email }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold">Billing</h2>
          <p className="text-sm text-slate-500">Stripe-powered subscriptions with secure webhooks.</p>
        </div>
        <button className="text-sm underline" onClick={fetchPlan}>
          Refresh
        </button>
      </div>
      {current && (
        <div className="mb-4 text-sm text-slate-700">
          Current Plan: {current.plan_type} — quota {current.quota_per_month} used {current.quota_used || 0}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {plans.map((plan) => (
          <div key={plan.id} className="border rounded p-3 flex flex-col gap-2">
            <div className="font-semibold">{plan.name}</div>
            <div className="text-sm text-slate-500">{plan.details}</div>
            <div className="text-lg">{plan.price}</div>
            <button className="bg-indigo-600 text-white px-3 py-2 rounded" onClick={() => startCheckout(plan.id)}>
              Choose
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
