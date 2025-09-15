/**
 * Helper functions for starred repository testing
 */

import type { Config, Repository, Organization } from "@/lib/db/schema";

export function createMockStarredRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: `starred-repo-${Math.random()}`,
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
    isStarred: true, // Key difference - this is a starred repo
    isArchived: false,
    size: 1000,
    hasLFS: false,
    hasSubmodules: false,
    language: "TypeScript",
    description: "Test starred repository",
    defaultBranch: "main",
    visibility: "public",
    status: "imported",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Repository;
}

export function createMockStarredOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: `starred-org-${Math.random()}`,
    userId: "test-user-id",
    configId: "test-config-id",
    name: "testowner",
    organizationType: "starred-owner",
    sourceOwner: "testowner",
    avatarUrl: "https://github.com/testowner.png",
    membershipRole: "external",
    isIncluded: true,
    destinationOrg: null,
    status: "imported",
    lastMirrored: null,
    errorMessage: null,
    repositoryCount: 5,
    publicRepositoryCount: 3,
    privateRepositoryCount: 2,
    forkRepositoryCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Organization;
}

export function createLargeStarredRepoDataset(count: number): Repository[] {
  const owners = ["facebook", "microsoft", "google", "apple", "netflix", "airbnb", "uber", "spotify"];
  const repos: Repository[] = [];
  
  for (let i = 0; i < count; i++) {
    const owner = owners[i % owners.length];
    const repoName = `repo-${i}`;
    
    repos.push(createMockStarredRepository({
      id: `repo-${i}`,
      name: repoName,
      fullName: `${owner}/${repoName}`,
      owner: owner,
      isPrivate: Math.random() > 0.7, // 30% private repos
      isForked: Math.random() > 0.8,  // 20% forked repos
      language: ["JavaScript", "TypeScript", "Python", "Java", "Go"][Math.floor(Math.random() * 5)],
      description: `Test repository ${i}`,
      size: Math.floor(Math.random() * 10000) + 100,
    }));
  }
  
  return repos;
}

export function createLargeOrganizationDataset(count: number): Organization[] {
  const orgs: Organization[] = [];
  
  for (let i = 0; i < count; i++) {
    const isStarred = i % 3 === 0; // 1/3 starred, 2/3 joined
    const ownerName = `org-${i}`;
    
    orgs.push({
      id: `org-${i}`,
      userId: "test-user-id",
      configId: "test-config-id",
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
      isIncluded: true,
      destinationOrg: null,
      lastMirrored: null,
      errorMessage: null,
      avatarUrl: `https://github.com/${ownerName}.png`,
    } as Organization);
  }
  
  return orgs;
}

// Database testing helpers
export async function setupStarredRepoTestDatabase(): Promise<void> {
  // Initialize test database with starred repo schema
  await runMigrations();
  await createTestUserAndConfig();
}

export async function cleanupStarredRepoTestDatabase(): Promise<void> {
  // Clean up test data
  await clearTestData();
}

