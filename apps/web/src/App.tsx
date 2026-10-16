import React, { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import { Compass } from "lucide-react";
import { Navbar } from "./components/layout/Navbar";
import { CreatePostModal } from "./components/feed/CreatePostModal";
import { EmptyState, Spinner } from "./components/ui/States";
import { refreshSession } from "./lib/api";
import { useRealtime } from "./lib/realtime";
import { useAuthStore } from "./store/useAuthStore";
import { AuthPage } from "./pages/AuthPage";
import { ExplorePage } from "./pages/ExplorePage";
import { FeedPage } from "./pages/FeedPage";
import { PostPage } from "./pages/PostPage";
import { ProfilePage } from "./pages/ProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      // Client errors (404, 401, validation) won't fix themselves on retry
      retry: (count, err) => {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        return (status === undefined || status >= 500) && count < 2;
      },
    },
  },
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-white font-semibold">Something went wrong.</p>
          <button onClick={() => window.location.reload()} className="text-sm text-brand-400 underline">
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}

const NotFound: React.FC = () => (
  <div className="max-w-xl mx-auto px-4 py-16">
    <EmptyState icon={<Compass className="w-6 h-6" />} title="Page not found">
      <Link to="/" className="text-brand-400 underline">
        Go to the feed
      </Link>
    </EmptyState>
  </div>
);

const Shell: React.FC = () => {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  useRealtime();

  // Restore the session from the refresh cookie once per page load
  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => setCreateOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col md:pl-64 pb-20 md:pb-0">
      <Navbar onOpenCreateModal={() => setCreateOpen(true)} />
      <main className="flex-1 w-full">
        {status === "loading" ? (
          <Spinner />
        ) : (
          <Routes>
            <Route path="/" element={<FeedPage onCreate={() => setCreateOpen(true)} />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/u/:username" element={<ProfilePage />} />
            <Route path="/p/:id" element={<PostPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>
      <CreatePostModal isOpen={isCreateOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
