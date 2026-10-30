import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Dataset, DatasetRowsResponse, ProfilingResult, CapabilitiesResult } from '../types';
import {
  TableProperties,
  Database,
  ArrowUpDown,
  Search,
  Download,
  Activity,
  FileCheck,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';

export const DataExplorerPage: React.FC = () => {
  const { activeProject } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'rows' | 'profile' | 'capabilities'>('rows');

  // Rows state
  const [rowsData, setRowsData] = useState<DatasetRowsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortCol, setSortCol] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterCol, setFilterCol] = useState<string>('');
  const [filterVal, setFilterVal] = useState<string>('');

  // Profiling state
  const [profile, setProfile] = useState<ProfilingResult | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load datasets on project change
  useEffect(() => {
    if (!activeProject) return;
    const fetchDatasets = async () => {
      try {
        const list = await api.datasets.listByProject(activeProject.id);
        setDatasets(list);
        if (list.length > 0) {
          setSelectedDatasetId(list[0].id);
        } else {
          setSelectedDatasetId('');
          setRowsData(null);
        }
      } catch (err: any) {
        console.error(err);
      }
    };
    fetchDatasets();
  }, [activeProject]);

  // Fetch rows
  const fetchRows = async () => {
    if (!selectedDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.datasets.getRows(selectedDatasetId, {
        page,
        page_size: pageSize,
        sort_col: sortCol,
        sort_dir: sortDir,
        filter_col: filterCol || undefined,
        filter_val: filterVal || undefined,
      });
      setRowsData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load rows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'rows') {
      fetchRows();
    } else if (activeTab === 'profile' && selectedDatasetId) {
      api.datasets.profile(selectedDatasetId).then(setProfile).catch(console.error);
    } else if (activeTab === 'capabilities' && selectedDatasetId) {
      api.datasets.capabilities(selectedDatasetId).then(setCapabilities).catch(console.error);
    }
  }, [selectedDatasetId, page, pageSize, sortCol, sortDir, activeTab]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const currentDataset = datasets.find((d) => d.id === selectedDatasetId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Dataset Selector */}
      <div className="pb-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <TableProperties className="w-6 h-6 text-indigo-400" />
            Dataset Explorer
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Inspect relational tables, filter records, compute data quality statistics and feature capabilities.
          </p>
        </div>

        {/* Dataset dropdown & Export */}
        <div className="flex items-center gap-3">
          <select
            value={selectedDatasetId}
            onChange={(e) => {
              setSelectedDatasetId(e.target.value);
              setPage(1);
              setFilterCol('');
              setFilterVal('');
            }}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-indigo-500"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.row_count?.toLocaleString()} rows)
              </option>
            ))}
          </select>

          {selectedDatasetId && (
            <a
              href={api.datasets.exportUrl(selectedDatasetId)}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </a>
          )}
        </div>
      </div>

      {datasets.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
          <Database className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-300">No Datasets Available</h3>
          <p className="text-xs text-slate-500 mt-1">Upload a CSV or load the sample dataset to start exploring.</p>
        </div>
      ) : (
        <>
          {/* Metadata Pill Banner */}
          {currentDataset && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Storage Layer</span>
                <span className="font-semibold text-indigo-400 uppercase">{currentDataset.storage_layer}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Records</span>
                <span className="font-semibold text-white font-mono">{currentDataset.row_count?.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Columns</span>
                <span className="font-semibold text-white font-mono">{currentDataset.column_count}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Quality Health</span>
                <span className="font-semibold text-emerald-400">{currentDataset.quality_score}%</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Physical Table</span>
                <span className="font-mono text-[11px] text-slate-300 truncate block">{currentDataset.table_name}</span>
              </div>
            </div>
          )}

          {/* Subtabs: Data View / Profiling / Capabilities */}
          <div className="flex border-b border-slate-800 gap-6">
            <button
              onClick={() => setActiveTab('rows')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
                activeTab === 'rows'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              Relational Rows ({rowsData?.total_count?.toLocaleString() || currentDataset?.row_count})
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
                activeTab === 'profile'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              Data Profiling & Quality
            </button>
            <button
              onClick={() => setActiveTab('capabilities')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
                activeTab === 'capabilities'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              Capability Detection
            </button>
          </div>

          {/* TAB 1: ROWS TABLE */}
          {activeTab === 'rows' && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={filterCol}
                    onChange={(e) => setFilterCol(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="">Filter by column...</option>
                    {rowsData?.columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Search value..."
                    value={filterVal}
                    onChange={(e) => setFilterVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchRows()}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none"
                  />

                  <button
                    onClick={fetchRows}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                  >
                    Apply Filter
                  </button>

                  {(filterCol || filterVal) && (
                    <button
                      onClick={() => {
                        setFilterCol('');
                        setFilterVal('');
                        fetchRows();
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Page Size */}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-xl">
                <div className="overflow-x-auto max-h-[550px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-800/80 sticky top-0 z-10 text-slate-300 uppercase text-[10px] tracking-wider font-mono">
                      <tr>
                        {rowsData?.columns.map((col) => (
                          <th
                            key={col}
                            onClick={() => handleSort(col)}
                            className="px-4 py-3 whitespace-nowrap border-b border-slate-700 cursor-pointer hover:bg-slate-700/60 transition"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{col}</span>
                              <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {rowsData?.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-800/30 transition">
                          {rowsData.columns.map((col, cIdx) => (
                            <td key={cIdx} className="px-4 py-2.5 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                              {row[col] !== null ? String(row[col]) : <span className="text-slate-600">NULL</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    Page {rowsData?.page} of {rowsData?.total_pages} ({rowsData?.total_count?.toLocaleString()} total records)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={page >= (rowsData?.total_pages || 1)}
                      onClick={() => setPage(page + 1)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROFILING */}
          {activeTab === 'profile' && profile && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-500 uppercase font-semibold">Completeness Score</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">{profile.quality_score}%</div>
                  <div className="text-[11px] text-slate-400 mt-1">{profile.missing_cells} missing cells found</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-500 uppercase font-semibold">Duplicate Rows</div>
                  <div className="text-2xl font-bold text-white mt-1">{profile.duplicate_rows}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Identical tuples across all dimensions</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-500 uppercase font-semibold">Columns Analyzed</div>
                  <div className="text-2xl font-bold text-indigo-400 mt-1">{profile.column_count}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Automated type & distribution scan</div>
                </div>
              </div>

              {/* Columns profiling table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px] font-mono">
                    <tr>
                      <th className="px-4 py-3">Column</th>
                      <th className="px-4 py-3">Data Type</th>
                      <th className="px-4 py-3">Missing %</th>
                      <th className="px-4 py-3">Unique Values</th>
                      <th className="px-4 py-3">Min / Max</th>
                      <th className="px-4 py-3">Mean / Std</th>
                      <th className="px-4 py-3">Top Values</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {profile.columns.map((col) => (
                      <tr key={col.name} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-semibold text-white">{col.name}</td>
                        <td className="px-4 py-3 text-indigo-400 uppercase text-[10px]">{col.type}</td>
                        <td className="px-4 py-3">
                          <span className={col.null_percent > 0 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                            {col.null_percent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{col.unique_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {col.min !== undefined ? `${col.min} → ${col.max}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {col.mean !== undefined ? `${col.mean.toFixed(2)} (±${col.std?.toFixed(2)})` : '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                          {col.top_values
                            ? Object.entries(col.top_values)
                                .slice(0, 3)
                                .map(([k, v]) => `${k} (${v})`)
                                .join(', ')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: CAPABILITIES */}
          {activeTab === 'capabilities' && capabilities && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-bold text-white mb-2">Supported Analytical Modules</h3>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Association Rules (Apriori / Basket)</span>
                    {capabilities.can_association_rules ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Ready</span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Missing Transaction ID</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Customer / Entity Clustering</span>
                    {capabilities.can_clustering ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Ready</span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Requires &gt;= 2 numerical cols</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Time-Series Forecasting</span>
                    {capabilities.can_forecast ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Ready</span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Missing Date column</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Classification & Regression</span>
                    {capabilities.can_classification ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Ready</span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Needs features</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Star Schema Fact/Dimension Modeling</span>
                    {capabilities.can_star_schema ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Ready</span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Needs dimensions</span>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-bold text-white mb-2">Inferred Grain & Roles</h3>
                  <div className="text-xs space-y-2">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Candidate Measures (Numeric)</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {capabilities.candidate_measures?.map((m) => (
                          <span key={m} className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[11px] font-mono">{m}</span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2">
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Candidate Dimensions (Categorical)</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {capabilities.candidate_dimensions?.map((d) => (
                          <span key={d} className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 text-[11px] font-mono">{d}</span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2">
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Time / Date Dimensions</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {capabilities.candidate_dates?.map((d) => (
                          <span key={d} className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 text-[11px] font-mono">{d}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
