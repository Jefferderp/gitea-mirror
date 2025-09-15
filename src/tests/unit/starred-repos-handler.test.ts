/**
 * Unit tests for enhanced starred repository handler
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { 
  extractGitHubOwners,
  createStarredRepoOrganizations,
  getStarredReposStrategy,
  processStarredRepositories
} from "@/lib/starred-repos-handler";
import type { Config, Repository } from "@/lib/db/schema";

describe("Starred Repository Handler", () => {
  let mockConfig: Config;
  let mockStarredRepos: Repository[];

  beforeEach(() => {
    mockConfig = createMockConfig({
      starredReposStrategy: "preserve-structure"
    });
    
    mockStarredRepos = [
      createMockRepository({ fullName: "facebook/react", isStarred: true }),
      createMockRepository({ fullName: "microsoft/vscode", isStarred: true }),
      createMockRepository({ fullName: "facebook/jest", isStarred: true }),
    ];
  });

  describe("extractGitHubOwners()", () => {
    test("should group repositories by GitHub owner", () => {
      const ownerMap = extractGitHubOwners(mockStarredRepos);
      
      expect(ownerMap.size).toBe(2);
      expect(ownerMap.get("facebook")).toHaveLength(2);
      expect(ownerMap.get("microsoft")).toHaveLength(1);
    });

    test("should handle empty repository list", () => {
      const ownerMap = extractGitHubOwners([]);
      expect(ownerMap.size).toBe(0);
    });

    test("should filter out non-starred repositories", () => {
      const mixedRepos = [
        ...mockStarredRepos,
        createMockRepository({ fullName: "vercel/next.js", isStarred: false })
      ];
      
      const ownerMap = extractGitHubOwners(mixedRepos);
      expect(ownerMap.has("vercel")).toBe(false);
    });
  });

  describe("getStarredReposStrategy()", () => {
    test("should return configured strategy", () => {
      const config = createMockConfig({ starredReposStrategy: "preserve-structure" });
      expect(getStarredReposStrategy(config)).toBe("preserve-structure");
    });

    test("should default to single-organization", () => {
      const config = createMockConfig({ starredReposStrategy: undefined });
      expect(getStarredReposStrategy(config)).toBe("single-organization");
    });
  });

  describe("createStarredRepoOrganizations()", () => {
    test("should create organization records for new owners", async () => {
      const mockDb = mockDatabase();
      const ownerMap = extractGitHubOwners(mockStarredRepos);
      
      await createStarredRepoOrganizations({ config: mockConfig, ownerRepoMap: ownerMap });
      
      expect(mockDb.insert).toHaveBeenCalledTimes(2); // facebook, microsoft
      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "facebook",
          organizationType: "starred-owner",
          sourceOwner: "facebook",
          repositoryCount: 2,
        })
      );
    });

    test("should update existing organization records", async () => {
      const mockDb = mockDatabase({
        existingOrgs: [
          createMockOrganization({ name: "facebook", organizationType: "starred-owner" })
        ]
      });
      
      const ownerMap = extractGitHubOwners(mockStarredRepos);
      await createStarredRepoOrganizations({ config: mockConfig, ownerRepoMap: ownerMap });
      
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryCount: 2, // Updated count
        })
      );
    });

    test("should handle database errors gracefully", async () => {
      const mockDb = mockDatabase({ 
        insertError: new Error("Database connection failed") 
      });
      
      const ownerMap = extractGitHubOwners(mockStarredRepos);
      
      // Should not throw, but log errors
      await expect(createStarredRepoOrganizations({ 
        config: mockConfig, 
        ownerRepoMap: ownerMap 
      })).resolves.not.toThrow();
    });
  });

  describe("processStarredRepositories()", () => {
    test("should use preserve-structure strategy when configured", async () => {
      const mockOctokit = {} as any;
      const config = createMockConfig({ starredReposStrategy: "preserve-structure" });
      
      const processPreserveSpy = mock();
      const processSingleSpy = mock();
      
      // Mock the strategy-specific functions
      mock.module("@/lib/starred-repos-handler", () => ({
        processWithPreserveStructure: processPreserveSpy,
        processWithSingleOrg: processSingleSpy,
      }));

      await processStarredRepositories({
        config,
        repositories: mockStarredRepos,
        octokit: mockOctokit,
      });

      expect(processPreserveSpy).toHaveBeenCalledTimes(1);
      expect(processSingleSpy).toHaveBeenCalledTimes(0);
    });

    test("should use single-organization strategy by default", async () => {
      const mockOctokit = {} as any;
      const config = createMockConfig({ starredReposStrategy: "single-organization" });
      
      const processPreserveSpy = mock();
      const processSingleSpy = mock();
      
      mock.module("@/lib/starred-repos-handler", () => ({
        processWithPreserveStructure: processPreserveSpy,
        processWithSingleOrg: processSingleSpy,
      }));

      await processStarredRepositories({
        config,
        repositories: mockStarredRepos,
        octokit: mockOctokit,
      });

      expect(processPreserveSpy).toHaveBeenCalledTimes(0);
      expect(processSingleSpy).toHaveBeenCalledTimes(1);
    });
  });
});

// Helper functions for creating mock data
function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    id: "test-config-id",
    userId: "test-user-id",
    name: "Test Config",
    isActive: true,
    githubConfig: {
      owner: "testuser",
      type: "personal",
      token: "test-token",
      includeStarred: true,
      starredReposStrategy: "single-organization",
      starredReposOrg: "starred",
      ...overrides.githubConfig,
    },
    giteaConfig: {
      url: "https://git.example.com",
      token: "gitea-token",
      defaultOwner: "testuser",
      ...overrides.giteaConfig,
    },
    ...overrides,
  } as Config;
}

function createMockRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: `repo-${Math.random()}`,
    userId: "test-user-id",
    configId: "test-config-id",
    name: "test-repo",
    fullName: "testowner/test-repo",
    url: "https://github.com/testowner/test-repo",
    cloneUrl: "https://github.com/testowner/test-repo.git",
    owner: "testowner",
    organization: null,
    mirroredLocation: "",
    isPrivate: false,
    isForked: false,
    hasIssues: false,
    isStarred: false,
    isArchived: false,
    size: 1000,
    hasLFS: false,
    hasSubmodules: false,
    language: "TypeScript",
    description: "Test repository",
    defaultBranch: "main",
    visibility: "public",
    status: "imported",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Repository;
}

function createMockOrganization(overrides: Partial<any> = {}) {
  return {
    id: `org-${Math.random()}`,
    userId: "test-user-id",
    configId: "test-config-id",
    name: "test-org",
    organizationType: "starred-owner",
    sourceOwner: "test-org",
    repositoryCount: 5,
    publicRepositoryCount: 3,
    privateRepositoryCount: 2,
    forkRepositoryCount: 1,
    ...overrides,
  };
}

function mockDatabase(options: any = {}) {
  const mockDb = {
    insert: mock(() => ({
      values: mock(() => {
        if (options.insertError) throw options.insertError;
        return Promise.resolve({ insertedId: "mock-id" });
      })
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => Promise.resolve())
      }))
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve(options.existingOrgs || []))
        }))
      }))
    }))
  };

  mock.module("@/lib/db", () => ({
    db: mockDb,
    organizations: {}
  }));

  return mockDb;
}