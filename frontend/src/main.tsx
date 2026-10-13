import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./modules/auth/auth.context";
import { TenantProvider } from "./modules/tenant/tenant.context";
import { ThemeProvider } from "./lib/theme";
import { initTheme } from "./lib/theme";
import { installInputScrollGuard } from "./utils/inputScrollGuard";
import "./index.css";
import "./styles.css";

initTheme();
installInputScrollGuard();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TenantProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </TenantProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
