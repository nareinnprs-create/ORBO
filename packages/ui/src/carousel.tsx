import * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical Carousel family. Export names, `data-slot`s, `orientation` API,
 * and Tailwind scale mirror app/src/components/ui/carousel.tsx (Carousel +
 * Content/Item/Previous/Next, `useCarousel`, `carouselKeyboardAction`) so a
 * future port is mechanical.
 *
 * Dependency-light by design: native scrolling, no `embla-carousel-react`,
 * no Tabler icons (inline SVG chevrons, local Button for Previous/Next).
 * Deliberate divergences: there is no Embla state — `opts`/`plugins` are not
 * accepted (the scroll axis follows `orientation`), `setApi` receives a
 * minimal `{ scrollPrev, scrollNext }` handle instead of the Embla API,
 * `scrollPrev`/`scrollNext` page the viewport with `scrollBy`, and
 * `canScrollPrev`/`canScrollNext` derive from the viewport scroll position
 * (measured on mount/scroll) instead of Embla `select`/`reInit` events. The
 * root is a native <section> keeping the app `role="region"` +
 * `aria-roledescription`, while `CarouselItem` is a plain <div> (no
 * `role="group"`) — the same lint-driven call as the `Field`/`ItemGroup`
 * role omissions. `carouselKeyboardAction` is a verbatim port (pure helper,
 * no dependencies).
 */

type CarouselApi = {
  scrollPrev: () => void;
  scrollNext: () => void;
};

type CarouselProps = {
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: React.RefObject<HTMLDivElement | null>;
  api: CarouselApi;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  updateCanScroll: () => void;
} & CarouselProps;

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />");
  }

  return context;
}

export function carouselKeyboardAction(
  orientation: "horizontal" | "vertical",
  key: string,
  target: EventTarget | null,
): "prev" | "next" | null {
  if (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  )
    return null;
  if (orientation === "horizontal") {
    if (key === "ArrowLeft") return "prev";
    if (key === "ArrowRight") return "next";
  } else {
    if (key === "ArrowUp") return "prev";
    if (key === "ArrowDown") return "next";
  }
  return null;
}

function Carousel({
  orientation = "horizontal",
  setApi,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & CarouselProps) {
  const carouselRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const updateCanScroll = React.useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    if (orientation === "horizontal") {
      setCanScrollPrev(el.scrollLeft > 0);
      setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    } else {
      setCanScrollPrev(el.scrollTop > 0);
      setCanScrollNext(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    }
  }, [orientation]);

  const scrollPrev = React.useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({
      left: orientation === "horizontal" ? -el.clientWidth : 0,
      top: orientation === "horizontal" ? 0 : -el.clientHeight,
      behavior: "smooth",
    });
  }, [orientation]);

  const scrollNext = React.useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({
      left: orientation === "horizontal" ? el.clientWidth : 0,
      top: orientation === "horizontal" ? 0 : el.clientHeight,
      behavior: "smooth",
    });
  }, [orientation]);

  const api = React.useMemo(
    () => ({ scrollPrev, scrollNext }),
    [scrollPrev, scrollNext],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const action = carouselKeyboardAction(
        orientation,
        event.key,
        event.target,
      );
      if (!action) return;
      event.preventDefault();
      if (action === "prev") scrollPrev();
      else scrollNext();
    },
    [orientation, scrollPrev, scrollNext],
  );

  React.useEffect(() => {
    if (!setApi) return;
    setApi(api);
  }, [api, setApi]);

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api,
        orientation,
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
        updateCanScroll,
      }}
    >
      <section
        onKeyDownCapture={handleKeyDown}
        className={cn("relative", className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </section>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: React.ComponentProps<"div">) {
  const { carouselRef, orientation, updateCanScroll } = useCarousel();

  React.useEffect(() => {
    updateCanScroll();
  }, [updateCanScroll]);

  return (
    <div
      ref={carouselRef}
      onScroll={updateCanScroll}
      className="overflow-hidden"
      data-slot="carousel-content"
    >
      <div
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
  const { orientation } = useCarousel();

  return (
    <div
      data-slot="carousel-item"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className,
      )}
      {...props}
    />
  );
}

function CarouselPrevious({
  className,
  variant = "outline",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        "absolute touch-manipulation rounded-full",
        orientation === "horizontal"
          ? "inset-y-0 -left-12 my-auto"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 6-6 6 6 6" />
      </svg>
      <span className="sr-only">Previous slide</span>
    </Button>
  );
}

function CarouselNext({
  className,
  variant = "outline",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollNext, canScrollNext } = useCarousel();

  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        "absolute touch-manipulation rounded-full",
        orientation === "horizontal"
          ? "inset-y-0 -right-12 my-auto"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
      <span className="sr-only">Next slide</span>
    </Button>
  );
}

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  useCarousel,
};
