import * as React from "react";
import { fireEvent, render, within } from "@testing-library/react-native";
import { CancelSubscriptionSheet } from "../src/components/CancelSubscriptionSheet";
import { ThemeProvider } from "../src/theme";

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

describe("CancelSubscriptionSheet (anti-Cleo guard)", () => {
  test("renders exactly two buttons: confirm and keep — no retention cascade", () => {
    const { getByTestId } = render(
      wrap(
        <CancelSubscriptionSheet
          visible
          merchant="Hulu"
          monthlyAmount={17.99}
          onConfirm={() => {}}
          onDismiss={() => {}}
        />
      )
    );
    const sheet = getByTestId("cancel-sheet");
    // Structural assertion: exactly two pressable buttons inside the sheet.
    // If anyone tries to add a "Wait, here's 50% off!" win-back screen this test breaks.
    const buttons = within(sheet).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    // And they are the right two.
    expect(within(sheet).getByTestId("confirm-cancel")).toBeTruthy();
    expect(within(sheet).getByTestId("keep-plan")).toBeTruthy();
  });

  test("confirm fires onConfirm exactly once (no intermediate screens)", () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      wrap(
        <CancelSubscriptionSheet
          visible
          merchant="Hulu"
          monthlyAmount={17.99}
          onConfirm={onConfirm}
          onDismiss={() => {}}
        />
      )
    );
    fireEvent.press(getByTestId("confirm-cancel"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("keep dismisses without firing confirm", () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      wrap(
        <CancelSubscriptionSheet
          visible
          merchant="Hulu"
          monthlyAmount={17.99}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      )
    );
    fireEvent.press(getByTestId("keep-plan"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
