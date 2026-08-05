import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Permission failures won't succeed on a second attempt.
        if (error instanceof Error && error.name === 'NotPermittedError') return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Query keys are arrays, feature-prefixed. (CLAUDE.md, Frontend rules)
 * Kept in one place so two developers don't invent divergent keys for the same
 * data and then wonder why the cache won't invalidate.
 */
export const queryKeys = {
  currentUser: ['auth', 'currentUser'] as const,

  locations: {
    all: ['locations'] as const,
    list: (includeInactive: boolean) => ['locations', 'list', { includeInactive }] as const,
    detail: (id: string) => ['locations', 'detail', id] as const,
  },
  assetTypes: {
    all: ['assetTypes'] as const,
    list: (includeInactive: boolean) => ['assetTypes', 'list', { includeInactive }] as const,
    detail: (id: string) => ['assetTypes', 'detail', id] as const,
  },
  assets: {
    all: ['assets'] as const,
    list: (includeInactive: boolean) => ['assets', 'list', { includeInactive }] as const,
    detail: (id: string) => ['assets', 'detail', id] as const,
  },
  inspections: {
    all: ['inspections'] as const,
    list: (includeInactive: boolean) => ['inspections', 'list', { includeInactive }] as const,
    detail: (id: string) => ['inspections', 'detail', id] as const,
    forAsset: (assetId: string) => ['inspections', 'forAsset', assetId] as const,
  },
  activities: {
    all: ['activities'] as const,
    list: () => ['activities', 'list'] as const,
    detail: (id: string) => ['activities', 'detail', id] as const,
    forAsset: (assetId: string) => ['activities', 'forAsset', assetId] as const,
  },
  incidents: {
    all: ['incidents'] as const,
    list: (status: string) => ['incidents', 'list', { status }] as const,
    detail: (id: string) => ['incidents', 'detail', id] as const,
  },
  lookups: {
    all: ['lookups'] as const,
    gradings: ['lookups', 'gradings'] as const,
    incidentTypes: ['lookups', 'incidentTypes'] as const,
  },
};
