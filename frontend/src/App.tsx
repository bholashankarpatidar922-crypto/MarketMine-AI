import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectOverviewPage } from './pages/ProjectOverviewPage';
import { DataUploadPage } from './pages/DataUploadPage';
import { DataExplorerPage } from './pages/DataExplorerPage';
import { DataCleaningPage } from './pages/DataCleaningPage';
import { DataWarehousePage } from './pages/DataWarehousePage';
import { DataMiningPage } from './pages/DataMiningPage';
import { AICopilotPage } from './pages/AICopilotPage';
import { SQLLabPage } from './pages/SQLLabPage';
import { ReportsPage } from './pages/ReportsPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<ProjectOverviewPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="upload" element={<DataUploadPage />} />
            <Route path="explorer" element={<DataExplorerPage />} />
            <Route path="preparation" element={<DataCleaningPage />} />
            <Route path="warehouse" element={<DataWarehousePage />} />
            <Route path="mining" element={<DataMiningPage />} />
            <Route path="copilot" element={<AICopilotPage />} />
            <Route path="sql" element={<SQLLabPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>

          {/* Any unknown route redirects back to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
