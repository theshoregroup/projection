import { FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr";
import { registry } from "@projection/auth/settings/registry";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@projection/ui/components/avatar";
import { Button } from "@projection/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@projection/ui/components/card";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldTitle,
} from "@projection/ui/components/field";
import { Input } from "@projection/ui/components/input";
import { Switch } from "@projection/ui/components/switch";
import { useForm, useSelector } from "@tanstack/react-form";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { getSsrHeaders } from "@/lib/auth-headers";
import { getOrgShortName } from "@/utils/auth";

const currentOrganizationQry = (orgId: string) =>
	queryOptions({
		queryKey: ["currentOrganization", orgId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.getFullOrganization(
				{
					query: { organizationId: orgId },
					fetchOptions: { headers: getSsrHeaders() },
				},
			);
			if (error) throw error;
			return data;
		},
	});

const orgSettingsQry = queryOptions({
	queryKey: ["orgSettings"] as const,
	queryFn: async () => {
		const { data, error } = await authClient.settings.list({ category: "org" });
		if (error) throw error;
		return data;
	},
});

export const Route = createFileRoute("/_org/settings/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			currentOrganizationQry(context.activeOrganizationId),
		);
	},
	component: RouteComponent,
});

function useOrgSetting(key: keyof typeof registry & string) {
	const { data } = useQuery(orgSettingsQry);
	const item = (data ?? []).find((i) => i.key === key);
	return item?.value ?? registry[key].default;
}

/** Fetch an image URL and convert it to a PNG data URI using a canvas.
 *  This ensures the stored logo is always a format react-pdf can render
 *  (JPEG/PNG), even when the source is WebP, AVIF, etc. */
async function urlToDataUri(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Could not get canvas context"));
				return;
			}
			ctx.drawImage(img, 0, 0);
			resolve(canvas.toDataURL("image/png"));
		};
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = url;
	});
}

/** Check if a string is a data URI (already converted). */
function isDataUri(value: string | undefined | null): boolean {
	return !!value && value.startsWith("data:");
}

