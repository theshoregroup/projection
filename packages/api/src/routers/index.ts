import { publicProcedure, router } from "../index";
import { boardRouter } from "./board";
import { linesRouter } from "./lines";
import { projectsRouter } from "./projects";
import { shareRouter } from "./share";
import { sharingRouter } from "./sharing";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	projects: projectsRouter,
	lines: linesRouter,
	sharing: sharingRouter,
	board: boardRouter,
	share: shareRouter,
});
export type AppRouter = typeof appRouter;
