import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NumInput } from "@/components/kit";
afterEach(cleanup);
it("accepts Bengali digits without dropping their monetary value", () => {
  const change = vi.fn();
  const page = render(<NumInput value="" onChange={change} />);
  fireEvent.change(page.getByRole("textbox"), { target: { value: "১,২৫০.৫০" } });
  expect(change).toHaveBeenCalledWith("1250.50");
});

it("preserves a negative paste so amount validation can reject it instead of turning it positive", () => {
  const change = vi.fn();
  const page = render(<NumInput value="" onChange={change} />);
  fireEvent.change(page.getByRole("textbox"), { target: { value: "−১০০" } });
  expect(change).toHaveBeenCalledWith("-100");
});
