import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/AppShell';
import { AuthProvider } from './lib/AuthContext';
import { LanguageProvider } from './lib/LanguageContext';
import { ThemeProvider } from './lib/ThemeContext';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const AiStudioPage = lazy(() => import('./pages/AiStudioPage').then((m) => ({ default: m.AiStudioPage })));
const ImageStudioPage = lazy(() => import('./pages/ImageStudioPage').then((m) => ({ default: m.ImageStudioPage })));
const ImageEnhancerPage = lazy(() => import('./pages/ImageEnhancerPage').then((m) => ({ default: m.ImageEnhancerPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const DownloaderPage = lazy(() => import('./pages/DownloaderPage').then((m) => ({ default: m.DownloaderPage })));
const AnimeHubPage = lazy(() => import('./pages/AnimeHubPage').then((m) => ({ default: m.AnimeHubPage })));
const AnimeDetailPage = lazy(() => import('./pages/AnimeDetailPage').then((m) => ({ default: m.AnimeDetailPage })));
const WatchPage = lazy(() => import('./pages/WatchPage').then((m) => ({ default: m.WatchPage })));
const AdminConsolePage = lazy(() => import('./pages/AdminConsolePage').then((m) => ({ default: m.AdminConsolePage })));
const SeoAdminPage = lazy(() => import('./pages/SeoAdminPage').then((m) => ({ default: m.SeoAdminPage })));
const ProgrammaticToolPage = lazy(() =>
  import('./pages/ProgrammaticToolPage').then((m) => ({ default: m.ProgrammaticToolPage }))
);
const ModelDetailPage = lazy(() => import('./pages/ModelDetailPage').then((m) => ({ default: m.ModelDetailPage })));
const DocsGuidePage = lazy(() => import('./pages/DocsGuidePage').then((m) => ({ default: m.DocsGuidePage })));

const PageFallback: React.FC = () => (
  <div className="max-w-5xl mx-auto px-4 lg:px-8 py-12 space-y-4">
    <div className="h-7 w-48 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
    <div className="h-32 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-28 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
      <div className="h-28 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppShell>
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/ai-studio" element={<AiStudioPage />} />
                    <Route path="/image-studio" element={<ImageStudioPage />} />
                    <Route path="/image-enhancer" element={<ImageEnhancerPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/watch" element={<WatchPage />} />
                    <Route path="/downloader" element={<DownloaderPage />} />
                    <Route path="/anime" element={<AnimeHubPage />} />
                    <Route path="/anime/:id" element={<AnimeDetailPage />} />

                    {/* Programmatic SEO & Documentation Routes */}
                    <Route path="/:lang/tools/:slug" element={<ProgrammaticToolPage />} />
                    <Route path="/models/:slug" element={<ModelDetailPage />} />
                    <Route path="/categories/:slug" element={<DocsGuidePage />} />
                    <Route path="/docs/:slug" element={<DocsGuidePage />} />
                    <Route path="/guides/:slug" element={<DocsGuidePage />} />

                    {/* Protected Admin Consoles */}
                    <Route path="/admin" element={<AdminConsolePage />} />
                    <Route path="/seo-admin" element={<SeoAdminPage />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </AppShell>
            </BrowserRouter>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