// API testing helpers
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(endpoint, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getTestToken()}`,
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function createTestStarredOrganization(overrides: Partial<Organization> = {}): Promise<Organization> {
  const org = createMockStarredOrganization(overrides);
  
  // Mock database insertion
  return {
    ...org,
    id: `org-${Date.now()}`,
    ...overrides,
  };
}

export async function createTestStarredRepositories(count: number = 5): Promise<Repository[]> {
  const repos: Repository[] = [];
  
  for (let i = 0; i < count; i++) {
    const owner = ["facebook", "microsoft", "google", "apple", "netflix"][i % 5];
    const repoName = `test-repo-${i}`;
    
    repos.push(createMockStarredRepository({
      id: `repo-${Date.now()}-${i}`,
      name: repoName,
      fullName: `${owner}/${repoName}`,
      owner: owner,
    }));
  }
  
  return repos;
}

// Migration testing helpers
export async function testMigrationSafety(migrationName: string): Promise<boolean> {
  try {
    // Backup current state
    await backupDatabase();
    
    // Run migration
    await runMigration(migrationName);
    
    // Validate result
    const isValid = await validateMigrationResult(migrationName);
    
    // Rollback
    await rollbackMigration(migrationName);
    
    // Validate rollback
    const rollbackValid = await validateRollback(migrationName);
    
    return isValid && rollbackValid;
  } catch (error) {
    console.error("Migration safety test failed:", error);
    return false;
  }
}

// Performance testing helpers
export function measurePerformance<T>(
  fn: () => Promise<T>,
  name: string
): Promise<{ result: T; duration: number; memoryUsage: number }> {
  const startMemory = process.memoryUsage();
  const startTime = Date.now();
  
  return fn().then(result => {
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    
    return {
      result,
      duration: endTime - startTime,
      memoryUsage: endMemory.heapUsed - startMemory.heapUsed,
    };
  });
}

export async function benchmarkOperation<T>(
  operation: () => Promise<T>,
  iterations: number = 10
): Promise<{
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  averageMemoryUsage: number;
}> {
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    const result = await measurePerformance(operation, `iteration-${i}`);
    results.push(result);
  }
  
  const durations = results.map(r => r.duration);
  const memoryUsages = results.map(r => r.memoryUsage);
  
  return {
    averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    averageMemoryUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
  };
}

// Mock data generators
export function generateMockGitHubOwners(count: number): string[] {
  const prefixes = ["facebook", "microsoft", "google", "apple", "netflix", "airbnb", "uber", "spotify"];
  const suffixes = ["labs", "inc", "org", "team", "dev", "opensource"];
  
  const owners = new Set<string>();
  
  while (owners.size < count) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const number = Math.floor(Math.random() * 1000);
    
    owners.add(`${prefix}-${suffix}-${number}`);
  }
  
  return Array.from(owners);
}

export function generateMockRepositoryNames(count: number): string[] {
  const adjectives = ["awesome", "amazing", "fantastic", "incredible", "wonderful"];
  const nouns = ["project", "library", "framework", "tool", "application"];
  const suffixes = ["js", "py", "go", "rs", "ts"];
  
  const names = new Set<string>();
  
  while (names.size < count) {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const number = Math.floor(Math.random() * 1000);
    
    names.add(`${adjective}-${noun}-${suffix}-${number}`);
  }
  
  return Array.from(names);
}

// Assertion helpers
export function expectStarredOrganization(org: Organization): void {
  expect(org).toBeDefined();
  expect(org.organizationType).toBe("starred-owner");
  expect(org.sourceOwner).toBeDefined();
  expect(org.membershipRole).toBe("external");
}

export function expectStarredRepository(repo: Repository): void {
  expect(repo).toBeDefined();
  expect(repo.isStarred).toBe(true);
  expect(repo.fullName).toBeDefined();
  expect(repo.owner).toBeDefined();
}

export function expectValidOrganizationName(name: string): void {
  expect(name).toMatch(/^[a-zA-Z0-9-]+$/);
  expect(name.length).toBeGreaterThan(0);
  expect(name.length).toBeLessThan(40);
}

export function expectValidRepositoryName(name: string): void {
  expect(name).toMatch(/^[a-zA-Z0-9._-]+$/);
  expect(name.length).toBeGreaterThan(0);
  expect(name.length).toBeLessThan(100);
}

// Mock functions for testing
export const mockFunctions = {
  mockFetch: (response: any) => {
    return jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
      status: 200,
      statusText: "OK",
    });
  },
  
  mockFetchError: (status: number, message: string) => {
    return jest.fn().mockResolvedValue({
      ok: false,
      status,
      statusText: message,
      json: () => Promise.resolve({ error: message }),
    });
  },
  
  mockDatabase: () => {
    return {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue({ insertedId: "mock-id" }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    };
  },
};

// Utility functions
export function createTestUserAndConfig(): Promise<void> {
  // Mock user and config creation
  return Promise.resolve();
}

export function getTestToken(): string {
  return `test-token-${Date.now()}`;
}

export function runMigrations(): Promise<void> {
  // Mock migration execution
  return Promise.resolve();
}

export function clearTestData(): Promise<void> {
  // Mock test data cleanup
  return Promise.resolve();
}

export function backupDatabase(): Promise<void> {
  // Mock database backup
  return Promise.resolve();
}

export function runMigration(migrationName: string): Promise<void> {
  // Mock migration execution
  return Promise.resolve();
}

export function rollbackMigration(migrationName: string): Promise<void> {
  // Mock migration rollback
  return Promise.resolve();
}

export function validateMigrationResult(migrationName: string): Promise<boolean> {
  // Mock migration validation
  return Promise.resolve(true);
}

export function validateRollback(migrationName: string): Promise<boolean> {
  // Mock rollback validation
  return Promise.resolve(true);
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Error simulation helpers
export function simulateNetworkError(): Error {
  return new Error("Network request failed");
}

export function simulateDatabaseError(): Error {
  return new Error("Database operation failed");
}

export function simulateValidationError(field: string): Error {
  return new Error(`Validation failed for field: ${field}`);
}

export function simulateTimeoutError(timeout: number): Error {
  return new Error(`Operation timed out after ${timeout}ms`);
}

// Test data validation helpers
export function validateTestData(data: any, schema: any): boolean {
  // Simple schema validation
  for (const [key, type] of Object.entries(schema)) {
    if (typeof data[key] !== type) {
      return false;
    }
  }
  return true;
}

export function sanitizeTestData(data: any): any {
  // Remove sensitive information from test data
  const sanitized = { ...data };
  delete sanitized.token;
  delete sanitized.password;
  delete sanitized.secret;
  return sanitized;
}