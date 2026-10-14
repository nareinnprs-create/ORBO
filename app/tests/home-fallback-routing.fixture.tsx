import { afterAll, beforeAll, spyOn } from "bun:test";
import type { ReactNode } from "react";
import * as Carousel from "@/components/ui/carousel";
import * as SidebarToggle from "@/components/layout/sidebar-toggle";

/**
 * Restorable namespace spies rather than `mock.module`, which bun cannot unregister. The spies are
 * put back by `mockRestore`, so the real modules survive for every other file in the run.
 */
const sidebarToggleBarSpy = spyOn(SidebarToggle, "SidebarToggleBar");
const carouselSpy = spyOn(Carousel, "Carousel");
const carouselContentSpy = spyOn(Carousel, "CarouselContent");
const carouselItemSpy = spyOn(Carousel, "CarouselItem");
const carouselNextSpy = spyOn(Carousel, "CarouselNext");
const carouselPreviousSpy = spyOn(Carousel, "CarouselPrevious");

beforeAll(() => {
  sidebarToggleBarSpy.mockImplementation((() => (
    <div data-testid="sidebar-toggle-bar" />
  )) as never);
  carouselSpy.mockImplementation((({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )) as never);
  carouselContentSpy.mockImplementation((({
    children,
  }: {
    children: ReactNode;
  }) => <div>{children}</div>) as never);
  carouselItemSpy.mockImplementation((({
    children,
  }: {
    children: ReactNode;
  }) => <div>{children}</div>) as never);
  carouselNextSpy.mockImplementation((() => (
    <button type="button">Next agents</button>
  )) as never);
  carouselPreviousSpy.mockImplementation((() => (
    <button type="button">Previous agents</button>
  )) as never);
});

afterAll(() => {
  sidebarToggleBarSpy.mockRestore();
  carouselSpy.mockRestore();
  carouselContentSpy.mockRestore();
  carouselItemSpy.mockRestore();
  carouselNextSpy.mockRestore();
  carouselPreviousSpy.mockRestore();
});
