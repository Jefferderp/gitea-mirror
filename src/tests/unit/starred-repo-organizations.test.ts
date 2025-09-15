/**
 * Unit tests for starred repository organization management
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { 
  createStarredOrganization,
  updateStarredOrganization,
  deleteStarredOrganization
} from "@/lib/starred-repo-organizations";

describe("Starred Repository Organizations", () => {
  describe("createStarredOrganization()", () => {
    test("should create organization with correct metadata", async () => {
      const mockDb = mockDatabase();
      const ownerName = "facebook";
      const repositories = [
        createMockRepository({ fullName: "facebook/react", isPrivate: false, isForked: false }),
        createMockRepository({ fullName: "facebook/jest", isPrivate: false, isForked: true }),
      ];

      await createStarredOrganization({
        userId: "test-user",
        configId: "test-config",
        ownerName,
        repositories,
      });

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "facebook",
          organizationType: "starred-owner",
          sourceOwner: "facebook",
          repositoryCount: 2,
          publicRepositoryCount: 2,
          privateRepositoryCount: 0,
          forkRepositoryCount: 1,
          membershipRole: "external",
        })
      );
    });

    test("should handle organization creation errors", async () => {
      const mockDb = mockDatabase({
        insertError: new Error("Constraint violation")
      });

      await expect(createStarredOrganization({
        userId: "test-user",
        configId: "test-config", 
        ownerName: "facebook",
        repositories: [],
      })).rejects.toThrow("Constraint violation");
    });

    test("should calculate repository counts correctly", async () => {
      const mockDb = mockDatabase();
      const repositories = [
        createMockRepository({ fullName: "facebook/react", isPrivate: false, isForked: false }),
        createMockRepository({ fullName: "facebook/jest", isPrivate: true, isForked: false }),
        createMockRepository({ fullName: "facebook/create-react-app", isPrivate: false, isForked: true }),
        createMockRepository({ fullName: "facebook/relay", isPrivate: true, isForked: true }),
      ];

      await createStarredOrganization({
        userId: "test-user",
        configId: "test-config",
        ownerName: "facebook",
        repositories,
      });

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryCount: 4,
          publicRepositoryCount: 2,
          privateRepositoryCount: 2,
          forkRepositoryCount: 2,
        })
      );
    });

    test("should handle empty repository list", async () => {
      const mockDb = mockDatabase();

      await createStarredOrganization({
        userId: "test-user",
        configId: "test-config",
        ownerName: "facebook",
        repositories: [],
      });

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryCount: 0,
          publicRepositoryCount: 0,
          privateRepositoryCount: 0,
          forkRepositoryCount: 0,
        })
      );
    });
  });

  describe("updateStarredOrganization()", () => {
    test("should update repository counts correctly", async () => {
      const mockDb = mockDatabase();
      const newRepositories = [
        createMockRepository({ fullName: "facebook/react" }),
        createMockRepository({ fullName: "facebook/jest" }),
        createMockRepository({ fullName: "facebook/create-react-app" }),
      ];

      await updateStarredOrganization({
        organizationId: "org-123",
        repositories: newRepositories,
      });

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryCount: 3,
        })
      );
    });

    test("should update organization metadata", async () => {
      const mockDb = mockDatabase();
      const repositories = [
        createMockRepository({ fullName: "facebook/react", description: "A JavaScript library for building user interfaces" }),
        createMockRepository({ fullName: "facebook/jest", language: "JavaScript" }),
      ];

      await updateStarredOrganization({
        organizationId: "org-123",
        repositories,
      });

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryCount: 2,
          updatedAt: expect.any(Date),
        })
      );
    });

    test("should handle update errors gracefully", async () => {
      const mockDb = mockDatabase({
        updateError: new Error("Update failed")
      });

      await expect(updateStarredOrganization({
        organizationId: "org-123",
        repositories: [],
      })).rejects.toThrow("Update failed");
    });
  });

  describe("deleteStarredOrganization()", () => {
    test("should delete organization and related data", async () => {
      const mockDb = mockDatabase();

      await deleteStarredOrganization({
        organizationId: "org-123",
        userId: "test-user",
      });

      expect(mockDb.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "org-123",
          userId: "test-user",
        })
      );
    });

    test("should handle delete errors gracefully", async () => {
      const mockDb = mockDatabase({
        deleteError: new Error("Delete failed")
      });

      await expect(deleteStarredOrganization({
        organizationId: "org-123",
        userId: "test-user",
      })).rejects.toThrow("Delete failed");
    });

    test("should cascade delete related repositories", async () => {
      const mockDb = mockDatabase();

      await deleteStarredOrganization({
        organizationId: "org-123",
        userId: "test-user",
        cascade: true,
      });

      expect(mockDb.delete).toHaveBeenCalledTimes(2); // Organization and related repos
    });
  });

  describe("Organization metadata calculations", () => {
    test("should calculate language statistics", async () => {
      const mockDb = mockDatabase();
      const repositories = [
        createMockRepository({ fullName: "facebook/react", language: "JavaScript" }),
        createMockRepository({ fullName: "facebook/jest", language: "JavaScript" }),
        createMockRepository({ fullName: "facebook/flow", language: "OCaml" }),
      ];

      await createStarredOrganization({
        userId: "test-user",
        configId: "test-config",
        ownerName: "facebook",
        repositories,
      });

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryLanguage: "JavaScript",
          languageCount: 2,
        })
      );
    });

    test("should handle repositories without language", async () => {
      const mockDb = mockDatabase();
      const repositories = [
        createMockRepository({ fullName: "facebook/react", language: "JavaScript" }),
        createMockRepository({ fullName: "facebook/repo-without-lang", language: null }),
      ];

      await createStarredOrganization({
        userId: "test-user",
        configId: "test-config",
        ownerName: "facebook",
        repositories,
      });

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryLanguage: "JavaScript",
          languageCount: 1,
        })
      );
    });

    test("should calculate average repository size", async () => {
      const mockDb = mockDatabase();
      const repositories = [
        createMockRepository({ fullName: "facebook/react", size: 1000 }),
        createMockRepository({ fullName: "facebook/jest", size: 2000 }),
        createMockRepository({ fullName: "facebook/flow", size: 3000 }),
      ];

      await createStarredOrganization({
        userId: "test-user",
        configId: "test-config",
        ownerName: "facebook",
        repositories,
      });

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          averageRepositorySize: 2000,
        })
      );
    });
  });
});

// Helper functions for creating mock data
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
        where: mock(() => {
          if (options.updateError) throw options.updateError;
          return Promise.resolve();
        })
      }))
    })),
    delete: mock(() => ({
      where: mock(() => {
        if (options.deleteError) throw options.deleteError;
        return Promise.resolve();
      })
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([]))
        }))
      }))
    }))
  };

  mock.module("@/lib/db", () => ({
    db: mockDb,
    organizations: {},
    repositories: {}
  }));

  return mockDb;
}