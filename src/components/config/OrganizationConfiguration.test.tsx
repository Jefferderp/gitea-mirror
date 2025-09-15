import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { OrganizationConfiguration } from "./OrganizationConfiguration";

describe("OrganizationConfiguration", () => {
  const defaultProps = {
    strategy: "single-org" as const,
    destinationOrg: "github-mirrors",
    starredReposOrg: "starred",
    personalReposOrg: "github-personal",
    visibility: "public" as const,
    starredReposStrategy: "single-organization" as const,
    onDestinationOrgChange: () => {},
    onStarredReposOrgChange: () => {},
    onPersonalReposOrgChange: () => {},
    onVisibilityChange: () => {},
  };

  test("shows starred repos org input for single-organization strategy", () => {
    render(<OrganizationConfiguration {...defaultProps} />);

    expect(screen.getByLabelText("Starred Repos Organization")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("starred")).toBeInTheDocument();
  });

  test("hides starred repos org input for preserve-structure strategy", () => {
    const props = {
      ...defaultProps,
      starredReposStrategy: "preserve-structure" as const,
    };

    render(<OrganizationConfiguration {...props} />);

    expect(screen.queryByLabelText("Starred Repos Organization")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("starred")).not.toBeInTheDocument();
  });

  test("shows starred repos org input when starredReposStrategy is undefined (backward compatibility)", () => {
    const props = {
      ...defaultProps,
      starredReposStrategy: undefined,
    };

    render(<OrganizationConfiguration {...props} />);

    expect(screen.getByLabelText("Starred Repos Organization")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("starred")).toBeInTheDocument();
  });

  test("shows organization visibility options regardless of strategy", () => {
    render(<OrganizationConfiguration {...defaultProps} />);

    expect(screen.getByText("Organization Visibility")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Limited")).toBeInTheDocument();
  });
});