import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Project } from '../types';
import { api } from '../services/api';

const DEFAULT_USER: User = {
  id: 'default-admin',
  email: 'admin@marketmine.ai',
  username: 'bholashankar',
  full_name: 'Bholashankar Patidar',
  role: 'admin',
  is_active: true,
  created_at: new Date().toISOString(),
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  login: (username: string, pass: string) => Promise<void>;
  register: (email: string, username: string, pass: string, name?: string) => Promise<void>;
  logout: () => void;
  setActiveProject: (proj: Project | null) => void;
  refreshProjects: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('mm_user');
    return saved ? JSON.parse(saved) : DEFAULT_USER;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('mm_token'));
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(() => {
    const saved = localStorage.getItem('mm_active_project');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);

  const setActiveProject = (proj: Project | null) => {
    setActiveProjectState(proj);
    if (proj) {
      localStorage.setItem('mm_active_project', JSON.stringify(proj));
    } else {
      localStorage.removeItem('mm_active_project');
    }
  };

  const refreshProjects = async () => {
    try {
      let list = await api.projects.list();
      if (!list || list.length === 0) {
        // Create an initial default workspace if none exists
        try {
          const newProj = await api.projects.create({
            name: 'Global E-Commerce Analytics',
            description: 'Default production workspace with retail intelligence and AI analytics.',
            domain: 'ecommerce',
          });
          list = [newProj];
        } catch (err) {
          console.warn('Could not auto-create project:', err);
        }
      }
      setProjects(list || []);
      if (list && list.length > 0) {
        if (!activeProject) {
          setActiveProject(list[0]);
        } else {
          const found = list.find((p) => p.id === activeProject.id);
          setActiveProject(found || list[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load projects', e);
    }
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  const login = async () => {
    setUser(DEFAULT_USER);
  };

  const register = async () => {
    setUser(DEFAULT_USER);
  };

  const logout = () => {
    // Keep user logged in
    setUser(DEFAULT_USER);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        projects,
        activeProject,
        loading,
        login,
        register,
        logout,
        setActiveProject,
        refreshProjects,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
