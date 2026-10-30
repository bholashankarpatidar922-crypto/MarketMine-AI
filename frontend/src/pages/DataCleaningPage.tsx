import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Dataset, Pipeline, TransformationStep } from '../types';
import {
  Layers,
  Plus,
  Trash2,
  Play,
  Eye,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
} from 'lucide-react';

export const DataCleaningPage: React.FC = () => {
  const { activeProject } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [sourceDatasetId, setSourceDatasetId] = useState<string>('');
  const [pipelineName, setPipelineName] = useState<string>('Clean & Standardize Pipeline');
  const [targetDatasetName, setTargetDatasetName] = useState<string>('');
  const [steps, setSteps] = useState<TransformationStep[]>([
    { step_type: 'drop_duplicates', parameters: {} },
    { step_type: 'fill_missing', parameters: { strategy: 'mean' } },
  ]);

  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) return;
    const load = async () => {
      try {
        const [dList, pList] = await Promise.all([
          api.datasets.listByProject(activeProject.id),
          api.pipelines.list(activeProject.id),
        ]);
        setDatasets(dList);
        setPipelines(pList);
        if (dList.length > 0) {
          setSourceDatasetId(dList[0].id);
          setTargetDatasetName(`${dList[0].name}_cleaned`);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [activeProject]);

  const addStep = (type: TransformationStep['step_type']) => {
    if (type === 'drop_duplicates') {
      setSteps([...steps, { step_type: 'drop_duplicates', parameters: {} }]);
    } else if (type === 'fill_missing') {
      setSteps([...steps, { step_type: 'fill_missing', parameters: { strategy: 'mean', column: '' } }]);
    } else if (type === 'filter') {
      setSteps([...steps, { step_type: 'filter', parameters: { column: '', operator: '>', value: '0' } }]);
    } else if (type === 'rename') {
      setSteps([...steps, { step_type: 'rename', parameters: { old_name: '', new_name: '' } }]);
    } else if (type === 'cast') {
      setSteps([...steps, { step_type: 'cast', parameters: { column: '', target_type: 'float' } }]);
    } else if (type === 'drop_columns') {
      setSteps([...steps, { step_type: 'drop_columns', parameters: { columns: [] } }]);
    }
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStepParam = (index: number, key: string, val: any) => {
    const copy = [...steps];
    copy[index].parameters = { ...copy[index].parameters, [key]: val };
    setSteps(copy);
  };

  const handlePreview = async () => {
    if (!sourceDatasetId) return;
    setLoadingPreview(true);
    setError(null);
    setPreviewResult(null);
    try {
      const res = await api.pipelines.preview({
        source_dataset_id: sourceDatasetId,
        steps,
      });
      setPreviewResult(res);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Pipeline preview failed');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecuteAndSave = async () => {
    if (!activeProject || !sourceDatasetId || !targetDatasetName) return;
    setExecuting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const created = await api.pipelines.create({
        project_id: activeProject.id,
        name: pipelineName,
        source_dataset_id: sourceDatasetId,
        target_dataset_name: targetDatasetName,
        steps,
      });
      await api.pipelines.run(created.id);
      setSuccessMsg(`Pipeline "${pipelineName}" executed! Cleaned dataset created in persistent storage.`);
      const updatedPipelines = await api.pipelines.list(activeProject.id);
      setPipelines(updatedPipelines);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Pipeline execution failed');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Layers className="w-6 h-6 text-indigo-400" />
          Data Preparation & Transformation Workspace
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Build visual, reversible data cleaning pipelines (Silver Layer) without writing complex scripts.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Pipeline Config */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Pipeline Configuration</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Source Dataset</label>
                <select
                  value={sourceDatasetId}
                  onChange={(e) => {
                    setSourceDatasetId(e.target.value);
                    const d = datasets.find((x) => x.id === e.target.value);
                    if (d) setTargetDatasetName(`${d.name}_cleaned`);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.row_count} rows)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Cleaned Dataset Name</label>
                <input
                  type="text"
                  value={targetDatasetName}
                  onChange={(e) => setTargetDatasetName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Pipeline Title</label>
              <input
                type="text"
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>

            {/* Steps Sequence */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Transformation Steps</span>
                {/* Step Adders */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => addStep('drop_duplicates')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700"
                  >
                    + Deduplicate
                  </button>
                  <button
                    onClick={() => addStep('fill_missing')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700"
                  >
                    + Impute
                  </button>
                  <button
                    onClick={() => addStep('filter')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700"
                  >
                    + Filter
                  </button>
                  <button
                    onClick={() => addStep('cast')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700"
                  >
                    + Cast Type
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {steps.map((st, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="h-6 w-6 rounded-full bg-indigo-600/20 text-indigo-400 font-bold flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <div className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
                        {st.step_type.replace('_', ' ')}
                      </div>

                      {st.step_type === 'fill_missing' && (
                        <div className="flex items-center gap-2">
                          <select
                            value={st.parameters.strategy || 'mean'}
                            onChange={(e) => updateStepParam(idx, 'strategy', e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300"
                          >
                            <option value="mean">Mean (numerical)</option>
                            <option value="median">Median (numerical)</option>
                            <option value="mode">Most Frequent</option>
                            <option value="drop">Drop Null Rows</option>
                          </select>
                        </div>
                      )}

                      {st.step_type === 'filter' && (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            placeholder="column"
                            value={st.parameters.column || ''}
                            onChange={(e) => updateStepParam(idx, 'column', e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 w-24"
                          />
                          <select
                            value={st.parameters.operator || '>'}
                            onChange={(e) => updateStepParam(idx, 'operator', e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-300"
                          >
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                            <option value="contains">contains</option>
                          </select>
                          <input
                            type="text"
                            placeholder="value"
                            value={st.parameters.value || ''}
                            onChange={(e) => updateStepParam(idx, 'value', e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 flex-1"
                          />
                        </div>
                      )}

                      {st.step_type === 'cast' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="column name"
                            value={st.parameters.column || ''}
                            onChange={(e) => updateStepParam(idx, 'column', e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 w-32"
                          />
                          <select
                            value={st.parameters.target_type || 'float'}
                            onChange={(e) => updateStepParam(idx, 'target_type', e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300"
                          >
                            <option value="int">Integer</option>
                            <option value="float">Float</option>
                            <option value="str">String</option>
                            <option value="datetime">Datetime</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => removeStep(idx)}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={handlePreview}
                disabled={loadingPreview}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{loadingPreview ? 'Simulating...' : 'Preview Changes'}</span>
              </button>

              <button
                onClick={handleExecuteAndSave}
                disabled={executing}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{executing ? 'Executing Pipeline...' : 'Execute & Save to Silver Layer'}</span>
              </button>
            </div>
          </div>

          {/* Preview Results Box */}
          {previewResult && (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Pipeline Execution Preview</h3>
                <div className="text-xs text-slate-400 flex items-center gap-3">
                  <span>Original: <strong className="text-white">{previewResult.original_row_count}</strong> rows</span>
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Transformed: <strong className="text-emerald-400">{previewResult.transformed_row_count}</strong> rows</span>
                </div>
              </div>

              {previewResult.sample_rows && (
                <div className="overflow-x-auto max-h-60 rounded-lg border border-slate-800 text-[11px]">
                  <table className="w-full text-left font-mono">
                    <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px]">
                      <tr>
                        {Object.keys(previewResult.sample_rows[0] || {}).map((k) => (
                          <th key={k} className="px-3 py-2 whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {previewResult.sample_rows.slice(0, 5).map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          {Object.values(r).map((v: any, j: number) => (
                            <td key={j} className="px-3 py-1.5 whitespace-nowrap text-slate-300">
                              {String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Col: Saved Pipelines */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Saved Project Pipelines</h3>
            <div className="space-y-2.5">
              {pipelines.map((p) => (
                <div key={p.id} className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs">
                  <div className="font-semibold text-slate-200">{p.name}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {p.steps?.length || 0} steps • Target: <span className="font-mono text-indigo-400">{p.target_dataset_name}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Created {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}

              {pipelines.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500">
                  No transformation pipelines saved yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
