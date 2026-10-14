import { afterAll, beforeAll, spyOn } from "bun:test";
import * as SidebarToggle from "@/components/layout/sidebar-toggle";

/**
 * A restorable namespace spy rather than `mock.module`, which bun cannot unregister: a module stub
 * would outlive this file and reach every test file walked into the same process afterwards.
 */
const sidebarToggleSpy = spyOn(SidebarToggle, "SidebarToggle");

beforeAll(() => {
  sidebarToggleSpy.mockImplementation((() => (
    <button type="button">Toggle sidebar</button>
  )) as never);
});

afterAll(() => {
  sidebarToggleSpy.mockRestore();
});
