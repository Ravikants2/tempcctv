import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import { exportPageTablesToExcel, exportPageTablesToPdf } from '../../utils/pageExport';

export function PageExportActions() {
  const [error, setError] = useState('');

  const exportData = (format: 'excel' | 'pdf') => {
    setError('');
    try {
      const exported = format === 'excel' ? exportPageTablesToExcel() : exportPageTablesToPdf();
      if (!exported) setError('There is no table data on this page to export.');
    } catch (reason) {
      console.error(`Failed to export page data as ${format}.`, reason);
      setError(`Could not export ${format.toUpperCase()} data. Please try again.`);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
      {error && <p role="alert" className="mr-auto text-xs text-red-600">{error}</p>}
      <Button variant="outline" size="sm" onClick={() => exportData('excel')}>
        <Download size={14} /> Export Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => exportData('pdf')}>
        <FileText size={14} /> Export PDF
      </Button>
    </div>
  );
}
