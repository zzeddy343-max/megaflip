import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteError, RouteNotFound } from "./components/RouteError";
// Install the client-side stale-chunk recovery handler. The server entry also
// imports this module for server diagnostics, but that does not install a
// browser listener in the client bundle.
import "./lib/error-capture";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
  });

  return router;
};
