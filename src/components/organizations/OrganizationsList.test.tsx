import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { OrganizationsList } from "./OrganizationsList";
import type { Organization } from "@/lib/db/schema";

describe("OrganizationsList", () => {
  const mockOrganizations: Organization[] = [
    {
      id: "1",
      userId: "user1",
      configId: "config1",
      name: "test-org",
      avatarUrl: "https://example.com/avatar.png",
      membershipRole: "admin",
      isIncluded: true,
      organizationType: "joined",
      sourceOwner: null,
      status: "imported",
      repositoryCount: 5,
      publicRepositoryCount: 3,
      privateRepositoryCount: 2,
      forkRepositoryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "2",
      userId: "user1",
      configId: "config1",
      name: "starred-owner-org",
      avatarUrl: "https://example.com/avatar2.png",
      membershipRole: "member",
      isIncluded: true,
      organizationType: "starred-owner",
      sourceOwner: "github-owner",
      status: "mirrored",
      repositoryCount: 10,
      publicRepositoryCount: 8,
      privateRepositoryCount: 2,
      forkRepositoryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockFilter = {
    searchTerm: "",
    membershipRole: "",
    status: "",
    organizationType: "",
  };

  const mockSetFilter = () => {};
  const mockOnMirror = async () => {};
  const mockOnIgnore = async () => {};
  const mockOnAddOrganization = () => {};
  const mockOnRefresh = async () => {};

  it("should render joined organizations without star badge", () => {
    render(
      <OrganizationsList
        organizations={mockOrganizations}
        isLoading={false}
        filter={mockFilter}
        setFilter={mockSetFilter}
        onMirror={mockOnMirror}
        onIgnore={mockOnIgnore}
        loadingOrgIds={new Set()}
        onAddOrganization={mockOnAddOrganization}
        onRefresh={mockOnRefresh}
      />
    );

    // Should show organization name
    expect(screen.getByText("test-org")).toBeInTheDocument();
    
    // Should not show star badge for joined organizations
    expect(screen.queryByText("Starred Owner")).not.toBeInTheDocument();
  });

  it("should render starred-owner organizations with star badge", () => {
    render(
      <OrganizationsList
        organizations={mockOrganizations}
        isLoading={false}
        filter={mockFilter}
        setFilter={mockSetFilter}
        onMirror={mockOnMirror}
        onIgnore={mockOnIgnore}
        loadingOrgIds={new Set()}
        onAddOrganization={mockOnAddOrganization}
        onRefresh={mockOnRefresh}
      />
    );

    // Should show organization name
    expect(screen.getByText("starred-owner-org")).toBeInTheDocument();
    
    // Should show star badge for starred-owner organizations
    expect(screen.getByText("Starred Owner")).toBeInTheDocument();
  });

  it("should filter organizations by type", () => {
    const starredOwnerFilter = {
      ...mockFilter,
      organizationType: "starred-owner" as const,
    };

    render(
      <OrganizationsList
        organizations={mockOrganizations}
        isLoading={false}
        filter={starredOwnerFilter}
        setFilter={mockSetFilter}
        onMirror={mockOnMirror}
        onIgnore={mockOnIgnore}
        loadingOrgIds={new Set()}
        onAddOrganization={mockOnAddOrganization}
        onRefresh={mockOnRefresh}
      />
    );

    // Should only show starred-owner organization
    expect(screen.getByText("starred-owner-org")).toBeInTheDocument();
    expect(screen.queryByText("test-org")).not.toBeInTheDocument();
  });

  it("should show amber styling for starred-owner organizations", () => {
    render(
      <OrganizationsList
        organizations={mockOrganizations}
        isLoading={false}
        filter={mockFilter}
        setFilter={mockSetFilter}
        onMirror={mockOnMirror}
        onIgnore={mockOnIgnore}
        loadingOrgIds={new Set()}
        onAddOrganization={mockOnAddOrganization}
        onRefresh={mockOnRefresh}
      />
    );

    // Find the card containing the starred-owner organization
    const starredOrgCard = screen.getByText("starred-owner-org").closest(".border-amber-200");
    expect(starredOrgCard).toBeInTheDocument();
  });
});