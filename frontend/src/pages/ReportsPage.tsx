import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Dataset, Report } from '../types';
import {
  FileText,
  Sparkles,
  Download,
  Copy,
  Check,
  Calendar,
  Layers,
  Database,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { activeProject } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [reportType, setReportType] = useState('executive_summary');
  const [reports, setReports] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);

  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) return;
    const load = async () => {
      try {
        const [dList, rList] = await Promise.all([
          api.datasets.listByProject(activeProject.id),
          api.reports.list(activeProject.id),
        ]);
        setDatasets(dList);
        setReports(rList);
        if (dList.length > 0) setSelectedDatasetId(dList[0].id);
        if (rList.length > 0) setActiveReport(rList[0]);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [activeProject]);

  const handleGenerate = async () => {
    if (!activeProject || !selectedDatasetId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await api.ai.generateReport({
        project_id: activeProject.id,
        dataset_id: selectedDatasetId,
        report_type: reportType,
      });

      const updated = await api.reports.list(activeProject.id);
      setReports(updated);
      const newRep = updated.find((r) => r.id === res.report_id) || {
        id: res.report_id || 'new',
        project_id: activeProject.id,
        title: res.title || 'Generated Report',
        report_type: reportType,
        content_markdown: res.content_markdown || res.content,
        created_at: new Date().toISOString(),
      };
      setActiveReport(newRep);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!activeReport) return;
    navigator.clipboard.writeText(activeReport.content_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    if (!activeReport) return;
    const blob = new Blob([activeReport.content_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeReport.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-indigo-400" />
            AI Analytical Reports & Executive Briefings
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Generate verifiable, publication-grade analytical reports derived strictly from backend computations.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Generator Form */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Generate New Analytical Report</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Source Dataset</label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.row_count} rows)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Report Format / Focus</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
            >
              <option value="executive_summary">Executive C-Level Summary</option>
              <option value="data_quality">Data Quality & Completeness Scorecard</option>
              <option value="eda">Exploratory Data Analysis (EDA) Briefing</option>
              <option value="association_rules">Association Rules & Market Basket Synthesis</option>
              <option value="segmentation">Customer Segmentation & Cohort Profiling</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedDatasetId}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>{generating ? 'Drafting Report with Metrics...' : 'Generate AI Report'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Saved Reports List */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Report Archive</h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {reports.map((rep) => {
                const isSelected = activeReport?.id === rep.id;
                return (
                  <div
                    key={rep.id}
                    onClick={() => setActiveReport(rep)}
                    className={`p-3 rounded-xl border cursor-pointer transition text-xs ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-300'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-semibold text-white truncate">{rep.title}</div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span className="uppercase">{rep.report_type?.replace('_', ' ')}</span>
                      <span>{new Date(rep.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}

              {reports.length === 0 && (
                <div className="text-xs text-slate-500 py-8 text-center">
                  No reports generated yet. Click "Generate AI Report" above.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Markdown Document Viewer */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
          {activeReport ? (
            <>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-white">{activeReport.title}</h2>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Generated on {new Date(activeReport.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
                    title="Copy Markdown"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={downloadMarkdown}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
                    title="Download Markdown"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Markdown Display */}
              <div className="prose prose-invert max-w-none text-slate-300 text-xs leading-relaxed whitespace-pre-wrap font-sans bg-slate-950/40 p-6 rounded-xl border border-slate-800/80">
                {activeReport.content_markdown}
              </div>
            </>
          ) : (
            <div className="text-center py-24 text-slate-500 text-xs">
              Select or generate a report to preview its contents.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
