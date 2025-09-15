import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StarredReposStrategy } from "./StarredReposStrategy";

describe("StarredReposStrategy", () => {
  test("renders with default single-organization strategy", () => {
    render(
      <StarredReposStrategy
        strategy="single-organization"
        onStrategyChange={() => {}}
      />
    );

    expect(screen.getByText("Starred Repos Strategy")).toBeInTheDocument();
    expect(screen.getByText("Single Organization")).toBeInTheDocument();
    expect(screen.getByText("Preserve Structure")).toBeInTheDocument();
    
    // Check that single-organization is selected by default
    const singleOrgRadio = screen.getByLabelText("Single Organization");
    expect(singleOrgRadio).toBeChecked();
  });

  test("renders with preserve-structure strategy", () => {
    render(
      <StarredReposStrategy
        strategy="preserve-structure"
        onStrategyChange={() => {}}
      />
    );

    // Check that preserve-structure is selected
    const preserveStructureRadio = screen.getByLabelText("Preserve Structure");
    expect(preserveStructureRadio).toBeChecked();
  });

  test("calls onStrategyChange when strategy is changed", async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();

    render(
      <StarredReposStrategy
        strategy="single-organization"
        onStrategyChange={mockOnChange}
      />
    );

    const preserveStructureRadio = screen.getByLabelText("Preserve Structure");
    await user.click(preserveStructureRadio);

    expect(mockOnChange).toHaveBeenCalledWith("preserve-structure");
  });

  test("shows correct descriptions for each strategy", () => {
    render(
      <StarredReposStrategy
        strategy="single-organization"
        onStrategyChange={() => {}}
      />
    );

    expect(screen.getByText("All starred repositories organized in one organization")).toBeInTheDocument();
    expect(screen.getByText("Create separate organizations for each GitHub owner")).toBeInTheDocument();
  });

  test("shows tooltip with strategy information", () => {
    render(
      <StarredReposStrategy
        strategy="single-organization"
        onStrategyChange={() => {}}
      />
    );

    const infoIcon = screen.getByRole("button", { name: /info/i });
    expect(infoIcon).toBeInTheDocument();
  });
});