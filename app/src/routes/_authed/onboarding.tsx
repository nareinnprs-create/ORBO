import { IconCheck } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import Avatar from "boring-avatars";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import * as React from "react";
import useMeasure from "react-use-measure";
import AgentOrb from "@/components/agents/orb/agent-orb";
import { Composer } from "@/components/channels/composer";
import { LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { currentUserQueryOptions, needsOnboarding } from "@/lib/auth/queries";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { appConfig } from "@/lib/generated/application-config";
import { healthQueryOptions } from "@/lib/health/queries";
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
      {/*
       * The Diya wordmark, above the greeting. Two files so the ink follows the theme without
       * recolouring the artwork (assets/brand/README.txt forbids that) — the same pair /sign draws.
       */}
      <img
        alt=""
        className="h-11 dark:hidden"
        src="/brand/orbo_diya_horizontal_light.svg"
      />
      <img
        alt=""
        className="hidden h-11 dark:block"
        src="/brand/orbo_diya_horizontal_dark.svg"
      />
      <h1 className="font-heading text-3xl font-medium tracking-tight max-w-md text-center mt-8">
        Welcome to {appConfig.brand.productName}
      </h1>
      <p className="font-heading mt-2 text-base tracking-tight text-diya-rich-teal">
        Your Personal AI Companion.
      </p>
      <p className="mt-1 text-muted-foreground text-sm">
        Think. Remember. Plan. Act.
      </p>
      <div className="h-10" />
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

/**
 * Model access, as the deployment actually is.
 *
 * ORBO is self-hosted: provider keys are configured once, on the deployment, by the person who runs
 * it — nobody entering this wizard types a key. What this step can honestly branch on is /health,
 * the one endpoint that answers for the Intelligence runtime: connected says "you're set", anything
 * else says who connects it. The capability endpoint deliberately does not project provider
 * configuration (server/src/app.ts), so there is nothing truer to read.
 */
function ProviderStep() {
  const { data: user } = useQuery(currentUserQueryOptions());
  const health = useQuery(healthQueryOptions());
  const answered = health.data !== undefined;
  const runtimeConnected = health.data
    ? !health.data.degraded.some(
        (dependency) => dependency.name === "intelligence",
      )
    : false;

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="font-heading text-3xl font-medium tracking-tight max-w-md text-center">
        No keys to enter
      </h1>
      <div className="h-8" />
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <p className="text-muted-foreground text-sm text-pretty">
          {appConfig.brand.productName} is self-hosted. Bots answer through a
          model runtime connected once, on the deployment itself — nobody enters
          API keys here.
        </p>
        {!answered ? (
          <LoadingState label="Checking the model runtime…" />
        ) : runtimeConnected ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <IconCheck
              aria-hidden="true"
              className="size-4 shrink-0 text-diya-rich-teal"
            />
            This deployment's model runtime is connected — you're set.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground text-sm text-pretty">
            The model runtime isn't answering yet.{" "}
            {user?.role === "admin"
              ? "As an administrator, connect Intelligence in the deployment's environment — /health will say when it answers."
              : "If Bots can't answer, your administrator is the one who connects it."}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The first Bot, chosen for real.
 *
 * The roster is what the server publishes on a first run; nothing is invented to top a sparse one
 * up. A chosen Bot is carried out of the wizard as the recipient the app opens with — and the first
 * channel itself is created by the first message sent (`/channel/new` creates it on send), which is
 * why this step promises a conversation and not a channel.
 */
function FirstBotStep({
  chosenId,
  onChoose,
}: {
  chosenId: string | null;
  onChoose: (agentId: string | null) => void;
}) {
  const {
    data: agents,
    isPending: rosterPending,
    isError: rosterFailed,
  } = useQuery(agentListQueryOptions());
  const roster = (agents ?? [])
    .filter((a) => !a.mine && a.visibility === "public")
    .slice(0, 4);

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="font-heading text-3xl font-medium tracking-tight max-w-md text-center">
        Choose your first Bot
      </h1>
      <p className="mt-2 max-w-md text-center text-muted-foreground text-sm">
        Your first conversation with it opens your first channel. You can create
        your own Bots any time from the Bots page.
      </p>
      <div className="h-8" />
      <div className="grid w-full max-w-lg grid-cols-1 gap-3 overflow-hidden md:grid-cols-2">
        {roster.map((a) => {
          const chosen = chosenId === a.id;
          return (
            <button
              aria-pressed={chosen}
              className={`flex flex-row items-center gap-4 rounded-lg border p-4 text-left transition-colors ${
                chosen
                  ? "border-diya-rich-teal bg-diya-rich-teal/5"
                  : "border-border bg-card hover:border-foreground/20"
              }`}
              key={a.id}
              onClick={() => onChoose(chosen ? null : a.id)}
              type="button"
            >
              <Avatar name={a.avatarSeed} size={40} />
              <span className="flex min-w-0 flex-col">
                <span className="line-clamp-1 font-medium text-base tracking-tight">
                  {a.name}
                </span>
                {chosen ? (
                  <IconCheck
                    aria-hidden="true"
                    className="size-4 shrink-0 text-diya-rich-teal"
                  />
                ) : (
                  <span className="line-clamp-1 text-muted-foreground text-xs">
                    {a.title}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {/*
         * Guidance, not a placeholder, when the deployment publishes fewer public Bots than the
         * grid would draw — and only on a roster that actually answered: while it loads there is
         * nothing to count, and on a failed query saying "you have 0" would be a lie the failed
         * read, not the deployment, produced.
         */}
        {!rosterPending && !rosterFailed && roster.length < 2 ? (
          <div className="flex items-center rounded-lg border border-border bg-card p-4 md:col-span-1">
            <p className="text-muted-foreground text-sm text-pretty">
              This deployment publishes {roster.length}{" "}
              {roster.length === 1 ? "Bot" : "Bots"} so far — ask your
              administrator to publish more, or create your own from the Bots
              page once you're in.
            </p>
          </div>
        ) : null}
        {rosterFailed ? (
          <div className="flex items-center rounded-lg border border-border bg-card p-4 md:col-span-1">
            <p className="text-destructive text-sm">
              The roster couldn't be loaded, so there's nothing to choose from
              yet — you can pick a Bot after the wizard.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const STEP_COUNT = 3;

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
  // The first Bot picked on the last step, carried out of the wizard as the app's opening
  // conversation. Null means the app opens at home, the way it always has.
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [ref, bounds] = useMeasure();

  const last = step === STEP_COUNT - 1;

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setStep(to);
  };

  const finish = () => {
    complete.mutate(undefined, {
      onSuccess: () => setLeaving(true),
    });
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
          navigate(
            chosenId
              ? { search: { agent: chosenId }, to: "/channel/new" }
              : { to: "/" },
          );
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
                  {step === 0 ? (
                    <WelcomeStep />
                  ) : step === 1 ? (
                    <ProviderStep />
                  ) : (
                    <FirstBotStep chosenId={chosenId} onChoose={setChosenId} />
                  )}
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
                      finish();
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
                {/* The first step's way back is the browser's. */}
                {step !== 0 ? (
                  <Button
                    className="w-full"
                    onClick={() => go(step - 1)}
                    variant="secondary"
                    size="lg"
                  >
                    Back
                  </Button>
                ) : null}
              </motion.div>
            </div>
          </motion.div>
        </MotionConfig>
      </div>
    </motion.div>
  );
}
