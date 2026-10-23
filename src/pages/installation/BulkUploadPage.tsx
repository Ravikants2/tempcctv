import React, { useRef, useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { formatExamDate, normalizeExamDate } from '../../utils/dates';
import { sameVendorName, sameZone } from '../../utils/vendorCode';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/index';
import { downloadTemplate, parseBulkInstallationFile, type BulkInstallationRow } from '../../utils/excel';
import type { InstallationRecord } from '../../types';
import { Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

type RowStatus = 'NEW' | 'UPDATE' | 'ERROR';

interface ValidatedRow extends BulkInstallationRow {
  status: RowStatus;
  errors: string[];
  requirementId?: string;
  resolvedVendorId?: string;
}

export default function BulkUploadPage() {
  const { data, updateData, addAuditLog, currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ValidatedRow[] | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseBulkInstallationFile(file);
      const validated: ValidatedRow[] = parsed.map(row => {
        const errors: string[] = [];
        const req = data.requirements.find(r =>
          r.clientName === row.clientName && r.examName === row.examName && r.tcCode === row.tcCode
        );
        if (!req) errors.push('Requirement not found');
        if (!normalizeExamDate(row.examDate)) errors.push('Invalid exam date');
        else row.examDate = normalizeExamDate(row.examDate)!;
        if (row.scheduledCandidates < 0) errors.push('Negative candidates');
        if (!['Full Vendor', 'Partial Vendor'].includes(row.installationType)) errors.push('Invalid installation type');
        const vendor = req ? data.vendors.find(v => sameZone(v.zone, req.zone) && sameVendorName(v.vendorName, row.vendorName)) : undefined;
        if (req && !vendor) errors.push(`Vendor "${row.vendorName}" not approved for zone ${req.zone}`);
        if (row.localVendorCost < 0) errors.push('Negative cost');
        if (row.cameraCount < 0) errors.push('Negative camera count');

        const existing = req ? data.installations.find(i => i.requirementId === req.id) : undefined;
        return {
          ...row,
          status: errors.length > 0 ? 'ERROR' : existing ? 'UPDATE' : 'NEW',
          errors,
          requirementId: req?.id,
          resolvedVendorId: vendor?.id,
        };
      });
      setRows(validated);
    } catch {
      setAlert({ type: 'error', msg: 'Failed to parse file.' });
    }
    e.target.value = '';
  };

  const handleImport = () => {
    if (!rows) return;
    setImporting(true);
    const valid = rows.filter(r => r.status !== 'ERROR');

    // Group by requirementId
    const grouped = new Map<string, ValidatedRow[]>();
    valid.forEach(row => {
      const key = row.requirementId!;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    });

    updateData(prev => {
      let installations = [...prev.installations];
      let examDates = [...prev.examDates];

      grouped.forEach((groupRows, reqId) => {
        const firstRow = groupRows[0];
        const existing = installations.find(i => i.requirementId === reqId);
        const recordId = existing?.id || uuidv4();
        const now = new Date().toISOString();

        const record: InstallationRecord = {
          id: recordId,
          requirementId: reqId,
          installationType: firstRow.installationType as InstallationRecord['installationType'],
          vendorId: firstRow.resolvedVendorId!,
          cameraCount: firstRow.cameraCount,
          proxyProvided: firstRow.proxyProvided,
          internetProvided: firstRow.internetProvided,
          storageProvided: firstRow.storageProvided,
          storageType: firstRow.storageProvided ? firstRow.storageType as InstallationRecord['storageType'] : undefined,
          storageQuantity: firstRow.storageProvided ? firstRow.storageQuantity : undefined,
          storageSize: firstRow.storageProvided ? firstRow.storageSize : undefined,
          storageUnit: firstRow.storageProvided ? firstRow.storageUnit as InstallationRecord['storageUnit'] : undefined,
          localVendorCost: firstRow.localVendorCost,
          minimumCost: firstRow.minimumCost || undefined,
          remarks: firstRow.remarks || undefined,
          createdBy: existing?.createdBy || currentUser!.id,
          createdAt: existing?.createdAt || now,
          updatedBy: currentUser!.id,
          updatedAt: now,
        };

        if (existing) {
          installations = installations.map(i => i.id === recordId ? record : i);
        } else {
          installations.push(record);
        }

        // Merge exam dates
        const existingDates = examDates.filter(d => d.installationRecordId === recordId);
        const otherDates = examDates.filter(d => d.installationRecordId !== recordId);
        const mergedDates = [...existingDates];

        groupRows.forEach(row => {
          const existing = mergedDates.find(d => d.examDate === row.examDate);
          if (existing) {
            existing.scheduledCandidates = row.scheduledCandidates;
          } else {
            mergedDates.push({ id: uuidv4(), installationRecordId: recordId, examDate: row.examDate, scheduledCandidates: row.scheduledCandidates });
          }
        });

        examDates = [...otherDates, ...mergedDates];
        addAuditLog(existing ? 'UPDATE' : 'CREATE', 'InstallationRecord', recordId, existing, record);
      });

      return { ...prev, installations, examDates };
    });

    addAuditLog('IMPORT', 'BulkInstallation', 'bulk', undefined, { count: valid.length });
    setAlert({ type: 'success', msg: `Imported ${valid.length} rows across ${grouped.size} records.` });
    setRows(null);
    setImporting(false);
  };

  const downloadErrorReport = () => {
    if (!rows) return;
    const errors = rows.filter(r => r.status === 'ERROR').map(r => ({
      'Row': r._rowIndex,
      'Client Name': r.clientName,
      'Exam Name': r.examName,
      'TC Code': r.tcCode,
      'Errors': r.errors.join('; '),
    }));
    const ws = XLSX.utils.json_to_sheet(errors);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'bulk-import-errors.xlsx');
  };

  const newCount = rows?.filter(r => r.status === 'NEW').length || 0;
  const updateCount = rows?.filter(r => r.status === 'UPDATE').length || 0;
  const errorCount = rows?.filter(r => r.status === 'ERROR').length || 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900">Bulk Installation Upload</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('installation')}><Download size={14} /> Template</Button>
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Upload File</Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert></div>}

      {rows && (
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap gap-4 text-sm mb-4">
            <span>Total Rows: <strong>{rows.length}</strong></span>
            <span className="text-green-700">New: <strong>{newCount}</strong></span>
            <span className="text-blue-700">Update: <strong>{updateCount}</strong></span>
            <span className="text-red-700">Errors: <strong>{errorCount}</strong></span>
          </div>

          <div className="overflow-x-auto max-h-96 mb-4">
            <SortableTable className="w-full text-xs">
              <thead><tr className="bg-gray-50 sticky top-0">
                {['Row','Status','Client','Exam','TC Code','Date','Candidates','Vendor','Cost','Errors'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold text-gray-600">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{r._rowIndex}</td>
                    <td className="px-2 py-1"><Badge variant={r.status === 'NEW' ? 'success' : r.status === 'UPDATE' ? 'info' : 'error'}>{r.status}</Badge></td>
                    <td className="px-2 py-1">{r.clientName}</td>
                    <td className="px-2 py-1">{r.examName}</td>
                    <td className="px-2 py-1">{r.tcCode}</td>
                    <td className="px-2 py-1">{formatExamDate(r.examDate)}</td>
                    <td className="px-2 py-1">{r.scheduledCandidates}</td>
                    <td className="px-2 py-1">{r.vendorName}</td>
                    <td className="px-2 py-1">₹{r.localVendorCost}</td>
                    <td className="px-2 py-1 text-red-600">{r.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importing || (newCount + updateCount === 0)}>
              {importing ? 'Importing…' : `Import ${newCount + updateCount} Valid Rows`}
            </Button>
            {errorCount > 0 && (
              <Button variant="outline" size="sm" onClick={downloadErrorReport}><Download size={14} /> Error Report</Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setRows(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {!rows && (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Upload size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-500 text-sm">Upload an XLSX file using the template above</p>
          <p className="text-gray-400 text-xs mt-1">Rows will be validated and previewed before import</p>
        </div>
      )}
    </div>
  );
}
