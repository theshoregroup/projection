import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react";
import { z } from "zod";

export type HistoryMode = "modal" | "always-push" | "always-replace";

type AllowedShape = {
	dialogKey: z.ZodLiteral<string>;
	dialogId?: z.ZodTypeAny;
	dialogPage?: z.ZodTypeAny;
};

export type DialogSchema = z.ZodObject<AllowedShape>;

type Inferred<S extends DialogSchema> = z.infer<S>;
type IdOf<S extends DialogSchema> = Inferred<S> extends { dialogId: infer T } ? T : undefined;
type PageOf<S extends DialogSchema> = Inferred<S> extends { dialogPage: infer T } ? T : undefined;
type HasPage<S extends DialogSchema> = Inferred<S> extends { dialogPage: unknown } ? true : false;
type HasId<S extends DialogSchema> = Inferred<S> extends { dialogId: unknown } ? true : false;

type SetPageFn<S extends DialogSchema> = HasPage<S> extends true ? (page: PageOf<S>) => void : never;

export type DialogState<S extends DialogSchema> =
	| {
			open: false;
			dialogId: undefined;
			dialogPage: undefined;
			setPage: SetPageFn<S>;
			onOpenChange: (next: boolean) => void;
	  }
	| {
			open: true;
			dialogId: IdOf<S>;
			dialogPage: PageOf<S>;
			setPage: SetPageFn<S>;
			onOpenChange: (next: boolean) => void;
	  };

type DialogLinkProps<S extends DialogSchema> = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
	children?: ReactNode;
} & (HasId<S> extends true ? { dialogId: IdOf<S> } : { dialogId?: undefined }) &
	(HasPage<S> extends true ? { dialogPage?: PageOf<S> } : { dialogPage?: undefined });

export interface Dialog<S extends DialogSchema> {
	readonly key: string;
	readonly schema: S;
	readonly historyMode: HistoryMode;
	useControl: () => DialogState<S>;
	Link: (props: DialogLinkProps<S>) => ReactElement;
}

const ALLOWED_FIELDS = new Set(["dialogKey", "dialogId", "dialogPage"]);

function isLiteral(value: unknown): value is z.ZodLiteral<string> {
	return value instanceof z.ZodLiteral;
}

function extractLiteralValue(literal: z.ZodLiteral<string>): string {
	// Zod v4 surfaces the literal value at `.value` (which is an array for multi-value literals);
	// for our single-value case we take the first.
	const raw = (literal as unknown as { value: string | readonly string[] }).value;
	return Array.isArray(raw) ? raw[0] : (raw as string);
}

export function defineDialog<S extends DialogSchema>(opts: { schema: S; historyMode?: HistoryMode }): Dialog<S> {
	const { schema, historyMode = "modal" } = opts;

	// Runtime enforcement: only allowed fields, dialogKey must be a literal.
	const shape = schema.shape as Record<string, z.ZodTypeAny>;
	const extras = Object.keys(shape).filter((f) => !ALLOWED_FIELDS.has(f));
	if (extras.length > 0) {
		throw new Error(
			`defineDialog: schema has unsupported fields [${extras.join(", ")}]. Only dialogKey, dialogId, dialogPage are allowed.`,
		);
	}
	if (!shape.dialogKey || !isLiteral(shape.dialogKey)) {
		throw new Error("defineDialog: schema must declare dialogKey as z.literal('...').");
	}

	const key = extractLiteralValue(shape.dialogKey);
	const hasId = "dialogId" in shape;
	const hasPage = "dialogPage" in shape;

	function useControl(): DialogState<S> {
		// The route validator has already parsed the URL into the discriminated union, so
		// useSearch returns a typed object. We only need to check whether THIS dialog is the
		// active one (by dialogKey).
		const search = useSearch({ strict: false }) as Record<string, unknown>;
		const navigate = useNavigate();

		const isActive = search.dialogKey === key;

		const onOpenChange = (next: boolean) => {
			const shouldReplace = historyMode === "always-replace" || (historyMode === "modal" && !next);
			navigate({
				// biome-ignore lint/suspicious/noExplicitAny: generic dialog factory; navigate's union type is too narrow to express here
				search: ((old: any) =>
					next
						? { ...old, dialogKey: key }
						: { ...old, dialogKey: undefined, dialogId: undefined, dialogPage: undefined }) as never,
				replace: shouldReplace,
			});
		};

		const setPage = ((nextPage: unknown) => {
			const shouldReplace = historyMode === "always-replace";
			navigate({
				// biome-ignore lint/suspicious/noExplicitAny: see above
				search: ((old: any) => ({ ...old, dialogKey: key, dialogPage: nextPage })) as never,
				replace: shouldReplace,
			});
		}) as SetPageFn<S>;

		if (isActive) {
			return {
				open: true,
				dialogId: (hasId ? search.dialogId : undefined) as IdOf<S>,
				dialogPage: (hasPage ? search.dialogPage : undefined) as PageOf<S>,
				setPage,
				onOpenChange,
			};
		}

		return {
			open: false,
			dialogId: undefined,
			dialogPage: undefined,
			setPage,
			onOpenChange,
		};
	}

	function DialogLinkImpl(props: DialogLinkProps<S>) {
		const { dialogId, dialogPage, children, ...rest } = props as DialogLinkProps<S> & {
			dialogId?: unknown;
			dialogPage?: unknown;
		};
		const shouldReplace = historyMode === "always-replace";

		return (
			<Link
				to="."
				search={
					// biome-ignore lint/suspicious/noExplicitAny: see above
					((old: any) => ({
						...(old ?? {}),
						dialogKey: key,
						dialogId,
						dialogPage,
					})) as never
				}
				replace={shouldReplace}
				{...rest}
			>
				{children}
			</Link>
		);
	}

	return {
		key,
		schema,
		historyMode,
		useControl,
		Link: DialogLinkImpl,
	};
}
