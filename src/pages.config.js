import React from 'react';
import __Layout from './Layout.jsx';

export const PAGES = {
    "Browse": React.lazy(() => import('./pages/Browse')),
    "BrowseStates": React.lazy(() => import('./pages/BrowseStates')),
    "StateDetail": React.lazy(() => import('./pages/StateDetail')),
    "Home": React.lazy(() => import('./pages/Home')),
    "ProviderDashboard": React.lazy(() => import('./pages/ProviderDashboard')),
    "ViewProfile": React.lazy(() => import('./pages/ViewProfile')),
    "ProviderSignup": React.lazy(() => import('./pages/ProviderSignup')),
    "provider-onboarding": React.lazy(() => import('./pages/ProviderSignup')),
    "Pricing": React.lazy(() => import('./pages/Pricing')),
    "Trust": React.lazy(() => import('./pages/Trust')),
    "AdminDashboard": React.lazy(() => import('./pages/AdminDashboard')),
    "DevDashboard": React.lazy(() => import('./pages/DevDashboard')),
    "Login": React.lazy(() => import('./pages/Login')),
    "Register": React.lazy(() => import('./pages/Register')),
    "AuthContinue": React.lazy(() => import('./pages/AuthContinue')),
    "Terms": React.lazy(() => import('./pages/Terms')),
    "Privacy": React.lazy(() => import('./pages/Privacy')),
    "Contact": React.lazy(() => import('./pages/Contact')),
    "FAQ": React.lazy(() => import('./pages/FAQ')),
    "DMCA": React.lazy(() => import('./pages/DMCA')),
};

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
