/**
 * Integration tests for complete starred repository workflows
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupTestDatabase, cleanupTestDatabase } from "@/tests/helpers/database";
import { createTestUser, createTestConfig } from "@/tests/helpers/auth";

describe("Starred Repository Workflow Integration", () => {
  let testUserId: string;
  let testConfigId: string;

  beforeEach(async () => {
    await setupTestDatabase();
    testUserId = await createTestUser();
    testConfigId = await createTestConfig(testUserId, {
      starredReposStrategy: "preserve-structure"
    });
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  test("should complete full preserve-structure workflow", async () => {
    // 1. Sync starred repositories
    const syncResponse = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: testUserId }),
    });

    expect(syncResponse.ok).toBe(true);
    const syncResult = await syncResponse.json();
    expect(syncResult.success).toBe(true);
    expect(syncResult.results.starredOrganizations).toBeGreaterThan(0);

    // 2. Verify organizations were created
    const orgsResponse = await fetch(`/api/github/organizations?userId=${testUserId}&type=starred-owner`);
    expect(orgsResponse.ok).toBe(true);
    const orgsResult = await orgsResponse.json();
    expect(orgsResult.organizations.length).toBeGreaterThan(0);

    // 3. Verify repositories are assigned to correct organizations
    const reposResponse = await fetch(`/api/repositories?userId=${testUserId}&starred=true`);
    expect(reposResponse.ok).toBe(true);
    const reposResult = await reposResponse.json();
    
    const starredRepos = reposResult.repositories.filter((r: any) => r.isStarred);
    starredRepos.forEach((repo: any) => {
      const expectedOwner = repo.fullName.split('/')[0];
      expect(repo.organization).toBe(expectedOwner);
    });

    // 4. Test organization management
    const firstOrg = orgsResult.organizations[0];
    const updateResponse = await fetch(`/api/organizations/${firstOrg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationOrg: "custom-destination" }),
    });

    expect(updateResponse.ok).toBe(true);
    const updateResult = await updateResponse.json();
    expect(updateResult.success).toBe(true);
  });

  test("should handle strategy switching from single-organization to preserve-structure", async () => {
    // 1. Start with single-organization strategy
    await updateUserConfig(testUserId, {
      starredReposStrategy: "single-organization",
      starredReposOrg: "starred"
    });

    // 2. Sync with single-organization
    await syncStarredRepositories(testUserId);
    
    // 3. Verify all starred repos go to single org
    let repos = await getStarredRepositories(testUserId);
    repos.forEach(repo => {
      expect(repo.organization).toBeNull(); // Should not be assigned to source org
    });

    // 4. Switch to preserve-structure
    await updateUserConfig(testUserId, {
      starredReposStrategy: "preserve-structure"
    });

    // 5. Trigger migration
    const migrationResponse = await fetch("/api/starred-repos/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: "migrate" }),
    });

    expect(migrationResponse.ok).toBe(true);

    // 6. Verify organizations were created and repos assigned
    const starredOrgs = await getStarredRepoOrganizations(testUserId);
    expect(starredOrgs.length).toBeGreaterThan(0);

    repos = await getStarredRepositories(testUserId);
    repos.forEach(repo => {
      const expectedOwner = repo.fullName.split('/')[0];
      expect(repo.organization).toBe(expectedOwner);
    });
  });

  test("should handle strategy switching from preserve-structure to single-organization", async () => {
    // 1. Start with preserve-structure
    await syncStarredRepositories(testUserId);
    
    // 2. Verify organizations exist
    let starredOrgs = await getStarredRepoOrganizations(testUserId);
    expect(starredOrgs.length).toBeGreaterThan(0);

    // 3. Switch to single-organization
    await updateUserConfig(testUserId, {
      starredReposStrategy: "single-organization",
      starredReposOrg: "consolidated"
    });

    // 4. Clean up starred organizations
    const cleanupResponse = await fetch("/api/starred-repos/organizations", {
      method: "DELETE",
    });

    expect(cleanupResponse.ok).toBe(true);

    // 5. Verify cleanup
    starredOrgs = await getStarredRepoOrganizations(testUserId);
    expect(starredOrgs.length).toBe(0);

    const repos = await getStarredRepositories(testUserId);
    repos.forEach(repo => {
      expect(repo.organization).toBeNull();
    });
  });

  test("should handle organization destination overrides", async () => {
    // 1. Setup preserve-structure strategy
    await syncStarredRepositories(testUserId);
    
    // 2. Get starred organizations
    const starredOrgs = await getStarredRepoOrganizations(testUserId);
    expect(starredOrgs.length).toBeGreaterThan(0);

    // 3. Set destination override for facebook org
    const facebookOrg = starredOrgs.find((org: any) => org.sourceOwner === "facebook");
    if (facebookOrg) {
      const updateResponse = await fetch(`/api/organizations/${facebookOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationOrg: "custom-facebook" }),
      });

      expect(updateResponse.ok).toBe(true);
    }

    // 4. Mirror repositories and verify destination
    const mirrorResponse = await fetch("/api/mirror", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        userId: testUserId,
        organizationIds: [facebookOrg.id]
      }),
    });

    expect(mirrorResponse.ok).toBe(true);

    // 5. Verify repositories were mirrored to custom destination
    const repos = await getStarredRepositories(testUserId);
    const facebookRepos = repos.filter((repo: any) => repo.fullName.startsWith("facebook/"));
    facebookRepos.forEach((repo: any) => {
      expect(repo.destinationOrg).toBe("custom-facebook");
    });
  });

  test("should handle duplicate repository names with different strategies", async () => {
    // 1. Create repositories with same name from different owners
    const duplicateRepos = [
      { fullName: "facebook/common-repo", name: "common-repo", isStarred: true },
      { fullName: "microsoft/common-repo", name: "common-repo", isStarred: true },
      { fullName: "google/common-repo", name: "common-repo", isStarred: true },
    ];

    // 2. Sync with preserve-structure strategy
    await syncStarredRepositoriesWithRepos(testUserId, duplicateRepos);
    
    // 3. Verify organizations were created for each owner
    const starredOrgs = await getStarredRepoOrganizations(testUserId);
    expect(starredOrgs.length).toBe(3);
    expect(starredOrgs.map((org: any) => org.sourceOwner)).toContain("facebook");
    expect(starredOrgs.map((org: any) => org.sourceOwner)).toContain("microsoft");
    expect(starredOrgs.map((org: any) => org.sourceOwner)).toContain("google");

    // 4. Mirror repositories
    const mirrorResponse = await fetch("/api/mirror", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: testUserId }),
    });

    expect(mirrorResponse.ok).toBe(true);

    // 5. Verify repositories were mirrored to correct organizations
    const mirroredRepos = await getMirroredRepositories(testUserId);
    const commonRepos = mirroredRepos.filter((repo: any) => repo.name === "common-repo");
    expect(commonRepos.length).toBe(3);
    
    // Each repo should be in its respective organization
    expect(commonRepos.some((repo: any) => repo.mirroredLocation.startsWith("facebook/"))).toBe(true);
    expect(commonRepos.some((repo: any) => repo.mirroredLocation.startsWith("microsoft/"))).toBe(true);
    expect(commonRepos.some((repo: any) => repo.mirroredLocation.startsWith("google/"))).toBe(true);
  });

  test("should handle large numbers of starred repositories efficiently", async () => {
    // 1. Create a large number of starred repositories
    const largeRepoSet = createLargeStarredRepoDataset(100);
    
    // 2. Sync with preserve-structure strategy
    const startTime = Date.now();
    await syncStarredRepositoriesWithRepos(testUserId, largeRepoSet);
    const syncTime = Date.now() - startTime;

    // 3. Verify performance (should complete within reasonable time)
    expect(syncTime).toBeLessThan(30000); // 30 seconds

    // 4. Verify organizations were created
    const starredOrgs = await getStarredRepoOrganizations(testUserId);
    expect(starredOrgs.length).toBeGreaterThan(0);

    // 5. Verify all repositories were processed
    const repos = await getStarredRepositories(testUserId);
    expect(repos.length).toBe(100);
  });

  test("should handle error scenarios gracefully", async () => {
    // 1. Setup with invalid configuration
    await updateUserConfig(testUserId, {
      starredReposStrategy: "preserve-structure",
      // Missing required fields
    });

    // 2. Attempt sync with invalid config
    const syncResponse = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: testUserId }),
    });

    // 3. Should handle errors gracefully
    expect(syncResponse.ok).toBe(false);
    const errorResult = await syncResponse.json();
    expect(errorResult.error).toBeDefined();

    // 4. Database should remain in consistent state
    const repos = await getStarredRepositories(testUserId);
    expect(repos.length).toBe(0); // No partial data should be created
  });
});

// Helper functions for integration tests
async function updateUserConfig(userId: string, configUpdates: any) {
  const response = await fetch(`/api/config/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configUpdates),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update user config: ${response.statusText}`);
  }
  
  return response.json();
}

async function syncStarredRepositories(userId: string) {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to sync starred repositories: ${response.statusText}`);
  }
  
  return response.json();
}

async function syncStarredRepositoriesWithRepos(userId: string, repos: any[]) {
  const response = await fetch("/api/sync/starred", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, repositories: repos }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to sync starred repositories: ${response.statusText}`);
  }
  
  return response.json();
}

async function getStarredRepositories(userId: string) {
  const response = await fetch(`/api/repositories?userId=${userId}&starred=true`);
  
  if (!response.ok) {
    throw new Error(`Failed to get starred repositories: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.repositories;
}

async function getStarredRepoOrganizations(userId: string) {
  const response = await fetch(`/api/github/organizations?userId=${userId}&type=starred-owner`);
  
  if (!response.ok) {
    throw new Error(`Failed to get starred organizations: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.organizations;
}

async function getMirroredRepositories(userId: string) {
  const response = await fetch(`/api/repositories?userId=${userId}&status=mirrored`);
  
  if (!response.ok) {
    throw new Error(`Failed to get mirrored repositories: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.repositories;
}

function createLargeStarredRepoDataset(count: number) {
  const owners = ["facebook", "microsoft", "google", "apple", "netflix", "airbnb", "uber", "spotify"];
  const repos = [];
  
  for (let i = 0; i < count; i++) {
    const owner = owners[i % owners.length];
    const repoName = `repo-${i}`;
    
    repos.push({
      fullName: `${owner}/${repoName}`,
      name: repoName,
      owner: owner,
      isStarred: true,
      isPrivate: Math.random() > 0.7, // 30% private repos
      isForked: Math.random() > 0.8,  // 20% forked repos
      size: Math.floor(Math.random() * 10000) + 100,
      language: ["JavaScript", "TypeScript", "Python", "Java", "Go"][Math.floor(Math.random() * 5)],
    });
  }
  
  return repos;
}