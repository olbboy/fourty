"use client";

import { createContext, useContext } from "react";

/**
 * Whether this install has an AI provider configured.
 *
 * The answer is server-side (`isAiEnabled()` reads the environment) and the
 * record pages that need it are client components several levels down, so the
 * shell hands it through a context rather than every page fetching for it.
 * `/api/diagnostics` is admin-only and would 403 for a member — the panel must
 * not depend on a route half the workspace cannot call.
 *
 * Defaults to `false`: an install with no provider is the one where getting this
 * wrong shows a composer that cannot send.
 */
const AiEnabledContext = createContext(false);

export function AiEnabledProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <AiEnabledContext.Provider value={enabled}>{children}</AiEnabledContext.Provider>;
}

export function useAiEnabled(): boolean {
  return useContext(AiEnabledContext);
}
