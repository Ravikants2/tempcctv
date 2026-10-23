import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/FormFields';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/index';
import { Cloud, CloudOff } from 'lucide-react';

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
    <div className="min-h-screen bg-[#0d1b3e] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-[#0d1b3e] leading-tight">
            iON Survillance<br />Temp. infra(CCTV)
          </h1>
          <p className="text-xs text-gray-400 mt-1">Examination Venue CCTV Management</p>
        </div>

        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-4 ${isGitHub ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          {isGitHub
            ? <><Cloud size={13} /> Secure cloud service connected</>
            : <><CloudOff size={13} /> Secure cloud service is not configured</>
          }
        </div>

        {error && <div className="mb-3"><Alert type="error" onClose={() => setError('')}>{error}</Alert></div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Email" type="email" value={email}
            onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@ion.com" />
          <Input label="Password" type="password" value={password}
            onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
          <Button type="submit" disabled={loading || !isGitHub} size="lg" className="w-full mt-1">
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        {!isGitHub && <p className="mt-4 text-xs text-amber-700">
          Ask your administrator to configure the secure Worker API before signing in.
        </p>}
      </div>
    </div>
  );
}
