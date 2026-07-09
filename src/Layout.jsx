// @ts-nocheck
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Search, LayoutDashboard, MessageSquare, Calendar, Megaphone, Crown, Shield, User, Sparkles, Menu } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { Footer } from "@/components/Footer";
import AdvertisingCopilot from "@/components/AdvertisingCopilot";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const publicNavigation = [
  { title: "Home", url: createPageUrl("Home"), icon: Home },
  { title: "Browse", url: createPageUrl("Browse"), icon: Search },
  { title: "Pricing", url: createPageUrl("Pricing"), icon: Crown },
  { title: "Trust", url: createPageUrl("Trust"), icon: Shield },
  { title: "FAQ", url: createPageUrl("FAQ"), icon: MessageSquare },
  { title: "Contact", url: createPageUrl("Contact"), icon: MessageSquare },
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
  const [ageGateAccepted, setAgeGateAccepted] = React.useState(() => sessionStorage.getItem("lbv_age_gate_accepted") === "yes");
  const [agreementAccepted, setAgreementAccepted] = React.useState(false);
  const [copilotOpen, setCopilotOpen] = React.useState(false);
  const [fabHidden, setFabHidden] = React.useState(false);
  const lastScrollTopRef = React.useRef(0);

  // Hide the copilot FAB while scrolling down so it never blocks card CTAs
  // or the profile Rates/enquiry sidebar; reveal it again on scroll up.
  React.useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      const delta = current - lastScrollTopRef.current;
      if (current > 160 && delta > 4) setFabHidden(true);
      else if (delta < -4 || current <= 160) setFabHidden(false);
      lastScrollTopRef.current = current;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
  // Auth screens render Clerk's own card — showing the age gate on top of it
  // creates a double overlay, so the gate is deferred to the rest of the site.
  const isAuthPage = currentPageName === "Login" || currentPageName === "Register";
  const fullPath = `${location.pathname}${location.search}`;

  const isNavActive = (item) => {
    if (location.pathname === item.url) return true;
    if (item.title === "Browse") {
      return location.pathname.startsWith("/city/") || location.pathname.toLowerCase().startsWith("/viewprofile") || location.pathname.startsWith("/profile/");
    }
    return false;
  };

  const acceptAgeGate = () => {
    sessionStorage.setItem("lbv_age_gate_accepted", "yes");
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
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-amber-500 focus:text-black focus:px-4 focus:py-2 focus:text-sm focus:font-semibold">Skip to main content</a>
        {!isProviderPage && !isAuthPage && (
          <Dialog open={!ageGateAccepted} modal={true} onOpenChange={() => {}}>
            <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 [&>button]:hidden p-4 sm:p-6 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100 font-serif">Adults only</DialogTitle>
                <DialogDescription className="text-zinc-400 text-sm leading-6">
                  This site is intended only for adults 18+. By continuing, you confirm you are of legal age in your jurisdiction and agree to use the platform lawfully and respectfully.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm leading-6 text-zinc-400">
                <div className="flex items-start space-x-3 pt-2">
                  <input
                    type="checkbox"
                    id="age-agree"
                    className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-rose-500 focus:ring-rose-500/30"
                    onChange={(e) => setAgreementAccepted(e.target.checked)}
                  />
                  <Label htmlFor="age-agree" className="text-xs leading-5 text-zinc-400 cursor-pointer">
                    I agree to the <Link to={createPageUrl("Terms")} className="text-amber-400 underline underline-offset-4 hover:text-amber-300">Terms of Service</Link> and confirm I am 18+ years of age.
                  </Label>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button 
                    onClick={acceptAgeGate} 
                    disabled={!agreementAccepted}
                    className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 disabled:opacity-50 border-0"
                  >
                    Enter site
                  </Button>
                  <Button variant="outline" className="flex-1 rounded-full border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800" onClick={() => window.location.href = 'https://www.google.com'}>
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

        <main className="flex-1 flex flex-col" id="main-content">
          {!isProviderPage && (
            <nav className="border-b border-zinc-800/40 bg-zinc-950/80 backdrop-blur-2xl sticky top-0 z-30 shadow-sm shadow-black/50">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 sm:h-20 items-center justify-between">
                  <Link to={createPageUrl("Home")} className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-white">
                      <Crown className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm sm:text-base font-serif font-bold tracking-tight text-zinc-100 text-gradient-gold">
                        La Boutique VIP<span className="hidden sm:inline"> International</span>
                      </span>
                      <span className="hidden sm:block text-xs text-zinc-500">Curated, discreet discovery</span>
                    </div>
                  </Link>

                  <div className="flex items-center gap-3 sm:gap-6">
                    <div className="hidden sm:flex items-center gap-3 sm:gap-6">
                    {publicNavigation.map((item) => (
                      <Link
                        key={item.title}
                        to={item.url}
                        aria-current={isNavActive(item) ? "page" : undefined}
                        className={`text-xs sm:text-sm font-medium transition-colors ${isNavActive(item) ? "text-amber-400" : "text-zinc-400 hover:text-zinc-100"} ${item.title === "Home" ? "hidden sm:block" : ""}`}
                      >
                        {item.title}
                      </Link>
                    ))}
                    </div>

                    <Sheet>
                      <SheetTrigger asChild className="sm:hidden">
                        <Button variant="outline" size="icon" className="h-11 w-11 border-zinc-700 bg-zinc-900 text-zinc-200">
                          <Menu className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="bg-zinc-950 border-zinc-800 text-zinc-100">
                        <SheetHeader>
                          <SheetTitle className="text-zinc-100">Menu</SheetTitle>
                        </SheetHeader>
                        <nav className="mt-6 flex flex-col gap-2">
                          {publicNavigation.map((item) => (
                            <Link
                              key={item.title}
                              to={item.url}
                              aria-current={isNavActive(item) ? "page" : undefined}
                              className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium ${isNavActive(item) ? "bg-zinc-900 text-amber-400" : "text-zinc-300 hover:bg-zinc-900"}`}
                            >
                              {item.title}
                            </Link>
                          ))}
                        </nav>
                      </SheetContent>
                    </Sheet>

                    {user ? (
                      <>
                        <Link to={createPageUrl("ProviderDashboard")} className="text-sm font-medium text-zinc-200 transition-colors hover:text-amber-400">
                          Dashboard
                        </Link>
                        <button onClick={() => base44.auth.logout()} className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200">
                          Logout
                        </button>
                      </>
                    ) : !isAuthPage && (
                      <button
                        onClick={() => base44.auth.redirectToLogin()}
                        className="min-h-11 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
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

          <div className="flex-1 overflow-auto">
            {children}
            {!isProviderPage && <Footer />}
          </div>

          {/* Back to top */}
          <BackToTop />

          {!isProviderPage && !isAuthPage && ageGateAccepted && (
            <>
              <Button
                type="button"
                onClick={() => setCopilotOpen(true)}
                aria-label="Open AI ad copilot"
                className={`fixed bottom-4 right-4 z-40 h-11 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-3 sm:px-5 py-2 text-white shadow-lg hover:opacity-95 border-0 text-xs sm:text-sm opacity-90 hover:opacity-100 transition-all duration-300 ${fabHidden && !copilotOpen ? "pointer-events-none translate-y-20 opacity-0" : ""}`}
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">AI ad copilot</span>
              </Button>
              <Dialog open={copilotOpen} onOpenChange={setCopilotOpen}>
                <DialogContent className="max-w-2xl border-stone-200 bg-stone-50 p-0 text-stone-900">
                  <DialogHeader className="sr-only">
                    <DialogTitle>AI advertising copilot</DialogTitle>
                    <DialogDescription>Ask for help with registration, packages, tours, city competition, and advertising strategy.</DialogDescription>
                  </DialogHeader>
                  <AdvertisingCopilot surface={user ? "signup" : "guest"} compact />
                </DialogContent>
              </Dialog>
            </>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}

function BackToTop() {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fixed bottom-20 right-4 z-40 md:bottom-6 h-10 w-10 rounded-full bg-zinc-800/80 backdrop-blur-md border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-all shadow-lg"
    >
      <svg className="mx-auto h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    </button>
  );
}
