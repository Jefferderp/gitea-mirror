/**
 * UI tests for organization list component with starred repo support
 */

import { describe, test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OrganizationList } from "@/components/organizations/OrganizationsList";

describe("OrganizationList Component", () => {
  const mockOrganizations = [
    {
      id: "org-1",
      name: "facebook",
      organizationType: "starred-owner",
      sourceOwner: "facebook",
      membershipRole: "external",
      repositoryCount: 5,
      status: "imported",
    },
    {
      id: "org-2", 
      name: "mycompany",
      organizationType: "joined",
      membershipRole: "admin",
      repositoryCount: 10,
      status: "mirrored",
    },
  ];

  test("should display organization type badges", () => {
    render(
      <OrganizationList
        organizations={mockOrganizations}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    expect(screen.getByText("Starred Repository Source")).toBeInTheDocument();
    expect(screen.getByText("Joined Organization")).toBeInTheDocument();
  });

  test("should filter by organization type", () => {
    const setFilterMock = mock();
    render(
      <OrganizationList
        organizations={mockOrganizations}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "starred-owner" }}
        setFilter={setFilterMock}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    // Should only show starred organization
    expect(screen.getByText("facebook")).toBeInTheDocument();
    expect(screen.queryByText("mycompany")).not.toBeInTheDocument();
  });

  test("should show appropriate styling for starred organizations", () => {
    render(
      <OrganizationList
        organizations={[mockOrganizations[0]]} // Only starred org
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    const card = screen.getByText("facebook").closest(".border-amber-200");
    expect(card).toBeInTheDocument();
  });

  test("should handle organization type filtering UI", async () => {
    const setFilterMock = mock();
    render(
      <OrganizationList
        organizations={mockOrganizations}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={setFilterMock}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    // Click on organization type filter
    const typeFilter = screen.getByDisplayValue("All types");
    fireEvent.click(typeFilter);

    // Select starred organizations
    const starredOption = screen.getByText("Starred Repository Sources");
    fireEvent.click(starredOption);

    await waitFor(() => {
      expect(setFilterMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationType: "starred-owner"
        })
      );
    });
  });

  test("should display star icon for starred organizations", () => {
    render(
      <OrganizationList
        organizations={[mockOrganizations[0]]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    const starIcon = screen.getByRole("img", { name: /star/i });
    expect(starIcon).toBeInTheDocument();
  });

  test("should show repository count breakdown for starred organizations", () => {
    const starredOrg = {
      ...mockOrganizations[0],
      publicRepositoryCount: 3,
      privateRepositoryCount: 2,
      forkRepositoryCount: 1,
    };

    render(
      <OrganizationList
        organizations={[starredOrg]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    expect(screen.getByText("3 public")).toBeInTheDocument();
    expect(screen.getByText("2 private")).toBeInTheDocument();
    expect(screen.getByText("1 fork")).toBeInTheDocument();
  });

  test("should show source owner information", () => {
    render(
      <OrganizationList
        organizations={[mockOrganizations[0]]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    expect(screen.getByText("Source: facebook")).toBeInTheDocument();
  });

  test("should handle destination override display", () => {
    const starredOrgWithOverride = {
      ...mockOrganizations[0],
      destinationOrg: "custom-destination",
    };

    render(
      <OrganizationList
        organizations={[starredOrgWithOverride]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    expect(screen.getByText("→ custom-destination")).toBeInTheDocument();
  });

  test("should show loading state for starred organizations", () => {
    render(
      <OrganizationList
        organizations={mockOrganizations}
        isLoading={true}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set(["org-1"])}
      />
    );

    const loadingIndicator = screen.getByText("Loading...");
    expect(loadingIndicator).toBeInTheDocument();
  });

  test("should handle mirror action for starred organizations", async () => {
    const onMirrorMock = mock();
    render(
      <OrganizationList
        organizations={[mockOrganizations[0]]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={onMirrorMock}
        loadingOrgIds={new Set()}
      />
    );

    const mirrorButton = screen.getByRole("button", { name: /mirror/i });
    fireEvent.click(mirrorButton);

    await waitFor(() => {
      expect(onMirrorMock).toHaveBeenCalledWith("org-1");
    });
  });

  test("should disable mirror button when organization is being mirrored", () => {
    render(
      <OrganizationList
        organizations={[mockOrganizations[0]]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set(["org-1"])}
      />
    );

    const mirrorButton = screen.getByRole("button", { name: /mirroring/i });
    expect(mirrorButton).toBeDisabled();
  });

  test("should handle mixed organization types", () => {
    const mixedOrganizations = [
      ...mockOrganizations,
      {
        id: "org-3",
        name: "netflix",
        organizationType: "starred-owner",
        sourceOwner: "netflix",
        membershipRole: "external",
        repositoryCount: 8,
        status: "imported",
      },
    ];

    render(
      <OrganizationList
        organizations={mixedOrganizations}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    // Should show all organizations
    expect(screen.getByText("facebook")).toBeInTheDocument();
    expect(screen.getByText("mycompany")).toBeInTheDocument();
    expect(screen.getByText("netflix")).toBeInTheDocument();

    // Should show correct badges
    expect(screen.getAllByText("Starred Repository Source").length).toBe(2);
    expect(screen.getAllByText("Joined Organization").length).toBe(1);
  });

  test("should handle empty state for starred organizations", () => {
    render(
      <OrganizationList
        organizations={[]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "starred-owner" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    expect(screen.getByText("No starred repository sources found")).toBeInTheDocument();
    expect(screen.getByText("Starred repositories will appear here when you sync them")).toBeInTheDocument();
  });

  test("should show strategy information for starred organizations", () => {
    render(
      <OrganizationList
        organizations={[mockOrganizations[0]]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    expect(screen.getByText("Preserve Structure Strategy")).toBeInTheDocument();
    expect(screen.getByText("Repositories from this source owner")).toBeInTheDocument();
  });

  test("should handle error states for starred organizations", () => {
    const errorOrg = {
      ...mockOrganizations[0],
      status: "failed",
      errorMessage: "Failed to create organization",
    };

    render(
      <OrganizationList
        organizations={[errorOrg]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    expect(screen.getByText("Failed to create organization")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  test("should be accessible with screen readers", () => {
    render(
      <OrganizationList
        organizations={[mockOrganizations[0]]}
        isLoading={false}
        filter={{ searchTerm: "", membershipRole: "", status: "", organizationType: "all" }}
        setFilter={mock()}
        onMirror={mock()}
        loadingOrgIds={new Set()}
      />
    );

    // Check for proper ARIA labels
    expect(screen.getByRole("article")).toHaveAttribute("aria-label", "facebook organization");
    expect(screen.getByRole("img", { name: /star/i })).toHaveAttribute("aria-label", "Starred repository source");
    
    // Check for proper heading structure
    const heading = screen.getByRole("heading", { name: "facebook" });
    expect(heading).toBeInTheDocument();
  });
});

// Mock functions
const mock = () => jest.fn();