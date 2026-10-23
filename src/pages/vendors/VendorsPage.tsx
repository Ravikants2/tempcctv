import React, { useRef, useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { Alert, Badge, ConfirmDialog, Modal } from '../../components/ui/index';
import { downloadTemplate, exportVendorsToExcel, parseVendorFile } from '../../utils/excel';
import type { VendorMaster } from '../../types';
import { Download, Upload, Trash2, Plus } from 'lucide-react';
import { TablePagination } from '../../components/ui/TablePagination';
import { createVendorCode, getVendorCode, isVendorCodeForZone, sameVendorName, sameZone } from '../../utils/vendorCode';

const PAGE_SIZE = 10;

export default function VendorsPage() {
  const { data, updateData, addAuditLog, can, currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [preview, setPreview] = useState<Array<Partial<VendorMaster> & { status: 'NEW' | 'UPDATE' | 'ERROR'; error?: string }> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState<{ vendorCode: string; zone: string; vendorName: string }>({ vendorCode: '', zone: '', vendorName: '' });
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState(1);

  const scopedRequirements = data.requirements.filter(r => currentUser?.role !== 'zonal_user' || r.zone === currentUser.zone);
  const scopedVendors = data.vendors.filter(vendor => currentUser?.role !== 'zonal_user' || vendor.zone === currentUser.zone);
  const zones = currentUser?.role === 'zonal_user' && currentUser.zone
    ? [currentUser.zone]
    : [...new Set(scopedRequirements.map(r => r.zone))].sort();
  const knownZones = [...new Set([...zones, ...scopedVendors.map(vendor => vendor.zone)])];

  const filtered = scopedVendors.filter(v => {
    if (filterZone && v.zone !== filterZone) return false;
    if (search && !v.vendorName.toLowerCase().includes(search.toLowerCase()) &&
      !v.zone.toLowerCase().includes(search.toLowerCase()) &&
      !getVendorCode(v).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseVendorFile(file);
      const importedVendorCodes = new Set<string>();
      const previewRows = rows.map(row => {
        if (!row.zone || !row.vendorName) return { ...row, status: 'ERROR' as const, error: 'Missing fields' };
        const canonicalZone = knownZones.find(zone => sameZone(zone, row.zone!));
        if (!canonicalZone) {
          return { ...row, status: 'ERROR' as const, error: 'Zone must match an existing zone name' };
        }
        const normalizedRow = { ...row, zone: canonicalZone, vendorName: row.vendorName.trim() };
        const normalizedCode = row.vendorCode?.trim().toLowerCase();
        if (row.vendorCode && !isVendorCodeForZone(row.vendorCode, canonicalZone)) {
          return { ...normalizedRow, status: 'ERROR' as const, error: 'Vendor ID must match Zone Name-12345' };
        }
        if (normalizedCode && importedVendorCodes.has(normalizedCode)) {
          return { ...normalizedRow, status: 'ERROR' as const, error: 'Vendor ID appears more than once in the file' };
        }
        if (normalizedCode) importedVendorCodes.add(normalizedCode);
        const existing = data.vendors.find(v =>
          (normalizedCode && getVendorCode(v).toLowerCase() === normalizedCode) ||
          (sameZone(v.zone, canonicalZone) && sameVendorName(v.vendorName, normalizedRow.vendorName!))
        );
        const duplicateCode = row.vendorCode && data.vendors.some(v =>
          getVendorCode(v).toLowerCase() === normalizedCode && v.id !== existing?.id
        );
        if (duplicateCode) return { ...normalizedRow, status: 'ERROR' as const, error: 'Vendor ID already belongs to another vendor' };
        const vendorCodeParts = row.vendorCode?.trim().split('-') || [];
        let vendorCode = row.vendorCode
          ? `${canonicalZone}-${vendorCodeParts[vendorCodeParts.length - 1]}`
          : (existing ? getVendorCode(existing) : createVendorCode(canonicalZone, data.vendors));
        if (!normalizedCode && !existing) {
          while (importedVendorCodes.has(vendorCode.toLowerCase())) {
            vendorCode = createVendorCode(canonicalZone, data.vendors);
          }
        }
        const finalCode = vendorCode.toLowerCase();
        if (!normalizedCode && importedVendorCodes.has(finalCode)) {
          return { ...normalizedRow, status: 'ERROR' as const, error: 'Generated Vendor ID conflicts with another row; retry the upload' };
        }
        importedVendorCodes.add(finalCode);
        return {
          ...normalizedRow,
          vendorCode,
          id: existing?.id,
          status: existing ? 'UPDATE' as const : 'NEW' as const,
        };
      });
      setPreview(previewRows);
    } catch {
      setAlert({ type: 'error', msg: 'Failed to parse file.' });
    }
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!preview) return;
    const valid = preview.filter(r => r.status !== 'ERROR');
    updateData(prev => {
      let vendors = [...prev.vendors];
      valid.forEach(row => {
        if (row.status === 'UPDATE' && row.id) {
          vendors = vendors.map(v => v.id === row.id ? { ...v, vendorCode: row.vendorCode || getVendorCode(v), zone: row.zone!, vendorName: row.vendorName!, updatedAt: new Date().toISOString() } : v);
        } else {
          vendors.push({ id: uuidv4(), vendorCode: row.vendorCode || createVendorCode(row.zone!, vendors), zone: row.zone!, vendorName: row.vendorName!, createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      });
      return { ...prev, vendors };
    });
    setAlert({ type: 'success', msg: `Imported ${valid.length} vendors.` });
    setPreview(null);
  };

  const handleDelete = (id: string) => {
    const inUse = data.installations.some(i => i.vendorId === id);
    if (inUse) { setAlert({ type: 'error', msg: 'Cannot delete: vendor is used in an installation record.' }); return; }
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const v = data.vendors.find(v => v.id === deleteId);
    updateData(prev => ({ ...prev, vendors: prev.vendors.filter(v => v.id !== deleteId) }));
    addAuditLog('DELETE', 'VendorMaster', deleteId, v, undefined);
    setDeleteId(null);
    setAlert({ type: 'success', msg: 'Vendor deleted.' });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.zone || !form.vendorName) { setFormError('All fields required.'); return; }
    const vendorCode = form.vendorCode.trim() || createVendorCode(form.zone, data.vendors);
    if (!isVendorCodeForZone(vendorCode, form.zone)) {
      setFormError('Vendor ID must use the selected zone followed by a hyphen and five digits.');
      return;
    }
    const dup = data.vendors.find(v => sameZone(v.zone, form.zone) && sameVendorName(v.vendorName, form.vendorName));
    if (dup) { setFormError('Duplicate: Zone + Vendor Name already exists.'); return; }
    if (data.vendors.some(v => getVendorCode(v).toLowerCase() === vendorCode.toLowerCase())) {
      setFormError('Vendor ID already exists.');
      return;
    }
    const newV: VendorMaster = { id: uuidv4(), vendorCode, zone: form.zone, vendorName: form.vendorName.trim(), createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    updateData(prev => ({ ...prev, vendors: [...prev.vendors, newV] }));
    addAuditLog('CREATE', 'VendorMaster', newV.id, undefined, newV);
    setAddModal(false);
    setForm({ vendorCode: '', zone: '', vendorName: '' });
    setFormError('');
    setAlert({ type: 'success', msg: 'Vendor added.' });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900">Zone-wise Vendor Master</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('vendor')}><Download size={14} /> Template</Button>
          <Button variant="outline" size="sm" onClick={() => exportVendorsToExcel(scopedVendors)}><Download size={14} /> Download Data</Button>
          {can('upload_vendors') && (
            <>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Upload</Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
            </>
          )}
          {can('manage_vendors') && <Button size="sm" onClick={() => {
            setForm({ vendorCode: '', zone: '', vendorName: '' });
            setFormError('');
            setAddModal(true);
          }}><Plus size={14} /> Add</Button>}
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert></div>}

      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Search vendor…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-48" />
        <Select value={filterZone} onChange={e => { setFilterZone(e.target.value); setPage(1); }}
          options={zones.map(z => ({ value: z, label: z }))} placeholder="All Zones" className="w-36" />
        {(filterZone || search) && <Button variant="ghost" size="sm" onClick={() => { setFilterZone(''); setSearch(''); setPage(1); }}>Clear</Button>}
      </div>

      {preview && (
        <div className="mb-4 bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold mb-2">Import Preview</h2>
          <div className="flex gap-4 text-sm mb-3">
            <span>Total: {preview.length}</span>
            <span className="text-green-700">New: {preview.filter(r => r.status === 'NEW').length}</span>
            <span className="text-blue-700">Update: {preview.filter(r => r.status === 'UPDATE').length}</span>
            <span className="text-red-700">Errors: {preview.filter(r => r.status === 'ERROR').length}</span>
          </div>
          <div className="overflow-x-auto max-h-48">
            <SortableTable className="w-full text-xs">
              <thead><tr className="bg-gray-50"><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-left">Vendor ID</th><th className="px-2 py-1 text-left">Zone</th><th className="px-2 py-1 text-left">Vendor Name</th><th className="px-2 py-1 text-left">Error</th></tr></thead>
              <tbody>{preview.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1"><Badge variant={r.status === 'NEW' ? 'success' : r.status === 'UPDATE' ? 'info' : 'error'}>{r.status}</Badge></td>
                  <td className="px-2 py-1 font-mono">{r.vendorCode}</td>
                  <td className="px-2 py-1">{r.zone}</td><td className="px-2 py-1">{r.vendorName}</td>
                  <td className="px-2 py-1 text-red-600">{r.error}</td>
                </tr>
              ))}</tbody>
            </SortableTable>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={confirmImport} disabled={preview.every(r => r.status === 'ERROR')}>Confirm Import</Button>
            <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b">
            {['Vendor ID','Zone','Vendor Name','Created At','Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No vendors found.</td></tr>
              : pageRows.map(v => (
                <tr key={v.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{getVendorCode(v)}</td>
                  <td className="px-4 py-3">{v.zone}</td>
                  <td className="px-4 py-3">{v.vendorName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(v.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">
                    {can('delete_vendors') && <Button variant="danger" size="sm" onClick={() => handleDelete(v.id)}><Trash2 size={12} /></Button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </SortableTable>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
      </div>

      <ConfirmDialog open={!!deleteId} title="Delete Vendor" message="Delete this vendor? This cannot be undone."
        onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />

      <Modal open={addModal} onClose={() => { setAddModal(false); setFormError(''); }} title="Add Vendor">
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-3">
          <Input label="Vendor ID" value={form.vendorCode} onChange={e => setForm(p => ({ ...p, vendorCode: e.target.value }))} placeholder={form.zone ? `${form.zone}-12345` : 'Select a zone first'} />
          <Select label="Zone" value={form.zone} onChange={e => setForm(p => ({
            ...p,
            zone: e.target.value,
            vendorCode: e.target.value ? createVendorCode(e.target.value, data.vendors) : '',
          }))}
            options={zones.map(z => ({ value: z, label: z }))} placeholder="Select Zone" required />
          <Input label="Vendor Name" value={form.vendorName} onChange={e => setForm(p => ({ ...p, vendorName: e.target.value }))} required />
          {formError && <Alert type="error">{formError}</Alert>}
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" type="button" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
