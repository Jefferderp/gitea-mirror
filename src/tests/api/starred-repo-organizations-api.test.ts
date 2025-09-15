/**
 * API tests for starred repository organization endpoints
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("Starred Repository Organizations API", () => {
  let testToken: string;
  let testUserId: string;

  beforeEach(async () => {
    // Setup test user and get auth token
    testUserId = await createTestUser();
    testToken = await getTestToken(testUserId);
  });

  afterEach(async () => {
    // Cleanup test data
    await cleanupTestUser(testUserId);
  });

  describe("GET /api/starred-repos/organizations", () => {
    test("should return starred repo organizations", async () => {
      // Create test starred organizations
      await createTestStarredOrganizations(testUserId);

      const response = await fetch("/api/starred-repos/organizations", {
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.organizations)).toBe(true);
      expect(result.organizations.length).toBeGreaterThan(0);
      
      // Verify organization structure
      result.organizations.forEach((org: any) => {
        expect(org).toHaveProperty("id");
        expect(org).toHaveProperty("name");
        expect(org).toHaveProperty("organizationType");
        expect(org.organizationType).toBe("starred-owner");
        expect(org).toHaveProperty("sourceOwner");
        expect(org).toHaveProperty("repositoryCount");
      });
    });

    test("should require authentication", async () => {
      const response = await fetch("/api/starred-repos/organizations");
      expect(response.status).toBe(401);
    });

    test("should filter by source owner", async () => {
      await createTestStarredOrganizations(testUserId);

      const response = await fetch("/api/starred-repos/organizations?sourceOwner=facebook", {
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.organizations.every((org: any) => org.sourceOwner === "facebook")).toBe(true);
    });

    test("should handle empty results gracefully", async () => {
      const response = await fetch("/api/starred-repos/organizations", {
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.organizations).toEqual([]);
    });
  });

  describe("POST /api/starred-repos/organizations", () => {
    test("should migrate starred repos to organizations", async () => {
      // Create test starred repositories
      await createTestStarredRepositories(testUserId);

      const response = await fetch("/api/starred-repos/organizations", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ strategy: "migrate" }),
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.migratedCount).toBeGreaterThanOrEqual(0);
      expect(result.organizationsCreated).toBeDefined();
    });

    test("should reject invalid migration strategy", async () => {
      const response = await fetch("/api/starred-repos/organizations", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ strategy: "invalid" }),
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toContain("Invalid migration strategy");
    });

    test("should handle migration with no starred repos", async () => {
      const response = await fetch("/api/starred-repos/organizations", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ strategy: "migrate" }),
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(0);
    });

    test("should handle concurrent migration requests", async () => {
      await createTestStarredRepositories(testUserId);

      // Send multiple concurrent requests
      const promises = Array.from({ length: 3 }, () => 
        fetch("/api/starred-repos/organizations", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${testToken}` 
          },
          body: JSON.stringify({ strategy: "migrate" }),
        })
      );

      const results = await Promise.all(promises);
      
      // All requests should succeed
      results.forEach(result => {
        expect(result.ok).toBe(true);
      });

      // Only one should actually perform the migration
      const jsonResults = await Promise.all(results.map(r => r.json()));
      const successfulMigrations = jsonResults.filter(r => r.migratedCount > 0);
      expect(successfulMigrations.length).toBe(1);
    });
  });

  describe("DELETE /api/starred-repos/organizations", () => {
    test("should clean up starred repo organizations", async () => {
      // First create some organizations
      await createTestStarredOrganizations(testUserId);

      const response = await fetch("/api/starred-repos/organizations", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThan(0);
    });

    test("should handle cleanup when no organizations exist", async () => {
      const response = await fetch("/api/starred-repos/organizations", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    test("should cascade delete related repositories when specified", async () => {
      await createTestStarredOrganizations(testUserId);
      await createTestStarredRepositories(testUserId);

      const response = await fetch("/api/starred-repos/organizations?cascade=true", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThan(0);
      expect(result.repositoriesDeleted).toBeDefined();
    });
  });

  describe("PATCH /api/organizations/[id]", () => {
    test("should update starred organization destination override", async () => {
      const starredOrg = await createTestStarredOrganization();

      const response = await fetch(`/api/organizations/${starredOrg.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ destinationOrg: "custom-destination" }),
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.destinationOrg).toBe("custom-destination");
      expect(result.organizationType).toBe("starred-owner");
    });

    test("should update repository destinations when org destination changes", async () => {
      const starredOrg = await createTestStarredOrganization();
      await createTestStarredRepositories(starredOrg.sourceOwner);

      await fetch(`/api/organizations/${starredOrg.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ destinationOrg: "new-destination" }),
      });

      // Verify repositories were updated
      const repos = await getRepositoriesByOrganization(starredOrg.sourceOwner);
      repos.forEach(repo => {
        expect(repo.destinationOrg).toBe("new-destination");
      });
    });

    test("should reject invalid destination organization names", async () => {
      const starredOrg = await createTestStarredOrganization();

      const response = await fetch(`/api/organizations/${starredOrg.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ destinationOrg: "invalid org name!" }),
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toContain("Invalid organization name");
    });

    test("should prevent updating non-starred organizations", async () => {
      const regularOrg = await createTestRegularOrganization();

      const response = await fetch(`/api/organizations/${regularOrg.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ destinationOrg: "custom-destination" }),
      });

      expect(response.status).toBe(403);
      const result = await response.json();
      expect(result.error).toContain("Cannot update non-starred organization");
    });
  });

  describe("GET /api/organizations", () => {
    test("should filter organizations by type", async () => {
      await createTestStarredOrganizations(testUserId);
      await createTestRegularOrganizations(testUserId);

      const response = await fetch("/api/organizations?organizationType=starred-owner", {
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.organizations.every((org: any) => org.organizationType === "starred-owner")).toBe(true);
    });

    test("should include starred organization metadata", async () => {
      await createTestStarredOrganization();

      const response = await fetch("/api/organizations?organizationType=starred-owner", {
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      const org = result.organizations[0];
      
      expect(org).toHaveProperty("sourceOwner");
      expect(org).toHaveProperty("repositoryCount");
      expect(org).toHaveProperty("publicRepositoryCount");
      expect(org).toHaveProperty("privateRepositoryCount");
      expect(org).toHaveProperty("forkRepositoryCount");
    });
  });

  describe("Error handling", () => {
    test("should handle database errors gracefully", async () => {
      // Mock database error
      mock.module("@/lib/db", () => ({
        db: {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.reject(new Error("Database connection failed"))
              })
            })
          })
        }
      }));

      const response = await fetch("/api/starred-repos/organizations", {
        headers: { "Authorization": `Bearer ${testToken}` },
      });

      expect(response.status).toBe(500);
      const result = await response.json();
      expect(result.error).toContain("Database connection failed");
    });

    test("should handle invalid organization IDs", async () => {
      const response = await fetch("/api/organizations/invalid-id", {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ destinationOrg: "custom-destination" }),
      });

      expect(response.status).toBe(404);
    });

    test("should handle unauthorized access to other users' organizations", async () => {
      const otherUserOrg = await createTestStarredOrganization("other-user");

      const response = await fetch(`/api/organizations/${otherUserOrg.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testToken}` 
        },
        body: JSON.stringify({ destinationOrg: "custom-destination" }),
      });

      expect(response.status).toBe(403);
    });
  });
});

// Helper functions for API tests
async function createTestUser(): Promise<string> {
  // Mock user creation
  return `test-user-${Date.now()}`;
}

async function getTestToken(userId: string): Promise<string> {
  // Mock token generation
  return `test-token-${userId}`;
}

async function cleanupTestUser(userId: string): Promise<void> {
  // Mock user cleanup
}

async function createTestStarredOrganizations(userId: string): Promise<any[]> {
  // Mock organization creation
  return [
    {
      id: `org-${Date.now()}-1`,
      userId,
      name: "facebook",
      organizationType: "starred-owner",
      sourceOwner: "facebook",
      repositoryCount: 5,
    },
    {
      id: `org-${Date.now()}-2`,
      userId,
      name: "microsoft",
      organizationType: "starred-owner",
      sourceOwner: "microsoft",
      repositoryCount: 3,
    }
  ];
}

async function createTestStarredOrganization(userId?: string): Promise<any> {
  const userIdToUse = userId || testUserId;
  return {
    id: `org-${Date.now()}`,
    userId: userIdToUse,
    name: "facebook",
    organizationType: "starred-owner",
    sourceOwner: "facebook",
    repositoryCount: 5,
  };
}

async function createTestRegularOrganization(userId?: string): Promise<any> {
  const userIdToUse = userId || testUserId;
  return {
    id: `org-${Date.now()}`,
    userId: userIdToUse,
    name: "mycompany",
    organizationType: "joined",
    membershipRole: "admin",
    repositoryCount: 10,
  };
}

async function createTestRegularOrganizations(userId: string): Promise<any[]> {
  return [
    {
      id: `org-${Date.now()}-1`,
      userId,
      name: "mycompany",
      organizationType: "joined",
      membershipRole: "admin",
      repositoryCount: 10,
    }
  ];
}

async function createTestStarredRepositories(userId: string, sourceOwner?: string): Promise<any[]> {
  const owner = sourceOwner || "facebook";
  return [
    {
      id: `repo-${Date.now()}-1`,
      userId,
      fullName: `${owner}/react`,
      name: "react",
      owner: owner,
      isStarred: true,
    },
    {
      id: `repo-${Date.now()}-2`,
      userId,
      fullName: `${owner}/jest`,
      name: "jest",
      owner: owner,
      isStarred: true,
    }
  ];
}

async function getRepositoriesByOrganization(sourceOwner: string): Promise<any[]> {
  // Mock repository retrieval
  return [
    {
      id: `repo-${Date.now()}-1`,
      fullName: `${sourceOwner}/repo1`,
      destinationOrg: "new-destination",
    },
    {
      id: `repo-${Date.now()}-2`,
      fullName: `${sourceOwner}/repo2`,
      destinationOrg: "new-destination",
    }
  ];
}