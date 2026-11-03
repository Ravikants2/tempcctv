import { useState } from 'react';
import { Alert } from '../../components/ui/index';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/FormFields';
import { useAuth } from '../../context/AuthContext';

export default function ApprovalAlertCriteriaPage() {
  const { data, updateData, addAuditLog } = useAuth();
  const [daysBeforeExam, setDaysBeforeExam] = useState(
    String(data.approvalAlertCriteria?.daysBeforeExam ?? 7)
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const saveCriteria = () => {
    const days = Number(daysBeforeExam);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError('Enter a whole number from 1 to 365 days.');
      setMessage('');
      return;
    }

    updateData(previous => ({
      ...previous,
      approvalAlertCriteria: { daysBeforeExam: days },
    }));
    addAuditLog('UPDATE', 'ApprovalAlertCriteria', 'approval-alert-criteria', undefined, { daysBeforeExam: days });
    setError('');
    setMessage('Approval alert criteria saved.');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Super Admin settings</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Approval Alert Criteria</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set when pending quotations should be flagged as urgent based on the scheduled exam date.
        </p>
      </header>

      {message && <Alert type="success" onClose={() => setMessage('')}>{message}</Alert>}
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Input
          type="number"
          label="Alert when an exam is within (days)"
          value={daysBeforeExam}
          onChange={event => setDaysBeforeExam(event.target.value)}
          min={1}
          max={365}
          step={1}
          required
          className="max-w-xs"
        />
        <p className="text-sm text-slate-600">
          Approvers will see actionable pending-quotation alerts for projects with an exam within this number of days.
          The default is 7 days. Overdue pending quotations remain flagged.
        </p>
        <div>
          <Button onClick={saveCriteria}>Save criteria</Button>
        </div>
      </section>
    </div>
  );
}
