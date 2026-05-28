import { palette, radii, spacing, typography } from "../src/theme/tokens";

describe("design tokens", () => {
  test("palette mirrors web tailwind config (hex pre-converted)", () => {
    expect(palette).toMatchSnapshot();
  });

  test("spacing scale is 4/8/12/16/24/32/48", () => {
    expect([spacing.xs, spacing.sm, spacing.md, spacing.base, spacing.lg, spacing.xl, spacing["2xl"]]).toEqual([
      4, 8, 12, 16, 24, 32, 48
    ]);
  });

  test("typography has the seven required scale steps + display", () => {
    expect(Object.keys(typography).sort()).toEqual(
      ["2xl", "3xl", "base", "display", "lg", "sm", "xl", "xs"].sort()
    );
  });

  test("radii expose sm/md/lg/pill", () => {
    expect(radii.lg).toBe(14);
    expect(radii.pill).toBe(999);
  });
});
