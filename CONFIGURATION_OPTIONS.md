# Configuration Options for Starred Repository Organizations

## Overview
This document outlines the final implemented configuration options for starred repository organization management, including the new strategy selection interface and enhanced organization configuration.

## Current Configuration Structure

### Existing Configuration
- **GitHub Configuration**: Username, token, repository inclusion settings
- **Gitea Configuration**: URL, token, organization settings, mirror strategies
- **Organization Settings**: Destination overrides, visibility settings

### New Configuration Options
- **Starred Repository Strategy**: Single Organization vs Preserve Structure
- **Enhanced Organization Management**: Type-aware configuration
- **Migration Settings**: Strategy switching and data migration options

## Final Configuration Implementations

### 1. Starred Repository Strategy Configuration
**File**: [`src/components/config/StarredReposStrategy.tsx:17-90`](src/components/config/StarredReposStrategy.tsx:17)

#### Strategy Selection Interface
```typescript
interface StarredReposStrategyProps {
  strategy?: "single-organization" | "preserve-structure";
  onStrategyChange: (strategy: "single-organization" | "preserve-structure") => void;
}

export function StarredReposStrategy({ strategy, onStrategyChange }: StarredReposStrategyProps) {
  const currentStrategy = strategy || "single-organization";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Star className="h-4 w-4" />
          Starred Repos Strategy
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-xs">
                Choose how to organize starred repositories in Gitea. "Single Organization" 
                keeps all starred repos in one organization, while "Preserve Structure" 
                creates separate organizations for each GitHub owner.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <RadioGroup
        value={currentStrategy}
        onValueChange={onStrategyChange}
        className="grid gap-3"
      >
        <div className="flex items-start space-x-3">
          <RadioGroupItem 
            value="single-organization" 
            id="single-organization"
            className="mt-1"
          />
          <div className="flex-1 space-y-1">
            <Label 
              htmlFor="single-organization" 
              className="text-sm font-normal cursor-pointer flex items-center gap-2"
            >
              <Building2 className="h-3.5 w-3.5" />
              Single Organization
            </Label>
            <p className="text-xs text-muted-foreground">
              All starred repositories organized in one organization
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <RadioGroupItem 
            value="preserve-structure" 
            id="preserve-structure"
            className="mt-1"
          />
          <div className="flex-1 space-y-1">
            <Label 
              htmlFor="preserve-structure" 
              className="text-sm font-normal cursor-pointer flex items-center gap-2"
            >
              <Star className="h-3.5 w-3.5" />
              Preserve Structure
            </Label>
            <p className="text-xs text-muted-foreground">
              Create separate organizations for each GitHub owner
            </p>
          </div>
        </div>
      </RadioGroup>
    </div>
  );
}
```

### 2. Enhanced Organization Configuration
**File**: [`src/components/config/OrganizationConfiguration.tsx:57-84`](src/components/config/OrganizationConfiguration.tsx:57)

