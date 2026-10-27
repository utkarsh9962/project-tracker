import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router";
import "./index.css";
import { AuthGate } from "./components/auth";
import { Layout } from "./components/layout";
import { Dashboard } from "./pages/dashboard";
import { Milestones } from "./pages/milestones";
import { NewMenu } from "./pages/new";
import { NotFound } from "./pages/not-found";
import { EditPerson, People, PersonDetail } from "./pages/people";
import { EditProject, NewProject, ProjectDetail, Projects } from "./pages/projects";
import { Search } from "./pages/search";
import { EditTicket, NewTicket, TicketDetail, Tickets } from "./pages/tickets";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Hash URLs (#/projects/1) work on GitHub Pages without server-side routing. */}
      <HashRouter>
        <AuthGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="new" element={<NewMenu />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/new" element={<NewProject />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="projects/:id/edit" element={<EditProject />} />
              <Route path="milestones" element={<Milestones />} />
              <Route path="tickets" element={<Tickets />} />
              <Route path="tickets/new" element={<NewTicket />} />
              <Route path="tickets/:id" element={<TicketDetail />} />
              <Route path="tickets/:id/edit" element={<EditTicket />} />
              <Route path="people" element={<People />} />
              <Route path="people/:id" element={<PersonDetail />} />
              <Route path="people/:id/edit" element={<EditPerson />} />
              <Route path="search" element={<Search />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthGate>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
