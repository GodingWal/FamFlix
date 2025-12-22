import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

export function Navigation() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigationItems = [
    { href: "/", label: "Dashboard", icon: "fas fa-home" },
    { href: "/create", label: "Create", icon: "fas fa-plus" },
    { href: "/videos", label: "Library", icon: "fas fa-video" },
    { href: "/voice-cloning", label: "Clone", icon: "fas fa-user-friends" },
    { href: "/stories", label: "Stories", icon: "fas fa-book" },
    { href: "/pricing", label: "Pricing", icon: "fas fa-tags" },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return location === "/";
    }
    return location.startsWith(href);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex-shrink-0">
              <h1 className="text-xl sm:text-2xl font-bold gradient-text" data-testid="link-logo">FamFlix</h1>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4 lg:space-x-8">
                {navigationItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 text-sm font-medium transition-colors touch-target ${isActive(item.href)
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                      }`}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <i className={`${item.icon} mr-2`}></i>
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Notifications */}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground p-2 touch-target hidden sm:flex"
              data-testid="button-notifications"
            >
              <i className="fas fa-bell text-lg"></i>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center space-x-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg px-2 sm:px-3 py-2 touch-target"
                  data-testid="button-user-menu"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    {user?.avatar ? (
                      <img
                        className="h-8 w-8 rounded-full"
                        src={user.avatar}
                        alt="User avatar"
                      />
                    ) : (
                      <i className="fas fa-user text-primary"></i>
                    )}
                  </div>
                  <span className="text-foreground font-medium hidden sm:block max-w-[120px] truncate">
                    {user?.firstName ? `${user.firstName} ${user.lastName}` : user?.username}
                  </span>
                  <i className="fas fa-chevron-down text-muted-foreground hidden sm:block"></i>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center touch-target" data-testid="menu-profile">
                    <i className="fas fa-user mr-2"></i>
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center touch-target" data-testid="menu-settings">
                    <i className="fas fa-cog mr-2"></i>
                    Settings
                  </Link>
                </DropdownMenuItem>
                {user?.role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="flex items-center touch-target" data-testid="menu-admin-dashboard">
                      <i className="fas fa-tachometer-alt mr-2"></i>
                      Admin Dashboard
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="flex items-center text-destructive focus:text-destructive touch-target"
                  data-testid="menu-logout"
                >
                  <i className="fas fa-sign-out-alt mr-2"></i>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden touch-target p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              <i className={`fas text-xl ${mobileMenuOpen ? 'fa-times' : 'fa-bars'}`}></i>
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className={`md:hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-border">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-3 text-base font-medium transition-colors rounded-lg touch-target ${isActive(item.href)
                  ? "text-foreground bg-secondary/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                  }`}
                onClick={() => setMobileMenuOpen(false)}
                data-testid={`mobile-nav-${item.label.toLowerCase()}`}
              >
                <i className={`${item.icon} mr-3 w-5`}></i>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav >
  );
}
