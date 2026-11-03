import { useState } from 'react';
import { Alert } from '../../components/ui/index';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/FormFields';
import { useAuth } from '../../context/AuthContext';

export default function ApprovalAlertCriteriaPage() {
  const { data, updateData, addAuditLog } = useAuth();
  const [approvalDays, setApprovalDays] = useState(
    String(data.approvalAlertCriteria?.approvalDaysBeforeExam ?? 7)
  );
  const [quotationDays, setQuotationDays] = useState(
    String(data.approvalAlertCriteria?.quotationDaysBeforeExam ?? 7)
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const saveCriteria = () => {
    const approvalWindow = Number(approvalDays);
    const quotationWindow = Number(quotationDays);
    if (![approvalWindow, quotationWindow].every(days => Number.isInteger(days) && days >= 1 && days <= 365)) {
      setError('Enter whole numbers from 1 to 365 days for both alert windows.');
      setMessage('');
      return;
    }

    const criteria = {
      approvalDaysBeforeExam: approvalWindow,
      quotationDaysBeforeExam: quotationWindow,
    };
    updateData(previous => ({
      ...previous,
      approvalAlertCriteria: criteria,
    }));
    addAuditLog('UPDATE', 'ApprovalAlertCriteria', 'approval-alert-criteria', undefined, criteria);
    setError('');
    setMessage('Approval alert criteria saved.');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Super Admin settings</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Approval Alert Criteria</h1>
        <p className="mt-1 text-sm text-slate-500">Choose which actionable quotation alerts users and approvers should see.</p>
      </header>

      {message && <Alert type="success" onClose={() => setMessage('')}>{message}</Alert>}
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Input type="number" label="Alert quote providers before an exam (days)" value={quotationDays}
          onChange={event => setQuotationDays(event.target.value)} min={1} max={365} step={1}
          required className="max-w-xs" />
        <p className="text-sm text-slate-600">
          Alert users about requirements without a quotation in this time window. They can open the requirement and use its past quote history.
          Overdue requirements remain flagged.
        </p>
        <Input type="number" label="Alert approvers before an exam (days)" value={approvalDays}
          onChange={event => setApprovalDays(event.target.value)} min={1} max={365} step={1}
          required className="max-w-xs" />
        <p className="text-sm text-slate-600">
          Alert approvers about submitted quotations awaiting their decision. Both windows default to 7 days.
        </p>
        <div>
          <Button onClick={saveCriteria}>Save criteria</Button>
        </div>
      </section>
    </div>
  );
}
