import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  Sparkles,
  Table,
  Layers,
} from 'lucide-react';

export const DataUploadPage: React.FC = () => {
  const { activeProject } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [destTable, setDestTable] = useState('');
  const [strategy, setStrategy] = useState<'replace' | 'append'>('replace');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<any | null>(null);

  const navigate = useNavigate();

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = async (f: File) => {
    if (!activeProject) {
      setError('Please select or create a project first.');
      return;
    }
    setFile(f);
    setError(null);
    setUploadResult(null);
    setPreview(null);
    setImportSuccess(null);
    setUploading(true);

    try {
      const res = await api.ingestion.upload(activeProject.id, f);
      setUploadResult(res);
      setDatasetName(f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'));
      setDestTable(f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());

      // Fetch preview
      const p = await api.ingestion.preview(res.file_id);
      setPreview(p);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload and validate file');
    } finally {
      setUploading(false);
    }
  };

  const handleLoadSample = async () => {
    if (!activeProject) {
      setError('Please select or create a project first.');
      return;
    }
    setError(null);
    setImporting(true);
    try {
      const res = await api.ingestion.loadSample(activeProject.id);
      setImportSuccess({
        dataset_id: res.dataset_id,
        name: res.name,
        row_count: res.row_count,
        column_count: res.column_count,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load sample dataset');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!uploadResult?.file_id) return;
    setImporting(true);
    setError(null);

    try {
      const res = await api.ingestion.importFile(uploadResult.file_id, {
        dataset_name: datasetName,
        destination_table: destTable,
        strategy,
      });
      setImportSuccess({
        dataset_id: res.dataset_id,
        name: datasetName,
        row_count: res.row_count,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="text-center py-20">
        <h2 className="text-lg font-bold text-white mb-2">No Active Project Selected</h2>
        <p className="text-xs text-slate-400 mb-4">Please select or create a project to upload data.</p>
        <button
          onClick={() => navigate('/projects')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
        >
          View Projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="pb-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <UploadCloud className="w-6 h-6 text-indigo-400" />
            Data Ingestion Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Ingest raw files into <span className="text-indigo-300 font-medium">{activeProject.name}</span> with automatic schema inference and validation.
          </p>
        </div>

        {/* 1-Click Sample Button */}
        <button
          onClick={handleLoadSample}
          disabled={importing}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 self-start md:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          <span>{importing ? 'Loading Sample...' : 'Load Built-In E-Commerce Data (1.2K Rows)'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Notification */}
      {importSuccess && (
        <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Data Ingested Successfully!</h3>
          </div>
          <p className="text-xs text-slate-300 mb-4">
            Imported <strong className="text-emerald-400">{importSuccess.row_count?.toLocaleString()}</strong> rows into dataset <strong className="text-white font-mono">{importSuccess.name}</strong>.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/explorer')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition"
            >
              <span>Explore Dataset</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/mining')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
            >
              Run Mining Lab
            </button>
          </div>
        </div>
      )}

      {/* Upload Box */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className="rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/40 hover:border-indigo-500/60 p-10 text-center transition cursor-pointer"
        onClick={() => document.getElementById('file-upload-input')?.click()}
      >
        <input
          id="file-upload-input"
          type="file"
          accept=".csv,.xlsx,.xls,.json,.parquet"
          className="hidden"
          onChange={(e) => e.target.files && e.target.files[0] && handleFileSelected(e.target.files[0])}
        />
        <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
          <FileSpreadsheet className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-white mb-1">
          {file ? file.name : 'Drag & Drop your dataset here'}
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Supports CSV, Excel (.xlsx, .xls), JSON, and Parquet (up to 50MB)
        </p>
        <span className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-block transition">
          Browse Computer
        </span>
      </div>

      {uploading && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Inspecting file schema and calculating SHA-256 integrity hash...</span>
        </div>
      )}

      {/* Preview Section */}
      {preview && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white">Detected Schema & Preview</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {preview.columns?.length} columns detected • Estimated ~{preview.row_count_estimate?.toLocaleString()} rows
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded">
              SHA: {uploadResult?.file_hash?.substring(0, 12)}...
            </span>
          </div>

          {/* Columns Tag Cloud */}
          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Inferred Columns</div>
            <div className="flex flex-wrap gap-2">
              {preview.columns?.map((col: any) => (
                <div key={col.name} className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs flex items-center gap-1.5">
                  <span className="text-slate-200 font-medium">{col.name}</span>
                  <span className="text-[10px] text-indigo-400 uppercase font-mono">{col.inferred_type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sample Table Preview */}
          {preview.sample_rows && preview.sample_rows.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5" /> Sample Rows (First {preview.sample_rows.length})
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 text-slate-400 text-[10px] uppercase font-mono">
                    <tr>
                      {Object.keys(preview.sample_rows[0]).map((k) => (
                        <th key={k} className="px-3 py-2 whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {preview.sample_rows.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        {Object.values(row).map((val: any, vIdx: number) => (
                          <td key={vIdx} className="px-3 py-2 text-slate-300 whitespace-nowrap font-mono text-[11px]">
                            {val !== null ? String(val) : <span className="text-slate-600">NULL</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Destination Form */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Dataset Name</label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Destination Table Name</label>
              <input
                type="text"
                value={destTable}
                onChange={(e) => setDestTable(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Import Strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="replace">Replace Existing Table</option>
                <option value="append">Append Rows</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition disabled:opacity-50"
            >
              {importing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Importing Data to SQLite...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Confirm & Import Dataset</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
