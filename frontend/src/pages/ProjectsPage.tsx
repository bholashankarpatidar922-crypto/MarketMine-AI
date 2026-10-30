import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Project } from '../types';
import {
  FolderKanban,
  Plus,
  Trash2,
  Calendar,
  Layers,
  ArrowRight,
  Database,
  Building2,
  AlertTriangle,
} from 'lucide-react';

export const ProjectsPage: React.FC = () => {
  const { projects, activeProject, setActiveProject, refreshProjects } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('ecommerce');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const newProj = await api.projects.create(name, description, domain);
      await refreshProjects();
      setActiveProject(newProj);
      setShowCreateModal(false);
      setName('');
      setDescription('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.projects.delete(deleteId);
      await refreshProjects();
      if (activeProject?.id === deleteId) {
        const remaining = projects.filter((p) => p.id !== deleteId);
        setActiveProject(remaining.length > 0 ? remaining[0] : null);
      }
      setDeleteId(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete project');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <FolderKanban className="w-6 h-6 text-indigo-400" />
            Project Workspaces
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Isolate datasets, pipelines, warehouse schemas, and AI conversations by business domain.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((proj) => {
          const isActive = activeProject?.id === proj.id;
          return (
            <div
              key={proj.id}
              className={`rounded-xl border p-5 transition-all flex flex-col justify-between ${
                isActive
                  ? 'bg-slate-900/90 border-indigo-500/50 shadow-xl shadow-indigo-500/10'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-800 text-indigo-400 border border-slate-700">
                    {proj.domain}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isActive && (
                      <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Active
                      </span>
                    )}
                    <button
                      onClick={() => setDeleteId(proj.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                      title="Delete project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="font-semibold text-lg text-white mb-1.5">{proj.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                  {proj.description || 'No description provided.'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                  <div className="flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" />
                    <span>{proj.dataset_count ?? 0} Datasets</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(proj.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setActiveProject(proj);
                    navigate('/');
                  }}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <span>{isActive ? 'Enter Workspace' : 'Switch & Open'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
          <FolderKanban className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No Projects Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create your first analytics workspace to start uploading datasets and running mining pipelines.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Create First Project
          </button>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Create Project Workspace</h2>
            <p className="text-xs text-slate-400 mb-4">Set up an isolated analytical environment.</p>

            {error && (
              <div className="mb-4 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Global E-Commerce Q4 Analytics"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Domain</label>
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ecommerce">E-Commerce & Retail</option>
                  <option value="sales">Sales & CRM</option>
                  <option value="finance">Finance & Banking</option>
                  <option value="healthcare">Healthcare & Life Sciences</option>
                  <option value="supply_chain">Supply Chain & Logistics</option>
                  <option value="generic">General / Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Goals, target business questions, or dataset descriptions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20"
                >
                  {submitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Delete Project?</h3>
            <p className="text-xs text-slate-400 mb-5">
              This will permanently delete this project, along with all associated datasets, tables, models, and history. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
