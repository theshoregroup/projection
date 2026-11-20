import { FilePdfIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@projection/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import BoardView from "@/components/board/board-view";
import { useTRPC, useTRPCClient } from "@/utils/trpc";

const PDF_PAGE_SIZES = ["A3", "A2", "A1", "A0"] as const;
type PdfPageSize = (typeof PDF_PAGE_SIZES)[number];

export const Route = createFileRoute("/share/$token")({
	component: SharePage,
});

/** Visitor PDF download — only rendered when the Owner has enabled it for
 * this Share Link (allowVisitorsToExport, CONTEXT.md — Share Link). */
function VisitorExport({ token }: { token: string }) {
	const trpcClient = useTRPCClient();
	const [pageSize, setPageSize] = useState<PdfPageSize>("A3");
	const [downloading, setDownloading] = useState(false);

	const download = async () => {
		setDownloading(true);
		try {
			const result = await trpcClient.share.exportPdfByToken.mutate({
				token,
				pageSize,
			});
			const blob = new Blob([result.data as BlobPart], {
				type: "application/pdf",
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = result.filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't export the PDF",
			);
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<div className="flex overflow-hidden rounded-md border">
				{PDF_PAGE_SIZES.map((size) => (
					<button
						key={size}
						type="button"
						onClick={() => setPageSize(size)}
						className={`px-2 py-1 text-xs ${
							pageSize === size
								? "bg-primary text-primary-foreground"
								: "bg-background hover:bg-muted"
						}`}
						aria-pressed={pageSize === size}
					>
						{size}
					</button>
				))}
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={() => void download()}
				disabled={downloading}
			>
				<FilePdfIcon className="size-4" />
				{downloading ? "Preparing…" : "Download PDF"}
			</Button>
		</div>
	);
}

/** Public read-only Board via a Share Link (CONTEXT.md) — no sign-in required. */
function SharePage() {
	const { token } = Route.useParams();
	const trpc = useTRPC();
	const shared = useQuery(trpc.share.getByToken.queryOptions({ token }));

	if (shared.isPending) {
		return <div className="p-6 text-muted-foreground">Loading…</div>;
	}
	if (shared.isError) {
		return (
			<div className="p-6 text-destructive">
				This share link is no longer valid.
			</div>
		);
	}

	const { project, lines } = shared.data;

	return (
		<div className="flex flex-col gap-2 p-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Shared board — read only
					</p>
					<h1 className="font-semibold text-2xl">{project.name}</h1>
					{project.description ? (
						<p className="text-muted-foreground text-sm">
							{project.description}
						</p>
					) : null}
				</div>
				{project.allowVisitorsToExport ? <VisitorExport token={token} /> : null}
			</div>
			<BoardView project={project} lines={lines} readOnly />
		</div>
	);
}
