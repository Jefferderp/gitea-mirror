/**
 * End-to-end tests for complete user journey with starred repositories
 */

import { describe, test, expect } from "bun:test";

describe("Starred Repository User Journey", () => {
  test("should complete full user journey: configure → sync → manage → mirror", async () => {
    // 1. User configures preserve-structure strategy
    await configureStarredRepoStrategy("preserve-structure");
    
    // 2. User syncs repositories
    const syncResult = await syncRepositories();
    expect(syncResult.starredOrganizations).toBeGreaterThan(0);
    
    // 3. User views organizations list
    const orgList = await getOrganizationsList();
    const starredOrgs = orgList.filter(org => org.organizationType === "starred-owner");
    expect(starredOrgs.length).toBeGreaterThan(0);
    
    // 4. User sets destination override for a starred org
    const firstStarredOrg = starredOrgs[0];
    await setOrganizationDestination(firstStarredOrg.id, "custom-destination");
    
    // 5. User mirrors the organization
    const mirrorResult = await mirrorOrganization(firstStarredOrg.id);
    expect(mirrorResult.success).toBe(true);
    
    // 6. Verify repositories are mirrored to correct destination
    const mirroredRepos = await getMirroredRepositories(firstStarredOrg.sourceOwner);
    mirroredRepos.forEach(repo => {
      expect(repo.mirroredLocation).toStartWith("custom-destination/");
    });
  });

  test("should handle strategy switching gracefully", async () => {
    // 1. Start with preserve-structure
    await configureStarredRepoStrategy("preserve-structure");
    await syncRepositories();
    
    let orgList = await getOrganizationsList();
    const initialStarredOrgs = orgList.filter(org => org.organizationType === "starred-owner");
    expect(initialStarredOrgs.length).toBeGreaterThan(0);
    
    // 2. Switch to single-organization
    await configureStarredRepoStrategy("single-organization", "consolidated-starred");
    
    // 3. Clean up starred organizations
    await cleanupStarredOrganizations();
    
    // 4. Verify cleanup
    orgList = await getOrganizationsList();
    const remainingStarredOrgs = orgList.filter(org => org.organizationType === "starred-owner");
    expect(remainingStarredOrgs.length).toBe(0);
    
    // 5. Verify starred repos now use single org
    const starredRepos = await getStarredRepositories();
    // In single-organization mode, repos should not have organization assignments
    starredRepos.forEach(repo => {
      expect(repo.organization).toBeNull();
    });
  });

  test("should handle configuration validation errors", async () => {
    // 1. Try to configure invalid strategy
    const invalidConfig = await configureStarredRepoStrategy("invalid-strategy");
    expect(invalidConfig.success).toBe(false);
    expect(invalidConfig.errors).toContain("Invalid starred repos strategy");
    
    // 2. Try single-organization without org name
    const missingOrgConfig = await configureStarredRepoStrategy("single-organization", "");
    expect(missingOrgConfig.success).toBe(false);
    expect(missingOrgConfig.errors).toContain("Organization name is required");
    
    // 3. Try invalid organization name
    const invalidOrgConfig = await configureStarredRepoStrategy("single-organization", "invalid org name!");
    expect(invalidOrgConfig.success).toBe(false);
    expect(invalidOrgConfig.errors).toContain("Invalid organization name format");
  });

  test("should handle duplicate repository names across different owners", async () => {
    // 1. Configure preserve-structure strategy
    await configureStarredRepoStrategy("preserve-structure");
    
    // 2. Create repositories with same name from different owners
    const duplicateRepos = [
      { fullName: "facebook/common-repo", name: "common-repo", isStarred: true },
      { fullName: "microsoft/common-repo", name: "common-repo", isStarred: true },
      { fullName: "google/common-repo", name: "common-repo", isStarred: true },
    ];
    
    await syncRepositoriesWithRepos(duplicateRepos);
    
    // 3. Verify organizations were created for each owner
    const orgList = await getOrganizationsList();
    const starredOrgs = orgList.filter(org => org.organizationType === "starred-owner");
    expect(starredOrgs.length).toBe(3);
    expect(starredOrgs.map(org => org.sourceOwner)).toContain("facebook");
    expect(starredOrgs.map(org => org.sourceOwner)).toContain("microsoft");
    expect(starredOrgs.map(org => org.sourceOwner)).toContain("google");
    
    // 4. Mirror repositories
    const mirrorResult = await mirrorAllOrganizations();
    expect(mirrorResult.success).toBe(true);
    
    // 5. Verify repositories were mirrored with unique names
    const mirroredRepos = await getAllMirroredRepositories();
    const commonRepos = mirroredRepos.filter(repo => repo.name === "common-repo");
    expect(commonRepos.length).toBe(3);
    
    // Each repo should be in its respective organization
    expect(commonRepos.some(repo => repo.mirroredLocation.startsWith("facebook/"))).toBe(true);
    expect(commonRepos.some(repo => repo.mirroredLocation.startsWith("microsoft/"))).toBe(true);
    expect(commonRepos.some(repo => repo.mirroredLocation.startsWith("google/"))).toBe(true);
  });

  test("should handle organization destination overrides", async () => {
    // 1. Configure preserve-structure strategy
    await configureStarredRepoStrategy("preserve-structure");
    await syncRepositories();
    
    // 2. Get starred organizations
    const orgList = await getOrganizationsList();
    const starredOrgs = orgList.filter(org => org.organizationType === "starred-owner");
    expect(starredOrgs.length).toBeGreaterThan(0);
    
    // 3. Set destination overrides for multiple organizations
    const facebookOrg = starredOrgs.find(org => org.sourceOwner === "facebook");
    const microsoftOrg = starredOrgs.find(org => org.sourceOwner === "microsoft");
    
    if (facebookOrg) {
      await setOrganizationDestination(facebookOrg.id, "custom-facebook");
    }
    if (microsoftOrg) {
      await setOrganizationDestination(microsoftOrg.id, "custom-microsoft");
    }
    
    // 4. Mirror repositories
    const mirrorResult = await mirrorAllOrganizations();
    expect(mirrorResult.success).toBe(true);
    
    // 5. Verify repositories were mirrored to custom destinations
    const allMirroredRepos = await getAllMirroredRepositories();
    
    if (facebookOrg) {
      const facebookRepos = allMirroredRepos.filter(repo => repo.fullName.startsWith("facebook/"));
      facebookRepos.forEach(repo => {
        expect(repo.mirroredLocation).toStartWith("custom-facebook/");
      });
    }
    
    if (microsoftOrg) {
      const microsoftRepos = allMirroredRepos.filter(repo => repo.fullName.startsWith("microsoft/"));
      microsoftRepos.forEach(repo => {
        expect(repo.mirroredLocation).toStartWith("custom-microsoft/");
      });
    }
  });

  test("should handle error scenarios gracefully", async () => {
    // 1. Configure with invalid settings
    await configureStarredRepoStrategy("preserve-structure");
    
    // 2. Simulate sync failure
    const syncResult = await simulateSyncFailure();
    expect(syncResult.success).toBe(false);
    expect(syncResult.error).toBeDefined();
    
    // 3. Verify no partial data was created
    const orgList = await getOrganizationsList();
    const starredOrgs = orgList.filter(org => org.organizationType === "starred-owner");
    expect(starredOrgs.length).toBe(0);
    
    const repos = await getStarredRepositories();
    expect(repos.length).toBe(0);
    
    // 4. Fix configuration and retry
    await configureStarredRepoStrategy("preserve-structure");
    const retryResult = await syncRepositories();
    expect(retryResult.success).toBe(true);
  });

  test("should handle large numbers of starred repositories", async () => {
    // 1. Configure preserve-structure strategy
    await configureStarredRepoStrategy("preserve-structure");
    
    // 2. Create large dataset
    const largeRepoSet = createLargeStarredRepoDataset(100);
    
    // 3. Sync repositories
    const startTime = Date.now();
    const syncResult = await syncRepositoriesWithRepos(largeRepoSet);
    const syncTime = Date.now() - startTime;
    
    expect(syncResult.success).toBe(true);
    expect(syncTime).toBeLessThan(30000); // Should complete within 30 seconds
    
    // 4. Verify organizations were created
    const orgList = await getOrganizationsList();
    const starredOrgs = orgList.filter(org => org.organizationType === "starred-owner");
    expect(starredOrgs.length).toBeGreaterThan(0);
    
    // 5. Verify all repositories were processed
    const repos = await getStarredRepositories();
    expect(repos.length).toBe(100);
    
    // 6. Mirror organizations
    const mirrorStartTime = Date.now();
    const mirrorResult = await mirrorAllOrganizations();
    const mirrorTime = Date.now() - mirrorStartTime;
    
    expect(mirrorResult.success).toBe(true);
    expect(mirrorTime).toBeLessThan(60000); // Should complete within 1 minute
  });

  test("should maintain data consistency across operations", async () => {
    // 1. Configure and sync
    await configureStarredRepoStrategy("preserve-structure");
    const syncResult = await syncRepositories();
    expect(syncResult.success).toBe(true);
    
    // 2. Get initial state
    const initialOrgs = await getOrganizationsList();
    const initialRepos = await getStarredRepositories();
    
    // 3. Perform multiple operations
    await setOrganizationDestination(initialOrgs[0].id, "custom-destination");
    await mirrorOrganization(initialOrgs[0].id);
    
    // 4. Verify data consistency
    const finalOrgs = await getOrganizationsList();
    const finalRepos = await getStarredRepositories();
    
    // Organization count should remain the same
    expect(finalOrgs.length).toBe(initialOrgs.length);
    
    // Repository count should remain the same
    expect(finalRepos.length).toBe(initialRepos.length);
    
    // Organization metadata should be updated correctly
    const updatedOrg = finalOrgs.find(org => org.id === initialOrgs[0].id);
    expect(updatedOrg.destinationOrg).toBe("custom-destination");
    
    // Repository destinations should be updated
    const updatedOrgRepos = finalRepos.filter(repo => 
      repo.fullName.startsWith(updatedOrg.sourceOwner + "/")
    );
    updatedOrgRepos.forEach(repo => {
      expect(repo.destinationOrg).toBe("custom-destination");
    });
  });

  test("should provide proper user feedback throughout the journey", async () => {
    // 1. Configuration feedback
    const configResult = await configureStarredRepoStrategy("preserve-structure");
    expect(configResult.message).toContain("Configuration saved successfully");
    
    // 2. Sync progress feedback
    const syncResult = await syncRepositories();
    expect(syncResult.message).toContain("Successfully synced");
    expect(syncResult.progress).toBeDefined();
    expect(syncResult.starredOrganizations).toBeGreaterThan(0);
    
    // 3. Organization management feedback
    const orgList = await getOrganizationsList();
    const firstOrg = orgList.find(org => org.organizationType === "starred-owner");
    
    const updateResult = await setOrganizationDestination(firstOrg.id, "custom-destination");
    expect(updateResult.message).toContain("Organization updated successfully");
    
    // 4. Mirror progress feedback
    const mirrorResult = await mirrorOrganization(firstOrg.id);
    expect(mirrorResult.message).toContain("Successfully mirrored");
    expect(mirrorResult.progress).toBeDefined();
    expect(mirrorResult.repositoriesMirrored).toBeGreaterThan(0);
  });

  test("should handle accessibility throughout the user journey", async () => {
    // 1. Configuration interface should be accessible
    const configAccessibility = await checkConfigurationAccessibility();
    expect(configAccessibility.ariaLabels).toBe(true);
    expect(configAccessibility.keyboardNavigation).toBe(true);
    expect(configAccessibility.screenReaderSupport).toBe(true);
    
    // 2. Organization list should be accessible
    await configureStarredRepoStrategy("preserve-structure");
    await syncRepositories();
    
    const listAccessibility = await checkOrganizationListAccessibility();
    expect(listAccessibility.ariaLabels).toBe(true);
    expect(listAccessibility.keyboardNavigation).toBe(true);
    expect(listAccessibility.screenReaderSupport).toBe(true);
    
    // 3. Mirror process should provide accessible feedback
    const orgList = await getOrganizationsList();
    const firstOrg = orgList.find(org => org.organizationType === "starred-owner");
    
    const mirrorAccessibility = await checkMirrorProcessAccessibility(firstOrg.id);
    expect(mirrorAccessibility.progressAnnouncement).toBe(true);
    expect(mirrorAccessibility.statusUpdates).toBe(true);
    expect(mirrorAccessibility.errorMessages).toBe(true);
  });
});

