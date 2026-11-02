import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/FormFields';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/index';
import { Activity, ArrowRight, Camera, ShieldAlert } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [name, setName] = useState('');
  const [recoverAdmin, setRecoverAdmin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const signedIn = await login(email, password, githubToken, name, recoverAdmin);
      if (signedIn) navigate('/dashboard/executive');
      else setError('Invalid user ID or password.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-slate-950 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-64 right-0 h-[38rem] w-[38rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-4 py-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-12">
        <section className="hidden min-h-[560px] flex-col justify-between py-8 lg:flex">
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
              Sign in to the workspace backed by the private GitHub data repository.
            </p>
          </div>

          <p className="text-xs text-amber-300">Repository collaborators can access all data. Do not store confidential information.</p>
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
              <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <ShieldAlert size={22} />
              </span>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">GitHub-backed sign in</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
              <p className="mt-1.5 text-sm text-slate-500">Use your app account and a GitHub token for the private data repo.</p>
            </div>

            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
              Anyone with write access to the private repository can read or change all app data, including account password hashes. App roles only control the interface; they are not a security boundary. A repository token is kept in this browser tab's session storage and is never saved in the public app repository.
            </div>

            {error && <div className="mb-5"><Alert type="error" onClose={() => setError('')}>{error}</Alert></div>}

            <form onSubmit={signIn} className="flex flex-col gap-4">
              <Input label="User ID (email)" type="email" value={email}
                onChange={event => setEmail(event.target.value)} required autoComplete="username" />
              <Input label="Password" type="password" value={password}
                onChange={event => setPassword(event.target.value)} required autoComplete="current-password" />
              <Input label="GitHub fine-grained token" type="password" value={githubToken}
                onChange={event => setGithubToken(event.target.value)} required autoComplete="off"
                placeholder="github_pat_…" />
              <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                <summary className="cursor-pointer font-medium text-slate-700">First Super Admin setup</summary>
                <p className="mt-2 leading-5">
                  If there is no Super Admin with a saved password, the first repository user can create one with a password of at least 12 characters. Existing accounts and IDs are kept.
                </p>
                <div className="mt-3">
                  <Input label="Admin display name (first setup only)" value={name}
                    onChange={event => setName(event.target.value)} autoComplete="name" />
                </div>
                <label className="mt-3 flex items-start gap-2 leading-5">
                  <input type="checkbox" checked={recoverAdmin}
                    onChange={event => setRecoverAdmin(event.target.checked)}
                    className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span>
                    Recover Super Admin: create or reset the Super Admin for this email using this password. Use only if you administer the private repository; this cannot restrict other repository collaborators.
                  </span>
                </label>
              </details>
              <p className="text-xs leading-5 text-slate-500">
                Each user needs a GitHub fine-grained token scoped to <strong>Contents: Read and write</strong> on the private data repository.
              </p>
              <Button type="submit" disabled={loading} size="lg"
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}
              </Button>
            </form>

            <p className="mt-7 border-t border-slate-100 pt-5 text-center text-[11px] text-slate-400">
              Never reuse a GitHub token in shared or untrusted browsers. Revoke a token immediately if exposed.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
