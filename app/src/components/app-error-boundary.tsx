import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/generated/application-config";

/**
 * What a person sees when a screen fails to draw.
 *
 * Render crashes used to fall through to the router's unstyled default error screen, which reads as
 * the whole product being broken. This is the branded, recoverable version: trying again re-renders
 * in place, and reloading starts the app over from its entry — neither loses what is on the server.
 * Shared by the two things that catch crashes: the React boundary around the whole app, and the
 * router's `defaultErrorComponent`, which is where a route component's own failure lands (the
 * boundary never sees those — the router handles them first).
 */
export function AppCrashScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center p-4 text-center">
      <h1 className="text-2xl font-medium tracking-tight">
        {appConfig.brand.productName} could not draw this screen
      </h1>
      <p className="mt-2 max-w-90 text-pretty text-sm text-muted-foreground">
        Something in it failed while rendering. Trying again re-renders it;
        reloading starts the app over. Everything already saved is safe either
        way.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={onRetry} variant="outline">
          Try again
        </Button>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}

/**
 * A screen that throws must not take the app with it.
 *
 * Everything below the router is the router's business — it catches route components itself and
 * shows `AppCrashScreen` through `defaultErrorComponent`. This boundary is for everything the
 * router never gets to draw: the providers around it, the router's own tree, a failure inside an
 * error handler. Without it those crashes blank the document.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state = { error: undefined as unknown | undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    // Stacks stay out of the person's screen; the console is where every other failure in this app
    // reports (see `ToolRenderBoundary` for the same policy one level down).
    console.error("[app] a screen failed to render", error, info);
  }

  render() {
    if (this.state.error !== undefined) {
      // Clearing the error re-renders the tree. A child that throws for a reason that has not
      // passed throws again, and this screen comes back — the honest outcome.
      return (
        <AppCrashScreen onRetry={() => this.setState({ error: undefined })} />
      );
    }
    return this.props.children;
  }
}

/**
 * The router's `defaultErrorComponent`: same screen, reset by the router, which re-renders the
 * errored route rather than the whole tree above it.
 */
export function RouteErrorScreen({ reset }: { reset: () => void }) {
  return <AppCrashScreen onRetry={reset} />;
}
