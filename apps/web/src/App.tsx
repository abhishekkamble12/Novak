import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./components/layout/Navbar";
import { FeedPage } from "./pages/FeedPage";
import { ExplorePage } from "./pages/ExplorePage";
import { AuthPage } from "./pages/AuthPage";
import { CreatePostModal } from "./components/feed/CreatePostModal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export const App: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleCreatePost = async (data: { mediaUrl: string; caption: string }) => {
    // Optimistic post handler
    console.log("Post published:", data);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-background text-slate-100 flex flex-col md:pl-64 pb-16 md:pb-0">
          <Navbar onOpenCreateModal={() => setIsCreateModalOpen(true)} />

          <main className="flex-1 w-full">
            <Routes>
              <Route path="/" element={<FeedPage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <CreatePostModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSubmit={handleCreatePost}
          />
        </div>
      </Router>
    </QueryClientProvider>
  );
};

export default App;
