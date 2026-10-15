import type * as React from "react";

import { buttonVariants } from "./button";
import { cn } from "./utils";

/*
 * Canonical Questionnaire family. Export names, `data-slot`s, and Tailwind
 * scale mirror app/src/components/ui/questionnaire.tsx (Questionnaire +
 * Progress/Item/Title/Description/Choices/Choice/ChoiceDescription/Input/
 * Error/Actions/Previous/Skip/Next/Submit) so a future port is mechanical.
 *
 * Dependency-light by design: native form/fieldset/legend/label/input/p/
 * buttons, no `@shadcn/react/questionnaire`, no Tabler icons (inline SVG
 * check, `buttonVariants` from the local canonical Button for the nav
 * buttons). Deliberate divergences: Questionnaire is a plain <form> (no
 * step/item state — `items`/`item`/`defaultItem`/`onItemChange`/`shortcuts`
 * are not accepted and every Item renders; the consumer controls
 * visibility); Item keeps the app `name`/`multiple`/`required`/`disabled`/
 * `invalid` API (`required` maps to `data-required` — a fieldset carries no
 * `required` attribute — and `invalid` to `aria-invalid` + `data-invalid`,
 * like the app's Item state); Choice keeps `value`/`checked`/`defaultChecked`/
 * `disabled` and gains an explicit `type` (`radio` | `checkbox`, defaults to
 * `radio`) reflected as `data-type` — the app derives it from the Item's
 * `multiple` via context, which has no state here; ChoiceShortcut gains an
 * explicit `shortcut` (the app derives it from the Root `shortcuts` mode);
 * QuestionnaireInput keeps the app `type` union; QuestionnaireError gains an
 * explicit `invalid` (additive — the app derives it from the Item, like the
 * DropdownMenu `RadioItem` `checked`) driving `hidden` + `role="alert"`;
 * The choice `<input>` is inlined in `Choice` (rather than composed via a
 * `ChoiceInput` piece, which the app file does not export either) so the
 * nested control stays statically associated with its `<label>` for
 * `a11y/noLabelWithoutControl`; `QuestionnaireChoiceLabel` stays
 * module-private (same call as the canonical `Empty`/`InputGroup` variants)
 * while `QuestionnaireChoiceShortcut` is exported (additive, so a shortcut
 * badge can be set explicitly via `shortcut` without Root state);
 * Previous/Skip/Next/Submit keep the app `size`/`variant` API over
 * `buttonVariants` (`Submit` defaults to `type="submit"`, the rest to
 * `type="button"`, matching the app) with no visibility/step gating and no
 * keyboard/shortcut handling (same category as the canonical Select's
 * dropped keyboard behavior).
 */

function Questionnaire({
  className,
  noValidate = true,
  ...props
}: React.ComponentProps<"form">) {
  return (
    <form
      data-slot="questionnaire"
      noValidate={noValidate}
      className={cn("flex w-full min-w-0 flex-col gap-4", className)}
      {...props}
    />
  );
}

function QuestionnaireProgress({
  className,
  children,
  current,
  total,
  ...props
}: React.ComponentProps<"div"> & {
  current?: number;
  total?: number;
}) {
  const fallback =
    current != null && total ? `Question ${current} of ${total}` : undefined;
  return (
    <div
      data-slot="questionnaire-progress"
      role="progressbar"
      aria-label="Questionnaire progress"
      aria-live="polite"
      aria-valuemax={total ?? undefined}
      aria-valuemin={total ? 1 : undefined}
      aria-valuenow={current ?? undefined}
      aria-valuetext={fallback}
      className={cn(
        "min-h-[1lh] w-fit min-w-[14ch] text-xs font-medium text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    >
      {children ?? fallback}
    </div>
  );
}

function QuestionnaireItem({
  className,
  name,
  multiple = false,
  required = false,
  disabled = false,
  invalid = false,
  ...props
}: React.ComponentProps<"fieldset"> & {
  name: string;
  multiple?: boolean;
  required?: boolean;
  invalid?: boolean;
}) {
  return (
    <fieldset
      data-slot="questionnaire-item"
      data-multiple={multiple ? true : undefined}
      data-required={required ? true : undefined}
      data-invalid={invalid ? true : undefined}
      name={name}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-4 border-0 p-0 outline-none",
        className,
      )}
      {...props}
    />
  );
}

