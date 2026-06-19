import React, { Suspense } from 'react'
import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { setupIframeMessaging } from './lib/iframe-messaging';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppErrorBoundary from '@/components/AppErrorBoundary';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

function resolvePageKey(pathname) {
  const raw = pathname.replace(/^\//, "") || mainPageKey;
  const lower = raw.toLowerCase();
  if (lower === "login" || lower.startsWith("login/")) return "Login";
  if (lower === "register" || lower.startsWith("register/")) return "Register";
  if (Pages[raw]) return raw;
  const match = Object.keys(Pages).find((key) => key.toLowerCase() === lower);
  return match ?? raw;
}

setupIframeMessaging();

const FullScreenSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <FullScreenSpinner />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  const pathKey = resolvePageKey(location.pathname);
  const currentPageName = Pages[pathKey] ? pathKey : mainPageKey;

  return (
    <LayoutWrapper currentPageName={currentPageName}>
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/" element={MainPage ? <MainPage /> : null} />
          {/* Clerk path routing needs wildcards for verify-email, SSO callback, etc. */}
          <Route path="/login/*" element={Pages.Login ? <Pages.Login /> : null} />
          <Route path="/register/*" element={Pages.Register ? <Pages.Register /> : null} />
          {/* SEO routes: sitemap & external links use /city/:slug and /profile/:slug */}
          <Route path="/city/:citySlug" element={Pages.Browse ? <Pages.Browse /> : null} />
          <Route path="/profile/:profileSlug" element={Pages.ViewProfile ? <Pages.ViewProfile /> : null} />
          {Object.entries(Pages).map(([path, Page]) => (
            <React.Fragment key={path}>
              <Route path={`/${path}`} element={<Page />} />
              <Route path={`/${path.toLowerCase()}`} element={<Page />} />
            </React.Fragment>
          ))}
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </LayoutWrapper>
  );
};

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <VisualEditAgent />
        </QueryClientProvider>
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App
