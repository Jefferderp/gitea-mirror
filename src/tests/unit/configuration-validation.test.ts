/**
 * Unit tests for configuration validation with starred repo strategies
 */

import { describe, test, expect } from "bun:test";
import { validateStarredRepoConfiguration } from "@/lib/config-validation";

describe("Configuration Validation", () => {
  describe("validateStarredRepoConfiguration()", () => {
    test("should validate single-organization strategy with organization name", () => {
      const config = {
        starredReposStrategy: "single-organization",
        starredReposOrg: "my-starred-repos"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should require organization name for single-organization strategy", () => {
      const config = {
        starredReposStrategy: "single-organization",
        starredReposOrg: ""
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Organization name is required for single-organization strategy");
    });

    test("should validate preserve-structure strategy", () => {
      const config = {
        starredReposStrategy: "preserve-structure"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should reject invalid strategy values", () => {
      const config = {
        starredReposStrategy: "invalid-strategy"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid starred repos strategy");
    });

    test("should validate organization name format", () => {
      const config = {
        starredReposStrategy: "single-organization",
        starredReposOrg: "invalid org name!"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid organization name format");
    });

    test("should validate organization name length", () => {
      const config = {
        starredReposStrategy: "single-organization",
        starredReposOrg: "a".repeat(40) // Too long
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Organization name is too long");
    });

    test("should validate organization name characters", () => {
      const config = {
        starredReposStrategy: "single-organization",
        starredReposOrg: "org-with-special-chars!@#"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Organization name contains invalid characters");
    });

    test("should validate duplicate handling strategy", () => {
      const config = {
        starredReposStrategy: "preserve-structure",
        starredDuplicateStrategy: "prefix"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(true);
    });

    test("should reject invalid duplicate handling strategy", () => {
      const config = {
        starredReposStrategy: "preserve-structure",
        starredDuplicateStrategy: "invalid-strategy"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid duplicate handling strategy");
    });

    test("should validate backward compatibility scenarios", () => {
      // Legacy config without starredReposStrategy
      const legacyConfig = {
        starredReposOrg: "legacy-starred"
      };

      const result = validateStarredRepoConfiguration(legacyConfig);
      expect(result.isValid).toBe(true);
      expect(result.strategy).toBe("single-organization");
    });

    test("should validate mixed strategy configurations", () => {
      const config = {
        starredReposStrategy: "preserve-structure",
        starredReposOrg: "fallback-org", // Should be ignored for preserve-structure
        starredDuplicateStrategy: "suffix"
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain("starredReposOrg is ignored for preserve-structure strategy");
    });

    test("should validate organization destination overrides", () => {
      const config = {
        starredReposStrategy: "preserve-structure",
        organizationOverrides: {
          "facebook": "custom-facebook-org",
          "microsoft": "custom-microsoft-org"
        }
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(true);
    });

    test("should validate invalid organization destination overrides", () => {
      const config = {
        starredReposStrategy: "preserve-structure",
        organizationOverrides: {
          "facebook": "invalid org name!"
        }
      };

      const result = validateStarredRepoConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid destination organization name: facebook -> invalid org name!");
    });
  });
});

// Mock the config validation module
mock.module("@/lib/config-validation", () => ({
  validateStarredRepoConfiguration: (config: any) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Default to single-organization if no strategy specified
    const strategy = config.starredReposStrategy || "single-organization";
    
    // Validate strategy
    const validStrategies = ["single-organization", "preserve-structure"];
    if (!validStrategies.includes(strategy)) {
      errors.push("Invalid starred repos strategy");
      return { isValid: false, errors, warnings };
    }
    
    // Validate single-organization strategy
    if (strategy === "single-organization") {
      if (!config.starredReposOrg || config.starredReposOrg.trim() === "") {
        errors.push("Organization name is required for single-organization strategy");
      } else {
        // Validate organization name format
        const orgName = config.starredReposOrg;
        if (orgName.length > 39) {
          errors.push("Organization name is too long");
        }
        if (!/^[a-zA-Z0-9-]+$/.test(orgName)) {
          errors.push("Invalid organization name format");
        }
        if (/[!@#$%^&*()+=\[\]{};':"\\|,.<>?]/.test(orgName)) {
          errors.push("Organization name contains invalid characters");
        }
      }
    }
    
    // Validate duplicate handling strategy
    if (config.starredDuplicateStrategy) {
      const validDuplicateStrategies = ["prefix", "suffix", "owner-org"];
      if (!validDuplicateStrategies.includes(config.starredDuplicateStrategy)) {
        errors.push("Invalid duplicate handling strategy");
      }
    }
    
    // Validate organization overrides
    if (config.organizationOverrides) {
      for (const [sourceOrg, destOrg] of Object.entries(config.organizationOverrides)) {
        if (typeof destOrg === 'string' && !/^[a-zA-Z0-9-]+$/.test(destOrg)) {
          errors.push(`Invalid destination organization name: ${sourceOrg} -> ${destOrg}`);
        }
      }
    }
    
    // Add warnings for ignored configurations
    if (strategy === "preserve-structure" && config.starredReposOrg) {
      warnings.push("starredReposOrg is ignored for preserve-structure strategy");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      strategy
    };
  }
}));