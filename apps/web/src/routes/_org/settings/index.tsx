import { ImagesIcon } from "@phosphor-icons/react/dist/ssr";
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
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@projection/ui/components/popover";
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
import { ImageToUri } from "@/components/image-to-uri";
import { authClient } from "@/lib/auth-client";
import { getSsrHeaders } from "@/lib/auth-headers";
import { getOrgShortName } from "@/utils/auth";
import { useState } from "react";

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
		defaultValues: {
			name: organization.name,
			logo: organization.logo ?? undefined,
		},
		validators: {
			onSubmit: z.object({
				name: z.string().min(3),
				logo: z.string().or(z.undefined()),
			}),
		},
		onSubmit: async ({ value }) => {
			await authClient.organization.update(
				{ data: value, organizationId: activeOrganizationId },
				{
					onSuccess: async () => {
						await queryClient.invalidateQueries(
							currentOrganizationQry(activeOrganizationId),
						);
						toast.success("Organization updated");
					},
					onError: ({ error }) => {
						toast.error(
							`There was an error updating the organization: ${error.name}`,
							{ description: error.message },
						);
					},
				},
			);
		},
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

	const [logoChangePopoverOpen, setLogoChangePopoverOpen] = useState(false);

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
						<CardContent className="space-y-4">
							<orgUpdateForm.Field name="logo">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field orientation={"horizontal"}>
											<FieldContent>
												<FieldTitle>Organization Logo</FieldTitle>
												<FieldDescription>
													Square Image between 200px and 500px recommended
												</FieldDescription>

												{isInvalid && (
													<FieldError errors={field.state.meta.errors} />
												)}

												<Popover open={logoChangePopoverOpen} onOpenChange={setLogoChangePopoverOpen}>
													<PopoverTrigger
														className="w-fit"
														render={
															<Button
																size="sm"
																variant="secondary"
																type="button"
															/>
														}
													>
														<ImagesIcon />
														Change
													</PopoverTrigger>

													<PopoverContent>
														<PopoverHeader>
															<PopoverTitle>Upload a new image</PopoverTitle>
															<PopoverDescription>
																Paste a link or upload an image from your local
																compter. Your image will be converted
																automatically.
															</PopoverDescription>
														</PopoverHeader>

														<ImageToUri
															onChange={(e) => {
                                field.handleChange(e);
																setLogoChangePopoverOpen(false)
															}}
														/>
													</PopoverContent>
												</Popover>
											</FieldContent>
											<Avatar className="size-20 rounded-lg after:rounded-lg">
												<AvatarFallback className="rounded-lg">
													{getOrgShortName(storedName)}
												</AvatarFallback>
												{field.state.value && (
													<AvatarImage
														className="rounded-lg"
														src={field.state.value ?? undefined}
													/>
												)}
											</Avatar>
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
								type="submit"
								variant={orgUpdateForm.state.isDirty ? "default" : "outline"}
								disabled={
									orgUpdateForm.state.isSubmitting ||
									!orgUpdateForm.state.isDirty
								}
							>
								<ImagesIcon />
								{orgUpdateForm.state.isSubmitting ? "Saving…" : "Update"}
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
