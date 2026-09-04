import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { LocaleProvider } from './i18n/useLocale'
import { registerServiceWorker } from './lib/serviceWorker'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A PR list is cheap to refetch and expensive to be wrong about, but
      // refetching on every window focus burns rate limit for no benefit when
      // the poll interval already covers it.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </LocaleProvider>
  </StrictMode>,
)