function QuestionnaireTitle({
  className,
  ...props
}: React.ComponentProps<"legend">) {
  return (
    <legend
      data-slot="questionnaire-title"
      className={cn(
        "font-heading text-base leading-snug font-medium text-pretty [&:not(:has(~[data-slot=questionnaire-description]))]:mb-4",
        className,
      )}
      {...props}
    />
  );
}

function QuestionnaireDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="questionnaire-description"
      className={cn("text-sm text-pretty text-muted-foreground", className)}
      {...props}
    />
  );
}

function QuestionnaireChoices({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="questionnaire-choices"
      className={cn(
        "group/questionnaire-choices grid min-w-0 gap-2",
        className,
      )}
      {...props}
    />
  );
}

function QuestionnaireChoiceLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="questionnaire-choice-label"
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-0.5 leading-snug",
        className,
      )}
      {...props}
    />
  );
}

function QuestionnaireChoiceShortcut({
  className,
  children,
  shortcut = null,
  ...props
}: React.ComponentProps<"span"> & {
  shortcut?: string | null;
}) {
  const resolved = children ?? shortcut;
  return (
    <span
      data-slot="questionnaire-choice-shortcut"
      aria-hidden="true"
      hidden={resolved == null}
      className={cn(
        "pointer-events-none ms-auto hidden size-5 shrink-0 translate-y-[--spacing(0.45)] items-center justify-center rounded-md border border-input bg-background font-mono text-[0.625rem] leading-none font-medium text-muted-foreground group-has-data-[slot=questionnaire-choice-description]/questionnaire-choice:translate-y-0.5 group-data-[shortcut]/questionnaire-choice:inline-flex",
        className,
      )}
      {...props}
    >
      {resolved}
    </span>
  );
}