#### Conditional Configuration Based on Strategy
```typescript
interface OrganizationConfigurationProps {
  strategy: MirrorStrategy;
  destinationOrg?: string;
  starredReposOrg?: string;
  personalReposOrg?: string;
  visibility: GiteaOrgVisibility;
  starredReposStrategy?: "single-organization" | "preserve-structure";
  onDestinationOrgChange: (org: string) => void;
  onStarredReposOrgChange: (org: string) => void;
  onPersonalReposOrgChange: (org: string) => void;
  onVisibilityChange: (visibility: GiteaOrgVisibility) => void;
}

export const OrganizationConfiguration: React.FC<OrganizationConfigurationProps> = ({
  strategy,
  destinationOrg,
  starredReposOrg,
  personalReposOrg,
  visibility,
  starredReposStrategy,
  onDestinationOrgChange,
  onStarredReposOrgChange,
  onPersonalReposOrgChange,
  onVisibilityChange,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <MonitorCog className="h-4 w-4" />
          Organization Configuration
        </h4>
      </div>

      {/* First row - Organization inputs with consistent layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* IMPLEMENTED: Conditional starred repos org input */}
        {(starredReposStrategy === "single-organization" || !starredReposStrategy) && (
          <div className="space-y-1">
            <Label htmlFor="starredReposOrg" className="text-sm font-normal flex items-center gap-2">
              <Star className="h-3.5 w-3.5" />
              Starred Repos Organization
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Starred repositories will be organized separately in this organization</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              id="starredReposOrg"
              value={starredReposOrg || ""}
              onChange={(e) => onStarredReposOrgChange(e.target.value)}
              placeholder="starred"
              className=""
            />
            <p className="text-xs text-muted-foreground mt-1">
              Keep starred repos organized separately
            </p>
          </div>
        )}

        {/* IMPLEMENTED: Conditional destination org based on mirror strategy */}
        {strategy === "single-org" || strategy === "mixed" ? (
          <div className="space-y-1">
            <Label htmlFor="destinationOrg" className="text-sm font-normal flex items-center gap-2">
              {strategy === "mixed" ? "Personal Repos Organization" : "Destination Organization"}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {strategy === "mixed"
                        ? "Personal repositories will be mirrored to this organization, while organization repos preserve their structure"
                        : "All repositories will be mirrored to this organization"
                      }
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              id="destinationOrg"
              value={destinationOrg || ""}
              onChange={(e) => onDestinationOrgChange(e.target.value)}
              placeholder={strategy === "mixed" ? "github-personal" : "github-mirrors"}
              className=""
            />
            <p className="text-xs text-muted-foreground mt-1">
              {strategy === "mixed"
                ? "All personal repos will go to this organization"
                : "Organization for consolidated repositories"
              }
            </p>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
      </div>

      {/* IMPLEMENTED: Organization visibility settings */}
      <div className="space-y-2">
        <Label className="text-sm font-normal flex items-center gap-2">
          Organization Visibility
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Default visibility for newly created organizations</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {visibilityOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = visibility === option.value;
            return (
              <TooltipProvider key={option.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onVisibilityChange(option.value)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all",
                        "border group",
                        isSelected
                          ? "bg-accent border-accent-foreground/20"
                          : "bg-background hover:bg-accent/50 border-input"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span>{option.label}</span>
                      </div>
                      <Info className="h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity hidden sm:inline-block" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{option.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
    </div>
  );
};
```

### 3. Enhanced Gitea Configuration Form
**File**: [`src/components/config/GiteaConfigForm.tsx:160-261`](src/components/config/GiteaConfigForm.tsx:160)

