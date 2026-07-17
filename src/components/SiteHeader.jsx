// @ts-nocheck
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Crown, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { base44 } from "@/api/base44Client";
import { buildLoginUrl, currentAppPath } from "@/lib/authUrls";

const publicNavigation = [
  { title: "Home", url: createPageUrl("Home") },
  { title: "Browse", url: createPageUrl("Browse") },
  { title: "AI Concierge", url: `${createPageUrl("Home")}#ai-concierge` },
  { title: "Pricing", url: createPageUrl("Pricing") },
  { title: "Trust", url: createPageUrl("Trust") },
  { title: "FAQ", url: createPageUrl("FAQ") },
  { title: "Contact", url: createPageUrl("Contact") },
];

function isNavActive(item, location) {
  if (location.pathname === item.url) return true;
  if (item.title === "Browse") {
    return (
      location.pathname.startsWith("/city/") ||
      location.pathname.toLowerCase().startsWith("/viewprofile") ||
      location.pathname.startsWith("/profile/")
    );
  }
  return false;
}

export function SiteHeader({ user, isAuthPage }) {
  const location = useLocation();
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-500 ${
        scrolled
          ? "border-b border-white/[0.06] bg-zinc-950/85 backdrop-blur-2xl shadow-[0_12px_40px_-20px_rgba(0,0,0,0.9)]"
          : "border-b border-transparent bg-zinc-950/40 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between transition-all duration-500 ${scrolled ? "h-16" : "h-18 sm:h-20"}`}>
          {/* Brand */}
          <Link to={createPageUrl("Home")} className="group flex items-center gap-3 min-w-0">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-rose-500 to-rose-600 text-white shadow-[0_8px_24px_-8px_rgba(244,63,94,0.55)] ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-[1.04]">
              <Crown className="h-5 w-5" strokeWidth={1.75} />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/20 to-transparent" />
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-serif text-[15px] sm:text-base font-semibold tracking-tight text-white">
                La Boutique VIP
                <span className="hidden md:inline text-zinc-400 font-sans font-normal text-xs ml-1.5 tracking-[0.18em] uppercase">
                  International
                </span>
              </span>
              <span className="hidden sm:block text-[11px] tracking-[0.14em] uppercase text-zinc-500 group-hover:text-amber-500/80 transition-colors">
                Curated · discreet · verified
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center" aria-label="Primary">
            <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1.5 backdrop-blur-md">
              {publicNavigation.map((item) => {
                const active = isNavActive(item, location);
                return (
                  <Link
                    key={item.title}
                    to={item.url}
                    aria-current={active ? "page" : undefined}
                    className={`relative rounded-full px-4 py-2 text-[13px] font-medium tracking-wide transition-all duration-300 ${
                      active
                        ? "bg-white/[0.08] text-amber-300 shadow-inner"
                        : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    {item.title}
                    {active && (
                      <span className="absolute inset-x-3 -bottom-[1px] h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to={createPageUrl("Browse")}
              className="hidden sm:inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(244,63,94,0.65)] ring-1 ring-white/10 transition hover:brightness-110 active:scale-[0.98]"
            >
              <Search className="h-3.5 w-3.5" />
              Browse
            </Link>

            {user ? (
              <div className="hidden sm:flex items-center gap-3">
                <Link
                  to={createPageUrl("ProviderDashboard")}
                  className="text-[13px] font-medium text-zinc-300 transition hover:text-amber-300"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => base44.auth.logout()}
                  className="text-[13px] font-medium text-zinc-500 transition hover:text-zinc-200"
                >
                  Logout
                </button>
              </div>
            ) : (
              !isAuthPage && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = buildLoginUrl(currentAppPath());
                  }}
                  className="hidden sm:inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  Sign in
                </button>
              )
            )}

            {/* Mobile menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-2xl border-white/10 bg-white/[0.03] text-zinc-100 hover:bg-white/[0.06]"
                >
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[min(100vw,22rem)] border-l border-white/10 bg-zinc-950/98 text-zinc-100 backdrop-blur-2xl p-0"
              >
                <div className="flex h-full flex-col">
                  <SheetHeader className="border-b border-white/5 px-6 py-5 text-left">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500">
                        <Crown className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <SheetTitle className="text-left font-serif text-lg text-white">Menu</SheetTitle>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">La Boutique VIP</p>
                      </div>
                    </div>
                  </SheetHeader>

                  <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Mobile">
                    {publicNavigation.map((item) => {
                      const active = isNavActive(item, location);
                      return (
                        <SheetClose asChild key={item.title}>
                          <Link
                            to={item.url}
                            aria-current={active ? "page" : undefined}
                            className={`flex min-h-12 items-center justify-between rounded-2xl px-4 text-sm font-medium transition ${
                              active
                                ? "bg-gradient-to-r from-amber-500/15 to-rose-500/10 text-amber-200 ring-1 ring-amber-500/20"
                                : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                            }`}
                          >
                            {item.title}
                            {active && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </nav>

                  <div className="space-y-3 border-t border-white/5 p-4">
                    <SheetClose asChild>
                      <Link
                        to={createPageUrl("Browse")}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600 text-sm font-semibold text-white shadow-lg shadow-rose-500/20"
                      >
                        <Search className="h-4 w-4" />
                        Browse listings
                      </Link>
                    </SheetClose>
                    {user ? (
                      <div className="grid grid-cols-2 gap-2">
                        <SheetClose asChild>
                          <Link
                            to={createPageUrl("ProviderDashboard")}
                            className="flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-zinc-200"
                          >
                            Dashboard
                          </Link>
                        </SheetClose>
                        <button
                          type="button"
                          onClick={() => base44.auth.logout()}
                          className="min-h-11 rounded-2xl border border-white/10 text-sm text-zinc-400"
                        >
                          Logout
                        </button>
                      </div>
                    ) : (
                      !isAuthPage && (
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = buildLoginUrl(currentAppPath());
                          }}
                          className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-medium text-zinc-200"
                        >
                          Sign in
                        </button>
                      )
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

export { publicNavigation, isNavActive };
