import { createContext, useContext, type ComponentType, type ReactNode } from 'react'

/**
 * The pieces a host can replace, so the radar wears their design.
 *
 * Every prop here is a primitive or a `ReactNode`. That is the whole discipline:
 * a slot that took a `PullRequest` would publish `PullRequest`, and that type is
 * the one the architecture rests on being free to change -- it is what changed
 * when the data layer moved from GraphQL to REST in a single module.
 *
 * So `Row` receives its parts already rendered rather than the pull request they
 * came from. A host arranges them; it never learns their shape. The design note
 * sketched `Row` taking the pull request, and that was wrong for exactly this
 * reason.
 *
 * Anything not supplied falls back to the radar's own, so `components` is always
 * partial and a host replaces one thing without inheriting responsibility for
 * the rest.
 */

/**
 * What a button is *for*, not what it looks like.
 *
 * A host cannot style by class name -- the classes are prefixed and internal --
 * so the intent has to travel with the button. Five covers every one in the app;
 * a sixth would mean the set is describing appearance rather than purpose.
 */
export type ButtonVariant =
  /** The one action a screen is for: Continue, Add, Merge. */
  | 'primary'
  /** Destructive: Close. */
  | 'danger'
  /** A bordered secondary action: Repositories, Refresh, Cancel. */
  | 'default'
  /** Text only: Sign out, Clear, Save. */
  | 'quiet'
  /** A row inside a dropdown. */
  | 'menuitem'
  /**
   * A toggle in a row of them -- the filter axes, the saved views. Reads
   * `selected`.
   *
   * These were left out at first as "the radar's own chrome", and that was
   * wrong: they are the most prominent interactive thing on the page, and a
   * host replacing Button saw one button change out of thirty. A design a host
   * cannot reach is not a design they have adopted.
   */
  | 'pill'
  /** Opens a menu: the dropdown headers, the actions ⋯. Reads `selected`. */
  | 'trigger'

export interface ButtonProps {
  children: ReactNode
  variant: ButtonVariant
  onClick?: (() => void) | undefined
  type?: 'button' | 'submit'
  disabled?: boolean | undefined
  autoFocus?: boolean | undefined
  title?: string | undefined
  /** Present on icon-only and glyph-only buttons, where the label is not visible. */
  'aria-label'?: string | undefined
  'aria-haspopup'?: 'menu' | 'listbox' | 'dialog' | undefined
  'aria-expanded'?: boolean | undefined
  'aria-selected'?: boolean | undefined
  role?: string | undefined
  lang?: string | undefined
  /** For `pill` and `trigger`: whether this one is currently on. */
  selected?: boolean | undefined
}

export type ChipTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info'

export interface ChipProps {
  children: ReactNode
  tone: ChipTone
  /**
   * A GitHub label's own colour, which belongs to the label rather than to the
   * design. A host that ignores it renders a plain chip; one that uses it looks
   * like GitHub. Given as CSS colours so no palette is implied.
   */
  color?: { background: string; text: string } | undefined
  title?: string | undefined
}

export interface AvatarProps {
  /** Never empty: the radar omits the avatar entirely rather than passing ''. */
  src: string
  alt: string
  size: number
}

/**
 * `title` is a pull request's own title, which is a link but must not look like
 * body text that happens to be linked -- it is the heading of its row. Same
 * reasoning as ButtonVariant: the intent travels with the element, because a
 * host cannot reach the classes.
 */
export type LinkVariant = 'default' | 'title'

export interface LinkProps {
  children: ReactNode
  href: string
  variant: LinkVariant
  /** Every link here leaves for GitHub, so this is always true today. */
  external: boolean
  title?: string | undefined
}

export interface InputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  type?: 'text' | 'password'
  autoFocus?: boolean | undefined
  autoComplete?: string | undefined
  id?: string | undefined
  'aria-label'?: string | undefined
  /** Used where an input appears on demand and dismisses itself when abandoned. */
  onBlur?: (() => void) | undefined
}

/**
 * One pull request, in pieces.
 *
 * Rendered content, never the pull request itself. `state` and `draft` are the
 * two facts a host might want to style a whole row on -- a merged row greyed
 * out, a draft dimmed -- and both are plain strings rather than the internal
 * unions, so widening those later is not a breaking change here.
 */