function QuestionnaireChoice({
  children,
  className,
  value,
  type = "radio",
  checked,
  defaultChecked,
  disabled,
  ...props
}: React.ComponentProps<"label"> & {
  value: string;
  type?: "radio" | "checkbox";
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      data-slot="questionnaire-choice"
      data-value={value}
      data-type={type}
      data-checked={checked ? true : undefined}
      data-disabled={disabled ? true : undefined}
      className={cn(
        "group/questionnaire-choice relative flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-input bg-transparent px-3 py-2.5 text-start text-sm transition-colors outline-none select-none hover:bg-muted/50 has-[>input:focus-visible]:border-ring has-[>input:focus-visible]:ring-3 has-[>input:focus-visible]:ring-ring/50 data-invalid:border-destructive dark:bg-input/20 data-checked:border-primary/40 data-checked:bg-muted dark:data-checked:bg-muted",
        "data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <input
        data-slot="questionnaire-choice-input"
        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        type={type}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
      />
      <span
        aria-hidden="true"
        data-slot="questionnaire-choice-indicator"
        className="pointer-events-none relative flex size-4 shrink-0 translate-y-[--spacing(0.45)] items-center justify-center rounded-[4px] border border-input group-has-data-[slot=questionnaire-choice-description]/questionnaire-choice:translate-y-0.5 group-data-[type=radio]/questionnaire-choice:rounded-full group-data-checked/questionnaire-choice:border-primary group-data-checked/questionnaire-choice:bg-primary group-data-checked/questionnaire-choice:text-primary-foreground dark:bg-input/30 dark:group-data-checked/questionnaire-choice:bg-primary"
      >
        <span
          data-slot="questionnaire-choice-indicator-dot"
          className="hidden size-2 rounded-full bg-primary-foreground group-data-[type=checkbox]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          data-slot="questionnaire-choice-indicator-check"
          className="hidden size-3.5 group-data-[type=radio]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      <QuestionnaireChoiceLabel>{children}</QuestionnaireChoiceLabel>
      <QuestionnaireChoiceShortcut />
    </label>
  );
}

function QuestionnaireChoiceDescription({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="questionnaire-choice-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

type QuestionnaireInputType =
  | "date"
  | "datetime-local"
  | "email"
  | "month"
  | "number"
  | "password"
  | "search"
  | "tel"
  | "text"
  | "time"
  | "url"
  | "week";

function QuestionnaireInput({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input"> & {
  type?: QuestionnaireInputType;
}) {
  return (
    <div
      data-slot="questionnaire-input-wrapper"
      className="group/questionnaire-input relative w-full min-w-0"
    >
      <input
        data-slot="questionnaire-input"
        type={type}
        className={cn(
          "h-8 min-h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 sm:min-h-0 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          "selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function QuestionnaireError({
  className,
  invalid = false,
  ...props
}: React.ComponentProps<"p"> & {
  invalid?: boolean;
}) {
  return (
    <p
      data-slot="questionnaire-error"
      data-invalid={invalid ? true : undefined}
      hidden={!invalid}
      role={invalid ? "alert" : undefined}
      className={cn("mt-2 text-sm text-destructive", className)}
      {...props}
    />
  );
}

function QuestionnaireActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="questionnaire-actions"
      className={cn(
        "grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:min-h-8",
        className,
      )}
      {...props}
    />
  );
}

function QuestionnairePrevious({
  children,
  className,
  size = "default",
  variant = "outline",
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "destructive"
    | "link"
    | "ai";
}) {
  return (
    <button
      data-slot="questionnaire-previous"
      data-size={size}
      data-variant={variant}
      type={type}
      className={cn(
        buttonVariants({ size, variant }),
        "col-start-1 row-start-1 min-h-11 justify-self-start sm:min-h-0",
        className,
      )}
      {...props}
    >
      {children ?? "Previous"}
    </button>
  );
}

function QuestionnaireSkip({
  children,
  className,
  size = "default",
  variant = "outline",
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "destructive"
    | "link"
    | "ai";
}) {
  return (
    <button
      data-slot="questionnaire-skip"
      data-size={size}
      data-variant={variant}
      type={type}
      className={cn(
        buttonVariants({ size, variant }),
        "col-start-2 row-start-1 min-h-11 justify-self-end sm:min-h-0",
        className,
      )}
      {...props}
    >
      {children ?? "Skip"}
    </button>
  );
}

function QuestionnaireNext({
  children,
  className,
  size = "default",
  variant = "default",
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "destructive"
    | "link"
    | "ai";
}) {
  return (
    <button
      data-slot="questionnaire-next"
      data-size={size}
      data-variant={variant}
      type={type}
      className={cn(
        buttonVariants({ size, variant }),
        "col-start-3 row-start-1 min-h-11 justify-self-end sm:min-h-0",
        className,
      )}
      {...props}
    >
      {children ?? "Next"}
    </button>
  );
}

function QuestionnaireSubmit({
  children,
  className,
  size = "default",
  variant = "default",
  type = "submit",
  ...props
}: React.ComponentProps<"button"> & {
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "destructive"
    | "link"
    | "ai";
}) {
  return (
    <button
      data-slot="questionnaire-submit"
      data-size={size}
      data-variant={variant}
      type={type}
      className={cn(
        buttonVariants({ size, variant }),
        "col-start-3 row-start-1 min-h-11 justify-self-end sm:min-h-0",
        className,
      )}
      {...props}
    >
      {children ?? "Submit"}
    </button>
  );
}

export {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoiceShortcut,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
  type QuestionnaireInputType,
};
