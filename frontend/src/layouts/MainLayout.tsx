import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Header } from "../components/Header";
import { PageTransition } from "../components/PageTransition";
import { Sidebar } from "../components/Sidebar";

type Props = {
  onOpenCommand?: () => void;
};

export const MainLayout = (props: Props): JSX.Element => {
  const { onOpenCommand } = props;
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  return (
    <div className={`layout${mobileNavOpen ? " layout--nav-open" : ""}`}>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close navigation"
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={() => setMobileNavOpen(false)}
      />
      <Sidebar
        {...(onOpenCommand ? { onOpenCommand } : {})}
        onNavigate={() => setMobileNavOpen(false)}
      />
      <div className="layout-content">
        <Header
          {...(onOpenCommand ? { onOpenCommand } : {})}
          onOpenNav={() => setMobileNavOpen(true)}
        />
        <main className="main-content">
          <AnimatePresence mode="wait">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
