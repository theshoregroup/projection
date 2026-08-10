import { CopyIcon, RowsIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@projection/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useTRPCClient } from "@/utils/trpc";

interface SelectionActionsProps {
	projectId: string;
	selectedIds: ReadonlySet<string>;
	/** Called after any action completes — selection is spent. */
	onClear: () => void;
	/** Called with the new Group's id so the Board opens its title for naming. */
	onGrouped: (groupId: string) => void;
}

/** Bulk actions for the Board's row selection, sitting left of Share in the
 * Project header. Inactive until at least one row is checked. Deleting a
 * selected Group deletes its whole subtree (CONTEXT.md). */
export default function SelectionActions({
	projectId,
	selectedIds,
	onClear,
	onGrouped,
}: SelectionActionsProps) {
	const trpcClient = useTRPCClient();
	const queryClient = useQueryClient();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [busy, setBusy] = useState(false);

	const disabled = selectedIds.size === 0 || busy;

	async function run(action: () => Promise<unknown>) {
		setBusy(true);
		try {
			await action();
			await queryClient.invalidateQueries({
				queryKey: ["collection", "lines", projectId],
			});
			onClear();
		} catch {
			toast.error("Couldn't save — try again.");
		} finally {
			setBusy(false);
		}
	}

	function onGroup() {
		void run(async () => {
			const created = await trpcClient.lines.group.mutate({
				projectId,
				lineIds: [...selectedIds],
			});
			onGrouped(created.id);
		});
	}

	function onCopy() {
		void run(() =>
			trpcClient.lines.duplicateMany.mutate({
				projectId,
				ids: [...selectedIds],
			}),
		);
	}

	/** Two-step: first click arms, second deletes (no dialogs on the Board). */
	function onDelete() {
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}
		setConfirmDelete(false);
		void run(() =>
			trpcClient.lines.deleteMany.mutate({
				projectId,
				ids: [...selectedIds],
			}),
		);
	}

	return (
		<div className="flex items-center gap-1">
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={disabled}
				onClick={onCopy}
			>
				<CopyIcon className="size-4" /> Copy
			</Button>
			<Button
				type="button"
				size="sm"
				variant={confirmDelete ? "destructive" : "outline"}
				disabled={disabled}
				onClick={onDelete}
				onBlur={() => setConfirmDelete(false)}
			>
				<TrashIcon className="size-4" />
				{confirmDelete ? "Click again to delete" : "Delete"}
			</Button>
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={disabled}
				onClick={onGroup}
			>
				<RowsIcon className="size-4" /> Group
			</Button>
		</div>
	);
}
