import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import Avatar from "boring-avatars";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import * as React from "react";
import useMeasure from "react-use-measure";
import AgentOrb from "@/components/agents/orb/agent-orb";
import { Composer } from "@/components/channels/composer";
import { DesktopIllustration } from "@/components/computer/desktop-illustration";
import { ComputerPlaceholder } from "@/components/computer/placeholder";
import { Button } from "@/components/ui/button";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { currentUserQueryOptions, needsOnboarding } from "@/lib/auth/queries";
import { appConfig } from "@/lib/generated/application-config";
import { completeOnboardingMutationOptions } from "@/lib/onboarding/mutations";
import { queryClient } from "@/query-client";

export const Route = createFileRoute("/_authed/onboarding")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    // Somebody who has finished, or whose deployment tracks no onboarding, has no business here.
    if (!user || !needsOnboarding(user)) {
      throw redirect({ to: "/" });
    }
  },
  component: RouteComponent,
});

function WelcomeStep() {
  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="text-3xl font-semibold tracking-tight max-w-md text-center">
        Welcome to {appConfig.brand.productName}
      </h1>
      <div className="h-32" />
      <AgentOrb size="72px" />
      {/*
       * A POSTER OF A COMPOSER, AND `pointer-events-none` IS WHAT MAKES IT ONE. Nothing here is
       * meant to be typed in, clicked or dropped on: it is a picture of the thing the person is
       * about to get, shown while they read a sentence about it.
       *
       * THE DROP THAT PASSES STRAIGHT THROUGH IT IS SOMEBODY ELSE'S TO CATCH, WHICH IS WORTH
       * SAYING OUT LOUD. The composer guards its own form against a dropped file navigating the
       * whole app away (`refuseDragOver` in `composer.tsx`), and that guard cannot fire here: an
       * element with no pointer events is never the target of the drop, so the event goes past it
       * to the document as if this composer were not on the page. What catches it is
       * `useUnclaimedDropGuard` in `routes/__root.tsx`, which refuses every drop nobody claimed —
       * the reason that guard lives at the root rather than in the composer, and the reason this
       * wrapper does not need to change to be safe. Taking `pointer-events-none` off to "fix" the
       * drop would turn the poster back into a live composer with nowhere to upload to.
       */}
      <div className="max-w-md w-full mx-auto pointer-events-none mt-10">
        <Composer
          compact
          className="scale-90"
          editorClassName="text-base"
          initialValue="Hand off tasks to your team of agents"
        />
      </div>
    </div>
  );
}

function ComputerUseStep() {
  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="text-3xl font-semibold tracking-tight max-w-md text-center">
        Each agent has its own computer
      </h1>
      <div className="h-8" />
      <div className="relative aspect-5/3 w-full max-w-lg rounded-2xl overflow-hidden border border-border">
        <ComputerPlaceholder className="absolute inset-0 h-full w-full" />
        <DesktopIllustration />
      </div>
    </div>
  );
}

function RosterStep() {
  const {
    data: agents,
    isPending: rosterPending,
    isError: rosterFailed,
  } = useQuery(agentListQueryOptions());
  const explore =
    agents?.filter((a) => !a.mine && a.visibility === "public") ?? [];
  // The deployment's own roster only. Nothing is invented to top a sparse one up: a name later
  // found nowhere in the Bot catalog costs more trust than a short list does.
  const roster = explore.slice(0, 3);

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="text-3xl font-semibold tracking-tight max-w-md text-center">
        Choose from a variety of agents or create your own
      </h1>
      <div className="h-8" />
      <div className="w-full max-w-lg overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-4">
        {roster.map((a) => {
          return (
            <div
              className="bg-card p-4 rounded-lg flex flex-row gap-4 items-center"
              key={a.id}
            >
              <Avatar name={a.avatarSeed} size={40} />
              <div className="flex min-w-0 flex-col">
                <h3 className="line-clamp-1 text-base font-medium tracking-tight">
                  {a.name}
                </h3>
              </div>
            </div>
          );
        })}
        {/*
         * Guidance, not a placeholder, when the deployment publishes few public agents — the three
         * cards' worth this grid would otherwise draw. Only drawn on a roster that actually
         * answered: while it loads there is nothing to count, and on a failed query saying "you
         * publish 0" would be a lie the failed read, not the deployment, produced.
         */}
        {!rosterPending && !rosterFailed && roster.length < 3 ? (
          <div className="bg-card p-4 rounded-lg flex items-center md:col-span-1">
            <p className="text-sm text-muted-foreground">
              Your {appConfig.brand.productName} deployment currently publishes{" "}
              {roster.length} agent{roster.length === 1 ? "" : "s"} — ask your
              administrator to publish more from the Bot catalog.
            </p>
          </div>
        ) : null}
        {/*
         * Said plainly when the roster never came back, for the same reason every screen here
         * separates "you have none" from "the read failed": a person who is told the deployment
         * publishes nothing publishes nothing they know is not true.
         */}
        {rosterFailed ? (
          <div className="bg-card p-4 rounded-lg flex items-center md:col-span-1">
            <p className="text-sm text-destructive">
              Your agents couldn't be loaded, so there's nothing to publish here
              yet.
            </p>
          </div>
        ) : null}
        <div className="bg-card p-4 rounded-lg flex flex-row gap-4 items-center">
          <div className="rounded-full size-[40px] border border-foreground/30 border-dashed" />
          <h3 className="line-clamp-1 text-base font-medium tracking-tight text-foreground/70">
            Your own agent
          </h3>
        </div>
      </div>
    </div>
  );
}

