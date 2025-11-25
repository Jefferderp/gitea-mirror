interface MetadataComponentsState {
  releases: boolean;
  issues: boolean;
  pullRequests: boolean;
  labels: boolean;
  milestones: boolean;
}

export interface RepositoryMetadataState {
  components: MetadataComponentsState;
  lastSyncedAt?: string;
}

const defaultComponents: MetadataComponentsState = {
  releases: false,
  issues: false,
  pullRequests: false,
  labels: false,
  milestones: false,
};

export function createDefaultMetadataState(): RepositoryMetadataState {
  return {
    components: { ...defaultComponents },
  };
}

export function parseRepositoryMetadataState(
  raw: unknown
): RepositoryMetadataState {
  const base = createDefaultMetadataState();

  if (!raw) {
    return base;
  }

  let parsed: any = raw;

  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return base;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return base;
  }

  if (parsed.components && typeof parsed.components === "object") {
    base.components = {
      ...base.components,
      releases: Boolean(parsed.components.releases),
      issues: Boolean(parsed.components.issues),
      pullRequests: Boolean(parsed.components.pullRequests),
      labels: Boolean(parsed.components.labels),
      milestones: Boolean(parsed.components.milestones),
    };
  }

  if (typeof parsed.lastSyncedAt === "string") {
    base.lastSyncedAt = parsed.lastSyncedAt;
  } else if (typeof parsed.lastMetadataSync === "string") {
    base.lastSyncedAt = parsed.lastMetadataSync;
  }

  return base;
}

export function serializeRepositoryMetadataState(
  state: RepositoryMetadataState
): string {
  return JSON.stringify(state);
}
