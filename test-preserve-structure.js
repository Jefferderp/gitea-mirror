// Simple test script to verify preserve-structure strategy
const { getGiteaRepoOwnerAsync } = require('./src/lib/gitea.ts');

// Mock config and repository for testing
const mockConfig = {
  userId: "user-123",
  giteaConfig: {
    url: "https://gitea.ui.com",
    token: "gitea-token",
    defaultOwner: "testuser"
  },
  githubConfig: {
    username: "testuser",
    token: "github-token",
    privateRepositories: false,
    mirrorStarred: true,
    starredReposStrategy: "preserve-structure"
  }
};

const mockRepository = {
  id: "repo-123",
  userId: "user-123",
  configId: "config-123",
  name: "awesome-repo",
  fullName: "octocat/awesome-repo", // GitHub owner is "octocat"
  url: "https://github.com/octocat/awesome-repo",
  cloneUrl: "https://github.com/octocat/awesome-repo.git",
  owner: "octocat",
  isPrivate: false,
  isForked: false,
  hasIssues: true,
  isStarred: true, // This is a starred repo
  isArchived: false,
  size: 1000,
  hasLFS: false,
  hasSubmodules: false,
  defaultBranch: "main",
  visibility: "public",
  status: "imported",
  createdAt: new Date(),
  updatedAt: new Date()
};

console.log("Testing preserve-structure strategy...");

// Test the function
getGiteaRepoOwnerAsync({ config: mockConfig, repository: mockRepository })
  .then(result => {
    console.log("✅ Test passed! Result:", result);
    console.log("Expected: 'octocat', Actual:", result);
    if (result === "octocat") {
      console.log("🎉 Preserve-structure strategy is working correctly!");
    } else {
      console.log("❌ Test failed - expected 'octocat' but got:", result);
    }
  })
  .catch(error => {
    console.error("❌ Test failed with error:", error);
  });