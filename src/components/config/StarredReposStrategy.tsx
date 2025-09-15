import React from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Star, Building2, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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