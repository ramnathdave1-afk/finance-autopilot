import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { PauseAllButton } from "../src/components/PauseAllButton";
import { ThemeProvider } from "../src/theme";

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

describe("PauseAllButton", () => {
  test("toggles from paused=false to true", () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(wrap(<PauseAllButton paused={false} onToggle={onToggle} />));
    fireEvent.press(getByTestId("pause-all"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  test("toggles from paused=true to false (resume)", () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(wrap(<PauseAllButton paused={true} onToggle={onToggle} />));
    fireEvent.press(getByTestId("pause-all"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  test("exposes correct accessibility state", () => {
    const { getByTestId } = render(wrap(<PauseAllButton paused={true} onToggle={() => {}} />));
    expect(getByTestId("pause-all").props.accessibilityState).toEqual({ checked: true });
  });
});