const STEPS: Array<() => React.ReactNode> = [
  () => <WelcomeStep />,
  () => <ComputerUseStep />,
  () => <RosterStep />,
];

/** A pane arrives from the side the journey is moving toward, and leaves out the other. */
const variants = {
  initial: (direction: number) => ({ x: `${110 * direction}%`, opacity: 0 }),
  active: { x: "0%", opacity: 1 },
  exit: (direction: number) => ({ x: `${-110 * direction}%`, opacity: 0 }),
};

function RouteComponent() {
  const navigate = useNavigate();
  const complete = useMutation(completeOnboardingMutationOptions(queryClient));

  // Browser state on purpose: the step is not persisted while the wizard is being designed.
  const [step, setStep] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  // The way out: set once the completion is saved, it fades the whole page and then navigates.
  const [leaving, setLeaving] = React.useState(false);
  const [ref, bounds] = useMeasure();

  const last = step === STEPS.length - 1;

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setStep(to);
  };

  return (
    // Outside `_app` on purpose: no sidebar and no chrome until onboarding is done.
    // The fade runs only after the completion is saved, so a failed save never fades a page the
    // person still needs — and navigation waits for the fade, so the home screen never pops in
    // over a half-faded wizard.
    <motion.div
      animate={{ opacity: leaving ? 0 : 1 }}
      className={`min-h-svh overflow-hidden flex flex-col items-center justify-center w-full ${leaving ? "pointer-events-none" : ""}`}
      initial={false}
      onAnimationComplete={() => {
        if (leaving) {
          navigate({ to: "/" });
        }
      }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <div className="mx-auto w-full max-w-2xl px-4">
        <MotionConfig transition={{ duration: 0.5, type: "spring", bounce: 0 }}>
          {/* The frame follows each pane's height, so the buttons glide instead of jumping. */}
          <motion.div
            animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}
            className="overflow-hidden"
          >
            <div ref={ref}>
              <AnimatePresence
                custom={direction}
                initial={false}
                mode="popLayout"
              >
                <motion.div
                  animate="active"
                  custom={direction}
                  exit="exit"
                  initial="initial"
                  key={step}
                  variants={variants}
                >
                  {STEPS[step]()}
                </motion.div>
              </AnimatePresence>

              {complete.error ? (
                <p className="mt-4 text-destructive text-sm" role="alert">
                  {complete.error.message}
                </p>
              ) : null}

              <motion.div
                className="mt-20 flex flex-col items-center justify-center max-w-xs gap-4 w-full mx-auto"
                layout
              >
                <Button
                  className="w-full"
                  disabled={complete.isPending}
                  onClick={() => {
                    if (last) {
                      complete.mutate(undefined, {
                        onSuccess: () => setLeaving(true),
                      });
                    } else {
                      go(step + 1);
                    }
                  }}
                  size="lg"
                >
                  {complete.isPending
                    ? "Saving…"
                    : last
                      ? "Get started"
                      : "Continue"}
                </Button>
                {step !== 0 && (
                  <Button
                    className="w-full"
                    onClick={() => go(step - 1)}
                    variant="secondary"
                    size="lg"
                  >
                    Back
                  </Button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </MotionConfig>
      </div>
    </motion.div>
  );
}
