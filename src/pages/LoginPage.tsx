import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/FormFields';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/index';
import { Activity, ArrowRight, Camera, Cloud, CloudOff, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const { login, isGitHub } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    void login(email, password).then(ok => {
      setLoading(false);
      if (ok) navigate('/dashboard/executive');
      else setError('Invalid email or password.');
    }).catch(error => {
      setLoading(false);
      setError((error as Error).message);
    });
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-slate-950 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-64 right-0 h-[38rem] w-[38rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-4 py-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-12">
        <section className="hidden min-h-[650px] flex-col justify-between py-8 lg:flex">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.08] text-sky-300 shadow-xl shadow-blue-950/30">
              <Camera size={23} />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">iON CCTV</span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Operations workspace</span>
            </span>
          </div>

          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-3 py-1.5 text-xs font-medium text-sky-200">
              <Activity size={14} /> Examination venue operations
            </span>
            <h1 className="mt-7 text-5xl font-semibold leading-[1.1] tracking-tight xl:text-6xl">
              Every centre.
              <span className="block bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-transparent">One clear view.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
              Coordinate venue requirements, installations, exam schedules and approvals in one secure workspace.
            </p>

            <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
              {[
                ['01', 'TC-centred records'],
                ['02', 'Exam and shift visibility'],
                ['03', 'Review and approvals'],
                ['04', 'Audited user activity'],
              ].map(([number, label]) => (
                <div key={number} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3">
                  <span className="font-mono text-[10px] text-sky-300/80">{number}</span>
                  <span className="text-xs font-medium text-slate-300">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500">Secure access for authorized examination operations teams.</p>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.08] text-sky-300">
              <Camera size={21} />
            </span>
            <span>
              <span className="block text-sm font-semibold">iON CCTV</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Operations workspace</span>
            </span>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl shadow-black/30 sm:p-9">
            <div className="mb-7">
              <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <ShieldCheck size={22} />
              </span>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Secure sign in</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
              <p className="mt-1.5 text-sm text-slate-500">Sign in to continue to your venue workspace.</p>
            </div>

            <div className={`mb-6 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-5 ${
              isGitHub
                ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {isGitHub ? <Cloud size={15} className="mt-0.5 shrink-0" /> : <CloudOff size={15} className="mt-0.5 shrink-0" />}
              <span>{isGitHub ? 'Secure cloud service configured' : 'Secure cloud service is not configured'}</span>
            </div>

            {error && <div className="mb-5"><Alert type="error" onClose={() => setError('')}>{error}</Alert></div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input label="Email address" type="email" value={email}
                onChange={e => setEmail(e.target.value)} required autoComplete="username" placeholder="you@company.com" />
              <Input label="Password" type="password" value={password}
                onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Enter your password" />
              <Button type="submit" disabled={loading || !isGitHub} size="lg"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? 'Signing in…' : <>Sign in to workspace <ArrowRight size={16} /></>}
              </Button>
            </form>

            {!isGitHub && <p className="mt-4 text-xs leading-5 text-amber-800">
              Ask your administrator to configure the secure Worker API before signing in.
            </p>}
            <p className="mt-7 border-t border-slate-100 pt-5 text-center text-[11px] text-slate-400">
              Access is limited to authorized users.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
