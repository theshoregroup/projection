import { Button } from "@projection/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@projection/ui/components/dialog";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

interface InlineTextEditProps {
	/** The committed text ("" when empty / creating). */
	value: string;
	/** Persist a committed value. Throw to keep editing (parent should toast). */
	onCommit: (text: string) => Promise<void> | void;
	/** Editing finished without committing (unchanged, empty, or Escape). For
	 * `startActive` usages the parent should unmount this component. */
	onDone?: () => void;
	/** Render the input immediately (inline creation) instead of click-to-edit. */
	startActive?: boolean;
	/** Allow committing empty text (e.g. clearing an Assignee). */
	allowEmpty?: boolean;
	placeholder?: string;
	/** Layout/typography classes applied to both the view text and the input. */
	className?: string;
	/** Disable editing (read-only Board). */
	disabled?: boolean;
}

/** Spreadsheet-style inline text edit: click the text and it becomes a text
 * box in place; Enter or blur commits, Escape cancels. Blocks navigation only
 * while the draft differs from the committed value. */
export default function InlineTextEdit({
	value,
	onCommit,
	onDone,
	startActive = false,
	allowEmpty = false,
	placeholder,
	className = "",
	disabled = false,
}: InlineTextEditProps) {
	const [editing, setEditing] = useState(startActive && !disabled);
	const [draft, setDraft] = useState(value);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Focus and select-all once, when the input appears
	useEffect(() => {
		if (!editing) return;
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [editing]);

	const dirty = editing && draft.trim() !== value;

	// Block navigation only while the draft differs. The callback must stay
	// referentially stable — the blocker effect re-registers on identity
	// change, which would orphan a pending blocked navigation.
	const shouldBlockFn = useCallback(() => true, []);
	const blocker = useBlocker({
		shouldBlockFn,
		enableBeforeUnload: dirty,
		disabled: !dirty,
		withResolver: true,
	});

	function finish() {
		if (startActive) onDone?.();
		else setEditing(false);
	}

	async function attemptCommit() {
		const text = draft.trim();
		if (text === value || (text.length === 0 && !allowEmpty)) {
			finish();
			return;
		}
		try {
			await onCommit(text);
			finish();
		} catch {
			// Keep editing — the parent already toasted the failure.
		}
	}

	if (!editing) {
		return (
			<button
				type="button"
				className={`flex items-center self-stretch text-left hover:underline disabled:cursor-default disabled:no-underline ${className}`}
				onClick={() => {
					setDraft(value);
					setEditing(true);
				}}
				disabled={disabled}
			>
				<span className="truncate">{value}</span>
			</button>
		);
	}

	return (
		<>
			<input
				ref={inputRef}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => void attemptCommit()}
				onKeyDown={(event) => {
					if (event.key === "Enter") void attemptCommit();
					if (event.key === "Escape") finish();
				}}
				placeholder={placeholder}
				className={`min-w-0 rounded-xs bg-transparent outline-none ring-1 ring-ring ${className}`}
			/>
			{blocker.status === "blocked" && (
				<Dialog
					open
					onOpenChange={(open) => {
						if (!open) blocker.reset();
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Discard unsaved changes?</DialogTitle>
							<DialogDescription>
								You have unsaved edits on this board. Leaving now will discard
								them.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={() => blocker.reset()}>
								Keep editing
							</Button>
							<Button variant="destructive" onClick={() => blocker.proceed()}>
								Discard
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</>
	);
}
