import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { configError } from './lib/supabase';
import { AuthProvider } from './features/auth/AuthProvider';
import { ConfigError } from './components/ConfigError';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// Check configuration before mounting anything. A missing env var used to
// throw during import, which produced a blank page and no visible explanation.
if (configError) {
  root.render(
    <React.StrictMode>
      <ConfigError message={configError} />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </HashRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
