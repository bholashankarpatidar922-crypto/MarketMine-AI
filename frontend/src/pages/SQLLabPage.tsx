import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { SavedQuery, Dataset } from '../types';
import {
  Terminal,
  Play,
  Save,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Table,
  Clock,
  Database,
  Bookmark,
} from 'lucide-react';

export const SQLLabPage: React.FC = () => {
  const { activeProject } = useAuth();
  const [sql, setSql] = useState('SELECT * FROM');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [execTimeMs, setExecTimeMs] = useState<number | null>(null);

  // NL to SQL modal/input
  const [nlInput, setNlInput] = useState('');
  const [generatingNl, setGeneratingNl] = useState(false);

  // Save Query
  const [queryName, setQueryName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    if (!activeProject) return;
    const load = async () => {
      try {
        const [dList, qList] = await Promise.all([
          api.datasets.listByProject(activeProject.id),
          api.sql.listQueries(activeProject.id),
        ]);
        setDatasets(dList);
        setSavedQueries(qList);
        if (dList.length > 0) {
          setSql(`SELECT * FROM "${dList[0].table_name}" LIMIT 25;`);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [activeProject]);

  const handleRunSQL = async () => {
    if (!activeProject || !sql.trim()) return;
    setRunning(true);
    setError(null);
    setResults(null);
    const start = performance.now();

    try {
      const res = await api.sql.execute(activeProject.id, sql);
      setResults(res);
      setExecTimeMs(Math.round(performance.now() - start));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Query execution rejected or failed');
    } finally {
      setRunning(false);
    }
  };

  const handleNL2SQL = async () => {
    if (!activeProject || !nlInput.trim()) return;
    setGeneratingNl(true);
    setError(null);
    try {
      const res = await api.ai.nl2sql({
        project_id: activeProject.id,
        natural_language_query: nlInput,
      });
      if (res.sql) {
        setSql(res.sql);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to convert natural language to SQL');
    } finally {
      setGeneratingNl(false);
    }
  };

  const handleSaveQuery = async () => {
    if (!activeProject || !queryName.trim()) return;
    try {
      const created = await api.sql.saveQuery({
        project_id: activeProject.id,
        name: queryName,
        sql_text: sql,
      });
      setSavedQueries([...savedQueries, created]);
      setShowSaveModal(false);
      setQueryName('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save query');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Terminal className="w-6 h-6 text-indigo-400" />
            SQL Lab & Natural Language Query Engine
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Execute AST-validated, read-only SQL queries with automatic project table isolation and row limits.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Read-Only Guard Enabled</span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* NL to SQL bar */}
      <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Sparkles className="w-4 h-4 text-indigo-400 absolute left-3 top-3" />
          <input
            type="text"
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNL2SQL()}
            placeholder="Ask AI to write SQL (e.g., 'Total revenue by category where order_date is in 2024')..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button
          onClick={handleNL2SQL}
          disabled={generatingNl || !nlInput.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition whitespace-nowrap self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{generatingNl ? 'Generating SQL...' : 'Convert to SQL'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* SQL Editor Area */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">query.sql</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSaveModal(true)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1"
                >
                  <Save className="w-3 h-3" />
                  Save
                </button>
                <button
                  onClick={handleRunSQL}
                  disabled={running}
                  className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>{running ? 'Running...' : 'Run Query'}</span>
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="w-full bg-slate-950 p-4 font-mono text-xs text-indigo-200 focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Results Grid */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Table className="w-4 h-4 text-indigo-400" />
                Query Results
              </h3>
              {results && (
                <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                  <span>{results.row_count || results.rows?.length || 0} rows</span>
                  {execTimeMs !== null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" /> {execTimeMs} ms
                    </span>
                  )}
                </div>
              )}
            </div>

            {!results && !running && (
              <div className="text-center py-12 text-xs text-slate-500">
                Run a query to view results.
              </div>
            )}

            {running && (
              <div className="text-center py-12 text-xs text-slate-400">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Executing read-only SQL query against SQLite database...
              </div>
            )}

            {results && results.rows && results.rows.length > 0 && (
              <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-800 text-[11px] font-mono">
                <table className="w-full text-left">
                  <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px]">
                    <tr>
                      {results.columns?.map((c: string) => (
                        <th key={c} className="px-4 py-2.5 whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {results.rows.map((row: any, rI: number) => (
                      <tr key={rI} className="hover:bg-slate-800/30">
                        {results.columns?.map((c: string) => (
                          <td key={c} className="px-4 py-2 text-slate-300 whitespace-nowrap">
                            {row[c] !== null ? String(row[c]) : <span className="text-slate-600">NULL</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Schema Browser & Saved Queries */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-400" /> Accessible Tables
            </h4>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {datasets.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setSql(`SELECT * FROM "${d.table_name}" LIMIT 25;`)}
                  className="p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/50 cursor-pointer transition text-xs font-mono text-slate-300 flex items-center justify-between"
                >
                  <span className="truncate">{d.table_name}</span>
                  <span className="text-[10px] text-slate-500 font-sans">{d.row_count} rows</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-indigo-400" /> Saved Queries
            </h4>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {savedQueries.map((q) => (
                <div
                  key={q.id}
                  onClick={() => setSql(q.sql_text)}
                  className="p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/50 cursor-pointer transition text-xs"
                >
                  <div className="font-semibold text-white truncate">{q.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{q.sql_text}</div>
                </div>
              ))}
              {savedQueries.length === 0 && (
                <div className="text-[11px] text-slate-500 py-3 text-center">No saved queries yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Query Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Save Query to Project</h3>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Query Name</label>
              <input
                type="text"
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
                placeholder="e.g., Monthly Category Totals"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuery}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/20"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