export interface RowProps {
  /** The status glyph. */
  icon: ReactNode
  /** The title, already a link to GitHub. */
  title: ReactNode
  /** Repository, number, author, timestamps: a sequence of small nodes. */
  meta: ReactNode
  /** Labels and review badges. Empty when there are none. */
  badges: ReactNode
  /**
   * Review verdict, check state and assignee avatars: the column that answers
   * "where is this up to" at a glance, kept apart from `meta` because it is
   * scanned rather than read.
   */
  trailing: ReactNode
  /** The actions menu, or nothing when the host did not ask for actions. */
  actions: ReactNode
  /** `open`, `merged` or `closed`. A string, not the internal union. */
  state: string
  draft: boolean
}

export interface RadarComponents {
  Button?: ComponentType<ButtonProps>
  Chip?: ComponentType<ChipProps>
  Avatar?: ComponentType<AvatarProps>
  Link?: ComponentType<LinkProps>
  Input?: ComponentType<InputProps>
  Row?: ComponentType<RowProps>
}

/* --------------------------------------------------------------- defaults */

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    'pr:rounded-md pr:bg-emerald-600 pr:px-4 pr:py-2 pr:text-sm pr:font-medium pr:text-white pr:transition-colors pr:hover:bg-emerald-700 pr:disabled:opacity-50',
  danger:
    'pr:rounded-md pr:bg-red-600 pr:px-3 pr:py-1 pr:text-sm pr:font-medium pr:text-white pr:hover:bg-red-700 pr:disabled:opacity-50',
  default:
    'pr:rounded-md pr:border pr:border-neutral-300 pr:px-2.5 pr:py-1 pr:text-sm pr:hover:bg-neutral-100 pr:disabled:opacity-50 pr:dark:border-neutral-700 pr:dark:hover:bg-neutral-800',
  quiet:
    'pr:text-sm pr:text-neutral-500 pr:hover:text-neutral-900 pr:disabled:opacity-50 pr:dark:hover:text-neutral-100',
  menuitem:
    'pr:block pr:w-full pr:px-3 pr:py-1.5 pr:text-start pr:text-sm pr:hover:bg-neutral-100 pr:disabled:opacity-50 pr:dark:hover:bg-neutral-800',
  pill: '',
  trigger: '',
}

/** `pill` and `trigger` look different when they are on. */
const SELECTABLE: Record<'pill' | 'trigger', { on: string; off: string }> = {
  pill: {
    on: 'pr:flex pr:items-center pr:gap-1.5 pr:rounded-full pr:px-3 pr:py-1 pr:text-sm pr:transition-colors pr:bg-neutral-900 pr:text-white pr:dark:bg-neutral-100 pr:dark:text-neutral-900',
    off: 'pr:flex pr:items-center pr:gap-1.5 pr:rounded-full pr:px-3 pr:py-1 pr:text-sm pr:transition-colors pr:text-neutral-600 pr:hover:bg-neutral-100 pr:dark:text-neutral-400 pr:dark:hover:bg-neutral-800',
  },
  trigger: {
    on: 'pr:flex pr:items-center pr:gap-1 pr:rounded-md pr:px-2.5 pr:py-1 pr:text-sm pr:font-medium pr:text-neutral-900 pr:hover:bg-neutral-100 pr:dark:text-neutral-100 pr:dark:hover:bg-neutral-800',
    off: 'pr:flex pr:items-center pr:gap-1 pr:rounded-md pr:px-2.5 pr:py-1 pr:text-sm pr:text-neutral-600 pr:hover:bg-neutral-100 pr:dark:text-neutral-400 pr:dark:hover:bg-neutral-800',
  },
}

const CHIP: Record<ChipTone, string> = {
  neutral: 'pr:text-neutral-600 pr:bg-neutral-100 pr:dark:text-neutral-400 pr:dark:bg-neutral-800',
  success: 'pr:text-emerald-700 pr:bg-emerald-50 pr:dark:text-emerald-400 pr:dark:bg-emerald-950',
  danger: 'pr:text-red-700 pr:bg-red-50 pr:dark:text-red-400 pr:dark:bg-red-950',
  warning: 'pr:text-amber-700 pr:bg-amber-50 pr:dark:text-amber-400 pr:dark:bg-amber-950',
  info: 'pr:text-blue-700 pr:bg-blue-50 pr:dark:text-blue-400 pr:dark:bg-blue-950',
}

