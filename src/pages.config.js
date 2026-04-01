import React from 'react';
import __Layout from './Layout.jsx';

export const PAGES = {
    "Browse": React.lazy(() => import('./pages/Browse')),
    "Home": React.lazy(() => import('./pages/Home')),
    "ProviderDashboard": React.lazy(() => import('./pages/ProviderDashboard')),
    "ViewProfile": React.lazy(() => import('./pages/ViewProfile')),
    "ProviderSignup": React.lazy(() => import('./pages/ProviderSignup')),
    "Pricing": React.lazy(() => import('./pages/Pricing')),
    "Trust": React.lazy(() => import('./pages/Trust')),
    "AdminDashboard": React.lazy(() => import('./pages/AdminDashboard')),
    "Login": React.lazy(() => import('./pages/Login')),
    "Register": React.lazy(() => import('./pages/Register')),
};

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
