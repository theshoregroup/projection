import { Button } from "@projection/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@projection/ui/components/dialog";
import { Field, FieldContent, FieldError, FieldLabel } from "@projection/ui/components/field";
import { Input } from "@projection/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";

export const createOrgSchema = z.object({
	name: z.string().min(3),
	slug: z.string().min(3),
});

export function CreateNewOrganizationDialog({ triggerButton }: { triggerButton: React.ReactNode }) {
	const navigate = useNavigate();

	const mutation = useMutation({
		mutationKey: ["createOrganization"],
		mutationFn: async (input: z.infer<typeof createOrgSchema>) => {
			// Better-auth handles auth checks, we're just passing this through
			const res = await authClient.organization.create(createOrgSchema.parse(input));

			if (res.error) {
				throw new Error(res.error.message, { cause: res.error });
			}

			return res.data;
		},

		onMutate: () =>
			toast.loading("Creating your new organization...", {
				description: "Please wait while we create your organization.",
			}),

		onError: (err, _, tId) => {
			toast.error("Failed to create organization.", {
				description: err.message,
				id: tId,
			});
		},

		onSuccess: async (data, _2, tId) => {
			toast.success("Organization created successfully!", {
				description: "Your new organization has been created.",
				id: tId,
			});

			await authClient.organization.setActive({ organizationId: data.id });

			navigate({ to: "/dashboard" });
		},
	});

	const form = useForm({
		defaultValues: {
			name: "",
			slug: "",
		},

		validators: {
			onSubmit: createOrgSchema,
		},

		onSubmit: async ({ value }) => mutation.mutateAsync(value),
	});

	const slugEdited = useRef(false);

	return (
		<Dialog>
			<DialogTrigger>{triggerButton}</DialogTrigger>

			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create a new organization</DialogTitle>
				</DialogHeader>

				<form
					className="space-y-4"
					id={form.formId}
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<form.Field name="name">
						{(field) => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

							return (
								<Field data-invalid={isInvalid} orientation={"responsive"}>
									<FieldContent>
										<FieldLabel htmlFor={field.name}>Organization Name</FieldLabel>
									</FieldContent>
									<Input
										id={field.name}
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(e) => {
											field.handleChange(e.target.value);

											if (slugEdited.current) {
												return;
											}

											// Slugify value
											const slug = e.target.value.replace(/\s+/g, "-").toLowerCase();

											form.setFieldValue("slug", slug);
										}}
										placeholder="Acme Inc."
										value={field.state.value}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>
					<form.Field name="slug">
						{(field) => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

							return (
								<Field data-invalid={isInvalid} orientation={"responsive"}>
									<FieldContent>
										<FieldLabel htmlFor={field.name}>Organization Slug</FieldLabel>
									</FieldContent>
									<Input
										id={field.name}
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(e) => {
											slugEdited.current = true;
											field.handleChange(e.target.value);
										}}
										placeholder="acme-inc"
										value={field.state.value}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>

					<DialogFooter>
						<Button type="submit" disabled={mutation.isPending}>
							Create Organization
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