function RouteComponent() {
	const { activeOrganizationId } = Route.useRouteContext({
		select: ({ activeOrganizationId }) => ({ activeOrganizationId }),
	});
	const { data: organization } = useSuspenseQuery(
		currentOrganizationQry(activeOrganizationId),
	);
	const queryClient = useQueryClient();

	const showOrgLogo = useOrgSetting("show_org_logo_on_exports");

	const settingsMut = useMutation({
		mutationFn: (vars: {
			key: keyof typeof registry & string;
			value: unknown;
		}) =>
			authClient.settings
				.update(vars.key, vars.value, { category: "org" })
				.then(({ data, error }) => {
					if (error) throw error;
					return data;
				}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: orgSettingsQry.queryKey }),
		onError: ({ message }) =>
			toast.error("Failed to save setting", { description: message }),
	});

	const orgUpdateForm = useForm({
		defaultValues: { name: organization.name, logo: organization.logo },
		validators: {
			onSubmit: z.object({
				name: z.string().min(3),
				// Accept data URIs (converted logos) or undefined
				logo: z.string().or(z.undefined()),
			}),
		},
		onSubmit: async ({ value }) =>
			authClient.organization.update(
				{ data: value, organizationId: activeOrganizationId },
				{
					onSuccess: async () =>
						queryClient.invalidateQueries(
							currentOrganizationQry(activeOrganizationId),
						),
					onError: ({ error }) => {
						toast.error(
							`There was an error updating the organization: ${error.name}`,
							{ description: error.message },
						);
					},
				},
			),
	});

	const storedName = useSelector(orgUpdateForm.store, (s) => s.values.name);

	const settingsForm = useForm({
		defaultValues: { show_org_logo_on_exports: showOrgLogo },
		validators: {
			onChange: z.object({
				show_org_logo_on_exports: registry.show_org_logo_on_exports.schema,
			}),
		},
		onSubmit: async () => {},
	});

	return (
		<div className="@container/org-form">
			<div className="grid @xl/org-form:grid-cols-[3fr_2fr] gap-6">
				<Card className="@xl/org-form:col-start-2 h-fit">
					<form
						id={orgUpdateForm.formId}
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							orgUpdateForm.handleSubmit();
						}}
						className="space-y-4"
					>
						<CardContent>
							<orgUpdateForm.Field name="logo">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									// Show a blank input for data URIs so the user pastes a fresh URL;
									// otherwise show the current URL value for editing.
									const displayValue = isDataUri(field.state.value)
										? ""
										: (field.state.value ?? "");
									const hasLogo = !!field.state.value;
									return (
										<Field orientation={"horizontal"}>
											<Avatar className="size-20 rounded-lg after:rounded-lg">
												<AvatarFallback className="rounded-lg">
													{getOrgShortName(storedName)}
												</AvatarFallback>
												{hasLogo && (
													<AvatarImage
														className="rounded-lg"
														src={field.state.value ?? undefined}
													/>
												)}
											</Avatar>
											<FieldContent>
												<FieldTitle>Organization Logo</FieldTitle>
												<Input
													id={field.name}
													value={displayValue}
													placeholder="https://example.com/logo.png"
													onChange={(e) =>
														field.handleChange(e.target.value || undefined)
													}
													onBlur={async () => {
														field.handleBlur();
														const url = field.state.value;
														// If the user just entered a URL (not a data URI),
														// convert it so we store a format react-pdf can render
														if (url && !isDataUri(url)) {
															try {
																const dataUri = await urlToDataUri(url);
																field.handleChange(dataUri);
															} catch {
																toast.error("Could not load image", {
																	description:
																		"Make sure the URL points to a valid, publicly accessible image.",
																});
															}
														}
													}}
													autoCorrect="off"
													autoFocus={false}
												/>
												<FieldDescription>
													Paste a URL to a logo image — it will be converted
													automatically. Use a square image, approx 250-500px.
												</FieldDescription>
												{isInvalid && (
													<FieldError
														errors={
															field.state.meta.errors as Array<
																{ message?: string | undefined } | undefined
															>
														}
													/>
												)}
											</FieldContent>
										</Field>
									);
								}}
							</orgUpdateForm.Field>

							<orgUpdateForm.Field name="name">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field orientation={"responsive"}>
											<FieldTitle>Organization Name</FieldTitle>
											<FieldContent>
												<Input
													id={field.name}
													value={field.state.value ?? ""}
													onChange={(e) => field.handleChange(e.target.value)}
													onBlur={field.handleBlur}
													autoCorrect="off"
													autoFocus={false}
													min={3}
												/>
												<FieldDescription>
													Shown on the organization's profile page
												</FieldDescription>
												{isInvalid && (
													<FieldError
														errors={
															field.state.meta.errors as Array<
																{ message?: string | undefined } | undefined
															>
														}
													/>
												)}
											</FieldContent>
										</Field>
									);
								}}
							</orgUpdateForm.Field>
						</CardContent>
						<CardFooter>
							<Button
								variant={orgUpdateForm.state.isDirty ? "default" : "outline"}
								disabled={!orgUpdateForm.state.isDirty}
							>
								<FloppyDiskIcon />
								Update
							</Button>
						</CardFooter>
					</form>
				</Card>

				<Card className="@xl/org-form:row-start-1 h-fit">
					<CardHeader>
						<CardTitle>Organization Settings</CardTitle>
					</CardHeader>
					<CardContent>
						<form
							id={settingsForm.formId}
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								settingsForm.handleSubmit();
							}}
							className="space-y-4"
						>
							<settingsForm.Field name="show_org_logo_on_exports">
								{(field) => (
									<Field orientation="horizontal">
										<FieldContent>
											<FieldTitle>
												{registry.show_org_logo_on_exports.meta.name}
											</FieldTitle>
											<FieldDescription>
												{registry.show_org_logo_on_exports.meta.description}
											</FieldDescription>
										</FieldContent>
										<Switch
											checked={!!field.state.value}
											onCheckedChange={(checked) => {
												field.handleChange(checked);
												settingsMut.mutate({
													key: "show_org_logo_on_exports",
													value: checked,
												});
											}}
											disabled={settingsMut.isPending}
										/>
									</Field>
								)}
							</settingsForm.Field>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}