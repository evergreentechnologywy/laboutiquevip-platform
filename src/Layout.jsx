// @ts-nocheck
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Search, LayoutDashboard, MessageSquare, Calendar, Megaphone, Crown, Shield, User } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const publicNavigation = [
  { title: "Home", url: createPageUrl("Home"), icon: Home },
  { title: "Browse", url: createPageUrl("Browse"), icon: Search },
];

const providerNavigation = [
  { title: "Overview", url: createPageUrl("ProviderDashboard?tab=overview"), icon: LayoutDashboard },
  { title: "Profile", url: createPageUrl("ProviderDashboard?tab=profile"), icon: User },
  { title: "Ads", url: createPageUrl("ProviderDashboard?tab=ads"), icon: Megaphone },
  { title: "Bookings", url: createPageUrl("ProviderDashboard?tab=bookings"), icon: Calendar },
  { title: "Messages", url: createPageUrl("ProviderDashboard?tab=messages"), icon: MessageSquare },
];

const adminNavigation = [
  { title: "Admin Dashboard", url: createPageUrl("AdminDashboard"), icon: Shield },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);
  const [ageGateAccepted, setAgeGateAccepted] = React.useState(() => localStorage.getItem("lbv_age_gate_accepted") === "yes");

  React.useEffect(() => {
    const loadUser = async () => {
      if (!base44.auth.hasToken()) {
        setUser(null);
        return;
      }

      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch {
        setUser(null);
      }
    };
    loadUser();
  }, []);

  const isProviderPage = currentPageName?.startsWith("Provider") || currentPageName?.startsWith("Admin");
  const fullPath = `${location.pathname}${location.search}`;

  const acceptAgeGate = () => {
    localStorage.setItem("lbv_age_gate_accepted", "yes");
    setAgeGateAccepted(true);
  };

  return (
    <SidebarProvider>
      <style>{`
        :root {
          --background: 0 0% 8%;
          --foreground: 0 0% 98%;
          --card: 0 0% 12%;
          --card-foreground: 0 0% 98%;
          --primary: 345 85% 55%;
          --primary-foreground: 0 0% 98%;
          --secondary: 35 65% 55%;
          --secondary-foreground: 0 0% 10%;
          --muted: 0 0% 20%;
          --muted-foreground: 0 0% 70%;
          --accent: 345 75% 45%;
          --accent-foreground: 0 0% 98%;
          --border: 0 0% 25%;
          --input: 0 0% 25%;
          --ring: 345 85% 55%;
        }
      `}</style>
      <div className="min-h-screen flex w-full bg-zinc-950 text-zinc-100">
        {!isProviderPage && (
          <Dialog open={!ageGateAccepted}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 [&>button]:hidden">
              <DialogHeader>
                <DialogTitle>Adults only</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm text-zinc-300 leading-6">
                <p>
                  This site is intended only for adults 18+. By continuing, you confirm you are of legal age in your jurisdiction and agree to use the platform lawfully and respectfully.
                </p>
                <p className="text-zinc-400">
                  Verification, availability, and premium placement are subject to review and may change. Booking requests are enquiries until confirmed.
                </p>
                <div className="flex gap-3 pt-2">
                  <Button onClick={acceptAgeGate} className="flex-1 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600">
                    I am 18+ and continue
                  </Button>
                  <Button variant="outline" className="flex-1 border-zinc-700 text-zinc-300" onClick={() => window.location.href = 'https://www.google.com'}>
                    Leave site
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {isProviderPage && user && (
          <Sidebar className="border-r border-zinc-800 bg-zinc-950">
            <SidebarHeader className="border-b border-zinc-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-amber-500 rounded-lg flex items-center justify-center">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-100 leading-tight">La Boutique Vip</h2>
                  <p className="text-xs text-zinc-400">International</p>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent className="p-2">
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-2 py-2">
                  Provider
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {providerNavigation.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`hover:bg-zinc-900 hover:text-rose-400 transition-colors duration-200 rounded-lg mb-1 ${fullPath === item.url ? "bg-zinc-900 text-rose-400" : "text-zinc-400"}`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                            <item.icon className="w-4 h-4" />
                            <span className="font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                    {user?.role === "admin" && adminNavigation.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`hover:bg-zinc-900 hover:text-amber-400 transition-colors duration-200 rounded-lg mb-1 ${location.pathname === item.url ? "bg-zinc-900 text-amber-400" : "text-zinc-400"}`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                            <item.icon className="w-4 h-4" />
                            <span className="font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-2 py-2">
                  Public
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {publicNavigation.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild className="hover:bg-zinc-900 hover:text-zinc-200 transition-colors rounded-lg mb-1 text-zinc-400">
                          <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                            <item.icon className="w-4 h-4" />
                            <span className="font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="border-t border-zinc-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-amber-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-sm">{user?.full_name?.[0]?.toUpperCase() || "U"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-100 text-sm truncate">{user?.full_name}</p>
                    <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                  </div>
                </div>
              </div>
            </SidebarFooter>
          </Sidebar>
        )}

        <main className="flex-1 flex flex-col">
          {!isProviderPage && (
            <nav className="bg-zinc-950 border-b border-zinc-800">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <Link to={createPageUrl("Home")} className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-amber-500 rounded-lg flex items-center justify-center">
                      <Crown className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-lg font-bold bg-gradient-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">La Boutique Vip</span>
                      <span className="text-xs text-zinc-500">International</span>
                    </div>
                  </Link>

                  <div className="flex items-center gap-6">
                    {publicNavigation.map((item) => (
                      <Link
                        key={item.title}
                        to={item.url}
                        className={`text-sm font-medium transition-colors ${location.pathname === item.url ? "text-rose-400" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        {item.title}
                      </Link>
                    ))}

                    {user ? (
                      <>
                        <Link to={createPageUrl("ProviderDashboard")} className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors">
                          Dashboard
                        </Link>
                        <button onClick={() => base44.auth.logout()} className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                          Logout
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => base44.auth.redirectToLogin()}
                        className="px-4 py-2 bg-gradient-to-r from-rose-500 to-amber-500 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-rose-500/20 transition-all"
                      >
                        Sign In
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </nav>
          )}

          {isProviderPage && (
            <header className="bg-zinc-950 border-b border-zinc-800 px-6 py-4 md:hidden">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="hover:bg-zinc-900 p-2 rounded-lg transition-colors duration-200" />
                <div className="flex flex-col leading-tight">
                  <h1 className="text-lg font-semibold">La Boutique Vip</h1>
                  <span className="text-xs text-zinc-500">International</span>
                </div>
              </div>
            </header>
          )}

          <div className="flex-1 overflow-auto">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
