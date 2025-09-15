import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Star, Globe, Lock, Shield, Info, MonitorCog } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MirrorStrategy, GiteaOrgVisibility } from "@/types/config";

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

const visibilityOptions = [
  { value: "public" as GiteaOrgVisibility, label: "Public", icon: Globe, description: "Visible to everyone" },
  { value: "private" as GiteaOrgVisibility, label: "Private", icon: Lock, description: "Visible to members only" },
  { value: "limited" as GiteaOrgVisibility, label: "Limited", icon: Shield, description: "Visible to logged-in users" },
];

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
        {/* Left column - shows starred repos org only for single-organization strategy */}
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

        {/* Right column - shows destination org for single-org/mixed, personal repos org for preserve, empty div for others */}
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

      {/* Second row - Organization Visibility (always shown) */}
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

