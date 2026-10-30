import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Dataset, WarehouseModel } from '../types';
import {
  Database,
  Layers,
  GitBranch,
  Play,
  Plus,
  Box,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Table,
} from 'lucide-react';

export const DataWarehousePage: React.FC = () => {
  const { activeProject } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<WarehouseModel[]>([]);
  const [lineages, setLineages] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'models' | 'etl' | 'olap' | 'lineage'>('models');

  // Schema creation
  const [showModelModal, setShowModelModal] = useState(false);
  const [modelName, setModelName] = useState('E-Commerce Star Schema');
  const [modelType, setModelType] = useState('star');
  const [grain, setGrain] = useState('Transaction item grain');
  const [factTable, setFactTable] = useState('');
  const [dims, setDims] = useState<string[]>(['dim_customer', 'dim_product', 'dim_date']);

  // ETL runner
  const [etlSourceId, setEtlSourceId] = useState('');
  const [etlLayer, setEtlLayer] = useState('warehouse');
  const [etlStrategy, setEtlStrategy] = useState<'full_refresh' | 'append' | 'scd2'>('scd2');
  const [etlRunning, setEtlRunning] = useState(false);
  const [etlResult, setEtlResult] = useState<any | null>(null);

  // OLAP runner
  const [olapTable, setOlapTable] = useState('');
  const [olapDims, setOlapDims] = useState<string>('category, region');
  const [olapMeasureCol, setOlapMeasureCol] = useState('revenue');
  const [olapMeasureAgg, setOlapMeasureAgg] = useState('sum');
  const [olapRunning, setOlapRunning] = useState(false);
  const [olapResult, setOlapResult] = useState<any | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) return;
    const load = async () => {
      try {
        const [dList, mList, lList] = await Promise.all([
          api.datasets.listByProject(activeProject.id),
          api.warehouse.listModels(activeProject.id),
          api.warehouse.getLineage(activeProject.id),
        ]);
        setDatasets(dList);
        setModels(mList);
        setLineages(lList);
        if (dList.length > 0) {
          setEtlSourceId(dList[0].id);
          setFactTable(dList[0].table_name);
          setOlapTable(dList[0].table_name);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [activeProject]);

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setError(null);
    try {
      const created = await api.warehouse.createModel({
        project_id: activeProject.id,
        name: modelName,
        model_type: modelType,
        grain,
        fact_table_name: factTable,
        dimension_tables: dims,
      });
      setModels([...models, created]);
      setShowModelModal(false);
      setSuccess(`Warehouse model "${created.name}" created successfully.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create warehouse model');
    }
  };

  const handleRunETL = async () => {
    if (!activeProject || !etlSourceId) return;
    setEtlRunning(true);
    setError(null);
    setSuccess(null);
    setEtlResult(null);
    try {
      const res = await api.warehouse.runETL(activeProject.id, {
        source_dataset_id: etlSourceId,
        destination_layer: etlLayer,
        load_strategy: etlStrategy,
      });
      setEtlResult(res);
      setSuccess(`ETL Batch finished: ${res.rows_processed} rows loaded using strategy "${etlStrategy}".`);
      const updatedLineages = await api.warehouse.getLineage(activeProject.id);
      setLineages(updatedLineages);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'ETL job failed');
    } finally {
      setEtlRunning(false);
    }
  };

  const handleRunOLAP = async () => {
    if (!olapTable) return;
    setOlapRunning(true);
    setError(null);
    setOlapResult(null);
    try {
      const parsedDims = olapDims.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await api.warehouse.runOLAP({
        table_name: olapTable,
        dimensions: parsedDims,
        measures: [{ column: olapMeasureCol, agg: olapMeasureAgg }],
      });
      setOlapResult(res);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'OLAP aggregation failed');
    } finally {
      setOlapRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Database className="w-6 h-6 text-indigo-400" />
            Data Warehousing & OLAP Lab
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Star/Snowflake schema modeling, SCD Type 1 & 2 incremental ETL, and multi-dimensional OLAP analysis.
          </p>
        </div>

        <button
          onClick={() => setShowModelModal(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Design Schema Model
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('models')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'models'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Schema Models ({models.length})
        </button>
        <button
          onClick={() => setActiveTab('etl')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'etl'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Incremental ETL & SCD Engine
        </button>
        <button
          onClick={() => setActiveTab('olap')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'olap'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          OLAP Multidimensional Cube
        </button>
        <button
          onClick={() => setActiveTab('lineage')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'lineage'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Data Lineage & Audit
        </button>
      </div>

      {/* TAB 1: MODELS */}
      {activeTab === 'models' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {models.map((m) => (
            <div key={m.id} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  {m.model_type} Schema
                </span>
                <span className="text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString()}</span>
              </div>
              <h3 className="text-lg font-bold text-white">{m.name}</h3>
              <p className="text-xs text-slate-400">{m.grain || 'Standard analytical grain'}</p>

              <div className="pt-2 border-t border-slate-800 text-xs space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">Fact Table</span>
                  <span className="font-mono text-cyan-400 font-semibold">{m.fact_table_name}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">Dimension Tables</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {m.dimension_tables_json?.map((d) => (
                      <span key={d} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {models.length === 0 && (
            <div className="col-span-2 text-center py-16 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
              <Box className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-300">No Warehouse Models Defined</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Design a Star Schema with centralized facts and surrounding dimension tables.
              </p>
              <button
                onClick={() => setShowModelModal(true)}
                className="mt-4 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
              >
                Create Star Schema
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ETL & SCD */}
      {activeTab === 'etl' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-white">Automated Warehouse ETL / ELT Runner</h2>
            <p className="text-xs text-slate-400 mt-1">
              Transfer records from Cleaned (Silver) to Warehouse (Gold) with full refresh or Slowly Changing Dimensions (SCD Type 2).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Source Dataset</label>
              <select
                value={etlSourceId}
                onChange={(e) => setEtlSourceId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.storage_layer})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Destination Layer</label>
              <select
                value={etlLayer}
                onChange={(e) => setEtlLayer(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="warehouse">Warehouse (Gold Fact)</option>
                <option value="mart">Data Mart (Sales / Marketing)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Load Strategy</label>
              <select
                value={etlStrategy}
                onChange={(e) => setEtlStrategy(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="full_refresh">Full Refresh (Truncate & Replace)</option>
                <option value="append">Incremental Append</option>
                <option value="scd2">SCD Type 2 (Historical Versioning with valid_from/to)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleRunETL}
            disabled={etlRunning}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            <span>{etlRunning ? 'Running ETL Pipeline...' : 'Execute ETL Batch'}</span>
          </button>

          {etlResult && (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs space-y-2">
              <div className="font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ETL Load Complete
              </div>
              <div className="text-slate-300 font-mono text-[11px]">
                Target Table: <span className="text-indigo-400">{etlResult.target_table}</span> • Rows Processed: {etlResult.rows_processed} • Strategy: {etlStrategy}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OLAP */}
      {activeTab === 'olap' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-white">Multidimensional OLAP Cube Aggregator</h2>
            <p className="text-xs text-slate-400 mt-1">
              Roll-up, slice, and dice analytical metrics across multiple business dimensions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Target Table</label>
              <select
                value={olapTable}
                onChange={(e) => setOlapTable(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.table_name}>{d.name} ({d.table_name})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Dimensions (comma-separated)</label>
              <input
                type="text"
                value={olapDims}
                onChange={(e) => setOlapDims(e.target.value)}
                placeholder="e.g. category, region"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Measure Column</label>
              <input
                type="text"
                value={olapMeasureCol}
                onChange={(e) => setOlapMeasureCol(e.target.value)}
                placeholder="revenue"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Aggregation Function</label>
              <select
                value={olapMeasureAgg}
                onChange={(e) => setOlapMeasureAgg(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="sum">SUM</option>
                <option value="avg">AVG (Mean)</option>
                <option value="count">COUNT</option>
                <option value="min">MIN</option>
                <option value="max">MAX</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleRunOLAP}
            disabled={olapRunning}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
          >
            <BarChart3 className="w-4 h-4" />
            <span>{olapRunning ? 'Calculating Multidimensional Cube...' : 'Execute OLAP Cube'}</span>
          </button>

          {/* OLAP Results Table */}
          {olapResult && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                <span>OLAP Pivot Slice ({olapResult.rows?.length} groups)</span>
                <span className="font-mono text-cyan-400">
                  {olapMeasureAgg.toUpperCase()}({olapMeasureCol})
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px]">
                    <tr>
                      {olapResult.columns?.map((c: string) => (
                        <th key={c} className="px-4 py-2.5">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {olapResult.rows?.map((r: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        {olapResult.columns?.map((c: string) => (
                          <td key={c} className="px-4 py-2 text-slate-300">
                            {r[c] !== null ? String(r[c]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LINEAGE */}
      {activeTab === 'lineage' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
          <h2 className="text-base font-bold text-white">Data Lineage & Governance Audit</h2>
          <p className="text-xs text-slate-400">
            Immutable tracking of data transformations from initial ingestion to analytical data marts.
          </p>

          <div className="space-y-3">
            {lineages.map((l, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GitBranch className="w-4 h-4 text-indigo-400" />
                  <div>
                    <span className="font-semibold text-white font-mono">{l.source_name || l.source_table}</span>
                    <span className="text-slate-500 mx-2">→</span>
                    <span className="font-semibold text-cyan-400 font-mono">{l.destination_table}</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {l.rows_affected?.toLocaleString()} rows • {new Date(l.created_at).toLocaleString()}
                </div>
              </div>
            ))}

            {lineages.length === 0 && (
              <div className="text-center py-12 text-xs text-slate-500">
                No lineage records yet. Execute an ETL or data preparation pipeline to populate lineage.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Model Modal */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Design Star / Snowflake Schema</h3>

            <form onSubmit={handleCreateModel} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Model Name</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Schema Type</label>
                <select
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                >
                  <option value="star">Star Schema (Denormalized Dimensions)</option>
                  <option value="snowflake">Snowflake Schema (Normalized Hierarchies)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Fact Table</label>
                <input
                  type="text"
                  value={factTable}
                  onChange={(e) => setFactTable(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Business Grain</label>
                <input
                  type="text"
                  value={grain}
                  onChange={(e) => setGrain(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModelModal(false)}
                  className="px-3.5 py-1.5 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-600/20"
                >
                  Save Schema
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
