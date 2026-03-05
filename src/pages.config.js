import Browse from './pages/Browse';
import Home from './pages/Home';
import ProviderDashboard from './pages/ProviderDashboard';
import ViewProfile from './pages/ViewProfile';
import ProviderSignup from './pages/ProviderSignup';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import __Layout from './Layout.jsx';

export const PAGES = {
    "Browse": Browse,
    "Home": Home,
    "ProviderDashboard": ProviderDashboard,
    "ViewProfile": ViewProfile,
    "ProviderSignup": ProviderSignup,
    "AdminDashboard": AdminDashboard,
    "Login": Login,
    "Register": Register,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
