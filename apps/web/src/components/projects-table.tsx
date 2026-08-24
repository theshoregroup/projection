import {
	CopyIcon,
	DotsThreeIcon,
	ImageBrokenIcon,
	MagnifyingGlassIcon,
	SmileyXEyesIcon,
	TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@projection/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@projection/ui/components/dropdown-menu";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@projection/ui/components/empty";
import { Input } from "@projection/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@projection/ui/components/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProjectsRow } from "@/lib/collections";
import { useTRPC } from "@/utils/trpc";

const columnHelper = createColumnHelper<ProjectsRow>();

/** Per-row actions menu (mine variant only). Duplicate forks the Project and
 * opens the copy; Delete is the Board's two-step pattern — first click arms,
 * second deletes — so the menu stays open between clicks (`closeOnClick` off)
 * and the arm resets when the menu closes. The arm state lives here, not in
 * the columns memo, so arming doesn't remount the menu. */
function RowActions({ project }: { project: ProjectsRow }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [armed, setArmed] = useState(false);

	const duplicate = useMutation(
		trpc.projects.duplicate.mutationOptions({
			onSuccess: async (created) => {
				await queryClient.invalidateQueries({
					queryKey: ["collection", "projects"],
				});
				toast.success(`Duplicated as “${created.name}”`);
				navigate({
					to: "/projects/$projectId",
					params: { projectId: created.id },
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const remove = useMutation(
		trpc.projects.delete.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: ["collection", "projects"],
				});
				toast.success("Project deleted");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (!open) setArmed(false);
			}}
		>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Actions for ${project.name}`}
					/>
				}
			>
				<DotsThreeIcon className="size-5" weight="bold" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuItem
					disabled={duplicate.isPending}
					onClick={() => duplicate.mutate({ id: project.id })}
				>
					<CopyIcon />
					Duplicate
				</DropdownMenuItem>
				<DropdownMenuItem
					variant={armed ? "destructive" : "default"}
					closeOnClick={false}
					disabled={remove.isPending}
					onClick={() => {
						if (!armed) {
							setArmed(true);
							return;
						}
						setArmed(false);
						remove.mutate({ id: project.id });
					}}
				>
					<TrashIcon />
					{armed ? "Click again to delete" : "Delete"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** Project list as a table (CONTEXT.md — Project). One component serves both
 * dashboard sections: `variant="shared"` adds the Owner column ("Shared by"),
 * `variant="mine"` adds the row-actions menu (Duplicate, Delete). Each table
 * filters itself by title. */
export default function ProjectsTable({
	projects,
	variant,
	empty,
}: {
	projects: ProjectsRow[];
	variant: "mine" | "shared";
	/** Shown when there is nothing to filter at all. */
	empty: string;
}) {
	const [search, setSearch] = useState("");

	const columns = useMemo(
		() => [
			columnHelper.accessor("name", {
				header: "Name",
				cell: (c) => (
					<Link
						to="/projects/$projectId"
						params={{ projectId: c.row.original.id }}
						className="font-medium hover:underline"
					>
						{c.getValue()}
					</Link>
				),
			}),
			columnHelper.accessor("description", {
				header: "Description",
				cell: (c) => (
					<span className="line-clamp-1 text-muted-foreground">
						{c.getValue() ?? ""}
					</span>
				),
			}),
			columnHelper.accessor((row) => `${row.seedStart} → ${row.seedEnd}`, {
				id: "dates",
				header: "Dates",
				cell: (c) => (
					<span className="whitespace-nowrap text-muted-foreground tabular-nums">
						{c.getValue()}
					</span>
				),
			}),
			...(variant === "shared"
				? [
						columnHelper.accessor((row) => row.ownerName ?? "", {
							id: "sharedBy",
							header: "Shared by",
							cell: (c) => (
								<span className="text-muted-foreground">{c.getValue()}</span>
							),
						}),
					]
				: []),
			...(variant === "mine"
				? [
						columnHelper.display({
							id: "actions",
							header: "",
							cell: (c) => <RowActions project={c.row.original} />,
						}),
					]
				: []),
		],
		[variant],
	);

	const table = useReactTable({
		data: projects,
		columns,
		state: { globalFilter: search },
		onGlobalFilterChange: setSearch,
		// globalFilterFn: "includesString",
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
	});

	const rows = table.getRowModel().rows;

	return (
		<div className="space-y-2">
			<div className="relative w-full max-w-xs">
				<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search by title…"
					aria-label="Search projects by title"
					className="pl-8"
				/>
			</div>

			<div className="overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{(projects.length === 0 && (
							<TableRow>
								<TableCell colSpan={table.getAllColumns().length}>
									<Empty className="bg-muted">
										<EmptyHeader>
											<EmptyMedia
												className="bg-muted-foreground text-muted"
												variant={"icon"}
											>
												<ImageBrokenIcon />
											</EmptyMedia>
											<EmptyTitle>{empty}</EmptyTitle>
										</EmptyHeader>
									</Empty>
								</TableCell>
							</TableRow>
						)) ||
							(rows.length === 0 && (
								<TableRow>
									<TableCell colSpan={table.getAllColumns().length}>
										<Empty className="bg-muted">
											<EmptyHeader>
												<EmptyMedia
													className="bg-muted-foreground text-muted"
													variant={"icon"}
												>
													<SmileyXEyesIcon />
												</EmptyMedia>
												<EmptyTitle>No projects match "{search}".</EmptyTitle>
                    </EmptyHeader>
										</Empty>
									</TableCell>
								</TableRow>
							)) ||
							rows.map((row) => (
								<TableRow
									key={row.id}
									className="border-b transition-colors last:border-0 hover:bg-muted/30"
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className="px-3 py-2">
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