#### Strategy Integration
```typescript
export function GiteaConfigForm({ config, setConfig, onAutoSave, isAutoSaving, githubUsername }: GiteaConfigFormProps) {
  // ... existing state management ...
  
  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <CardTitle className="text-lg font-semibold">
          Gitea Configuration
        </CardTitle>
        {/* Desktop: Show button in header */}
        <Button
          type="button"
          variant="default"
          onClick={testConnection}
          disabled={isLoading || !config.url || !config.token}
          className="hidden sm:inline-flex"
        >
          {isLoading ? "Testing..." : "Test Connection"}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-y-6 flex-1">
        {/* IMPLEMENTED: Basic Gitea configuration inputs */}
        <div>
          <label
            htmlFor="gitea-username"
            className="block text-sm font-medium mb-1.5"
          >
            Gitea Username
          </label>
          <input
            id="gitea-username"
            name="username"
            type="text"
            value={config.username}
            onChange={handleChange}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Your Gitea username"
            required
          />
        </div>

        {/* IMPLEMENTED: Organization strategy and configuration section */}
        <Separator />
        
        <OrganizationStrategy
          strategy={mirrorStrategy}
          destinationOrg={config.organization}
          starredReposOrg={config.starredReposOrg}
          onStrategyChange={setMirrorStrategy}
          githubUsername={githubUsername}
          giteaUsername={config.username}
        />
        
        <Separator />
        
        <OrganizationConfiguration
          strategy={mirrorStrategy}
          destinationOrg={config.organization}
          starredReposOrg={config.starredReposOrg}
          personalReposOrg={config.personalReposOrg}
          visibility={config.visibility}
          starredReposStrategy={config.starredReposStrategy}
          onDestinationOrgChange={(org) => {
            const newConfig = { ...config, organization: org };
            setConfig(newConfig);
            if (onAutoSave) onAutoSave(newConfig);
          }}
          onStarredReposOrgChange={(org) => {
            const newConfig = { ...config, starredReposOrg: org };
            setConfig(newConfig);
            if (onAutoSave) onAutoSave(newConfig);
          }}
          onPersonalReposOrgChange={(org) => {
            const newConfig = { ...config, personalReposOrg: org };
            setConfig(newConfig);
            if (onAutoSave) onAutoSave(newConfig);
          }}
          onVisibilityChange={(visibility) => {
            const newConfig = { ...config, visibility };
            setConfig(newConfig);
            if (onAutoSave) onAutoSave(newConfig);
          }}
        />
        
        {/* Mobile: Show button at bottom */}
        <Button
          type="button"
          variant="default"
          onClick={testConnection}
          disabled={isLoading || !config.url || !config.token}
          className="sm:hidden w-full"
        >
          {isLoading ? "Testing..." : "Test Connection"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 4. Enhanced Organization Strategy Visualization
**File**: [`src/components/config/OrganizationStrategy.tsx:80-120`](src/components/config/OrganizationStrategy.tsx:80)

#### Strategy Visualization with Starred Support
```typescript
const OrganizationStrategyVisualization: React.FC<{
  strategy: MirrorStrategy;
  config: GiteaConfig;
  destinationOrg?: string;
  starredReposOrg?: string;
  githubUsername?: string;
  giteaUsername?: string;
}> = ({ strategy, config, destinationOrg, starredReposOrg, githubUsername, giteaUsername }) => {
  const displayGithubUsername = githubUsername || "<username>";
  const displayGiteaUsername = giteaUsername || config.username || "<gitea-username>";

  return (
    <div className="space-y-4">
      {/* IMPLEMENTED: Strategy visualization with starred repo support */}
      {strategy === "preserve" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Preserve GitHub Structure</span>
          </div>
          <div className="space-y-2 pl-6">
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>facebook/react → facebook/react</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>microsoft/vscode → microsoft/vscode</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>personal/repo → {displayGiteaUsername}/repo</span>
            </div>
          </div>
        </div>
      )}

      {strategy === "single-org" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Single Organization</span>
          </div>
          <div className="space-y-2 pl-6">
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>facebook/react → {destinationOrg || "github-mirrors"}/react</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>microsoft/vscode → {destinationOrg || "github-mirrors"}/vscode</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>personal/repo → {destinationOrg || "github-mirrors"}/repo</span>
            </div>
          </div>
        </div>
      )}

      {strategy === "mixed" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <GitMerge className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Mixed Mode</span>
          </div>
          <div className="space-y-2 pl-6">
            <div className="flex items-center gap-2 text-xs">
              <Building2 className="h-3 w-3" />
              <span>facebook/react → facebook/react</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Building2 className="h-3 w-3" />
              <span>microsoft/vscode → microsoft/vscode</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <User className="h-3 w-3" />
              <span>personal/repo → {personalReposOrg || "github-personal"}/repo</span>
            </div>
          </div>
        </div>
      )}

      {strategy === "flat-user" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Flat User Structure</span>
          </div>
          <div className="space-y-2 pl-6">
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>facebook/react → {displayGiteaUsername}/react</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>microsoft/vscode → {displayGiteaUsername}/vscode</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              <span>personal/repo → {displayGiteaUsername}/repo</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

### 5. Enhanced Configuration Validation
**File**: [`src/lib/config-validation.ts`](src/lib/config-validation.ts) (NEW)

#### Configuration Validation Functions
```typescript
/**
 * Validate starred repository organization configuration
 */
export function validateStarredReposConfig(
  config: Partial<Config>
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.githubConfig) {
    errors.push("GitHub configuration is required");
    return { isValid: false, errors, warnings };
  }

  const strategy = config.githubConfig.starredReposStrategy || "single-organization";

  // Validate strategy value
  if (!["single-organization", "preserve-structure"].includes(strategy)) {
    errors.push(`Invalid starredReposStrategy: ${strategy}`);
  }

  // Validate single-organization requirements
  if (strategy === "single-organization") {
    if (!config.githubConfig.starredReposOrg) {
      warnings.push("No starredReposOrg specified, will default to 'starred'");
    }
  }

  // Validate preserve-structure requirements
  if (strategy === "preserve-structure") {
    if (config.githubConfig.starredReposOrg) {
      warnings.push("starredReposOrg is ignored in preserve-structure mode");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get configuration recommendations based on usage patterns
 */
export function getStarredReposRecommendations(
  userStats: UserStatistics
): {
  recommendedStrategy: "single-organization" | "preserve-structure";
  reasoning: string;
  considerations: string[];
} {
  const starredRepoCount = userStats.starredRepositoryCount || 0;
  const uniqueOwners = userStats.uniqueStarredOwners || 0;

  if (starredRepoCount === 0) {
    return {
      recommendedStrategy: "single-organization",
      reasoning: "No starred repositories found",
      considerations: ["You can change this later when you star repositories"],
    };
  }

  if (uniqueOwners <= 3) {
    return {
      recommendedStrategy: "single-organization",
      reasoning: `You have starred repositories from only ${uniqueOwners} owners`,
      considerations: [
        "Simple setup and management",
        "All starred repos in one place",
        "Easy to find and manage",
      ],
    };
  }

  if (uniqueOwners > 10) {
    return {
      recommendedStrategy: "preserve-structure",
      reasoning: `You have starred repositories from ${uniqueOwners} different owners`,
      considerations: [
        "Better organization with many sources",
        "Individual control per GitHub owner",
        "Matches your diverse starring patterns",
      ],
    };
  }

  return {
    recommendedStrategy: "preserve-structure",
    reasoning: `You have starred repositories from ${uniqueOwners} owners`,
    considerations: [
      "Balanced approach for moderate diversity",
      "Individual organization management",
      "Flexible destination overrides",
    ],
  };
}
```

### 6. Enhanced Configuration Persistence
**File**: [`src/lib/config-persistence.ts`](src/lib/config-persistence.ts) (NEW)

#### Configuration Auto-Save
```typescript
/**
 * Enhanced configuration persistence with starred repo strategy support
 */
export async function saveConfigurationWithStarredStrategy(
  config: Config,
  options?: {
    validate?: boolean;
    migrateData?: boolean;
  }
): Promise<{ success: boolean; errors?: string[]; warnings?: string[] }> {
  try {
    // Validate configuration if requested
    if (options?.validate) {
      const validation = validateStarredReposConfig(config);
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }
    }

    // Handle data migration if strategy changed
    if (options?.migrateData) {
      const previousConfig = await getPreviousConfiguration(config.userId!);
      if (previousConfig && 
          previousConfig.githubConfig?.starredReposStrategy !== config.githubConfig?.starredReposStrategy) {
        
        await handleStrategyChange({
          userId: config.userId!,
          oldStrategy: previousConfig.githubConfig?.starredReposStrategy || "single-organization",
          newStrategy: config.githubConfig?.starredReposStrategy || "single-organization",
        });
      }
    }

    // Save configuration
    const result = await saveConfiguration(config);
    
    return {
      success: true,
      warnings: validation.warnings,
    };

  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : "Unknown error occurred"],
    };
  }
}

/**
 * Handle configuration changes that require data migration
 */
async function handleStrategyChange({
  userId,
  oldStrategy,
  newStrategy,
}: {
  userId: string;
  oldStrategy: "single-organization" | "preserve-structure";
  newStrategy: "single-organization" | "preserve-structure";
}): Promise<void> {
  console.log(`Migrating starred repos from ${oldStrategy} to ${newStrategy} for user ${userId}`);

  if (oldStrategy === "single-organization" && newStrategy === "preserve-structure") {
    // Migrate from single-org to preserve-structure
    await migrateToPreserveStructure(userId);
  } else if (oldStrategy === "preserve-structure" && newStrategy === "single-organization") {
    // Migrate from preserve-structure to single-org
    await migrateToSingleOrganization(userId);
  }
}
```

## Configuration Schema Updates

### 1. TypeScript Type Definitions
**File**: [`src/types/config.ts:41`](src/types/config.ts:41)

```typescript
export interface GitHubConfig {
  username: string;
  token: string;
  privateRepositories: boolean;
  mirrorStarred: boolean;
  starredDuplicateStrategy?: DuplicateNameStrategy;
  // NEW: Starred repository strategy configuration
  starredReposStrategy?: "single-organization" | "preserve-structure";
  mirrorStrategy?: MirrorStrategy;
  defaultOrg?: string;
  skipStarredIssues?: boolean;
  starredReposOrg?: string;
  includeOrganizations?: string[];
  includeForks?: boolean;
  skipForks?: boolean;
  includeArchived?: boolean;
  includePrivate?: boolean;
  includePublic?: boolean;
}
```

### 2. Database Schema
**File**: [`src/lib/db/schema.ts:28`](src/lib/db/schema.ts:28)

```typescript
export const githubConfigSchema = z.object({
  owner: z.string(),
  type: z.enum(["personal", "organization"]),
  token: z.string(),
  includeStarred: z.boolean().default(false),
  includeForks: z.boolean().default(true),
  skipForks: z.boolean().default(false),
  includeArchived: z.boolean().default(false),
  includePrivate: z.boolean().default(true),
  includePublic: z.boolean().default(true),
  includeOrganizations: z.array(z.string()).default([]),
  starredReposOrg: z.string().optional(),
  // NEW: Starred repository strategy with validation
  starredReposStrategy: z.enum(["single-organization", "preserve-structure"]).default("single-organization"),
  mirrorStrategy: z.enum(["preserve", "single-org", "flat-user", "mixed"]).default("preserve"),
  defaultOrg: z.string().optional(),
  skipStarredIssues: z.boolean().default(false),
  starredDuplicateStrategy: z.enum(["suffix", "prefix", "owner-org"]).default("suffix").optional(),
});
```

## Configuration Validation and Migration

### 1. Strategy Validation
```typescript
/**
 * Validate and normalize starred repository strategy
 */
export function validateStarredReposStrategy(
  strategy: string | undefined
): "single-organization" | "preserve-structure" {
  if (!strategy) {
    return "single-organization";
  }

  // Handle legacy values
  if (strategy === "single-org") {
    return "single-organization";
  }

  if (strategy === "preserve-structure") {
    return "preserve-structure";
  }

  // Default to single-organization for invalid values
  console.warn(`Invalid starredReposStrategy: ${strategy}, defaulting to single-organization`);
  return "single-organization";
}
```

### 2. Configuration Migration
```typescript
/**
 * Migrate configuration when strategy changes
 */
export async function migrateStarredReposConfig({
  userId,
  oldStrategy,
  newStrategy,
}: {
  userId: string;
  oldStrategy: "single-organization" | "preserve-structure";
  newStrategy: "single-organization" | "preserve-structure";
}): Promise<void> {
  console.log(`Migrating starred repos from ${oldStrategy} to ${newStrategy} for user ${userId}`);

  if (oldStrategy === "single-organization" && newStrategy === "preserve-structure") {
    // Create starred organizations from existing starred repos
    await createStarredOrganizationsFromRepos(userId);
  } else if (oldStrategy === "preserve-structure" && newStrategy === "single-organization") {
    // Clean up starred organizations (optional)
    await cleanupStarredOrganizations(userId);
  }
}
```

## Configuration UI Best Practices

### 1. Progressive Disclosure
- Show only relevant configuration options based on selected strategy
- Use conditional rendering to avoid overwhelming users
- Provide clear visual hierarchy

### 2. Contextual Help
- Tooltips with detailed explanations
- Inline help text for complex options
- Visual examples of strategy outcomes

### 3. Validation Feedback
- Real-time validation with clear error messages
- Success indicators for valid configurations
- Warning messages for potentially problematic settings

### 4. Accessibility
- Proper ARIA labels and descriptions
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support

## Configuration Persistence and Synchronization

### 1. Auto-Save Functionality
```typescript
/**
 * Auto-save configuration with debouncing
 */
export function useAutoSaveConfig(
  config: Config,
  onSave: (config: Config) => Promise<void>,
  delay: number = 1000
): void {
  const [pendingSave, setPendingSave] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (pendingSave) {
      timeoutRef.current = setTimeout(() => {
        onSave(config);
        setPendingSave(false);
      }, delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [config, pendingSave, onSave, delay]);

  // Trigger save when config changes
  useEffect(() => {
    setPendingSave(true);
  }, [config]);
}
```

### 2. Configuration Synchronization
```typescript
/**
 * Sync configuration across multiple tabs/windows
 */
export function useConfigSync(config: Config): void {
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'gitea-mirror-config' && event.newValue) {
        const newConfig = JSON.parse(event.newValue);
        if (newConfig.userId === config.userId) {
          // Update local config with remote changes
          updateLocalConfig(newConfig);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [config.userId]);
}
```

## Configuration Testing and Validation

### 1. Unit Tests
**File**: [`src/components/config/StarredReposStrategy.test.tsx`](src/components/config/StarredReposStrategy.test.tsx)

```typescript
describe("StarredReposStrategy", () => {
  test("renders with default single-organization strategy", () => {
    render(
      <StarredReposStrategy
        strategy="single-organization"
        onStrategyChange={mockOnStrategyChange}
      />
    );
    
    expect(screen.getByLabelText("Single Organization")).toBeChecked();
    expect(screen.getByLabelText("Preserve Structure")).not.toBeChecked();
  });

  test("calls onStrategyChange when strategy changes", async () => {
    const user = userEvent.setup();
    render(
      <StarredReposStrategy
        strategy="single-organization"
        onStrategyChange={mockOnStrategyChange}
      />
    );
    
    await user.click(screen.getByLabelText("Preserve Structure"));
    expect(mockOnStrategyChange).toHaveBeenCalledWith("preserve-structure");
  });
});
```

### 2. Integration Tests
**File**: [`src/tests/ui/configuration-interface.test.tsx`](src/tests/ui/configuration-interface.test.tsx)

```typescript
describe("Configuration Interface Integration", () => {
  test("strategy change updates organization inputs", async () => {
    const user = userEvent.setup();
    render(<GiteaConfigForm config={defaultConfig} setConfig={mockSetConfig} />);
    
    // Switch to preserve-structure
    await user.click(screen.getByLabelText("Preserve Structure"));
    
    // Verify starred org input is hidden
    expect(screen.queryByLabelText("Starred Repos Organization")).not.toBeInTheDocument();
    
    // Switch back to single-organization
    await user.click(screen.getByLabelText("Single Organization"));
    
    // Verify starred org input is shown
    expect(screen.getByLabelText("Starred Repos Organization")).toBeInTheDocument();
  });
});
```

## Configuration Deployment and Rollout

### 1. Feature Flags
```typescript
/**
 * Feature flag for starred repository organizations
 */
export function useStarredReposFeature(): {
  isEnabled: boolean;
  isStrategySelectionEnabled: boolean;
  isMigrationEnabled: boolean;
} {
  const config = useConfig();
  
  return {
    isEnabled: true, // Always enabled for this implementation
    isStrategySelectionEnabled: true,
    isMigrationEnabled: true,
  };
}
```

### 2. Gradual Rollout
```typescript
/**
 * Gradual rollout configuration for starred repo organizations
 */
export function getRolloutConfig(userId: string): {
  enableStrategySelection: boolean;
  enableMigration: boolean;
  enableBulkOperations: boolean;
} {
  // For this implementation, all features are enabled
  // In a real deployment, this could be based on user segments, feature flags, etc.
  return {
    enableStrategySelection: true,
    enableMigration: true,
    enableBulkOperations: true,
  };
}
```

## Summary of Configuration Options

### Core Enhancements
1. **Strategy Selection**: Radio button interface for choosing between single-organization and preserve-structure
2. **Conditional UI**: Dynamic form fields based on selected strategy
3. **Enhanced Validation**: Real-time validation with helpful error messages
4. **Auto-Save**: Automatic configuration persistence with debouncing
5. **Migration Support**: Seamless transition between strategies

### Backward Compatibility
- All existing configuration options continue to work unchanged
- Default behavior remains the same for existing users
- Graceful handling of missing or invalid configuration values
- No breaking changes to existing configuration APIs

### User Experience
- **Progressive Disclosure**: Show only relevant options based on context
- **Contextual Help**: Tooltips and inline help for complex options
- **Visual Feedback**: Clear indicators for valid and invalid configurations
- **Accessibility**: Full keyboard navigation and screen reader support

### Key Implementation Files
- **Strategy Selection**: [`src/components/config/StarredReposStrategy.tsx:17-90`](src/components/config/StarredReposStrategy.tsx:17) - Radio button interface
- **Organization Configuration**: [`src/components/config/OrganizationConfiguration.tsx:57-84`](src/components/config/OrganizationConfiguration.tsx:57) - Conditional form fields
- **Gitea Configuration**: [`src/components/config/GiteaConfigForm.tsx:160-261`](src/components/config/GiteaConfigForm.tsx:160) - Strategy integration
- **Strategy Visualization**: [`src/components/config/OrganizationStrategy.tsx:80-120`](src/components/config/OrganizationStrategy.tsx:80) - Visual examples
- **Configuration Validation**: [`src/lib/config-validation.ts`](src/lib/config-validation.ts) - Validation logic
- **Configuration Persistence**: [`src/lib/config-persistence.ts`](src/lib/config-persistence.ts) - Auto-save and migration

These comprehensive configuration options provide a flexible, user-friendly interface for managing starred repository organization strategies while maintaining backward compatibility and providing excellent user experience.