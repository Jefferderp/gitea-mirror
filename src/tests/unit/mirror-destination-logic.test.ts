/**
 * Unit tests for mirror destination logic with starred repo support
 */

import { describe, test, expect } from "bun:test";
import { getGiteaRepoOwnerAsync, getGiteaRepoOwner } from "@/lib/gitea";

describe("Mirror Destination Logic", () => {
  describe("getGiteaRepoOwnerAsync()", () => {
    test("should return GitHub owner for starred repos with preserve-structure", async () => {
      const config = createMockConfig({
        githubConfig: { starredReposStrategy: "preserve-structure" }
      });
      const repository = createMockRepository({
        fullName: "facebook/react",
        isStarred: true
      });

      const owner = await getGiteaRepoOwnerAsync({ config, repository });
      expect(owner).toBe("facebook");
    });

    test("should return starredReposOrg for starred repos with single-organization", async () => {
      const config = createMockConfig({
        githubConfig: { 
          starredReposStrategy: "single-organization",
          starredReposOrg: "my-starred-repos"
        }
      });
      const repository = createMockRepository({
        fullName: "facebook/react",
        isStarred: true
      });

      const owner = await getGiteaRepoOwnerAsync({ config, repository });
      expect(owner).toBe("my-starred-repos");
    });

    test("should respect organization destination overrides for starred repos", async () => {
      const mockGetOrgConfig = mock().mockResolvedValue({
        destinationOrg: "custom-destination"
      });
      
      mock.module("@/lib/gitea", () => ({
        getOrganizationConfig: mockGetOrgConfig
      }));

      const config = createMockConfig({
        githubConfig: { starredReposStrategy: "preserve-structure" }
      });
      const repository = createMockRepository({
        fullName: "facebook/react",
        isStarred: true
      });

      const owner = await getGiteaRepoOwnerAsync({ config, repository });
      expect(owner).toBe("custom-destination");
      expect(mockGetOrgConfig).toHaveBeenCalledWith({
        orgName: "facebook",
        userId: "test-user-id"
      });
    });

    test("should handle non-starred repositories normally", async () => {
      const config = createMockConfig({
        githubConfig: { mirrorStrategy: "preserve" }
      });
      const repository = createMockRepository({
        fullName: "testorg/test-repo",
        organization: "testorg",
        isStarred: false
      });

      const owner = await getGiteaRepoOwnerAsync({ config, repository });
      expect(owner).toBe("testorg");
    });
  });

  describe("getGiteaRepoOwner()", () => {
    test("should handle starred repos with preserve-structure strategy", () => {
      const config = createMockConfig({
        githubConfig: { starredReposStrategy: "preserve-structure" }
      });
      const repository = createMockRepository({
        fullName: "microsoft/vscode",
        isStarred: true
      });

      const owner = getGiteaRepoOwner({ config, repository });
      expect(owner).toBe("starred"); // Should fall back to starred org for sync version
    });

    test("should default to single-organization for starred repos", () => {
      const config = createMockConfig({
        githubConfig: { 
          starredReposStrategy: "single-organization",
          starredReposOrg: "starred-collection"
        }
      });
      const repository = createMockRepository({
        fullName: "facebook/react",
        isStarred: true
      });

      const owner = getGiteaRepoOwner({ config, repository });
      expect(owner).toBe("starred-collection");
    });

    test("should fall back to 'starred' when starredReposOrg is not configured", () => {
      const config = createMockConfig({
        githubConfig: { starredReposStrategy: "single-organization" }
      });
      const repository = createMockRepository({
        fullName: "facebook/react",
        isStarred: true
      });

      const owner = getGiteaRepoOwner({ config, repository });
      expect(owner).toBe("starred");
    });
  });

  describe("Backward compatibility scenarios", () => {
    test("should handle legacy configs without starredReposStrategy", () => {
      const config = createMockConfig({
        githubConfig: { 
          // No starredReposStrategy specified
          starredReposOrg: "legacy-starred"
        }
      });
      const repository = createMockRepository({
        fullName: "facebook/react",
        isStarred: true
      });

      const owner = getGiteaRepoOwner({ config, repository });
      expect(owner).toBe("legacy-starred");
    });

    test("should handle repository destination overrides for starred repos", async () => {
      const config = createMockConfig({
        githubConfig: { starredReposStrategy: "preserve-structure" }
      });
      const repository = createMockRepository({
        fullName: "facebook/react",
        isStarred: true,
        destinationOrg: "override-destination"
      });

      const owner = await getGiteaRepoOwnerAsync({ config, repository });
      expect(owner).toBe("override-destination");
    });

    test("should handle mixed starred and non-starred repos", async () => {
      const config = createMockConfig({
        githubConfig: { starredReposStrategy: "preserve-structure" }
      });

      const starredRepo = createMockRepository({
        fullName: "facebook/react",
        isStarred: true
      });

      const normalRepo = createMockRepository({
        fullName: "mycompany/internal-repo",
        organization: "mycompany",
        isStarred: false
      });

      const starredOwner = await getGiteaRepoOwnerAsync({ config, repository: starredRepo });
      const normalOwner = await getGiteaRepoOwnerAsync({ config, repository: normalRepo });

      expect(starredOwner).toBe("facebook");
      expect(normalOwner).toBe("mycompany");
    });
  });
});

// Helper functions for creating mock data
function createMockConfig(overrides: Partial<any> = {}): any {
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
      mirrorStrategy: "preserve",
      ...overrides.githubConfig,
    },
    giteaConfig: {
      url: "https://git.example.com",
      token: "gitea-token",
      defaultOwner: "testuser",
      ...overrides.giteaConfig,
    },
    ...overrides,
  };
}

function createMockRepository(overrides: Partial<any> = {}): any {
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
  };
}