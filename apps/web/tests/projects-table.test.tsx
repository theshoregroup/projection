// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { useMutation } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectsRow } from "@/lib/collections";

// jsdom lacks ResizeObserver (base-ui positions popups through it)
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver =
	globalThis.ResizeObserver ??
	(ResizeObserverStub as unknown as typeof ResizeObserver);

const duplicateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...mod,
		Link: ({
			children,
			to,
			params,
		}: {
			children: React.ReactNode;
			to: string;
			params: { projectId: string };
		}) => <a href={`${to}/${params.projectId}`}>{children}</a>,
		useNavigate: () => vi.fn(),
	};
});

// Tag each mutationOptions call so useMutation can tell duplicate from delete.
vi.mock("@/utils/trpc", () => ({
	useTRPC: () => ({
		projects: {
			duplicate: {
				mutationOptions: (opts: unknown) => ({ __kind: "duplicate", opts }),
			},
			delete: {
				mutationOptions: (opts: unknown) => ({ __kind: "delete", opts }),
			},
		},
	}),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@tanstack/react-query")>();
	return {
		...mod,
		useQueryClient: () => ({ invalidateQueries: vi.fn() }),
		useMutation: (options: { __kind: string }) =>
			({
				mutate: options.__kind === "duplicate" ? duplicateMutate : deleteMutate,
				isPending: false,
			}) as unknown as ReturnType<typeof useMutation>,
	};
});

import ProjectsTable from "@/components/projects-table";

function makeProject(partial: Partial<ProjectsRow>): ProjectsRow {
	return {
		id: "p1",
		ownerId: "u1",
		name: "Alpha project",
		description: null,
		seedStart: "2026-03-01",
		seedEnd: "2026-04-01",
		shareToken: null,
		allowVisitorsToExport: false,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		relation: "mine",
		...partial,
	};
}

const mine = [
	makeProject({ id: "p1", name: "Kitchen refurb" }),
	makeProject({
		id: "p2",
		name: "Loft conversion",
		seedStart: "2026-05-01",
		seedEnd: "2026-06-15",
	}),
];

const shared = [
	makeProject({
		id: "p3",
		name: "Friern Barnet",
		relation: "shared",
		ownerName: "Liam Doyle",
	}),
];

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ProjectsTable", () => {
	it("renders project names as links with dates", () => {
		render(
			<ProjectsTable variant="mine" projects={mine} empty="No projects yet." />,
		);
		const link = screen.getByText("Kitchen refurb").closest("a");
		expect(link?.getAttribute("href")).toBe("/projects/$projectId/p1");
		expect(screen.getAllByText("2026-03-01 → 2026-04-01").length).toBeGreaterThan(0);
		expect(screen.getByText("2026-05-01 → 2026-06-15")).toBeTruthy();
	});

	it("mine: shows actions, hides the Shared by column", () => {
		render(
			<ProjectsTable variant="mine" projects={mine} empty="No projects yet." />,
		);
		expect(screen.queryByText("Shared by")).toBeNull();
		expect(screen.getAllByLabelText(/^Actions for /)).toHaveLength(2);
	});

	it("shared: shows who shared it, hides actions", () => {
		render(
			<ProjectsTable
				variant="shared"
				projects={shared}
				empty="Nothing shared yet."
			/>,
		);
		expect(screen.getByText("Shared by")).toBeTruthy();
		expect(screen.getByText("Liam Doyle")).toBeTruthy();
		expect(screen.queryByLabelText(/^Actions for /)).toBeNull();
	});

	it("filters by title, case-insensitively", () => {
		render(
			<ProjectsTable variant="mine" projects={mine} empty="No projects yet." />,
		);
		fireEvent.change(screen.getByLabelText("Search projects by title"), {
			target: { value: "kitchen" },
		});
		expect(screen.getByText("Kitchen refurb")).toBeTruthy();
		expect(screen.queryByText("Loft conversion")).toBeNull();
	});

	it("shows a no-match message when the filter excludes everything", () => {
		render(
			<ProjectsTable variant="mine" projects={mine} empty="No projects yet." />,
		);
		fireEvent.change(screen.getByLabelText("Search projects by title"), {
			target: { value: "zzz" },
		});
		expect(screen.getByText(/No projects match/)).toBeTruthy();
	});

	it("shows the empty copy when there is nothing to list", () => {
		render(<ProjectsTable variant="mine" projects={[]} empty="Empty here." />);
		expect(screen.getByText("Empty here.")).toBeTruthy();
	});

	it("duplicate fires the duplicate mutation for that row", async () => {
		render(
			<ProjectsTable variant="mine" projects={mine} empty="No projects yet." />,
		);
		fireEvent.click(screen.getByLabelText("Actions for Loft conversion"));
		fireEvent.click(await screen.findByText("Duplicate"));
		expect(duplicateMutate).toHaveBeenCalledWith({ id: "p2" });
	});

	it("delete requires a second click (two-step arm/confirm)", async () => {
		render(
			<ProjectsTable variant="mine" projects={mine} empty="No projects yet." />,
		);
		fireEvent.click(screen.getByLabelText("Actions for Kitchen refurb"));
		const item = await screen.findByText("Delete");
		fireEvent.click(item);
		expect(deleteMutate).not.toHaveBeenCalled();
		fireEvent.click(await screen.findByText("Click again to delete"));
		expect(deleteMutate).toHaveBeenCalledWith({ id: "p1" });
	});
});
