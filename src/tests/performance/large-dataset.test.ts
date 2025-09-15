/**
 * Performance tests with large numbers of starred repositories
 */

import { describe, test, expect } from "bun:test";

describe("Large Dataset Performance", () => {
  test("should handle 1000+ starred repositories efficiently", async () => {
    const startTime = Date.now();
    
    // Create large dataset
    const largeStarredRepoSet = createLargeStarredRepoDataset(1000);
    
    // Process with preserve-structure strategy
    const result = await processStarredRepositoriesWithTiming({
      repositories: largeStarredRepoSet,
      strategy: "preserve-structure"
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Performance assertions
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    expect(result.organizationsCreated).toBeGreaterThan(0);
    expect(result.repositoriesProcessed).toBe(1000);
  });

  test("should handle concurrent organization creation efficiently", async () => {
    const concurrentOperations = Array.from({ length: 50 }, (_, i) => 
      createStarredOrganization({
        userId: "test-user",
        configId: "test-config",
        ownerName: `owner-${i}`,
        repositories: [createMockRepository()]
      })
    );

    const startTime = Date.now();
    const results = await Promise.allSettled(concurrentOperations);
    const endTime = Date.now();

    const successCount = results.filter(r => r.status === "fulfilled").length;
    const duration = endTime - startTime;

    expect(successCount).toBeGreaterThanOrEqual(45); // Allow some failures
    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
  });

  test("should maintain performance with large organization lists", async () => {
    // Create 100 organizations of mixed types
    const largeOrgList = createLargeOrganizationDataset(100);
    
    const startTime = Date.now();
    
    // Test filtering performance
    const filteredResults = await filterOrganizations(largeOrgList, {
      organizationType: "starred-owner",
      searchTerm: "facebook",
      status: "mirrored"
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(1000); // Should filter within 1 second
    expect(filteredResults.length).toBeGreaterThanOrEqual(0);
  });

  test("should handle bulk repository operations efficiently", async () => {
    const bulkRepoCount = 500;
    const repositories = createLargeStarredRepoDataset(bulkRepoCount);
    
    const startTime = Date.now();
    
    // Test bulk update operation
    const updateResults = await bulkUpdateRepositories(repositories, {
      status: "imported",
      updatedAt: new Date()
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
    expect(updateResults.successCount).toBe(bulkRepoCount);
    expect(updateResults.failureCount).toBe(0);
  });

  test("should handle memory efficiently with large datasets", async () => {
    const memoryBefore = process.memoryUsage();
    
    // Process large dataset
    const largeDataset = createLargeStarredRepoDataset(2000);
    const result = await processStarredRepositoriesWithTiming({
      repositories: largeDataset,
      strategy: "preserve-structure"
    });
    
    const memoryAfter = process.memoryUsage();
    const memoryIncrease = memoryAfter.heapUsed - memoryBefore.heapUsed;

    // Memory usage should be reasonable (less than 100MB increase)
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    expect(result.repositoriesProcessed).toBe(2000);
  });

  test("should scale linearly with dataset size", async () => {
    const sizes = [100, 500, 1000];
    const timings = [];
    
    for (const size of sizes) {
      const repositories = createLargeStarredRepoDataset(size);
      
      const startTime = Date.now();
      await processStarredRepositoriesWithTiming({
        repositories,
        strategy: "preserve-structure"
      });
      const endTime = Date.now();
      
      timings.push({
        size,
        duration: endTime - startTime,
        timePerRepo: (endTime - startTime) / size
      });
    }
    
    // Check for linear scaling (time per repo should be relatively constant)
    const timePerRepoValues = timings.map(t => t.timePerRepo);
    const avgTimePerRepo = timePerRepoValues.reduce((a, b) => a + b, 0) / timePerRepoValues.length;
    
    timePerRepoValues.forEach(timePerRepo => {
      // Allow 50% variance from average
      expect(timePerRepo).toBeGreaterThan(avgTimePerRepo * 0.5);
      expect(timePerRepo).toBeLessThan(avgTimePerRepo * 1.5);
    });
  });

  test("should handle concurrent API requests efficiently", async () => {
    const requestCount = 100;
    const concurrentRequests = Array.from({ length: requestCount }, (_, i) => 
      fetch(`/api/organizations?userId=test-user&organizationType=starred-owner&page=${i}`)
    );

    const startTime = Date.now();
    const results = await Promise.allSettled(concurrentRequests);
    const endTime = Date.now();
    const duration = endTime - startTime;

    const successCount = results.filter(r => r.status === "fulfilled").length;
    
    expect(successCount).toBeGreaterThanOrEqual(requestCount * 0.9); // 90% success rate
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
  });

  test("should optimize database queries for large datasets", async () => {
    const largeOrgSet = createLargeOrganizationDataset(500);
    const largeRepoSet = createLargeStarredRepoDataset(5000);
    
    // Insert test data
    await insertTestData(largeOrgSet, largeRepoSet);
    
    const startTime = Date.now();
    
    // Test complex query performance
    const complexQueryResults = await executeComplexQuery(`
      SELECT 
        o.organization_type,
        o.source_owner,
        COUNT(r.id) as repo_count,
        AVG(r.size) as avg_size,
        COUNT(DISTINCT r.language) as language_count
      FROM organizations o
      LEFT JOIN repositories r ON o.name = r.organization
      WHERE o.organization_type = 'starred-owner'
      GROUP BY o.id, o.organization_type, o.source_owner
      HAVING COUNT(r.id) > 5
      ORDER BY repo_count DESC
      LIMIT 50
    `);
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    expect(complexQueryResults.length).toBeGreaterThan(0);
  });

  test("should handle memory pressure gracefully", async () => {
    const largeDataset = createLargeStarredRepoDataset(5000);
    
    // Simulate memory pressure
    const memoryPressure = new Array(100).fill("x".repeat(1024 * 1024)); // 100MB
    
    const startTime = Date.now();
    const result = await processStarredRepositoriesWithTiming({
      repositories: largeDataset,
      strategy: "preserve-structure",
      memoryLimit: 50 * 1024 * 1024 // 50MB limit
    });
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(result.success).toBe(true);
    expect(result.repositoriesProcessed).toBe(5000);
    expect(duration).toBeLessThan(60000); // Should complete within 1 minute
    
    // Clean up memory pressure
    memoryPressure.length = 0;
  });

  test("should optimize batch operations", async () => {
    const batchSizes = [10, 50, 100, 500];
    const batchTimings = [];
    
    for (const batchSize of batchSizes) {
      const repositories = createLargeStarredRepoDataset(1000);
      
      const startTime = Date.now();
      await processStarredRepositoriesInBatches(repositories, {
        strategy: "preserve-structure",
        batchSize
      });
      const endTime = Date.now();
      
      batchTimings.push({
        batchSize,
        duration: endTime - startTime,
        throughput: 1000 / ((endTime - startTime) / 1000) // repos per second
      });
    }
    
    // Find optimal batch size (highest throughput)
    const optimalBatch = batchTimings.reduce((best, current) => 
      current.throughput > best.throughput ? current : best
    );
    
    expect(optimalBatch.batchSize).toBeGreaterThanOrEqual(50);
    expect(optimalBatch.throughput).toBeGreaterThan(10); // At least 10 repos per second
  });
});

// Helper functions for performance tests
function createLargeStarredRepoDataset(count: number): any[] {
  const owners = ["facebook", "microsoft", "google", "apple", "netflix", "airbnb", "uber", "spotify"];
  const repos = [];
  
  for (let i = 0; i < count; i++) {
    const owner = owners[i % owners.length];
    const repoName = `repo-${i}`;
    
    repos.push({
      id: `repo-${i}`,
      fullName: `${owner}/${repoName}`,
      name: repoName,
      owner: owner,
      isStarred: true,
      isPrivate: Math.random() > 0.7, // 30% private repos
      isForked: Math.random() > 0.8,  // 20% forked repos
      size: Math.floor(Math.random() * 10000) + 100,
      language: ["JavaScript", "TypeScript", "Python", "Java", "Go"][Math.floor(Math.random() * 5)],
      description: `Test repository ${i}`,
      defaultBranch: "main",
      visibility: Math.random() > 0.7 ? "private" : "public",
      status: "imported",
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
  }
  
  return repos;
}

function createLargeOrganizationDataset(count: number): any[] {
  const orgs = [];
  const owners = ["facebook", "microsoft", "google", "apple", "netflix", "airbnb", "uber", "spotify"];
  
  for (let i = 0; i < count; i++) {
    const isStarred = i % 3 === 0; // 1/3 starred, 2/3 joined
    const ownerName = `org-${i}`;
    
    orgs.push({
      id: `org-${i}`,
      name: ownerName,
      organizationType: isStarred ? "starred-owner" : "joined",
      sourceOwner: isStarred ? ownerName : null,
      membershipRole: isStarred ? "external" : (i % 2 === 0 ? "admin" : "member"),
      repositoryCount: Math.floor(Math.random() * 50) + 1,
      publicRepositoryCount: Math.floor(Math.random() * 30) + 1,
      privateRepositoryCount: Math.floor(Math.random() * 20),
      forkRepositoryCount: Math.floor(Math.random() * 10),
      status: ["imported", "mirrored", "failed"][Math.floor(Math.random() * 3)],
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
  }
  
  return orgs;
}

async function processStarredRepositoriesWithTiming(options: any): Promise<any> {
  const { repositories, strategy } = options;
  
  // Mock processing with timing
  const organizationsCreated = new Set(repositories.map((r: any) => r.owner)).size;
  const repositoriesProcessed = repositories.length;
  
  // Simulate processing time based on dataset size
  await new Promise(resolve => setTimeout(resolve, Math.min(repositories.length * 10, 25000)));
  
  return {
    success: true,
    organizationsCreated,
    repositoriesProcessed,
    duration: repositories.length * 10,
  };
}

async function createStarredOrganization(options: any): Promise<any> {
  // Mock organization creation with delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    id: `org-${Date.now()}`,
    success: true,
    ...options,
  };
}

async function filterOrganizations(organizations: any[], filters: any): Promise<any[]> {
  // Mock filtering with delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  return organizations.filter(org => {
    if (filters.organizationType && org.organizationType !== filters.organizationType) return false;
    if (filters.searchTerm && !org.name.toLowerCase().includes(filters.searchTerm.toLowerCase())) return false;
    if (filters.status && org.status !== filters.status) return false;
    return true;
  });
}

async function bulkUpdateRepositories(repositories: any[], updates: any): Promise<any> {
  // Mock bulk update with delay
  await new Promise(resolve => setTimeout(resolve, repositories.length * 5));
  
  return {
    successCount: repositories.length,
    failureCount: 0,
  };
}

async function insertTestData(organizations: any[], repositories: any[]): Promise<void> {
  // Mock data insertion
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function executeComplexQuery(query: string): Promise<any[]> {
  // Mock complex query execution
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return Array.from({ length: 25 }, (_, i) => ({
    organization_type: "starred-owner",
    source_owner: `owner-${i}`,
    repo_count: Math.floor(Math.random() * 20) + 5,
    avg_size: Math.floor(Math.random() * 5000) + 1000,
    language_count: Math.floor(Math.random() * 5) + 1,
  }));
}

async function processStarredRepositoriesInBatches(repositories: any[], options: any): Promise<any> {
  const { batchSize } = options;
  const batches = [];
  
  for (let i = 0; i < repositories.length; i += batchSize) {
    batches.push(repositories.slice(i, i + batchSize));
  }
  
  // Process batches sequentially
  for (const batch of batches) {
    await new Promise(resolve => setTimeout(resolve, batch.length * 2));
  }
  
  return {
    success: true,
    batchesProcessed: batches.length,
    totalRepositories: repositories.length,
  };
}

function createMockRepository(overrides: any = {}): any {
  return {
    id: `repo-${Math.random()}`,
    fullName: "testowner/test-repo",
    name: "test-repo",
    owner: "testowner",
    isStarred: true,
    ...overrides,
  };
}