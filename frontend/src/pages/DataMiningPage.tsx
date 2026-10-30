import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Dataset, MiningExperiment } from '../types';
import {
  Cpu,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  Network,
  Users,
  Target,
  TrendingUp,
  AlertTriangle,
  History,
  Layers,
} from 'lucide-react';

export const DataMiningPage: React.FC = () => {
  const { activeProject } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [experiments, setExperiments] = useState<MiningExperiment[]>([]);
  const [algorithmTab, setAlgorithmTab] = useState<
    'association' | 'clustering' | 'classification' | 'regression' | 'anomaly' | 'forecast' | 'history'
  >('association');

  // Form states
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Association Rules
  const [transCol, setTransCol] = useState('order_id');
  const [itemCol, setItemCol] = useState('product_name');
  const [minSupport, setMinSupport] = useState(0.01);
  const [minConfidence, setMinConfidence] = useState(0.1);

  // Clustering
  const [clusterFeatures, setClusterFeatures] = useState('revenue, quantity, profit');
  const [kClusters, setKClusters] = useState(3);

  // Classification
  const [classTarget, setClassTarget] = useState('customer_segment');
  const [classFeatures, setClassFeatures] = useState('revenue, quantity, profit, discount_pct');
  const [classAlgo, setClassAlgo] = useState('random_forest');

  // Regression
  const [regTarget, setRegTarget] = useState('revenue');
  const [regFeatures, setRegFeatures] = useState('quantity, unit_price, discount_pct');
  const [regAlgo, setRegAlgo] = useState('random_forest');

  // Anomaly
  const [anomalyFeatures, setAnomalyFeatures] = useState('revenue, profit');
  const [anomalyMethod, setAnomalyMethod] = useState('isolation_forest');

  // Forecast
  const [forecastDateCol, setForecastDateCol] = useState('order_date');
  const [forecastTargetCol, setForecastTargetCol] = useState('revenue');
  const [forecastHorizon, setForecastHorizon] = useState(14);

  useEffect(() => {
    if (!activeProject) return;
    const load = async () => {
      try {
        const [dList, expList] = await Promise.all([
          api.datasets.listByProject(activeProject.id),
          api.mining.listExperiments(activeProject.id),
        ]);
        setDatasets(dList);
        setExperiments(expList);
        if (dList.length > 0) {
          setSelectedDatasetId(dList[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [activeProject]);

  const handleRun = async () => {
    if (!selectedDatasetId) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      let res: any = null;
      if (algorithmTab === 'association') {
        res = await api.mining.runAssociationRules({
          dataset_id: selectedDatasetId,
          transaction_col: transCol,
          item_col: itemCol,
          min_support: Number(minSupport),
          min_confidence: Number(minConfidence),
        });
      } else if (algorithmTab === 'clustering') {
        const fList = clusterFeatures.split(',').map((s) => s.trim()).filter(Boolean);
        res = await api.mining.runClustering({
          dataset_id: selectedDatasetId,
          features: fList,
          n_clusters: Number(kClusters),
        });
      } else if (algorithmTab === 'classification') {
        const fList = classFeatures.split(',').map((s) => s.trim()).filter(Boolean);
        res = await api.mining.runClassification({
          dataset_id: selectedDatasetId,
          target_col: classTarget,
          feature_cols: fList,
          algorithm: classAlgo,
        });
      } else if (algorithmTab === 'regression') {
        const fList = regFeatures.split(',').map((s) => s.trim()).filter(Boolean);
        res = await api.mining.runRegression({
          dataset_id: selectedDatasetId,
          target_col: regTarget,
          feature_cols: fList,
          algorithm: regAlgo,
        });
      } else if (algorithmTab === 'anomaly') {
        const fList = anomalyFeatures.split(',').map((s) => s.trim()).filter(Boolean);
        res = await api.mining.runAnomaly({
          dataset_id: selectedDatasetId,
          feature_cols: fList,
          method: anomalyMethod,
        });
      } else if (algorithmTab === 'forecast') {
        res = await api.mining.runForecast({
          dataset_id: selectedDatasetId,
          date_col: forecastDateCol,
          target_col: forecastTargetCol,
          horizon: Number(forecastHorizon),
        });
      }
      setResult(res);
      if (activeProject) {
        const updatedExp = await api.mining.listExperiments(activeProject.id);
        setExperiments(updatedExp);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Algorithm execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Cpu className="w-6 h-6 text-indigo-400" />
            Data Mining & Machine Learning Lab
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Execute real data mining algorithms on your persistent datasets: Apriori, K-Means, Supervised ML, and Forecasting.
          </p>
        </div>

        {/* Dataset Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Dataset:</span>
          <select
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-medium focus:outline-none"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.row_count} rows)</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Algorithm Tabs */}
      <div className="flex border-b border-slate-800 gap-4 overflow-x-auto">
        <button
          onClick={() => { setAlgorithmTab('association'); setResult(null); }}
          className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
            algorithmTab === 'association' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Network className="w-4 h-4" /> Association Rules (Apriori)
        </button>
        <button
          onClick={() => { setAlgorithmTab('clustering'); setResult(null); }}
          className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
            algorithmTab === 'clustering' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Users className="w-4 h-4" /> K-Means Clustering
        </button>
        <button
          onClick={() => { setAlgorithmTab('classification'); setResult(null); }}
          className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
            algorithmTab === 'classification' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Target className="w-4 h-4" /> Classification
        </button>
        <button
          onClick={() => { setAlgorithmTab('regression'); setResult(null); }}
          className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
            algorithmTab === 'regression' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Regression
        </button>
        <button
          onClick={() => { setAlgorithmTab('anomaly'); setResult(null); }}
          className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
            algorithmTab === 'anomaly' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Anomaly Detection
        </button>
        <button
          onClick={() => { setAlgorithmTab('forecast'); setResult(null); }}
          className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
            algorithmTab === 'forecast' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Sparkles className="w-4 h-4" /> Time-Series Forecast
        </button>
        <button
          onClick={() => { setAlgorithmTab('history'); setResult(null); }}
          className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
            algorithmTab === 'history' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <History className="w-4 h-4" /> Experiment Registry ({experiments.length})
        </button>
      </div>

      {/* Main Algorithm Controls & Outputs */}
      {algorithmTab !== 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Parameters Panel */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Parameters</h2>

            {algorithmTab === 'association' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Transaction ID Column</label>
                  <input
                    type="text"
                    value={transCol}
                    onChange={(e) => setTransCol(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Item / Product Column</label>
                  <input
                    type="text"
                    value={itemCol}
                    onChange={(e) => setItemCol(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Min Support ({minSupport})</label>
                  <input
                    type="range"
                    min="0.005"
                    max="0.2"
                    step="0.005"
                    value={minSupport}
                    onChange={(e) => setMinSupport(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Min Confidence ({minConfidence})</label>
                  <input
                    type="range"
                    min="0.05"
                    max="0.8"
                    step="0.05"
                    value={minConfidence}
                    onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </>
            )}

            {algorithmTab === 'clustering' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Numerical Features</label>
                  <input
                    type="text"
                    value={clusterFeatures}
                    onChange={(e) => setClusterFeatures(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Number of Clusters (k = {kClusters})</label>
                  <input
                    type="range"
                    min="2"
                    max="8"
                    value={kClusters}
                    onChange={(e) => setKClusters(parseInt(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </>
            )}

            {algorithmTab === 'classification' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Column (Categorical)</label>
                  <input
                    type="text"
                    value={classTarget}
                    onChange={(e) => setClassTarget(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Feature Columns</label>
                  <input
                    type="text"
                    value={classFeatures}
                    onChange={(e) => setClassFeatures(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Algorithm</label>
                  <select
                    value={classAlgo}
                    onChange={(e) => setClassAlgo(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="random_forest">Random Forest Classifier</option>
                    <option value="decision_tree">Decision Tree</option>
                    <option value="logistic_regression">Logistic Regression</option>
                  </select>
                </div>
              </>
            )}

            {algorithmTab === 'regression' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Column (Continuous)</label>
                  <input
                    type="text"
                    value={regTarget}
                    onChange={(e) => setRegTarget(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Feature Columns</label>
                  <input
                    type="text"
                    value={regFeatures}
                    onChange={(e) => setRegFeatures(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Algorithm</label>
                  <select
                    value={regAlgo}
                    onChange={(e) => setRegAlgo(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="random_forest">Random Forest Regressor</option>
                    <option value="linear_regression">Linear Regression</option>
                  </select>
                </div>
              </>
            )}

            {algorithmTab === 'anomaly' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Feature Columns</label>
                  <input
                    type="text"
                    value={anomalyFeatures}
                    onChange={(e) => setAnomalyFeatures(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Method</label>
                  <select
                    value={anomalyMethod}
                    onChange={(e) => setAnomalyMethod(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="isolation_forest">Isolation Forest (Multivariate)</option>
                    <option value="iqr">Interquartile Range (IQR)</option>
                    <option value="zscore">Z-Score Threshold (&gt; 3.0)</option>
                  </select>
                </div>
              </>
            )}

            {algorithmTab === 'forecast' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Date Column</label>
                  <input
                    type="text"
                    value={forecastDateCol}
                    onChange={(e) => setForecastDateCol(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Series Column</label>
                  <input
                    type="text"
                    value={forecastTargetCol}
                    onChange={(e) => setForecastTargetCol(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Forecast Horizon ({forecastHorizon} periods)</label>
                  <input
                    type="range"
                    min="7"
                    max="60"
                    value={forecastHorizon}
                    onChange={(e) => setForecastHorizon(parseInt(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </>
            )}

            <button
              onClick={handleRun}
              disabled={running}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50 mt-4"
            >
              <Play className="w-4 h-4" />
              <span>{running ? 'Running Scikit-learn/MLxtend...' : 'Execute Algorithm'}</span>
            </button>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Model Output & Verification</h2>

            {!result && !running && (
              <div className="text-center py-16 text-slate-500 text-xs">
                Configure parameters and click "Execute Algorithm" to generate verified mathematical results.
              </div>
            )}

            {running && (
              <div className="text-center py-16 space-y-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Computing algorithm on relational dataset...</p>
              </div>
            )}

            {/* ASSOCIATION RULES RESULTS */}
            {result && algorithmTab === 'association' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Discovered <strong className="text-indigo-400">{result.rules?.length || 0}</strong> Association Rules</span>
                  <span>Transactions: {result.total_transactions}</span>
                </div>

                <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-800 text-[11px] font-mono">
                  <table className="w-full text-left">
                    <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Antecedent (If Bought)</th>
                        <th className="px-3 py-2">Consequent (Also Bought)</th>
                        <th className="px-3 py-2">Support</th>
                        <th className="px-3 py-2">Confidence</th>
                        <th className="px-3 py-2">Lift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {result.rules?.map((r: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2 text-indigo-300 font-semibold">{r.antecedents?.join(', ')}</td>
                          <td className="px-3 py-2 text-cyan-300 font-semibold">{r.consequents?.join(', ')}</td>
                          <td className="px-3 py-2 text-slate-300">{(r.support * 100).toFixed(2)}%</td>
                          <td className="px-3 py-2 text-emerald-400 font-bold">{(r.confidence * 100).toFixed(1)}%</td>
                          <td className="px-3 py-2 text-purple-400 font-bold">{r.lift?.toFixed(2)}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CLUSTERING RESULTS */}
            {result && algorithmTab === 'clustering' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Silhouette Score</span>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">{result.metrics?.silhouette_score?.toFixed(3)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Inertia</span>
                    <div className="text-2xl font-bold text-indigo-400 mt-1">{result.metrics?.inertia?.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-300 mb-2">Cluster Profiles (Feature Centroids)</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-800 text-[11px] font-mono">
                    <table className="w-full text-left">
                      <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2">Cluster</th>
                          <th className="px-3 py-2">Size (Count)</th>
                          {result.feature_names?.map((f: string) => (
                            <th key={f} className="px-3 py-2">Mean {f}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {result.cluster_centers?.map((c: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2 font-bold text-indigo-400">Cluster #{idx}</td>
                            <td className="px-3 py-2 text-slate-300">{result.cluster_counts?.[idx] || '-'}</td>
                            {result.feature_names?.map((f: string, fIdx: number) => (
                              <td key={f} className="px-3 py-2 text-slate-200">{c[fIdx]?.toFixed(2)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* CLASSIFICATION RESULTS */}
            {result && algorithmTab === 'classification' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Accuracy</span>
                    <div className="text-xl font-bold text-emerald-400 mt-1">{(result.metrics?.accuracy * 100).toFixed(1)}%</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Precision</span>
                    <div className="text-xl font-bold text-indigo-400 mt-1">{(result.metrics?.precision * 100).toFixed(1)}%</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">F1-Score</span>
                    <div className="text-xl font-bold text-cyan-400 mt-1">{(result.metrics?.f1_score * 100).toFixed(1)}%</div>
                  </div>
                </div>

                {/* Feature Importances */}
                {result.feature_importances && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-2">Feature Importances</h4>
                    <div className="space-y-2">
                      {Object.entries(result.feature_importances).map(([f, imp]: any) => (
                        <div key={f} className="text-xs">
                          <div className="flex justify-between text-slate-300 mb-1">
                            <span className="font-mono">{f}</span>
                            <span className="font-mono text-indigo-400">{(imp * 100).toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${imp * 100}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* REGRESSION RESULTS */}
            {result && algorithmTab === 'regression' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">R² Score</span>
                    <div className="text-xl font-bold text-emerald-400 mt-1">{result.metrics?.r2_score?.toFixed(3)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">RMSE</span>
                    <div className="text-xl font-bold text-indigo-400 mt-1">{result.metrics?.rmse?.toFixed(2)}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">MAE</span>
                    <div className="text-xl font-bold text-cyan-400 mt-1">{result.metrics?.mae?.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ANOMALY RESULTS */}
            {result && algorithmTab === 'anomaly' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold">Anomalies Detected</span>
                    <div className="text-2xl font-bold text-rose-400 mt-1">{result.outliers_count} rows</div>
                  </div>
                  <div className="text-xs text-slate-400">
                    Method: <strong className="text-white">{result.method}</strong>
                  </div>
                </div>

                {result.sample_outliers && result.sample_outliers.length > 0 && (
                  <div className="overflow-x-auto max-h-60 rounded-xl border border-slate-800 text-[11px] font-mono">
                    <table className="w-full text-left">
                      <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px]">
                        <tr>
                          {Object.keys(result.sample_outliers[0]).map((k) => (
                            <th key={k} className="px-3 py-2 whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {result.sample_outliers.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-800/30 text-rose-300">
                            {Object.values(row).map((val: any, j: number) => (
                              <td key={j} className="px-3 py-1.5 whitespace-nowrap">{String(val)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* FORECAST RESULTS */}
            {result && algorithmTab === 'forecast' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Forecast Generated for Next <strong className="text-cyan-400">{result.horizon}</strong> Periods</span>
                  <span className="text-slate-400">Model: Exponential Smoothing / ARIMA</span>
                </div>

                <div className="overflow-x-auto max-h-80 rounded-xl border border-slate-800 text-[11px] font-mono">
                  <table className="w-full text-left">
                    <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Period / Date</th>
                        <th className="px-3 py-2 text-right">Predicted Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {result.forecast_values?.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2 text-slate-300">{item.date || `Step +${i + 1}`}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-400">
                            {typeof item.value === 'number' ? item.value.toFixed(2) : String(item.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXPERIMENT REGISTRY */}
      {algorithmTab === 'history' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-800">
            <h3 className="text-base font-bold text-white">Project Experiment Registry</h3>
            <p className="text-xs text-slate-400 mt-0.5">Auditable track record of every trained machine learning model and data mining run.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-mono">
                <tr>
                  <th className="px-5 py-3">Experiment Name</th>
                  <th className="px-5 py-3">Algorithm</th>
                  <th className="px-5 py-3">Task Type</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3">Key Metrics</th>
                  <th className="px-5 py-3">Executed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {experiments.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-800/30">
                    <td className="px-5 py-3.5 font-semibold text-white">{exp.name}</td>
                    <td className="px-5 py-3.5 font-mono text-indigo-400 uppercase text-[10px]">{exp.algorithm}</td>
                    <td className="px-5 py-3.5 text-slate-300">{exp.task_type}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-400">{exp.target_column || '-'}</td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-emerald-400">
                      {JSON.stringify(exp.metrics_json || {})}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{new Date(exp.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