function DefaultButton({
  children,
  variant,
  onClick,
  type = 'button',
  selected,
  ...rest
}: ButtonProps) {
  const className =
    variant === 'pill' || variant === 'trigger'
      ? SELECTABLE[variant][selected ? 'on' : 'off']
      : BUTTON[variant]
  return (
    <button type={type} onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  )
}

function DefaultChip({ children, tone, color, title }: ChipProps) {
  return (
    <span
      title={title}
      className={`pr:rounded-full pr:px-2 pr:py-0.5 pr:text-xs ${color ? '' : CHIP[tone]}`}
      style={color ? { backgroundColor: color.background, color: color.text } : undefined}
    >
      {children}
    </span>
  )
}

function DefaultAvatar({ src, alt, size }: AvatarProps) {
  return (
    <img src={src} alt={alt} width={size} height={size} className="pr:rounded-full" loading="lazy" />
  )
}

const LINK: Record<LinkVariant, string> = {
  default: 'pr:text-blue-600 pr:underline pr:dark:text-blue-400',
  title:
    'pr:font-semibold pr:text-neutral-900 pr:hover:text-blue-600 pr:hover:underline pr:dark:text-neutral-100 pr:dark:hover:text-blue-400',
}

function DefaultLink({ children, href, variant, external, title }: LinkProps) {
  return (
    <a
      href={href}
      title={title}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={LINK[variant]}
    >
      {children}
    </a>
  )
}

function DefaultInput({ onChange, type = 'text', ...rest }: InputProps) {
  return (
    <input
      type={type}
      onChange={(event) => onChange(event.target.value)}
      className="pr:w-full pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:px-3 pr:py-2 pr:text-sm pr:text-neutral-900 pr:outline-none pr:focus:border-blue-500 pr:dark:border-neutral-700 pr:dark:bg-neutral-900 pr:dark:text-neutral-100"
      {...rest}
    />
  )
}

function DefaultRow({ icon, title, meta, badges, trailing, actions }: RowProps) {
  return (
    <li className="pr:flex pr:gap-3 pr:border-b pr:border-neutral-200 pr:px-4 pr:py-3 pr:last:border-b-0 pr:hover:bg-neutral-50 pr:dark:border-neutral-800 pr:dark:hover:bg-neutral-900/60">
      <div className="pr:pt-0.5">{icon}</div>
      <div className="pr:min-w-0 pr:flex-1">
        <div className="pr:flex pr:flex-wrap pr:items-baseline pr:gap-x-2 pr:gap-y-1">
          {title}
          {badges}
        </div>
        <div className="pr:mt-1 pr:flex pr:flex-wrap pr:items-center pr:gap-x-1.5 pr:gap-y-1 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
          {meta}
        </div>
      </div>
      <div className="pr:flex pr:shrink-0 pr:items-center pr:gap-2 pr:self-start pr:pt-0.5">
        {trailing}
      </div>
      {actions ? <div className="pr:shrink-0 pr:pt-0.5">{actions}</div> : null}
    </li>
  )
}

const DEFAULTS = {
  Button: DefaultButton,
  Chip: DefaultChip,
  Avatar: DefaultAvatar,
  Link: DefaultLink,
  Input: DefaultInput,
  Row: DefaultRow,
} as const

export type Slots = typeof DEFAULTS

const Context = createContext<Slots>(DEFAULTS)

/**
 * Fill the gaps in what a host supplied.
 *
 * Merged once here rather than defaulted at every use, so a component can write
 * `<Button>` without knowing whether it came from the host.
 */
export function SlotProvider({
  components,
  children,
}: {
  components?: RadarComponents | undefined
  children: ReactNode
}) {
  const value: Slots = { ...DEFAULTS, ...(components ?? {}) } as Slots
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useSlots(): Slots {
  return useContext(Context)
}
