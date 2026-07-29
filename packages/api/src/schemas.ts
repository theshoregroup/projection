import { z } from "zod";

export const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD");

const rangeRefinement = {
	message: "End must be on or after Start",
	path: ["endDate"],
};

export const projectCreateSchema = z
	.object({
		name: z.string().min(1).max(120),
		description: z.string().max(500).optional(),
		seedStart: isoDate,
		seedEnd: isoDate,
	})
	.refine((value) => value.seedStart <= value.seedEnd, {
		message: rangeRefinement.message,
		path: ["seedEnd"],
	});

export const projectUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(120).optional(),
	description: z.string().max(500).nullable().optional(),
	seedStart: isoDate.optional(),
	seedEnd: isoDate.optional(),
});

export const lineBaseSchema = z.object({
	item: z.string().min(1).max(200),
	startDate: isoDate,
	endDate: isoDate,
	assignee: z.string().max(120).optional(),
	note: z.string().max(500).optional(),
	percentComplete: z.number().int().min(0).max(100).default(0),
	isMilestone: z.boolean().default(false),
});

/** A Milestone occupies a single day (CONTEXT.md). */
export const coerceMilestoneDates = <
	T extends { startDate: string; endDate: string; isMilestone: boolean },
>(
	value: T,
): T => (value.isMilestone ? { ...value, endDate: value.startDate } : value);

export const validLineRange = (value: {
	startDate: string;
	endDate: string;
}): boolean => value.startDate <= value.endDate;

export const lineCreateSchema = lineBaseSchema
	.transform(coerceMilestoneDates)
	.refine(validLineRange, rangeRefinement);

export const lineUpdateSchema = z.object({
	id: z.string().min(1),
	item: z.string().min(1).max(200).optional(),
	startDate: isoDate.optional(),
	endDate: isoDate.optional(),
	assignee: z.string().max(120).nullable().optional(),
	note: z.string().max(500).nullable().optional(),
	percentComplete: z.number().int().min(0).max(100).optional(),
	isMilestone: z.boolean().optional(),
});

export const inviteSchema = z.object({
	projectId: z.string().min(1),
	email: z.email(),
});

export const reorderSchema = z.object({
	projectId: z.string().min(1),
	lineId: z.string().min(1),
	beforeLineId: z.string().min(1).nullable(),
	afterLineId: z.string().min(1).nullable(),
});
