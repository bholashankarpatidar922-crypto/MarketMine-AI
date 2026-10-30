import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Dataset, WarehouseModel, MiningExperiment } from '../types';
import {
  Database,
  Layers,
  Sparkles,
  Cpu,
  UploadCloud,
  FileCheck,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
  Terminal,
  Activity,
  CheckCircle2,
} from 'lucide-react';

export const ProjectOverviewPage: React.FC = () => {
  const { activeProject, projects, setActiveProject } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<WarehouseModel[]>([]);
  const [experiments, setExperiments] = useState<MiningExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      if (!activeProject) return;
      setLoading(false);
      try {
        const [dList, mList, expList] = await Promise.all([
          api.datasets.listByProject(activeProject.id).catch(() => []),
          api.warehouse.listModels(activeProject.id).catch(() => []),
          api.mining.listExperiments(activeProject.id).catch(() => []),
        ]);
        setDatasets(dList);
        setModels(mList);
        setExperiments(expList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeProject]);

  if (!activeProject) {
    return (
      <div className="text-center py-20">
        <h2 className="text-lg font-bold text-white mb-2">No Active Project Selected</h2>
        <p className="text-xs text-slate-400 mb-4">Please select or create a project to view its workspace.</p>
        <button
          onClick={() => navigate('/projects')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
        >
          View Projects
        </button>
      </div>
    );
  }

  const totalRows = datasets.reduce((sum, d) => sum + (d.row_count || 0), 0);
  const avgQuality = datasets.length > 0
    ? (datasets.reduce((sum, d) => sum + (d.quality_score || 0), 0) / datasets.length).toFixed(1)
    : 'N/A';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Banner / Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              {activeProject.domain}
            </span>
            <span className="text-xs text-slate-500">• Created {new Date(activeProject.created_at).toLocaleDateString()}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{activeProject.name}</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">{activeProject.description || 'Enterprise analytics workspace.'}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/upload')}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
          >
            <UploadCloud className="w-4 h-4" />
            Ingest Dataset
          </button>
          <button
            onClick={() => navigate('/copilot')}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs flex items-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            AI Copilot
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Datasets</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">{datasets.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">In persistent storage</div>
        </div>

        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Processed Records</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">{totalRows.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-1">Total relational rows</div>
        </div>

        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Data Quality Score</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">{avgQuality}%</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-3 h-3" /> Completeness & types verified
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Mining Experiments</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">{experiments.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">ML models & rules saved</div>
        </div>
      </div>

      {/* Architecture Pipeline Map */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          End-to-End Analytics Pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div
            onClick={() => navigate('/upload')}
            className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/60 hover:border-indigo-500/50 cursor-pointer transition"
          >
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">1. Ingest (Raw/Bronze)</div>
            <p className="text-[11px] text-slate-400">CSV, Excel, JSON, Parquet validation and schema inference.</p>
          </div>

          <div
            onClick={() => navigate('/preparation')}
            className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/60 hover:border-indigo-500/50 cursor-pointer transition"
          >
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-1">2. Clean (Silver)</div>
            <p className="text-[11px] text-slate-400">Deduplication, imputation, filtering, and type casting pipelines.</p>
          </div>

          <div
            onClick={() => navigate('/warehouse')}
            className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/60 hover:border-indigo-500/50 cursor-pointer transition"
          >
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">3. Warehouse (Gold)</div>
            <p className="text-[11px] text-slate-400">Star/Snowflake schema, SCD Type 1 & 2, and multidimensional OLAP cubes.</p>
          </div>

          <div
            onClick={() => navigate('/mining')}
            className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/60 hover:border-indigo-500/50 cursor-pointer transition"
          >
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">4. Mining & AI</div>
            <p className="text-[11px] text-slate-400">Apriori rules, K-means, Random Forest, ARIMA forecasting & Copilot.</p>
          </div>
        </div>
      </div>

      {/* Datasets Table */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Project Datasets</h2>
            <p className="text-xs text-slate-400 mt-0.5">Relational tables ready for exploration and modeling.</p>
          </div>
          <button
            onClick={() => navigate('/explorer')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
          >
            Open Explorer <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {datasets.length === 0 ? (
          <div className="p-8 text-center">
            <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 mb-3">No datasets imported in this project yet.</p>
            <button
              onClick={() => navigate('/upload')}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Upload Data Now
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                <tr>
                  <th className="px-5 py-3">Dataset Name</th>
                  <th className="px-5 py-3">Storage Layer</th>
                  <th className="px-5 py-3">Rows</th>
                  <th className="px-5 py-3">Columns</th>
                  <th className="px-5 py-3">Quality Score</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {datasets.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3.5 font-medium text-white flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-indigo-400"></div>
                      <span>{d.name}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {d.storage_layer}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">{d.row_count.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">{d.column_count}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-emerald-400">{d.quality_score}%</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{new Date(d.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => navigate('/explorer')}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Explore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
