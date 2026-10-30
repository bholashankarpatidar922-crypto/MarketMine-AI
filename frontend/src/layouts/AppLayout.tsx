import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  UploadCloud,
  TableProperties,
  Sparkles,
  Database,
  Cpu,
  Terminal,
  FileText,
  FolderKanban,
  LogOut,
  ChevronDown,
  Plus,
  Activity,
  Layers,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, logout, projects, activeProject, setActiveProject } = useAuth();
  const [projectDropdown, setProjectDropdown] = useState(false);
  const navigate = useNavigate();

  const navItems = [
    { label: 'Project Overview', to: '/', icon: LayoutDashboard },
    { label: 'Data Ingestion', to: '/upload', icon: UploadCloud },
    { label: 'Data Explorer', to: '/explorer', icon: TableProperties },
    { label: 'Data Preparation', to: '/preparation', icon: Layers },
    { label: 'Data Warehouse', to: '/warehouse', icon: Database },
    { label: 'Data Mining Lab', to: '/mining', icon: Cpu },
    { label: 'AI Copilot', to: '/copilot', icon: Sparkles },
    { label: 'SQL Lab', to: '/sql', icon: Terminal },
    { label: 'Reports', to: '/reports', icon: FileText },
    { label: 'All Projects', to: '/projects', icon: FolderKanban },
  ];

  return (
    <div className="flex h-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-[#0c1220]/90 flex flex-col justify-between backdrop-blur-md z-20">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-slate-800/80 gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-bold text-lg text-white">
              M
            </div>
            <div>
              <div className="font-bold tracking-tight text-white flex items-center gap-1.5 text-base">
                MarketMine <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-semibold">AI</span>
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Enterprise Analytics</div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-160px)]">
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Modules</div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-xs font-semibold text-indigo-300">
              {user?.full_name?.substring(0, 2).toUpperCase() || 'BP'}
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-slate-200 truncate">{user?.full_name || 'Bholashankar Patidar'}</div>
              <div className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Workspace Active
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800/80 bg-[#0c1220]/60 backdrop-blur-md px-6 flex items-center justify-between z-10">
          {/* Active Project Selector */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setProjectDropdown(!projectDropdown)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-slate-600 text-sm font-medium transition"
              >
                <FolderKanban className="w-4 h-4 text-indigo-400" />
                <span className="text-slate-200">{activeProject ? activeProject.name : 'Select Project'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {projectDropdown && (
                <div className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Switch Project</div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveProject(p);
                          setProjectDropdown(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
                          activeProject?.id === p.id
                            ? 'bg-indigo-600/20 text-indigo-300'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{p.domain}</span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-800 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setProjectDropdown(false);
                        navigate('/projects');
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-indigo-400 hover:bg-indigo-500/10 flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create New Project
                    </button>
                  </div>
                </div>
              )}
            </div>

            {activeProject && (
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <span>Domain:</span>
                <span className="capitalize text-slate-400 font-medium">{activeProject.domain}</span>
              </div>
            )}
          </div>

          {/* Right Status Indicator */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>FastAPI & SQLite Active</span>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto p-8 bg-[#090d16]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
