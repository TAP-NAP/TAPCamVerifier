import { describe, expect, it, vi } from "vitest";
import { ResultModalCoordinator } from "./resultModalCoordinator";

describe("ResultModalCoordinator", () => {
  it("settles the replaced modal exactly once", async () => {
    const coordinator = new ResultModalCoordinator();
    const firstCleanup = vi.fn();
    const first = coordinator.replace(firstCleanup);

    coordinator.replace(() => {});
    await first.closed;
    first.dismiss();

    expect(firstCleanup).toHaveBeenCalledTimes(1);
  });

  it("settles the active modal once for dismiss or home reset", async () => {
    const coordinator = new ResultModalCoordinator();
    const cleanup = vi.fn();
    const session = coordinator.replace(cleanup);

    coordinator.dismiss();
    session.dismiss();
    coordinator.dismiss();
    await session.closed;

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
