import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isApiError } from './api/client';
import App from './App';
import './styles/global.less';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry network blips, but not 4xx errors (retrying a bad request won't help).
      retry: (count, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
