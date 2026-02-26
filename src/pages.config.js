import Browse from './pages/Browse';
import Home from './pages/Home';
import ProviderDashboard from './pages/ProviderDashboard';
import ViewProfile from './pages/ViewProfile';
import ProviderSignup from './pages/ProviderSignup';
import AdminDashboard from './pages/AdminDashboard';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Browse": Browse,
    "Home": Home,
    "ProviderDashboard": ProviderDashboard,
    "ViewProfile": ViewProfile,
    "ProviderSignup": ProviderSignup,
    "AdminDashboard": AdminDashboard,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};