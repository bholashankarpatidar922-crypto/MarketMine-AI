import axios from 'axios';
import type {
  AuthResponse,
  User,
  Project,
  Dataset,
  DatasetRowsResponse,
  ProfilingResult,
  CapabilitiesResult,
  Pipeline,
  TransformationStep,
  WarehouseModel,
  MiningExperiment,
  AIMessage,
  Report,
  SavedQuery,
  BackgroundJob,
} from '../types';

const API_BASE = '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token automatically
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('mm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor for 401 handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mm_token');
      localStorage.removeItem('mm_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Auth
  auth: {
    login: async (username: string, password: string): Promise<AuthResponse> => {
      const res = await apiClient.post<AuthResponse>('/auth/login', { username, password });
      return res.data;
    },
    register: async (email: string, username: string, password: string, full_name?: string): Promise<AuthResponse> => {
      const res = await apiClient.post<AuthResponse>('/auth/register', { email, username, password, full_name });
      return res.data;
    },
    me: async (): Promise<User> => {
      const res = await apiClient.get<User>('/auth/me');
      return res.data;
    },
  },

  // Projects
  projects: {
    list: async (): Promise<Project[]> => {
      const res = await apiClient.get<Project[]>('/projects/');
      return res.data;
    },
    get: async (id: string): Promise<Project> => {
      const res = await apiClient.get<Project>(`/projects/${id}`);
      return res.data;
    },
    create: async (
      nameOrPayload: string | { name: string; description?: string; domain?: string },
      description: string = '',
      domain: string = 'general'
    ): Promise<Project> => {
      let body;
      if (typeof nameOrPayload === 'object' && nameOrPayload !== null) {
        body = {
          name: nameOrPayload.name,
          description: nameOrPayload.description || '',
          domain: nameOrPayload.domain || 'general',
        };
      } else {
        body = { name: nameOrPayload, description, domain };
      }
      const res = await apiClient.post<Project>('/projects/', body);
      return res.data;
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/projects/${id}`);
    },
  },

  // Ingestion
  ingestion: {
    upload: async (projectId: string, file: File): Promise<any> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId);
      const res = await apiClient.post('/ingestion/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    preview: async (fileId: string): Promise<any> => {
      const res = await apiClient.get(`/ingestion/preview/${fileId}`);
      return res.data;
    },
    importFile: async (fileId: string, payload: {
      dataset_name: string;
      destination_table?: string;
      strategy?: 'replace' | 'append';
      column_types?: Record<string, string>;
    }): Promise<{ dataset_id: string; job_id: string; row_count: number }> => {
      const res = await apiClient.post(`/ingestion/import/${fileId}`, payload);
      return res.data;
    },
    loadSample: async (projectId: string): Promise<any> => {
      const res = await apiClient.post('/ingestion/sample', { project_id: projectId });
      return res.data;
    },
  },

  // Datasets
  datasets: {
    listByProject: async (projectId: string): Promise<Dataset[]> => {
      const res = await apiClient.get<Dataset[]>(`/datasets/project/${projectId}`);
      return res.data;
    },
    get: async (id: string): Promise<Dataset> => {
      const res = await apiClient.get<Dataset>(`/datasets/${id}`);
      return res.data;
    },
    getRows: async (
      id: string,
      params: {
        page?: number;
        page_size?: number;
        sort_col?: string;
        sort_dir?: 'asc' | 'desc';
        filter_col?: string;
        filter_val?: string;
      } = {}
    ): Promise<DatasetRowsResponse> => {
      const res = await apiClient.get<DatasetRowsResponse>(`/datasets/${id}/rows`, { params });
      return res.data;
    },
    profile: async (id: string): Promise<ProfilingResult> => {
      const res = await apiClient.post<ProfilingResult>(`/datasets/${id}/profile`);
      return res.data;
    },
    capabilities: async (id: string): Promise<CapabilitiesResult> => {
      const res = await apiClient.get<CapabilitiesResult>(`/datasets/${id}/capabilities`);
      return res.data;
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/datasets/${id}`);
    },
    exportUrl: (id: string) => `${API_BASE}/datasets/${id}/export`,
  },

  // Pipelines
  pipelines: {
    list: async (projectId: string): Promise<Pipeline[]> => {
      const res = await apiClient.get<Pipeline[]>(`/pipelines/project/${projectId}`);
      return res.data;
    },
    create: async (data: {
      project_id: string;
      name: string;
      source_dataset_id: string;
      target_dataset_name: string;
      steps: TransformationStep[];
    }): Promise<Pipeline> => {
      const res = await apiClient.post<Pipeline>('/pipelines/', data);
      return res.data;
    },
    preview: async (data: {
      source_dataset_id: string;
      steps: TransformationStep[];
    }): Promise<any> => {
      const res = await apiClient.post('/pipelines/preview', data);
      return res.data;
    },
    run: async (pipelineId: string): Promise<any> => {
      const res = await apiClient.post(`/pipelines/${pipelineId}/run`);
      return res.data;
    },
  },

  // Warehouse
  warehouse: {
    listModels: async (projectId: string): Promise<WarehouseModel[]> => {
      const res = await apiClient.get<WarehouseModel[]>(`/warehouse/models/project/${projectId}`);
      return res.data;
    },
    createModel: async (data: {
      project_id: string;
      name: string;
      model_type: string;
      grain: string;
      description?: string;
      fact_table_name: string;
      dimension_tables: string[];
    }): Promise<WarehouseModel> => {
      const res = await apiClient.post<WarehouseModel>('/warehouse/models', data);
      return res.data;
    },
    runETL: async (projectId: string, payload: {
      source_dataset_id: string;
      destination_layer: string;
      load_strategy: 'full_refresh' | 'append' | 'scd2';
    }): Promise<any> => {
      const res = await apiClient.post('/warehouse/etl', { project_id: projectId, ...payload });
      return res.data;
    },
    runOLAP: async (payload: {
      table_name: string;
      dimensions: string[];
      measures: { column: string; agg: string }[];
      filters?: Record<string, any>;
    }): Promise<any> => {
      const res = await apiClient.post('/warehouse/olap/cube', payload);
      return res.data;
    },
    getLineage: async (projectId: string): Promise<any[]> => {
      const res = await apiClient.get(`/warehouse/lineage/${projectId}`);
      return res.data;
    },
  },

  // Mining
  mining: {
    runEDA: async (datasetId: string): Promise<any> => {
      const res = await apiClient.post(`/mining/eda/${datasetId}`);
      return res.data;
    },
    runClustering: async (payload: {
      dataset_id: string;
      features: string[];
      n_clusters?: number;
      algorithm?: string;
    }): Promise<any> => {
      const res = await apiClient.post('/mining/clustering', payload);
      return res.data;
    },
    runAssociationRules: async (payload: {
      dataset_id: string;
      transaction_col: string;
      item_col: string;
      min_support?: number;
      min_confidence?: number;
    }): Promise<any> => {
      const res = await apiClient.post('/mining/association-rules', payload);
      return res.data;
    },
    runClassification: async (payload: {
      dataset_id: string;
      target_col: string;
      feature_cols: string[];
      algorithm?: string;
    }): Promise<any> => {
      const res = await apiClient.post('/mining/classification', payload);
      return res.data;
    },
    runRegression: async (payload: {
      dataset_id: string;
      target_col: string;
      feature_cols: string[];
      algorithm?: string;
    }): Promise<any> => {
      const res = await apiClient.post('/mining/regression', payload);
      return res.data;
    },
    runAnomaly: async (payload: {
      dataset_id: string;
      feature_cols: string[];
      method?: string;
    }): Promise<any> => {
      const res = await apiClient.post('/mining/anomaly', payload);
      return res.data;
    },
    runForecast: async (payload: {
      dataset_id: string;
      date_col: string;
      target_col: string;
      horizon?: number;
    }): Promise<any> => {
      const res = await apiClient.post('/mining/forecast', payload);
      return res.data;
    },
    listExperiments: async (projectId: string): Promise<MiningExperiment[]> => {
      const res = await apiClient.get<MiningExperiment[]>(`/mining/experiments/${projectId}`);
      return res.data;
    },
  },

  // AI & Copilot
  ai: {
    chat: async (payload: {
      project_id: string;
      message: string;
      dataset_id?: string;
      conversation_id?: string;
    }): Promise<any> => {
      const res = await apiClient.post('/ai/chat', payload);
      return res.data;
    },
    nl2sql: async (payload: {
      project_id: string;
      natural_language_query: string;
      dataset_id?: string;
    }): Promise<any> => {
      const res = await apiClient.post('/ai/nl2sql', payload);
      return res.data;
    },
    generateReport: async (payload: {
      project_id: string;
      dataset_id: string;
      report_type: string;
    }): Promise<any> => {
      const res = await apiClient.post('/ai/report', payload);
      return res.data;
    },
  },

  // Reports
  reports: {
    list: async (projectId: string): Promise<Report[]> => {
      const res = await apiClient.get<Report[]>(`/reports/project/${projectId}`);
      return res.data;
    },
    get: async (id: string): Promise<Report> => {
      const res = await apiClient.get<Report>(`/reports/${id}`);
      return res.data;
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/reports/${id}`);
    },
  },

  // SQL Lab
  sql: {
    execute: async (projectId: string, sqlText: string): Promise<any> => {
      const res = await apiClient.post('/sql/execute', { project_id: projectId, sql: sqlText });
      return res.data;
    },
    listQueries: async (projectId: string): Promise<SavedQuery[]> => {
      const res = await apiClient.get<SavedQuery[]>(`/sql/queries/project/${projectId}`);
      return res.data;
    },
    saveQuery: async (data: {
      project_id: string;
      name: string;
      sql_text: string;
      description?: string;
    }): Promise<SavedQuery> => {
      const res = await apiClient.post<SavedQuery>('/sql/queries', data);
      return res.data;
    },
  },

  // Jobs & Health
  system: {
    health: async (): Promise<any> => {
      const res = await apiClient.get('/health');
      return res.data;
    },
    getJob: async (jobId: string): Promise<BackgroundJob> => {
      const res = await apiClient.get<BackgroundJob>(`/jobs/${jobId}`);
      return res.data;
    },
  },
};
