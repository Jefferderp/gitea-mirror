/**
 * UI tests for starred repository configuration interface
 */

import { describe, test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StarredReposConfiguration } from "@/components/config/StarredReposConfiguration";

describe("StarredReposConfiguration Component", () => {
  test("should show single-organization strategy by default", () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
      />
    );

    const singleOrgRadio = screen.getByLabelText("Single Organization");
    expect(singleOrgRadio).toBeChecked();
    
    const orgNameInput = screen.getByDisplayValue("starred");
    expect(orgNameInput).toBeVisible();
  });

  test("should hide org name input when preserve-structure is selected", () => {
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
      />
    );

    const preserveRadio = screen.getByLabelText("Preserve Structure");
    expect(preserveRadio).toBeChecked();
    
    const orgNameInput = screen.queryByDisplayValue("starred");
    expect(orgNameInput).not.toBeInTheDocument();
  });

  test("should call strategy change handler", async () => {
    const onStrategyChangeMock = mock();
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={onStrategyChangeMock}
        onStarredReposOrgChange={mock()}
      />
    );

    const preserveRadio = screen.getByLabelText("Preserve Structure");
    fireEvent.click(preserveRadio);

    await waitFor(() => {
      expect(onStrategyChangeMock).toHaveBeenCalledWith("preserve-structure");
    });
  });

  test("should show strategy explanation for preserve-structure", () => {
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
      />
    );

    expect(screen.getByText(/facebook\/react → facebook\/react/)).toBeInTheDocument();
    expect(screen.getByText(/microsoft\/vscode → microsoft\/vscode/)).toBeInTheDocument();
  });

  test("should show migration notice for preserve-structure", () => {
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
      />
    );

    expect(screen.getByText("Strategy Change Notice")).toBeInTheDocument();
    expect(screen.getByText(/Switching to preserve structure will create organization records/)).toBeInTheDocument();
  });

  test("should validate organization name input", async () => {
    const onStarredReposOrgChangeMock = mock();
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg=""
        onStrategyChange={mock()}
        onStarredReposOrgChange={onStarredReposOrgChangeMock}
      />
    );

    const orgNameInput = screen.getByPlaceholderText("Enter organization name");
    fireEvent.change(orgNameInput, { target: { value: "my-starred-repos" } });

    await waitFor(() => {
      expect(onStarredReposOrgChangeMock).toHaveBeenCalledWith("my-starred-repos");
    });
  });

  test("should show validation errors for invalid org names", async () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="invalid org name!"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        validationErrors={["Invalid organization name format"]}
      />
    );

    expect(screen.getByText("Invalid organization name format")).toBeInTheDocument();
    const orgNameInput = screen.getByDisplayValue("invalid org name!");
    expect(orgNameInput).toHaveClass("border-red-500");
  });

  test("should show duplicate handling options for preserve-structure", () => {
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        showDuplicateOptions={true}
      />
    );

    expect(screen.getByText("Duplicate Repository Handling")).toBeInTheDocument();
    expect(screen.getByLabelText("Prefix with owner name")).toBeInTheDocument();
    expect(screen.getByLabelText("Suffix with owner name")).toBeInTheDocument();
  });

  test("should hide duplicate handling options for single-organization", () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        showDuplicateOptions={true}
      />
    );

    expect(screen.queryByText("Duplicate Repository Handling")).not.toBeInTheDocument();
  });

  test("should show organization override configuration", () => {
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        showOrganizationOverrides={true}
        organizationOverrides={{
          "facebook": "custom-facebook",
          "microsoft": "custom-microsoft"
        }}
      />
    );

    expect(screen.getByText("Organization Destination Overrides")).toBeInTheDocument();
    expect(screen.getByDisplayValue("facebook")).toBeInTheDocument();
    expect(screen.getByDisplayValue("custom-facebook")).toBeInTheDocument();
    expect(screen.getByDisplayValue("microsoft")).toBeInTheDocument();
    expect(screen.getByDisplayValue("custom-microsoft")).toBeInTheDocument();
  });

  test("should handle adding organization overrides", async () => {
    const onOrganizationOverrideChangeMock = mock();
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        showOrganizationOverrides={true}
        organizationOverrides={{}}
        onOrganizationOverrideChange={onOrganizationOverrideChangeMock}
      />
    );

    const addButton = screen.getByRole("button", { name: /add override/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(onOrganizationOverrideChangeMock).toHaveBeenCalled();
    });
  });

  test("should handle removing organization overrides", async () => {
    const onOrganizationOverrideChangeMock = mock();
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        showOrganizationOverrides={true}
        organizationOverrides={{
          "facebook": "custom-facebook"
        }}
        onOrganizationOverrideChange={onOrganizationOverrideChangeMock}
      />
    );

    const removeButton = screen.getByRole("button", { name: /remove/i });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(onOrganizationOverrideChangeMock).toHaveBeenCalledWith("facebook", null);
    });
  });

  test("should show help text for each strategy", () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
      />
    );

    expect(screen.getByText(/All starred repositories will be mirrored to a single organization/)).toBeInTheDocument();
    
    // Switch to preserve-structure
    const preserveRadio = screen.getByLabelText("Preserve Structure");
    fireEvent.click(preserveRadio);

    expect(screen.getByText(/Each GitHub owner's starred repositories will be mirrored to a separate organization/)).toBeInTheDocument();
  });

  test("should show current configuration summary", () => {
    render(
      <StarredReposConfiguration
        strategy="preserve-structure"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        currentConfig={{
          starredReposStrategy: "preserve-structure",
          organizationCount: 5,
          repositoryCount: 25
        }}
      />
    );

    expect(screen.getByText("Current Configuration")).toBeInTheDocument();
    expect(screen.getByText("5 organizations")).toBeInTheDocument();
    expect(screen.getByText("25 repositories")).toBeInTheDocument();
  });

  test("should handle disabled state", () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        disabled={true}
      />
    );

    const singleOrgRadio = screen.getByLabelText("Single Organization");
    const preserveRadio = screen.getByLabelText("Preserve Structure");
    const orgNameInput = screen.getByDisplayValue("starred");

    expect(singleOrgRadio).toBeDisabled();
    expect(preserveRadio).toBeDisabled();
    expect(orgNameInput).toBeDisabled();
  });

  test("should show loading state", () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        isLoading={true}
      />
    );

    expect(screen.getByText("Loading configuration...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  test("should be accessible with screen readers", () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
      />
    );

    // Check for proper ARIA labels
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-label", "Starred Repository Strategy");
    expect(screen.getByLabelText("Single Organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Preserve Structure")).toBeInTheDocument();
    
    // Check for proper form labeling
    const orgNameInput = screen.getByDisplayValue("starred");
    expect(orgNameInput).toHaveAttribute("aria-label", "Organization name");
  });

  test("should handle keyboard navigation", async () => {
    const onStrategyChangeMock = mock();
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={onStrategyChangeMock}
        onStarredReposOrgChange={mock()}
      />
    );

    const preserveRadio = screen.getByLabelText("Preserve Structure");
    
    // Tab to the radio button and press space
    preserveRadio.focus();
    fireEvent.keyDown(preserveRadio, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(onStrategyChangeMock).toHaveBeenCalledWith("preserve-structure");
    });
  });

  test("should show warning for strategy change with existing data", () => {
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg="starred"
        onStrategyChange={mock()}
        onStarredReposOrgChange={mock()}
        hasExistingData={true}
        existingDataSummary={{
          organizationCount: 3,
          repositoryCount: 15
        }}
      />
    );

    expect(screen.getByText("Warning: Strategy Change")).toBeInTheDocument();
    expect(screen.getByText(/You have 3 organizations and 15 repositories/)).toBeInTheDocument();
    expect(screen.getByText(/Changing strategy will require migration/)).toBeInTheDocument();
  });

  test("should validate organization name in real-time", async () => {
    const onStarredReposOrgChangeMock = mock();
    render(
      <StarredReposConfiguration
        strategy="single-organization"
        starredReposOrg=""
        onStrategyChange={mock()}
        onStarredReposOrgChange={onStarredReposOrgChangeMock}
        validateInRealTime={true}
      />
    );

    const orgNameInput = screen.getByPlaceholderText("Enter organization name");
    
    // Type invalid name
    fireEvent.change(orgNameInput, { target: { value: "invalid org!" } });
    
    await waitFor(() => {
      expect(screen.getByText("Organization name contains invalid characters")).toBeInTheDocument();
    });

    // Type valid name
    fireEvent.change(orgNameInput, { target: { value: "valid-org" } });
    
    await waitFor(() => {
      expect(screen.queryByText("Organization name contains invalid characters")).not.toBeInTheDocument();
    });
  });
});

// Mock functions
const mock = () => jest.fn();