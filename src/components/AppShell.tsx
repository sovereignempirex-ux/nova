import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Compass,
  DownloadCloud,
  Film,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  ServerCog,
  SlidersHorizontal,
  Sun,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { useTheme } from '../lib/ThemeContext';
import { PWAInstallButton } from './PWAInstallButton';
import { OfflineIndicator } from './OfflineIndicator';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, authReady, authError, signInWithGoogle, signOut, clearAuthError } = useAuth();
  const { lang, dir, supportedLanguages, setLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const navItems = [
    { to: '/', label: t('overview'), icon: LayoutGrid, exact: true },
    { to: '/ai-studio', label: t('aiStudio'), icon: MessageSquare },
    { to: '/image-studio', label: t('imageStudio'), icon: ImageIcon },
    { to: '/image-enhancer', label: t('imageEnhancer'), icon: SlidersHorizontal },
    { to: '/search', label: t('search'), icon: Compass },
    { to: '/watch', label: t('watchPlayer'), icon: Video },
    { to: '/downloader', label: t('downloader'), icon: DownloadCloud },
    { to: '/anime', label: t('animeHub'), icon: Film },
  ];

  const controlNavItems = [
    { to: '/docs/api-gateway', label: t('apiReference'), icon: BookOpen },
    { to: '/admin', label: t('apiAdmin'), icon: ServerCog },
    { to: '/seo-admin', label: t('seoEngine'), icon: BarChart3 },
  ];

  const topNavLinks = [
    { to: '/ai-studio', label: t('aiStudio') },
    { to: '/image-studio', label: t('imageStudio') },
    { to: '/image-enhancer', label: t('enhancerShort') },
    { to: '/search', label: t('search') },
    { to: '/anime', label: t('animeHub') },
  ];

  const currentModule =
    [...navItems, ...controlNavItems].find((item) =>
      'exact' in item && item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to)
    )?.label ?? 'Workspace';

  return (
    <div dir={dir} className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#090B10] dark:text-slate-100">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        aria-label="Workspace Navigation"
        className={`fixed inset-y-0 start-0 z-50 w-64 flex flex-col border-e border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1017] transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : dir === 'rtl' ? 'translate-x-full' : '-translate-x-full'
        }`}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800/80">
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            NOVA
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-1">
            <p className="px-3 pb-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
              {t('platformAdmin')}
            </p>
            {controlNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer: 39-Language Selector, Theme & Account */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
          <label className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-900/70">
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <Globe className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
              <span>{t('languageLabel')}</span>
            </span>
            <select
              aria-label="Select interface language"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="max-w-[125px] bg-transparent font-mono text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none truncate"
            >
              {supportedLanguages.map((l) => (
                <option key={l.code} value={l.code} className="bg-white dark:bg-[#0D1017]">
                  {l.code} · {l.nativeName}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
          >
            <span>{theme === 'dark' ? t('darkWorkspace') : t('lightWorkspace')}</span>
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-slate-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-500" aria-hidden="true" />
            )}
          </button>

          {authError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400 space-y-1">
              <p className="break-words">{authError}</p>
              <button
                type="button"
                onClick={clearAuthError}
                className="underline font-medium"
              >
                Dismiss
              </button>
            </div>
          )}

          {!authReady ? (
            <div className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
          ) : user ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {user.displayName || 'Signed In'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('cloudSyncActive')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors shrink-0"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t('signInGoogle')}</span>
            </button>
          )}

          <div className="pt-0.5">
            <PWAInstallButton compact />
          </div>

          <p className="px-3 pt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
            Vanitas Ecosystem · nova.vanitasbot.my.id
          </p>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Strict 3-Zone Top Bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-8 px-4 lg:px-8 border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#090B10]/95 backdrop-blur-sm">
          {/* Zone 1: Mobile trigger + Single-line context */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ms-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
              {currentModule}
            </span>
          </div>

          {/* Zone 2: 5 clean single-line text nav links */}
          <nav
            aria-label="Primary modules"
            className="hidden xl:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
          >
            {topNavLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 dark:hover:text-white ${
                    isActive
                      ? 'text-slate-900 dark:text-white underline underline-offset-8 decoration-2 decoration-blue-600'
                      : ''
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/ai-studio"
              className="inline-flex items-center px-3.5 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              {t('launchAiStudio')}
            </Link>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          {children}
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800/80 px-4 lg:px-8 py-5 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <span>{t('footerTagline')}</span>
          <div className="flex items-center gap-4">
            <a href="/sitemap.xml" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
              Sitemap
            </a>
            <a href="/robots.txt" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
              Robots
            </a>
            <a
              href="https://nova.vanitasbot.my.id"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              nova.vanitasbot.my.id
            </a>
          </div>
        </footer>
      </div>

      <OfflineIndicator />
    </div>
  );
};