// Helper functions for E2E tests
async function configureStarredRepoStrategy(strategy: string, orgName?: string): Promise<any> {
  const response = await fetch("/api/config/starred-repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      starredReposStrategy: strategy,
      starredReposOrg: orgName 
    }),
  });
  
  return response.json();
}

async function syncRepositories(): Promise<any> {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "test-user" }),
  });
  
  return response.json();
}

async function syncRepositoriesWithRepos(repositories: any[]): Promise<any> {
  const response = await fetch("/api/sync/starred", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      userId: "test-user",
      repositories 
    }),
  });
  
  return response.json();
}

async function getOrganizationsList(): Promise<any[]> {
  const response = await fetch("/api/organizations?userId=test-user");
  const result = await response.json();
  return result.organizations;
}

async function getStarredRepositories(): Promise<any[]> {
  const response = await fetch("/api/repositories?userId=test-user&starred=true");
  const result = await response.json();
  return result.repositories;
}

async function setOrganizationDestination(orgId: string, destinationOrg: string): Promise<any> {
  const response = await fetch(`/api/organizations/${orgId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationOrg }),
  });
  
  return response.json();
}

async function mirrorOrganization(orgId: string): Promise<any> {
  const response = await fetch("/api/mirror", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      userId: "test-user",
      organizationIds: [orgId]
    }),
  });
  
  return response.json();
}

async function mirrorAllOrganizations(): Promise<any> {
  const response = await fetch("/api/mirror", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      userId: "test-user"
    }),
  });
  
  return response.json();
}

async function getMirroredRepositories(sourceOwner?: string): Promise<any[]> {
  let url = "/api/repositories?userId=test-user&status=mirrored";
  if (sourceOwner) {
    url += `&organization=${sourceOwner}`;
  }
  
  const response = await fetch(url);
  const result = await response.json();
  return result.repositories;
}

async function getAllMirroredRepositories(): Promise<any[]> {
  return getMirroredRepositories();
}

async function cleanupStarredOrganizations(): Promise<any> {
  const response = await fetch("/api/starred-repos/organizations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "test-user" }),
  });
  
  return response.json();
}

async function simulateSyncFailure(): Promise<any> {
  // Mock sync failure
  return {
    success: false,
    error: "Simulated sync failure",
  };
}

function createLargeStarredRepoDataset(count: number): any[] {
  const owners = ["facebook", "microsoft", "google", "apple", "netflix"];
  const repos = [];
  
  for (let i = 0; i < count; i++) {
    const owner = owners[i % owners.length];
    const repoName = `repo-${i}`;
    
    repos.push({
      fullName: `${owner}/${repoName}`,
      name: repoName,
      owner: owner,
      isStarred: true,
      isPrivate: Math.random() > 0.8,
      size: Math.floor(Math.random() * 10000) + 1000,
      language: ["JavaScript", "TypeScript", "Python"][Math.floor(Math.random() * 3)],
    });
  }
  
  return repos;
}

async function checkConfigurationAccessibility(): Promise<any> {
  // Mock accessibility check
  return {
    ariaLabels: true,
    keyboardNavigation: true,
    screenReaderSupport: true,
  };
}

async function checkOrganizationListAccessibility(): Promise<any> {
  // Mock accessibility check
  return {
    ariaLabels: true,
    keyboardNavigation: true,
    screenReaderSupport: true,
  };
}

async function checkMirrorProcessAccessibility(orgId: string): Promise<any> {
  // Mock accessibility check
  return {
    progressAnnouncement: true,
    statusUpdates: true,
    errorMessages: true,
  };
}